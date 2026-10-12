export type AccessState = {
  state: 'anonymous' | 'code' | 'mfa' | 'waitlist' | 'joined' | 'active';
  workspaceId?: string | null;
  email?: string;
};
export const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
export const forceDemo = demoAllowed && new URL(location.href).searchParams.get('demo') === '1';
export async function api<T = unknown>(
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch('/api/' + endpoint, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let result: Record<string, unknown>;
  try {
    result = await response.json();
  } catch {
    throw new Error('Подключение сервиса ещё не настроено.');
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('replyfolio:session-ended'));
    if (response.status === 428) window.dispatchEvent(new Event('replyfolio:step-up'));
    throw new Error(
      response.status === 428
        ? 'Подтвердите вход аутентификатором и повторите действие.'
        : typeof result.error === 'string'
          ? result.error
          : 'Не удалось выполнить запрос.',
    );
  }
  return result as T;
}
export async function logout() {
  await api('auth', { action: 'logout' });
  window.dispatchEvent(new Event('replyfolio:session-ended'));
}
