import { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Command,
  FileText,
  GitBranch,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import { Brand } from '../components/Brand.tsx';
import { MfaChallenge } from '../components/MfaChallenge.tsx';
import { Turnstile } from '../components/Turnstile.tsx';
import { api, demoAllowed, logout, type AccessState } from '../data/session.ts';
function LoginCard({
  access,
  onAccess,
  ready,
}: {
  access: AccessState;
  onAccess: (a: AccessState) => void;
  ready: boolean;
}) {
  const [email, setEmail] = useState(access.email ?? ''),
    [code, setCode] = useState(''),
    [captchaToken, setCaptchaToken] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const state = await api<AccessState>('auth', { action, ...payload });
      onAccess(state);
      if (state.state === 'code') setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (access.state === 'mfa')
    return (
      <section className="login-card">
        <MfaChallenge onDone={onAccess} />
        <button className="auth-back" onClick={() => void logout()}>
          Выйти
        </button>
      </section>
    );
  if (access.state === 'active')
    return (
      <section className="login-card">
        <div className="auth-stage-icon">
          <ShieldCheck size={24} />
        </div>
        <h2>Вы в команде.</h2>
        <p>
          Владелец ещё не создал рабочее пространство. Оно появится здесь после его первого входа.
        </p>
        <button className="login-button" onClick={() => location.reload()}>
          Обновить
          <ArrowRight size={16} />
        </button>
      </section>
    );
  if (access.state === 'joined')
    return (
      <section className="login-card">
        <div className="auth-stage-icon success">
          <Check size={25} />
        </div>
        <span className="login-kicker">ВЫ В СПИСКЕ</span>
        <h2>До скорой встречи.</h2>
        <p>
          Ваш email сохранён в листе ожидания. Когда откроем доступ, сможем пригласить вас первыми.
        </p>
        <div className="auth-line-note">
          <Sparkles size={15} />
          Хорошим диалогам нужно немного времени.
        </div>
        <button
          className="auth-back"
          onClick={() => {
            onAccess({ state: 'anonymous' });
            setSent(false);
          }}
        >
          Вернуться ко входу
        </button>
      </section>
    );
  if (access.state === 'waitlist')
    return (
      <section className="login-card">
        <div className="auth-stage-icon">
          <Mail size={24} />
        </div>
        <span className="login-kicker">EARLY ACCESS</span>
        <h2>
          Здесь скоро
          <br />
          будет место и вам.
        </h2>
        <p>
          Сейчас ReplyFolio открыт для нашей команды. Этот email ещё не приглашён — присоединитесь к
          листу ожидания.
        </p>
        <label className="waitlist-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Разрешаю сохранить мой email и связаться со мной по поводу доступа.
        </label>
        <button
          className="login-button"
          disabled={busy || !consent}
          onClick={() => void submit('waitlist', { consent: true })}
        >
          {busy ? <LoaderCircle size={17} className="spin" /> : null}Присоединиться к листу
          <ArrowRight size={16} />
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-back" onClick={() => void logout()}>
          Войти с другим email
        </button>
      </section>
    );
  return (
    <section className="login-card" id="login">
      <div className="login-card-top">
        <span className="login-symbol">
          <LockKeyhole size={19} />
        </span>
        <span className="login-kicker">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span>
      </div>
      <h2>{access.state === 'code' ? 'Проверьте почту.' : 'Рады вас видеть.'}</h2>
      <p>
        {access.state === 'code'
          ? 'Отправили одноразовый код на ' + email + '. Введите его, чтобы продолжить.'
          : 'Войдите по email. Приглашённые участники попадут в кабинет, остальные — в лист ожидания.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(
            access.state === 'code' ? 'verify-email' : 'start',
            access.state === 'code' ? { code } : { email, captchaToken },
          );
        }}
      >
        {access.state === 'code' ? (
          <label>
            Код из письма
            <input
              className="otp-input"
              aria-label="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              required
              autoFocus
              placeholder="000000"
            />
          </label>
        ) : (
          <label>
            Рабочий email
            <div className="login-email-field">
              <Mail size={17} />
              <input
                aria-label="Email для входа"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </div>
          </label>
        )}
        {access.state !== 'code' && (
          <Turnstile
            onToken={setCaptchaToken}
            onError={() => setError('Проверка браузера недоступна. Обновите страницу.')}
          />
        )}
        <button
          className="login-button"
          disabled={
            busy ||
            (access.state === 'code' && code.length < 6) ||
            (!!import.meta.env.VITE_TURNSTILE_SITE_KEY && access.state !== 'code' && !captchaToken)
          }
        >
          {busy ? <LoaderCircle size={17} className="spin" /> : null}
          {access.state === 'code' ? 'Подтвердить email' : 'Продолжить с email'}
          <ArrowRight size={17} />
        </button>
      </form>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {access.state === 'code' ? (
        <button
          className="auth-back"
          onClick={() => {
            onAccess({ state: 'anonymous' });
            setSent(false);
            setCode('');
          }}
        >
          Другой email или новое письмо
        </button>
      ) : (
        <div className="login-security">
          <ShieldCheck size={14} />
          <span>
            Подтверждение email. Второй фактор.
            <br />
            Доступ только по приглашению.
          </span>
        </div>
      )}
      {!ready && demoAllowed && !sent && (
        <div className="local-access-note">
          Email-вход подключается при запуске. Сейчас доступен демонстрационный кабинет.
        </div>
      )}
    </section>
  );
}
export function Landing({
  access,
  onAccess,
  ready,
}: {
  access: AccessState;
  onAccess: (s: AccessState) => void;
  ready: boolean;
}) {
  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />
      <header className="landing-nav">
        <a href="/" aria-label="ReplyFolio, главная">
          <Brand />
        </a>
        <nav>
          <a href="#product">Как это ощущается</a>
          <span className="private-release">
            <span />
            PRIVATE RELEASE
          </span>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="early-label">
              <span className="early-dot" />
              Сейчас — только для нашей команды
              <ChevronRight size={13} />
            </div>
            <h1>
              Каждый диалог.
              <br />
              <span>Следующий шаг.</span>
            </h1>
            <p>
              Пусть хорошие разговоры продолжаются.
              <br />
              Материалы, ответы и заявки — в одном
              <br className="desktop-break" /> спокойном рабочем пространстве.
            </p>
            <div className="hero-caption">
              <span className="hero-line" />
              <span>ВАШ ГОЛОС. ВАШ РИТМ. ВАШ DIRECT.</span>
            </div>
            {demoAllowed && (
              <a className="demo-link" href="/?demo=1#/dashboard">
                Заглянуть в кабинет
                <ArrowUpRight size={16} />
                <span>ДЕМО</span>
              </a>
            )}
          </div>
          <LoginCard access={access} onAccess={onAccess} ready={ready} />
        </section>
        <section className="product-showcase" id="product">
          <div className="showcase-caption">
            <span>МЕНЬШЕ РУТИНЫ. БОЛЬШЕ ВНИМАНИЯ.</span>
            <a href="#experience">
              Рассмотреть ближе
              <ArrowDown size={14} />
            </a>
          </div>
          <div className="showcase-window">
            <div className="showcase-sidebar">
              <Brand />
              <div className="mock-team">
                <span>R</span>
                <div>
                  Ваша команда<small>Рабочее пространство</small>
                </div>
              </div>
              {[
                [Inbox, 'Обзор'],
                [MessagesSquare, 'Диалоги'],
                [Workflow, 'Сценарии'],
                [FileText, 'Материалы'],
                [Users, 'Заявки'],
              ].map(([Icon, title], i) => {
                const Glyph = Icon as typeof Inbox;
                return (
                  <div className={'mock-nav ' + (i === 1 ? 'selected' : '')} key={String(title)}>
                    <Glyph size={15} />
                    {String(title)}
                    {i === 1 && <span>3</span>}
                  </div>
                );
              })}
              <div className="mock-connected">
                <span />
                Всё на своём месте
              </div>
            </div>
            <div className="showcase-content">
              <div className="mock-topbar">
                <span>
                  Диалоги
                  <ChevronRight size={12} />
                  <strong>Новый интерес</strong>
                </span>
                <span>
                  <Command size={11} /> K
                </span>
              </div>
              <div className="showcase-inner">
                <div className="mock-conversation">
                  <header>
                    <span className="mock-avatar">A</span>
                    <div>
                      Будущий ученик<small>Instagram Direct</small>
                    </div>
                    <span className="mock-online">Сценарий активен</span>
                  </header>
                  <div className="mock-date">СЕГОДНЯ</div>
                  <div className="mock-bubble incoming">
                    Привет! Можно вводный урок?<small>12:41</small>
                  </div>
                  <div className="mock-bubble outgoing">
                    Конечно. Хорошее начало — уже здесь.
                    <div className="mock-file">
                      <FileText size={24} />
                      <div>
                        Первый шаг в обучении<small>Бесплатный вводный урок</small>
                      </div>
                      <ArrowUpRight size={17} />
                    </div>
                    <small>
                      ReplyFolio · 12:41 <CheckCheck size={11} />
                    </small>
                  </div>
                  <div className="mock-message-input">
                    Напишите ответ…
                    <ArrowRight size={15} />
                  </div>
                </div>
                <aside className="showcase-flow">
                  <span className="flow-kicker">ОДИН МАЛЕНЬКИЙ СЦЕНАРИЙ</span>
                  <div className="show-flow-node">
                    <span className="mini-flow-icon">
                      <MessageCircle size={15} />
                    </span>
                    <div>
                      <small>ТРИГГЕР</small>
                      <strong>«Хочу урок»</strong>
                    </div>
                    <span className="mini-success">
                      <Check size={11} />
                    </span>
                  </div>
                  <div className="show-flow-line" />
                  <div className="show-flow-node">
                    <span className="mini-flow-icon lavender">
                      <FileText size={15} />
                    </span>
                    <div>
                      <small>ОТВЕТ</small>
                      <strong>Полезный материал</strong>
                    </div>
                    <span className="mini-success">
                      <Check size={11} />
                    </span>
                  </div>
                  <div className="show-flow-line" />
                  <div className="show-flow-node final">
                    <span className="mini-flow-icon mint">
                      <Users size={15} />
                    </span>
                    <div>
                      <small>РЕЗУЛЬТАТ</small>
                      <strong>Новый интерес</strong>
                    </div>
                    <span className="mini-success">
                      <Check size={11} />
                    </span>
                  </div>
                  <div className="showcase-note">
                    <ShieldCheck size={16} />
                    <p>
                      Команда подключается
                      <br />в нужный момент.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
          <div className="showcase-foot">
            <span>
              <span />
              REPLYFOLIO IN MOTION
            </span>
            <p>Не заменяет внимание. Освобождает для него время.</p>
          </div>
        </section>
        <section className="experience" id="experience">
          <div className="experience-heading">
            <span className="section-kicker">СПОКОЙСТВИЕ — ТОЖЕ ФУНКЦИЯ</span>
            <h2>
              Чуть меньше хаоса.
              <br />
              <span>Заметно больше ясности.</span>
            </h2>
          </div>
          <div className="experience-grid">
            {[
              [
                MessagesSquare,
                '01',
                'Ответ вовремя.',
                'Материалы и стоимость приходят в ответ на интерес. Человек продолжает разговор в своём темпе.',
              ],
              [
                GitBranch,
                '02',
                'Логика без шума.',
                'Соберите путь из простых шагов. Разветвляйте, сохраняйте контакт и зовите менеджера, когда он нужен.',
              ],
              [
                ShieldCheck,
                '03',
                'Только свои.',
                'Подтверждённый email, второй фактор и закрытый доступ. Рабочий кабинет остаётся внутри вашей команды.',
              ],
            ].map(([Icon, n, title, description]) => {
              const Glyph = Icon as typeof Inbox;
              return (
                <article key={String(n)}>
                  <div>
                    <Glyph size={21} />
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(description)}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <p>Место для разговоров, которые имеют значение.</p>
        <span>© {new Date().getFullYear()} ReplyFolio</span>
      </footer>
    </div>
  );
}
