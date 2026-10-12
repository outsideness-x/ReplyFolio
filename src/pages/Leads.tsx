import { useState } from 'react';
import { Download, Edit3, MessageCircle, Search, Users } from 'lucide-react';
import type { Contact, LeadStatus } from '../../shared/types.ts';
import { contactsCsv } from '../../shared/export.ts';
import { Avatar, Badge, day, download, Empty, leadLabels, useUI } from '../ui.tsx';
import { ContactEditor } from '../components/ContactEditor.tsx';
export function Leads() {
  const { data, perform, repo, openInbox, notify } = useUI(),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [editing, setEditing] = useState<Contact | null>(null);
  const all = data.contacts.filter((c) => c.is_lead),
    list = all
      .filter(
        (c) =>
          (status === 'all' || c.status === status) &&
          [c.name, c.username, c.email, c.phone, ...c.tags]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const stats = [
    ['new', 'Новые'],
    ['qualified', 'Заинтересованы'],
    ['contacted', 'На связи'],
    ['enrolled', 'Начали обучение'],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR NEXT STUDENTS</div>
          <h1>Заявки</h1>
          <p>От интереса к знакомству с вашей командой.</p>
        </div>
        <button
          className="button"
          disabled={!list.length}
          onClick={() =>
            download(
              'replyfolio-leads-' + new Date().toISOString().slice(0, 10) + '.csv',
              contactsCsv(list),
              'text/csv;charset=utf-8',
            )
          }
        >
          <Download size={15} />
          Экспорт CSV
        </button>
      </div>
      <div className="stats-grid compact">
        {stats.map(([value, label]) => (
          <button
            className={`stat-card stat-filter ${status === value ? 'selected' : ''}`}
            key={value}
            onClick={() => setStatus(status === value ? 'all' : value)}
          >
            <div className="stat-top">
              <span>{label}</span>
              <Users size={17} />
            </div>
            <strong>{all.filter((c) => c.status === value).length}</strong>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={16} />
            <input
              aria-label="Поиск заявок"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя, контакт или тег"
            />
          </div>
          <select
            aria-label="Фильтр статуса заявки"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Все статусы</option>
            {Object.entries(leadLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {list.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>УЧЕНИК</th>
                  <th>КОНТАКТ</th>
                  <th>СТАТУС</th>
                  <th>ИСТОЧНИК</th>
                  <th>ДАТА</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-person">
                        <Avatar name={c.name || c.username} size="small" />
                        <div>
                          <strong>{c.name || c.username || 'Пользователь Instagram'}</strong>
                          <small>{c.username ? '@' + c.username : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.email || c.phone || 'Не указан'}
                      {c.email && c.phone && (
                        <small style={{ display: 'block', marginTop: 5 }}>{c.phone}</small>
                      )}
                    </td>
                    <td>
                      <select
                        className="inline-select"
                        aria-label={'Статус ' + (c.name || c.username)}
                        value={c.status}
                        onChange={(e) =>
                          void perform(() =>
                            repo.updateContact(c.id, { status: e.target.value as LeadStatus }),
                          )
                        }
                      >
                        {Object.entries(leadLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Badge tone="gray">{c.source}</Badge>
                    </td>
                    <td>{day(c.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={'Диалог ' + (c.name || c.username)}
                          onClick={() => {
                            const chat = data.conversations.find((x) => x.contact_id === c.id);
                            if (chat) openInbox(chat.id);
                            else notify('У этого контакта ещё нет диалога.');
                          }}
                        >
                          <MessageCircle size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={'Редактировать ' + (c.name || c.username)}
                          onClick={() => setEditing(c)}
                        >
                          <Edit3 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Здесь появятся ваши будущие ученики"
            description="Сценарий сохранит заявку, когда человек оставит контакт. Также можно отметить контакт как заявку в диалоге."
          />
        )}
      </section>
      {editing && <ContactEditor contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
