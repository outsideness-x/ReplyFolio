import { useRef, useEffect, useState } from 'react';
import { ArrowRight, FlaskConical, MessageCircle, Plus, Send, Workflow } from 'lucide-react';
import { selectFlow } from '../../shared/engine.ts';
import { Avatar, Badge, Empty, time, useUI } from '../ui.tsx';
export function Lab() {
  const { data, repo, perform, openInbox, busy } = useUI(),
    [contactId, setContactId] = useState(''),
    [currentId, setCurrentId] = useState<string | null>(null),
    [text, setText] = useState('materials'),
    [kind, setKind] = useState<'dm' | 'comment'>('dm'),
    [postId, setPostId] = useState(''),
    bottom = useRef<HTMLDivElement>(null);
  const c = data.conversations.find(
      (c) => c.id === currentId || (!!contactId && c.contact_id === contactId),
    ),
    person = data.contacts.find((p) => p.id === (c?.contact_id ?? contactId)),
    messages = data.messages.filter((m) => m.conversation_id === c?.id),
    matching = selectFlow(data.flows, kind, text, postId);
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
  if (repo.mode === 'live')
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">TRY YOUR FLOW</div>
            <h1>Simulator</h1>
            <p>Test your flow before running it for learners.</p>
          </div>
        </div>
        <section className="panel">
          <Empty
            title="The simulator runs in the demo workspace"
            description="Open a separate demo workspace to test flows. Live messages and leads will stay unchanged."
          >
            <a className="button primary" href="?demo=1#/lab">
              Open demo workspace
              <ArrowRight size={16} />
            </a>
          </Empty>
        </section>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRY YOUR FLOW</div>
          <h1>Simulator</h1>
          <p>See the flow through a future learner's eyes.</p>
        </div>
        <Badge tone="gray">
          <FlaskConical size={12} />
          Local test
        </Badge>
      </div>
      <div className="lab-grid">
        <section className="panel lab-controls">
          <div className="panel-heading">
            <div>
              <h2>First message</h2>
              <p>Replies will appear in the conversation on the right.</p>
            </div>
            <MessageCircle size={19} />
          </div>
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
                placeholder="For example: I'd like the materials"
                rows={4}
              />
            </label>
            <button className="button primary full" disabled={busy || !text.trim()}>
              <Send size={15} />
              Send to simulator
            </button>
          </form>
          <div className="lab-suggestions">
            {['materials', 'price', 'team', 'stop'].map((keyword) => (
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
                    ? 'The active conversation will continue its current flow.'
                    : matching
                      ? 'Ready to run.'
                      : 'Check the keywords and whether the flow is active.'}
              </p>
            </div>
          </div>
          <p className="form-hint">Data stays in this browser. Nothing is sent to Instagram.</p>
          <div className="lab-bottom">
            <button
              className="button small"
              onClick={() => {
                setContactId('');
                setCurrentId(null);
                setText('materials');
              }}
            >
              <Plus size={14} />
              New learner
            </button>
            {c && (
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
              <div ref={bottom} />
            </div>
            <div className="phone-bottom">LOCAL DEMO · INSTAGRAM DIRECT</div>
          </div>
        </section>
      </div>
    </>
  );
}
