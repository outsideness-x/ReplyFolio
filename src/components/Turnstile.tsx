import { useEffect, useRef } from 'react';
type TurnstileAPI = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
let loader: Promise<void> | undefined;
function load() {
  return (loader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Verification unavailable'));
    document.head.appendChild(script);
  }));
}
export function Turnstile({
  onToken,
  onError,
}: {
  onToken: (value: string) => void;
  onError: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  useEffect(() => {
    if (!siteKey) return;
    let active = true,
      id: string | undefined;
    void load()
      .then(() => {
        if (active && ref.current && window.turnstile)
          id = window.turnstile.render(ref.current, {
            sitekey: siteKey,
            action: 'login',
            theme: 'dark',
            size: 'flexible',
            callback: (value: string) => callbacks.current.onToken(value),
            'expired-callback': () => callbacks.current.onToken(''),
            'error-callback': () => callbacks.current.onError(),
          });
      })
      .catch(() => callbacks.current.onError());
    return () => {
      active = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  return siteKey ? <div className="turnstile-container" ref={ref} /> : null;
}
