import { useEffect, useRef, useState } from 'react';
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
import { Avatar, Badge, day, Empty, leadLabels, time, useUI } from '../ui.tsx';
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
          <h1>Диалоги</h1>
          <p>Каждое обращение — на своём месте.</p>
        </div>
        <Badge tone="gray">{data.conversations.length} диалогов</Badge>
      </div>
      <div className="inbox-layout">
        <section className="conversation-list">
          <div className="list-search">
            <Search size={16} />
            <input
              aria-label="Поиск диалогов"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя или сообщение"
            />
          </div>
          <div className="inbox-filters">
            {[
              ['all', 'Все'],
              ['unread', 'Новые'],
              ['human', 'Менеджер'],
              ['closed', 'Закрытые'],
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
                        <strong>{p?.name || p?.username || 'Пользователь Instagram'}</strong>
                        <time>{time(c.last_message_at)}</time>
                      </div>
                      <p>{c.last_message}</p>
                      <div className="conversation-item-foot">
                        <span>
                          {c.mode === 'bot' ? (
                            <>
                              <Workflow size={11} />
                              Сценарий
                            </>
                          ) : (
                            <>
                              <UserRound size={11} />
                              Менеджер
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
                title="Диалоги не найдены"
                description="Попробуйте изменить поиск или фильтр."
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
                  <strong>{contact.name || contact.username || 'Пользователь Instagram'}</strong>
                  <small>{contact.username ? '@' + contact.username : 'Instagram Direct'}</small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Редактировать контакт"
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
                        ? 'Бот на паузе. Диалог передан менеджеру.'
                        : 'Бот включён для следующих обращений.',
                    )
                  }
                >
                  {conversation.mode === 'bot' ? <Pause size={13} /> : <Play size={13} />}
                  <span>{conversation.mode === 'bot' ? 'Пауза' : 'Включить бота'}</span>
                </button>
              </header>
              <div className="chat-status">
                <span>
                  <span
                    className={`status-dot ${conversation.mode === 'bot' ? 'green' : 'gray'}`}
                  />
                  {conversation.mode === 'bot' ? 'Сценарий активен' : 'Отвечает менеджер'}
                </span>
                <span>
                  <Clock3 size={12} />
                  {windowOpen ? `Окно ответа: ~${remaining} ч` : 'Окно ответа закрыто'}
                </span>
              </div>
              <div className="messages">
                <div className="chat-day">{day(conversation.last_message_at)}</div>
                {messages.map((m, i) => (
                  <div className={`message-row ${m.direction}`} key={m.id}>
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
                                  ? 'Ответить от имени тестового ученика'
                                  : 'Кнопка в сообщении клиента'
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
                          {m.source === 'bot'
                            ? 'Сценарий'
                            : m.source === 'operator'
                              ? 'Менеджер'
                              : ''}
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
                                {m.status === 'uncertain' ? 'Не подтверждено' : 'Ошибка'}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {m.error && <small className="message-error">{m.error}</small>}
                    </div>
                  </div>
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
                      Ответ менеджера
                    </button>
                    <button
                      type="button"
                      className={compose === 'student' ? 'active' : ''}
                      onClick={() => setCompose('student')}
                    >
                      Сообщение ученика
                    </button>
                  </div>
                )}
                <div className="composer-input">
                  <textarea
                    aria-label={compose === 'student' ? 'Сообщение ученика' : 'Ответ менеджера'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      compose === 'student'
                        ? 'Напишите от имени тестового ученика…'
                        : windowOpen
                          ? 'Напишите ответ…'
                          : 'Дождитесь нового сообщения клиента'
                    }
                    disabled={compose === 'operator' && !windowOpen}
                    rows={2}
                  />
                  <button
                    className="button primary"
                    aria-label="Отправить сообщение"
                    disabled={busy || !text.trim() || (compose === 'operator' && !windowOpen)}
                  >
                    <Send size={17} />
                  </button>
                </div>
                <small>
                  {compose === 'student'
                    ? 'Сообщение запустит сценарий в локальном симуляторе.'
                    : 'Ваш ответ автоматически ставит бота на паузу.'}{' '}
                  <span>{new TextEncoder().encode(text).length}/1000 байт</span>
                </small>
              </form>
            </section>
            <aside className="contact-detail">
              <div className="contact-cover">
                <Avatar name={contact.name || contact.username} />
                <h3>{contact.name || 'Пользователь Instagram'}</h3>
                <p>{contact.username ? '@' + contact.username : ''}</p>
                <Badge tone={contact.is_lead ? 'green' : 'gray'}>
                  {contact.is_lead ? 'Заявка' : 'Контакт'}
                </Badge>
              </div>
              <div className="detail-section">
                <h4>КОНТАКТ</h4>
                <dl>
                  <dt>Email</dt>
                  <dd>{contact.email || 'Не указан'}</dd>
                  <dt>Телефон</dt>
                  <dd>{contact.phone || 'Не указан'}</dd>
                  <dt>Источник</dt>
                  <dd>{contact.source}</dd>
                </dl>
              </div>
              <div className="detail-section">
                <h4>СТАТУС</h4>
                <select
                  aria-label="Статус контакта"
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
                  Редактировать
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
                      conversation.status === 'closed' ? 'Диалог открыт.' : 'Диалог закрыт.',
                    )
                  }
                >
                  <CheckCheck size={14} />
                  {conversation.status === 'closed' ? 'Открыть диалог' : 'Закрыть диалог'}
                </button>
              </div>
            </aside>
          </>
        ) : (
          <section className="chat">
            <Empty
              title="Начните с диалога"
              description="Входящие сообщения появятся здесь после подключения Instagram."
            />
          </section>
        )}
      </div>
      {editing && <ContactEditor contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
