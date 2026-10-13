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
          Sign out
        </button>
      </section>
    );
  if (access.state === 'active')
    return (
      <section className="login-card">
        <div className="auth-stage-icon">
          <ShieldCheck size={24} />
        </div>
        <h2>You're on the team.</h2>
        <p>
          The owner hasn't created the workspace yet. It will appear here after their first sign-in.
        </p>
        <button className="login-button" onClick={() => location.reload()}>
          Refresh
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
        <span className="login-kicker">YOU'RE ON THE LIST</span>
        <h2>See you soon.</h2>
        <p>Your email is on the waitlist. We'll be able to invite you when access opens.</p>
        <div className="auth-line-note">
          <Sparkles size={15} />
          Good conversations take a little time.
        </div>
        <button
          className="auth-back"
          onClick={() => {
            onAccess({ state: 'anonymous' });
            setSent(false);
          }}
        >
          Back to sign-in
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
          There will soon be
          <br />a place for you, too.
        </h2>
        <p>
          GrowthThread is currently open to our team. This email isn't invited yet — join the
          waitlist.
        </p>
        <label className="waitlist-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I agree to have my email saved and to be contacted about access.
        </label>
        <button
          className="login-button"
          disabled={busy || !consent}
          onClick={() => void submit('waitlist', { consent: true })}
        >
          {busy ? <LoaderCircle size={17} className="spin" /> : null}Join the waitlist
          <ArrowRight size={16} />
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-back" onClick={() => void logout()}>
          Use a different email
        </button>
      </section>
    );
  return (
    <section className="login-card" id="login">
      <div className="login-card-top">
        <span className="login-symbol">
          <LockKeyhole size={19} />
        </span>
        <span className="login-kicker">YOUR WORKSPACE</span>
      </div>
      <h2>{access.state === 'code' ? 'Check your inbox.' : 'Good to see you.'}</h2>
      <p>
        {access.state === 'code'
          ? 'We sent a one-time code to ' + email + '. Enter it to continue.'
          : 'Sign in with email. Invited members enter the workspace; everyone else can join the waitlist.'}
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
            Email code
            <input
              className="otp-input"
              aria-label="Email code"
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
            Work email
            <div className="login-email-field">
              <Mail size={17} />
              <input
                aria-label="Sign-in email"
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
            onError={() => setError('Browser verification is unavailable. Refresh the page.')}
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
          {access.state === 'code' ? 'Verify email' : 'Continue with email'}
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
          Use another email or request a new code
        </button>
      ) : (
        <div className="login-security">
          <ShieldCheck size={14} />
          <span>
            Verified email. Second factor.
            <br />
            Access by invitation only.
          </span>
        </div>
      )}
      {!ready && demoAllowed && !sent && (
        <div className="local-access-note">
          Email sign-in is configured at launch. The demo workspace is available now.
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
        <a href="/" aria-label="GrowthThread, home">
          <Brand />
        </a>
        <nav>
          <a href="#product">The experience</a>
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
              For our team, for now
              <ChevronRight size={13} />
            </div>
            <h1>
              Every step.
              <br />
              <span>One clear picture.</span>
            </h1>
            <p>
              From first interest to lasting habits.
              <br />
              Conversations, audience and product in one
              <br className="desktop-break" /> shared workspace.
            </p>
            <div className="hero-caption">
              <span className="hero-line" />
              <span>Follow your growth. Stay connected.</span>
            </div>
            {demoAllowed && (
              <a className="demo-link" href="/?demo=1#/dashboard">
                Explore the workspace
                <ArrowUpRight size={16} />
                <span>DEMO</span>
              </a>
            )}
          </div>
          <LoginCard access={access} onAccess={onAccess} ready={ready} />
        </section>
        <section className="product-showcase" id="product">
          <div className="showcase-caption">
            <span>LESS ROUTINE. MORE ATTENTION.</span>
            <a href="#experience">
              Take a closer look
              <ArrowDown size={14} />
            </a>
          </div>
          <div className="showcase-window">
            <div className="showcase-sidebar">
              <Brand />
              <div className="mock-team">
                <span>R</span>
                <div>
                  Your team<small>Workspace</small>
                </div>
              </div>
              {[
                [Inbox, 'Overview'],
                [MessagesSquare, 'Inbox'],
                [Workflow, 'Flows'],
                [FileText, 'Materials'],
                [Users, 'Leads'],
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
                Everything in its place
              </div>
            </div>
            <div className="showcase-content">
              <div className="mock-topbar">
                <span>
                  Inbox
                  <ChevronRight size={12} />
                  <strong>New interest</strong>
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
                      Future learner<small>Instagram Direct</small>
                    </div>
                    <span className="mock-online">Flow active</span>
                  </header>
                  <div className="mock-date">TODAY</div>
                  <div className="mock-bubble incoming">
                    Hi! Can I try an introductory lesson?<small>12:41</small>
                  </div>
                  <div className="mock-bubble outgoing">
                    Of course. A good start is right here.
                    <div className="mock-file">
                      <FileText size={24} />
                      <div>
                        Your first step in learning<small>Free introductory lesson</small>
                      </div>
                      <ArrowUpRight size={17} />
                    </div>
                    <small>
                      GrowthThread · 12:41 <CheckCheck size={11} />
                    </small>
                  </div>
                  <div className="mock-message-input">
                    Write a reply…
                    <ArrowRight size={15} />
                  </div>
                </div>
                <aside className="showcase-flow">
                  <span className="flow-kicker">ONE SMALL FLOW</span>
                  <div className="show-flow-node">
                    <span className="mini-flow-icon">
                      <MessageCircle size={15} />
                    </span>
                    <div>
                      <small>TRIGGER</small>
                      <strong>“I'd like a lesson”</strong>
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
                      <small>REPLY</small>
                      <strong>A useful resource</strong>
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
                      <small>RESULT</small>
                      <strong>New interest</strong>
                    </div>
                    <span className="mini-success">
                      <Check size={11} />
                    </span>
                  </div>
                  <div className="showcase-note">
                    <ShieldCheck size={16} />
                    <p>
                      Your team steps in
                      <br />
                      at the right moment.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
          <div className="showcase-foot">
            <span>
              <span />
              GROWTHTHREAD IN MOTION
            </span>
            <p>More room for attention. More time to give it.</p>
          </div>
        </section>
        <section className="experience" id="experience">
          <div className="experience-heading">
            <span className="section-kicker">CALM IS A FEATURE, TOO</span>
            <h2>
              A little less chaos.
              <br />
              <span>A lot more clarity.</span>
            </h2>
          </div>
          <div className="experience-grid">
            {[
              [
                MessagesSquare,
                '01',
                'The right reply, on time.',
                "Materials and pricing meet a person's interest. The conversation continues at their own pace.",
              ],
              [
                GitBranch,
                '02',
                'Logic without the noise.',
                'Build a path from simple steps. Add branches, collect details and bring in your team when needed.',
              ],
              [
                ShieldCheck,
                '03',
                'Just your people.',
                'Verified email, a second factor and invitation-only access. Your workspace stays within your team.',
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
        <p>A place for conversations that matter.</p>
        <span>© {new Date().getFullYear()} GrowthThread</span>
      </footer>
    </div>
  );
}
