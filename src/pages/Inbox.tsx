import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  Edit3,
  Mail,
  Pause,
  Play,
  Search,
  Send,
  UserRound,
  Workflow,
  CheckCheck,
} from 'lucide-react';
import { canSend, isHttpsUrl } from '../../shared/engine.ts';
import type { Contact } from '../../shared/types.ts';
import { Avatar, Badge, day, dayKey, Empty, leadLabels, time, useUI } from '../ui.tsx';
import { ContactEditor } from '../components/ContactEditor.tsx';
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https:\/\/[^\s]+)/g).map((part, i) =>
        isHttpsUrl(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
export function Inbox({
  selectedId,
  query: globalQuery,
}: {
  selectedId: string | null;
  query: string;
}) {
  const { data, repo, perform, busy, notify } = useUI(),
    [selected, setSelected] = useState<string | null>(selectedId),
    [query, setQuery] = useState(globalQuery),
    [filter, setFilter] = useState('all'),
    [text, setText] = useState(''),
    [compose, setCompose] = useState<'operator' | 'student'>('operator'),
    [editing, setEditing] = useState<Contact | null>(null),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setQuery(globalQuery);
  }, [globalQuery]);
  useEffect(() => {
    if (selectedId) setSelected(selectedId);
  }, [selectedId]);
  const list = data.conversations
    .filter((c) => {
      const p = data.contacts.find((x) => x.id === c.contact_id);
      const found = [p?.name, p?.username, c.last_message]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase());
      return (
        found &&
        (filter === 'all' ||
          (filter === 'human' && c.mode === 'human') ||
          (filter === 'unread' && c.unread_count > 0) ||
          (filter === 'closed' && c.status === 'closed'))
      );
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  const conversation = data.conversations.find((c) => c.id === (selected ?? list[0]?.id)),
    contact = data.contacts.find((p) => p.id === conversation?.contact_id),
    messages = data.messages
      .filter((m) => m.conversation_id === conversation?.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const windowOpen = canSend(conversation?.window_expires_at ?? null),
    remaining = conversation?.window_expires_at
      ? Math.max(0, Math.ceil((Date.parse(conversation.window_expires_at) - Date.now()) / 3600000))
      : 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [conversation?.id, messages.length]);
  useEffect(() => {
    if (conversation?.unread_count)
      void repo.updateConversation(conversation.id, { unread_count: 0 }).catch(() => undefined);
  }, [conversation?.id, conversation?.unread_count, repo]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONVERSATIONS</div>
          <h1>Inbox</h1>
          <p>A place for every conversation.</p>
        </div>
        <Badge tone="gray">{data.conversations.length} conversations</Badge>
      </div>
      <div className="inbox-layout">
        <section className="conversation-list">
          <div className="list-search">
            <Search size={16} />
            <input
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or message"
            />
          </div>
          <div className="inbox-filters">
            {[
              ['all', 'All'],
              ['unread', 'New'],
              ['human', 'Team'],
              ['closed', 'Closed'],
            ].map(([key, label]) => (
              <button
                className={filter === key ? 'active' : ''}
                key={key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="conversation-scroll">
            {list.length ? (
              list.map((c) => {
                const p = data.contacts.find((x) => x.id === c.contact_id);
                return (
                  <button
                    className={`conversation-item ${conversation?.id === c.id ? 'active' : ''}`}
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                  >
                    <Avatar name={p?.name || p?.username || 'Instagram'} />
                    <div>
                      <div className="conversation-item-head">
                        <strong>{p?.name || p?.username || 'Instagram user'}</strong>
                        <time>{time(c.last_message_at)}</time>
                      </div>
                      <p>{c.last_message}</p>
                      <div className="conversation-item-foot">
                        <span>
                          {c.mode === 'bot' ? (
                            <>
                              <Workflow size={11} />
                              Flow
                            </>
                          ) : (
                            <>
                              <UserRound size={11} />
                              Team
                            </>
                          )}
                        </span>
                        {c.unread_count > 0 && <b>{c.unread_count}</b>}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <Empty
                title="No conversations found"
                description="Try a different search or filter."
              />
            )}
          </div>
        </section>
        {conversation && contact ? (
          <>
            <section className="chat">
              <header className="chat-heading">
                <Avatar name={contact.name || contact.username} />
                <div>
                  <strong>{contact.name || contact.username || 'Instagram user'}</strong>
                  <small>{contact.username ? '@' + contact.username : 'Instagram Direct'}</small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Edit contact"
                  onClick={() => setEditing(contact)}
                >
                  <Edit3 size={17} />
                </button>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () =>
                        repo.updateConversation(conversation.id, {
                          mode: conversation.mode === 'bot' ? 'human' : 'bot',
                        }),
                      conversation.mode === 'bot'
                        ? 'Bot paused. Your team has taken over.'
                        : 'Bot enabled for future requests.',
                    )
                  }
                >
                  {conversation.mode === 'bot' ? <Pause size={13} /> : <Play size={13} />}
                  <span>{conversation.mode === 'bot' ? 'Pause' : 'Enable bot'}</span>
                </button>
              </header>
              <div className="chat-status">
                <span>
                  <span
                    className={`status-dot ${conversation.mode === 'bot' ? 'green' : 'gray'}`}
                  />
                  {conversation.mode === 'bot' ? 'Flow active' : 'Team is replying'}
                </span>
                <span>
                  <Clock3 size={12} />
                  {windowOpen ? `Reply window: ~${remaining} h` : 'Reply window closed'}
                </span>
              </div>
              <div className="messages">
                {messages.map((m, i) => (
                  <Fragment key={m.id}>
                    {(i === 0 || dayKey(messages[i - 1].created_at) !== dayKey(m.created_at)) && (
                      <div className="chat-day">{day(m.created_at)}</div>
                    )}
                    <div className={`message-row ${m.direction}`}>
                      <div className="message">
                        <div className="message-body">
                          <Body text={m.body} />
                        </div>
                        {m.quick_replies?.length ? (
                          <div className="quick-replies">
                            {m.quick_replies.map((q) => (
                              <button
                                key={q.payload}
                                disabled={repo.mode !== 'demo' || busy || i !== messages.length - 1}
                                title={
                                  repo.mode === 'demo'
                                    ? 'Reply as the test learner'
                                    : "Button in the customer's message"
                                }
                                onClick={() =>
                                  void perform(() =>
                                    repo.simulate!({
                                      kind: 'dm',
                                      text: q.title,
                                      payload: q.payload,
                                      contactId: contact.id,
                                    }),
                                  )
                                }
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
                          {m.direction === 'out' && (
                            <span>
                              {m.status === 'accepted' ? (
                                <Check size={12} />
                              ) : m.status === 'queued' ? (
                                <Clock3 size={12} />
                              ) : (
                                <span className="message-error-status">
                                  {m.status === 'uncertain' ? 'Unconfirmed' : 'Error'}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {m.error && <small className="message-error">{m.error}</small>}
                      </div>
                    </div>
                  </Fragment>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  const ok = await perform(() =>
                    compose === 'student' && repo.simulate
                      ? repo.simulate({ kind: 'dm', text, contactId: contact.id })
                      : repo.send(conversation.id, text),
                  );
                  if (ok) setText('');
                }}
              >
                {repo.mode === 'demo' && (
                  <div className="compose-mode">
                    <button
                      type="button"
                      className={compose === 'operator' ? 'active' : ''}
                      onClick={() => setCompose('operator')}
                    >
                      Team reply
                    </button>
                    <button
                      type="button"
                      className={compose === 'student' ? 'active' : ''}
                      onClick={() => setCompose('student')}
                    >
                      Learner message
                    </button>
                  </div>
                )}
                <div className="composer-input">
                  <textarea
                    aria-label={compose === 'student' ? 'Learner message' : 'Team reply'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      compose === 'student'
                        ? 'Write as the test learner…'
                        : windowOpen
                          ? 'Write a reply…'
                          : 'Wait for a new message from the customer'
                    }
                    disabled={compose === 'operator' && !windowOpen}
                    rows={2}
                  />
                  <button
                    className="button primary"
                    aria-label="Send message"
                    disabled={busy || !text.trim() || (compose === 'operator' && !windowOpen)}
                  >
                    <Send size={17} />
                  </button>
                </div>
                <small>
                  {compose === 'student'
                    ? 'This message will trigger a flow in the local simulator.'
                    : 'Your reply automatically pauses the bot.'}{' '}
                  <span>{new TextEncoder().encode(text).length}/1000 bytes</span>
                </small>
              </form>
            </section>
            <aside className="contact-detail">
              <div className="contact-cover">
                <Avatar name={contact.name || contact.username} />
                <h3>{contact.name || 'Instagram user'}</h3>
                <p>{contact.username ? '@' + contact.username : ''}</p>
                <Badge tone={contact.is_lead ? 'green' : 'gray'}>
                  {contact.is_lead ? 'Lead' : 'Contact'}
                </Badge>
              </div>
              <div className="detail-section">
                <h4>CONTACT</h4>
                <dl>
                  <dt>Email</dt>
                  <dd>{contact.email || 'Not provided'}</dd>
                  <dt>Phone</dt>
                  <dd>{contact.phone || 'Not provided'}</dd>
                  <dt>Source</dt>
                  <dd>{contact.source}</dd>
                </dl>
              </div>
              <div className="detail-section">
                <h4>STATUS</h4>
                <select
                  aria-label="Contact status"
                  value={contact.status}
                  onChange={(e) =>
                    void perform(() =>
                      repo.updateContact(contact.id, {
                        status: e.target.value as Contact['status'],
                      }),
                    )
                  }
                >
                  {Object.entries(leadLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="tag-list">
                  {contact.tags.map((tag) => (
                    <Badge tone="gray" key={tag}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="detail-section">
                <button className="button full" onClick={() => setEditing(contact)}>
                  <Edit3 size={14} />
                  Edit
                </button>
                <button
                  className="button full"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () =>
                        repo.updateConversation(conversation.id, {
                          status: conversation.status === 'closed' ? 'open' : 'closed',
                          ...(conversation.status === 'open' ? { mode: 'human' as const } : {}),
                        }),
                      conversation.status === 'closed'
                        ? 'Conversation opened.'
                        : 'Conversation closed.',
                    )
                  }
                >
                  <CheckCheck size={14} />
                  {conversation.status === 'closed' ? 'Open conversation' : 'Close conversation'}
                </button>
              </div>
            </aside>
          </>
        ) : (
          <section className="chat">
            <Empty
              title="Start with a conversation"
              description="Incoming messages will appear here after you connect Instagram."
            />
          </section>
        )}
      </div>
      {editing && <ContactEditor contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
