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
    ['new', 'New'],
    ['qualified', 'Interested'],
    ['contacted', 'In touch'],
    ['enrolled', 'Enrolled'],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR NEXT STUDENTS</div>
          <h1>Leads</h1>
          <p>From interest to a conversation with your team.</p>
        </div>
        <button
          className="button"
          disabled={!list.length}
          onClick={() =>
            download(
              'growththread-leads-' + new Date().toISOString().slice(0, 10) + '.csv',
              contactsCsv(list),
              'text/csv;charset=utf-8',
            )
          }
        >
          <Download size={15} />
          Export CSV
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
              aria-label="Search leads"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, contact details or tag"
            />
          </div>
          <select
            aria-label="Filter by lead status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
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
                  <th>LEARNER</th>
                  <th>CONTACT</th>
                  <th>STATUS</th>
                  <th>SOURCE</th>
                  <th>DATE</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-person">
                        <Avatar name={c.name || c.username} size="small" />
                        <div>
                          <strong>{c.name || c.username || 'Instagram user'}</strong>
                          <small>{c.username ? '@' + c.username : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.email || c.phone || 'Not provided'}
                      {c.email && c.phone && (
                        <small style={{ display: 'block', marginTop: 5 }}>{c.phone}</small>
                      )}
                    </td>
                    <td>
                      <select
                        className="inline-select"
                        aria-label={'Status ' + (c.name || c.username)}
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
                          aria-label={'Conversation ' + (c.name || c.username)}
                          onClick={() => {
                            const chat = data.conversations.find((x) => x.contact_id === c.id);
                            if (chat) openInbox(chat.id);
                            else notify("This contact doesn't have a conversation yet.");
                          }}
                        >
                          <MessageCircle size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={'Edit ' + (c.name || c.username)}
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
            title="Your future learners will appear here"
            description="A flow saves a lead when someone leaves their details. You can also mark a contact as a lead in a conversation."
          />
        )}
      </section>
      {editing && <ContactEditor contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
