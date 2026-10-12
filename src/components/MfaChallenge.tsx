import { useState } from 'react';
import { ArrowRight, ShieldCheck, LoaderCircle } from 'lucide-react';
import { api, type AccessState } from '../data/session.ts';
export function MfaChallenge({ onDone }: { onDone: (state: AccessState) => void }) {
  const [challenge, setChallenge] = useState<{
      enrollment: boolean;
      qr?: string;
      secret?: string;
    } | null>(null),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function start() {
    setBusy(true);
    setError('');
    try {
      setChallenge(await api('auth', { action: 'mfa-start' }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const qr = challenge?.qr
    ? challenge.qr.startsWith('data:image/svg+xml')
      ? challenge.qr
      : 'data:image/svg+xml;base64,' +
        btoa(String.fromCharCode(...new TextEncoder().encode(challenge.qr)))
    : null;
  return (
    <div className="mfa-stage">
      <div className="auth-stage-icon">
        <ShieldCheck size={24} />
      </div>
      <h2>{challenge?.enrollment ? 'Ваш второй ключ.' : 'Ещё один шаг.'}</h2>
      <p>
        {challenge?.enrollment
          ? 'Добавьте ReplyFolio в приложение-аутентификатор. Этот шаг защищает вход даже при доступе к вашему email.'
          : 'Подтвердите вход кодом из вашего аутентификатора.'}
      </p>
      {!challenge ? (
        <button className="login-button" disabled={busy} onClick={() => void start()}>
          {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}Открыть
          проверку
          <ArrowRight size={16} />
        </button>
      ) : (
        <>
          <div className="mfa-enrollment">
            {qr && (
              <img src={qr} alt="QR-код для подключения аутентификатора" width={180} height={180} />
            )}{' '}
            {challenge.secret && (
              <details>
                <summary>Ввести ключ вручную</summary>
                <code>{challenge.secret}</code>
              </details>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                onDone(await api('auth', { action: 'mfa-verify', code }));
                setCode('');
                setChallenge(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Код аутентификатора
              <input
                aria-label="Код аутентификатора"
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                pattern="[0-9]{6}"
                required
                autoFocus
              />
            </label>
            <button className="login-button" disabled={busy || code.length !== 6}>
              {busy ? <LoaderCircle size={17} className="spin" /> : null}Подтвердить вход
              <ArrowRight size={16} />
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
