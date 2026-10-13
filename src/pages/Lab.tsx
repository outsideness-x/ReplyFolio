import { useRef, useEffect, useState } from 'react';
import { ArrowRight, FlaskConical, MessageCircle, Plus, Send, Workflow } from 'lucide-react';
import { selectFlow } from '../../shared/engine.ts';
import { Avatar, Badge, Empty, time, useUI } from '../ui.tsx';
export function Lab() {
  const { data, repo, perform, openInbox, busy } = useUI(),
    [contactId, setContactId] = useState(''),
    [currentId, setCurrentId] = useState<string | null>(null),
    [text, setText] = useState('материалы'),
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
            <h1>Симулятор</h1>
            <p>Проверьте логику, прежде чем запускать её для учеников.</p>
          </div>
        </div>
        <section className="panel">
          <Empty
            title="Симулятор работает в демосреде"
            description="Откройте отдельную демосреду, чтобы протестировать сценарии. Реальные сообщения и заявки не изменятся."
          >
            <a className="button primary" href="?demo=1#/lab">
              Открыть демосреду
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
          <h1>Симулятор</h1>
          <p>Посмотрите на сценарий глазами будущего ученика.</p>
        </div>
        <Badge tone="gray">
          <FlaskConical size={12} />
          Локальный тест
        </Badge>
      </div>
      <div className="lab-grid">
        <section className="panel lab-controls">
          <div className="panel-heading">
            <div>
              <h2>Первое сообщение</h2>
              <p>Ответы появятся в диалоге справа.</p>
            </div>
            <MessageCircle size={19} />
          </div>
          <label>
            Ученик
            <select
              aria-label="Ученик в симуляторе"
              value={contactId}
              onChange={(e) => {
                setContactId(e.target.value);
                setCurrentId(null);
              }}
            >
              <option value="">Новый тестовый ученик</option>
              {data.contacts.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name || p.username || 'Контакт Instagram'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Откуда обращение
            <select
              aria-label="Тип обращения"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'dm' | 'comment')}
            >
              <option value="dm">Сообщение в Direct</option>
              <option value="comment">Комментарий к публикации</option>
            </select>
          </label>
          {kind === 'comment' && (
            <label>
              ID публикации
              <input
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                placeholder="Если сценарий привязан к публикации"
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
              Сообщение ученика
              <textarea
                aria-label="Тестовое сообщение"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Например: хочу материалы"
                rows={4}
              />
            </label>
            <button className="button primary full" disabled={busy || !text.trim()}>
              <Send size={15} />
              Отправить в симулятор
            </button>
          </form>
          <div className="lab-suggestions">
            {['материалы', 'прайс', 'менеджер', 'стоп'].map((keyword) => (
              <button key={keyword} onClick={() => setText(keyword)}>
                {keyword}
              </button>
            ))}
          </div>
          <div className="lab-matching">
            <Workflow size={18} />
            <div>
              <small>СЦЕНАРИЙ ПО ТРИГГЕРУ</small>
              <strong>{matching?.name || 'Нет совпадения'}</strong>
              <p>
                {c?.mode === 'human'
                  ? 'Бот на паузе: диалог передан менеджеру.'
                  : c
                    ? 'Активный диалог продолжит текущий сценарий.'
                    : matching
                      ? 'Готов к запуску.'
                      : 'Проверьте ключевые слова и активность сценария.'}
              </p>
            </div>
          </div>
          <p className="form-hint">
            Данные остаются в этом браузере. В Instagram ничего не отправляется.
          </p>
          <div className="lab-bottom">
            <button
              className="button small"
              onClick={() => {
                setContactId('');
                setCurrentId(null);
                setText('материалы');
              }}
            >
              <Plus size={14} />
              Новый ученик
            </button>
            {c && (
              <button className="button small" onClick={() => openInbox(c.id)}>
                Открыть диалог
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </section>
        <section className="lab-preview">
          <div className="preview-label">
            <span />
            ПРЕДПРОСМОТР ДИАЛОГА
          </div>
          <div className="phone-preview">
            <div className="phone-notch" />
            <div className="phone-header">
              <Avatar name={person?.name || 'Новый ученик'} size="small" />
              <div>
                <strong>{person?.name || 'Новый ученик'}</strong>
                <small>{c?.mode === 'human' ? 'Менеджер' : 'GrowthThread · тестовый бот'}</small>
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
                          {m.source === 'bot'
                            ? 'Сценарий'
                            : m.source === 'operator'
                              ? 'Менеджер'
                              : ''}
                        </span>
                        <time>{time(m.created_at)}</time>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="Привет, новый диалог"
                  description="Отправьте первое сообщение и посмотрите, как ответит ваш сценарий."
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
