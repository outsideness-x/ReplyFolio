import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Database,
  Download,
  Camera,
  Link2,
  RotateCcw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { Badge, day, download, Modal, useUI } from '../ui.tsx';
export function Settings() {
  const { data, repo, perform, busy } = useUI();
  const [name, setName] = useState(data.workspace.name),
    [confirm, setConfirm] = useState<'reset' | 'disconnect' | null>(null);
  const connected = data.account?.status === 'connected';
  useEffect(() => setName(data.workspace.name), [data.workspace.name]);
  async function connect() {
    if (repo.mode === 'demo') {
      window.open('/setup.html', '_blank', 'noopener');
      return;
    }
    await perform(async () => {
      const url = await repo.connect();
      if (!['www.instagram.com', 'instagram.com'].includes(new URL(url).hostname))
        throw new Error('Invalid authorization link.');
      location.assign(url);
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Settings</h1>
          <p>Your workspace. Your connections.</p>
        </div>
        <a className="button" href="/setup.html" target="_blank" rel="noopener noreferrer">
          <BookOpen size={15} />
          Setup guide
        </a>
      </div>
      <div className="settings-grid">
        <div className="settings-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Workspace</h2>
                <p>Only your team can see this name.</p>
              </div>
              <Badge tone="gray">{repo.mode === 'demo' ? 'Demo' : 'Live workspace'}</Badge>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(() => repo.renameWorkspace(name), 'Name saved.');
              }}
            >
              <label>
                Title
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !name.trim() || name === data.workspace.name}
              >
                Save name
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Instagram</h2>
                <p>An official connection to your professional account.</p>
              </div>
              <Camera size={21} className="settings-icon" />
            </div>
            <div className="integration-status">
              <span className="integration-icon">
                <Camera size={25} strokeWidth={1.3} />
              </span>
              <div>
                <strong>
                  {data.account?.username
                    ? '@' + data.account.username
                    : 'No account connected yet'}
                </strong>
                <p>
                  {repo.mode === 'demo'
                    ? 'Local simulation with no live messages'
                    : connected
                      ? 'Permissions and event subscriptions are active'
                      : data.account?.last_error ||
                        'Connect an Instagram Business or Creator account'}
                </p>
              </div>
              <Badge tone={connected ? 'green' : data.account?.status === 'error' ? 'red' : 'gray'}>
                {connected
                  ? 'Connected'
                  : data.account?.status === 'error'
                    ? 'Sign-in required'
                    : 'Not connected'}
              </Badge>
            </div>
            {data.account?.token_expires_at && (
              <p className="form-hint" style={{ marginBottom: 20 }}>
                Access expires on {day(data.account.token_expires_at)}. The server refreshes the
                token automatically.
              </p>
            )}
            <div className="settings-actions">
              <button className="button primary" disabled={busy} onClick={() => void connect()}>
                <Link2 size={14} />
                {repo.mode === 'demo'
                  ? 'How to connect'
                  : connected
                    ? 'Reconnect'
                    : 'Connect Instagram'}
              </button>
              {data.account && repo.mode === 'live' && (
                <button className="button" disabled={busy} onClick={() => setConfirm('disconnect')}>
                  <Unplug size={14} />
                  Disconnect
                </button>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Data and export</h2>
                <p>Save a copy of your loaded workspace data.</p>
              </div>
              <Database size={20} className="settings-icon" />
            </div>
            <p className="form-hint">
              The export includes contacts, flows, materials and loaded messages. Instagram tokens
              and server secrets are excluded. See the setup guide for a full database backup.
            </p>
            <div className="settings-actions" style={{ marginTop: 21 }}>
              <button
                className="button"
                onClick={() =>
                  download(
                    'growththread-' + new Date().toISOString().slice(0, 10) + '.json',
                    JSON.stringify(data, null, 2),
                  )
                }
              >
                <Download size={14} />
                Download current data
              </button>
              {repo.mode === 'demo' && (
                <button className="button" onClick={() => setConfirm('reset')}>
                  <RotateCcw size={14} />
                  Reset demo data
                </button>
              )}
            </div>
          </section>
        </div>
        <div className="settings-column">
          <section className="panel setup-checklist">
            <div className="panel-heading">
              <div>
                <h2>From testing to launch</h2>
                <p>Three steps to your live Direct.</p>
              </div>
              <ShieldCheck size={20} className="settings-icon" />
            </div>
            {[
              [
                '01',
                'Connect Supabase',
                'Database, team authentication and your material library.',
                repo.mode === 'live',
              ],
              [
                '02',
                'Configure your Meta app',
                'Instagram permissions and the event endpoint.',
                connected,
              ],
              [
                '03',
                'Authorize Instagram',
                "Connect through Instagram's official sign-in screen.",
                connected,
              ],
            ].map(([number, title, description, done]) => (
              <div className="setup-step" key={String(number)}>
                <span className={done ? 'done' : ''}>{done ? <Check size={14} /> : number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </div>
            ))}
            <a className="button full" href="/setup.html" target="_blank" rel="noopener noreferrer">
              Open setup guide
              <ArrowRight size={15} />
            </a>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Webhook URL</h2>
                <p>For your Meta app settings.</p>
              </div>
              <Link2 size={19} className="settings-icon" />
            </div>
            <p className="form-hint">
              The URL depends on your Supabase project. Get it from the setup guide and add it to
              your Meta settings.
            </p>
          </section>
          <section className="quiet-note">
            <ShieldCheck size={19} />
            <div>
              <strong>The messaging window is checked before sending.</strong>
              <p>
                Regular messages: 24 hours after a request. After a comment, one initial message is
                sent; the flow can continue after the learner replies.
              </p>
            </div>
          </section>
        </div>
      </div>
      {confirm && (
        <Modal
          title={confirm === 'reset' ? 'Reset demo data?' : 'Disconnect Instagram?'}
          onClose={() => setConfirm(null)}
        >
          <p className="form-hint">
            {confirm === 'reset'
              ? 'Your local demo changes will be replaced with the original examples. Cloud data will stay unchanged.'
              : 'The bot will stop sending messages. Saved conversations and leads will remain in the workspace.'}
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await perform(
                    () => (confirm === 'reset' ? repo.reset!() : repo.disconnect()),
                    confirm === 'reset' ? 'Demo workspace reset.' : 'Instagram disconnected.',
                  )
                )
                  setConfirm(null);
              }}
            >
              {confirm === 'reset' ? 'Reset demo workspace' : 'Disconnect account'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
