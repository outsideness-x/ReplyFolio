import { useRef, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  FastForward,
  FlaskConical,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Workflow,
} from 'lucide-react';
import { selectFlow } from '../../shared/engine.ts';
import type { Snapshot } from '../../shared/types.ts';
import { LocalRepository } from '../data/local.ts';
import type { Repository } from '../data/repository.ts';
import { Avatar, Badge, Empty, Loading, time, useUI } from '../ui.tsx';
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
// The sandbox copies only flows and materials: no contacts, conversations or account.
function sandboxSeed(live: Snapshot, drafts: boolean): Snapshot {
  return {
    workspace: live.workspace,
    contacts: [],
    conversations: [],
    messages: [],
    runs: [],
    account: null,
    materials: structuredClone(live.materials),
    flows: live.flows.map((f) => ({ ...structuredClone(f), enabled: f.enabled || drafts })),
  };
}
type Runner = {
  repo: Repository;
  data: Snapshot;
  perform: (action: () => Promise<unknown>) => Promise<boolean>;
  busy: boolean;
};
export function Lab() {
  const ui = useUI(),
    [drafts, setDrafts] = useState(false),
    [generation, setGeneration] = useState(0),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false);
  const live = ui.repo.mode === 'live';
  // Seeded once per restart: background refreshes of the live workspace must not reset a test.
  const sandbox = useMemo(
    () =>
      live
        ? new LocalRepository(memoryStorage(), Date.now, () => sandboxSeed(ui.data, drafts))
        : null,
    [live, drafts, generation],
  );
  useEffect(() => {
    if (!sandbox) return;
    let active = true;
    const refresh = () => void sandbox.load().then((s) => active && setSnapshot(s));
    refresh();
    const unsubscribe = sandbox.subscribe(refresh);
    const timer = setInterval(() => void sandbox.processDue(), 5000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [sandbox]);
  if (!sandbox)
    return (
      <Simulator
        runner={{ repo: ui.repo, data: ui.data, perform: ui.perform, busy: ui.busy }}
        onRestart={null}
      />
    );
  if (!snapshot) return <Loading />;
  const restart = () => {
    setSnapshot(null);
    setGeneration((n) => n + 1);
  };
  return (
    <Simulator
      key={generation + (drafts ? ':drafts' : '')}
      runner={{
        repo: sandbox,
        data: snapshot,
        busy,
        perform: async (action) => {
          setBusy(true);
          try {
            await action();
            setSnapshot(await sandbox.load());
            return true;
          } catch (e) {
            ui.notify(e instanceof Error ? e.message : 'Unable to run the flow.');
            return false;
          } finally {
            setBusy(false);
          }
        },
      }}
      onRestart={restart}
      drafts={{
        value: drafts,
        count: ui.data.flows.filter((f) => !f.enabled).length,
        set: (value) => {
          setSnapshot(null);
          setDrafts(value);
        },
      }}
    />
  );
}
function Simulator({
  runner: { repo, data, perform, busy },
  onRestart,
  drafts,
}: {
  runner: Runner;
  onRestart: (() => void) | null;
  drafts?: { value: boolean; count: number; set: (value: boolean) => void };
}) {
  const { openInbox } = useUI(),
    sandbox = onRestart !== null,
    [contactId, setContactId] = useState(''),
    [currentId, setCurrentId] = useState<string | null>(null),
    [text, setText] = useState(sandbox ? '' : 'materials'),
    [kind, setKind] = useState<'dm' | 'comment'>('dm'),
    [postId, setPostId] = useState(''),
    bottom = useRef<HTMLDivElement>(null);
  const c = data.conversations.find(
      (c) => c.id === currentId || (!!contactId && c.contact_id === contactId),
    ),
    person = data.contacts.find((p) => p.id === (c?.contact_id ?? contactId)),
    messages = data.messages.filter((m) => m.conversation_id === c?.id),
    matching = selectFlow(data.flows, kind, text, postId),
    resumeAt = c ? (repo.pendingDelay?.(c.id) ?? null) : null,
    suggestions = sandbox
      ? [
          ...new Set([
            ...data.flows
              .filter((f) => f.enabled && f.trigger_kind === 'dm_keyword')
              .flatMap((f) => f.keywords.slice(0, 1))
              .slice(0, 4),
            'team',
            'stop',
          ]),
        ]
      : ['materials', 'price', 'team', 'stop'];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);
  async function simulate(message: string, payload?: string) {
    return await perform(async () => {
      const id = await repo.simulate!({
        kind,
        text: message,
        contactId: contactId || undefined,
        postId: postId || undefined,
        payload,
      });
      setCurrentId(id);
      const fresh = await repo.load();
      setContactId(fresh.conversations.find((c) => c.id === id)!.contact_id);
    });
  }
  function newLearner() {
    if (onRestart) return onRestart();
    setContactId('');
    setCurrentId(null);
    setText('materials');
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRY YOUR FLOW</div>
          <h1>Simulator</h1>
          <p>
            {sandbox
              ? 'Your saved flows, run by the same engine as the server.'
              : "See the flow through a future learner's eyes."}
          </p>
        </div>
        <Badge tone="gray">
          <FlaskConical size={12} />
          {sandbox ? 'Sandbox' : 'Local test'}
        </Badge>
      </div>
      <div className="lab-grid">
        <section className="panel lab-controls">
          <div className="panel-heading">
            <div>
              <h2>Message</h2>
              <p>Write as a learner. Replies appear in the preview.</p>
            </div>
            <MessageCircle size={19} />
          </div>
          {sandbox ? (
            drafts &&
            drafts.count > 0 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={drafts.value}
                  onChange={(e) => drafts.set(e.target.checked)}
                />
                Include {drafts.count} draft {drafts.count === 1 ? 'flow' : 'flows'}
              </label>
            )
          ) : (
            <label>
              Learner
              <select
                aria-label="Learner in the simulator"
                value={contactId}
                onChange={(e) => {
                  setContactId(e.target.value);
                  setCurrentId(null);
                }}
              >
                <option value="">New test learner</option>
                {data.contacts.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name || p.username || 'Instagram contact'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Request source
            <select
              aria-label="Request type"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'dm' | 'comment')}
            >
              <option value="dm">Direct message</option>
              <option value="comment">Comment on a post</option>
            </select>
          </label>
          {kind === 'comment' && (
            <label>
              Post ID
              <input
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                placeholder="If the flow is linked to a post"
              />
            </label>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await simulate(text)) setText('');
            }}
          >
            <label>
              Learner message
              <textarea
                aria-label="Test message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="For example: I'd like the materials"
                rows={3}
              />
            </label>
            <button className="button primary full" disabled={busy || !text.trim()}>
              <Send size={15} />
              Send to simulator
            </button>
          </form>
          <div className="lab-suggestions">
            {suggestions.map((keyword) => (
              <button key={keyword} onClick={() => setText(keyword)}>
                {keyword}
              </button>
            ))}
          </div>
          <div className="lab-matching">
            <Workflow size={18} />
            <div>
              <small>MATCHING FLOW</small>
              <strong>{matching?.name || 'No match'}</strong>
              <p>
                {c?.mode === 'human'
                  ? 'Bot paused: your team has taken over.'
                  : c
                    ? "An active flow continues unless this is another flow's keyword."
                    : matching
                      ? 'Ready to run.'
                      : data.flows.some((f) => f.enabled)
                        ? 'Check the keywords and whether the flow is active.'
                        : 'No active flows yet. Enable a flow or include drafts.'}
              </p>
            </div>
          </div>
          <p className="form-hint">
            {sandbox
              ? 'Nothing is saved, and nothing is sent to Instagram. Leads and conversations stay unchanged.'
              : 'Data stays in this browser. Nothing is sent to Instagram.'}
          </p>
          <div className="lab-bottom">
            <button className="button small" onClick={newLearner}>
              {sandbox ? <RotateCcw size={14} /> : <Plus size={14} />}
              {sandbox ? 'Start over' : 'New learner'}
            </button>
            {c && !sandbox && (
              <button className="button small" onClick={() => openInbox(c.id)}>
                Open conversation
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </section>
        <section className="lab-preview">
          <div className="preview-label">
            <span />
            CONVERSATION PREVIEW
          </div>
          <div className="phone-preview">
            <div className="phone-notch" />
            <div className="phone-header">
              <Avatar name={person?.name || 'New learner'} size="small" />
              <div>
                <strong>{person?.name || 'New learner'}</strong>
                <small>{c?.mode === 'human' ? 'Team' : 'GrowthThread · test bot'}</small>
              </div>
              <MessageCircle size={18} />
            </div>
            <div className="phone-messages">
              {messages.length ? (
                messages.map((m, i) => (
                  <div className={`message-row ${m.direction}`} key={m.id}>
                    <div className="message">
                      <div className="message-body">{m.body}</div>
                      {m.quick_replies?.length && i === messages.length - 1 ? (
                        <div className="quick-replies">
                          {m.quick_replies.map((q) => (
                            <button
                              key={q.payload}
                              disabled={busy}
                              onClick={() => {
                                setKind('dm');
                                void perform(async () => {
                                  const id = await repo.simulate!({
                                    kind: 'dm',
                                    text: q.title,
                                    payload: q.payload,
                                    contactId,
                                  });
                                  setCurrentId(id);
                                });
                              }}
                            >
                              {q.title}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="message-meta">
                        <span>
                          {m.source === 'bot' ? 'Flow' : m.source === 'operator' ? 'Team' : ''}
                        </span>
                        <time>{time(m.created_at)}</time>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="Hello, new conversation"
                  description="Send the first message and see how your flow responds."
                />
              )}
              {resumeAt && c && (
                <div className="phone-wait">
                  <Clock3 size={13} />
                  <span>Delay until {time(resumeAt)}</span>
                  <button disabled={busy} onClick={() => void perform(() => repo.skipDelay!(c.id))}>
                    <FastForward size={12} />
                    Skip
                  </button>
                </div>
              )}
              <div ref={bottom} />
            </div>
            <div className="phone-bottom">
              {sandbox ? 'SANDBOX · NOTHING IS SENT' : 'LOCAL DEMO · INSTAGRAM DIRECT'}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
