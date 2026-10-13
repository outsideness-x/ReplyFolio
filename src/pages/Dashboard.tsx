import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  MessageCircle,
  MessagesSquare,
  MousePointerClick,
  Play,
  Users,
  Workflow,
} from 'lucide-react';
import { Badge, day, Empty, time, useUI } from '../ui.tsx';
export function Dashboard() {
  const { data, repo, navigate, openInbox } = useUI(),
    [period, setPeriod] = useState(7);
  const leads = data.contacts.filter((c) => c.is_lead),
    human = data.conversations.filter((c) => c.mode === 'human' && c.status === 'open');
  const stats = [
    {
      label: 'Inbox',
      value: data.conversations.length,
      icon: MessagesSquare,
      detail: `${data.conversations.filter((c) => c.unread_count > 0).length} with new messages`,
      color: 'blue',
    },
    {
      label: 'Leads',
      value: leads.length,
      icon: Users,
      detail: `${leads.filter((c) => c.status === 'new').length} awaiting review`,
      color: 'purple',
    },
    {
      label: 'Active flows',
      value: data.flows.filter((f) => f.enabled).length,
      icon: Workflow,
      detail: `of ${data.flows.length} created`,
      color: 'cyan',
    },
    {
      label: 'Needs the team',
      value: human.length,
      icon: MousePointerClick,
      detail: 'Conversations handled by your team',
      color: 'orange',
    },
  ];
  const points = Array.from({ length: period }, (_, i) => {
    const date = new Date(Date.now() - (period - i - 1) * 86400000);
    const dateString = date.toISOString().slice(0, 10);
    return {
      date,
      count: data.messages.filter(
        (m) => m.direction === 'in' && m.created_at.slice(0, 10) === dateString,
      ).length,
    };
  });
  const max = Math.max(4, ...points.map((p) => p.count)),
    path = points
      .map((p, i) => `${40 + (i * 650) / (period - 1)},${155 - (p.count / max) * 125}`)
      .join(' ');
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Minsk',
  }).format(new Date());
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>Overview</h1>
          <p>Everything happening in your Instagram Direct.</p>
        </div>
        <button className="button primary" onClick={() => navigate('flows')}>
          <Play size={16} />
          Create a flow
        </button>
      </div>
      <div className="stats-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.color}`}>
                <s.icon size={20} />
              </span>
            </div>
            <strong>{s.value}</strong>
            <small>{s.detail}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Incoming requests</h2>
              <p>Messages and comments by day</p>
            </div>
            <div className="segmented">
              <button className={period === 7 ? 'active' : ''} onClick={() => setPeriod(7)}>
                7 days
              </button>
              <button className={period === 14 ? 'active' : ''} onClick={() => setPeriod(14)}>
                14 days
              </button>
            </div>
          </div>
          <div className="chart">
            <svg viewBox="0 0 720 190" role="img" aria-label="Incoming requests by day">
              {[30, 72, 113, 155].map((y) => (
                <g key={y}>
                  <line x1="40" y1={y} x2="690" y2={y} stroke="#eaf0f7" strokeDasharray="4 5" />
                  <text x="7" y={y + 4} fill="#92a0b5" fontSize="10">
                    {Math.round(((155 - y) / 125) * max)}
                  </text>
                </g>
              ))}
              <polygon points={`40,155 ${path} 690,155`} fill="currentColor" fillOpacity=".04" />
              <polyline
                points={path}
                fill="none"
                stroke="#566780"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={40 + (i * 650) / (period - 1)}
                    cy={155 - (p.count / max) * 125}
                    r="4"
                    fill="white"
                    stroke="#566780"
                    strokeWidth="2"
                  />
                  <text
                    x={40 + (i * 650) / (period - 1)}
                    y="180"
                    textAnchor="middle"
                    fill="#8494ad"
                    fontSize="10"
                  >
                    {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric' }).format(
                      p.date,
                    )}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="chart-summary">
            <span>
              <i className="legend-dot" />
              Incoming requests
            </span>
            <strong>{points.reduce((a, p) => a + p.count, 0)} in this period</strong>
          </div>
        </section>
        <section className="panel scenarios-preview">
          <div className="panel-heading">
            <div>
              <h2>Your flows</h2>
              <p>From the first message to a lead</p>
            </div>
            <button
              className="icon-button"
              aria-label="All flows"
              onClick={() => navigate('flows')}
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          {data.flows.length ? (
            data.flows.slice(0, 3).map((f, i) => (
              <button className="preview-row" key={f.id} onClick={() => navigate('flows')}>
                <span className={`art-icon ${['blue', 'purple', 'cyan'][i]}`}>
                  <Workflow size={20} />
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {f.trigger_kind === 'comment_keyword'
                      ? 'Comment → Direct'
                      : f.trigger_kind === 'dm_any'
                        ? 'Any message'
                        : f.keywords.slice(0, 2).join(' · ')}
                  </small>
                </div>
                <span className={`status-dot ${f.enabled ? 'green' : 'gray'}`} />
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="Start with a flow"
              description="Choose a template and add your material."
            />
          )}
          <button className="button full" onClick={() => navigate('flows')}>
            Open the builder
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>{date}</p>
            </div>
            <Badge tone="gray">{repo.mode === 'demo' ? 'Demo' : 'Events'}</Badge>
          </div>
          {data.runs.length ? (
            data.runs.slice(0, 5).map((r) => (
              <div className="activity-row" key={r.id}>
                <span
                  className={`activity-icon ${r.status === 'failed' ? 'red' : r.status === 'handoff' ? 'orange' : 'green'}`}
                >
                  {r.status === 'waiting' ? (
                    <Clock3 size={16} />
                  ) : r.status === 'handoff' ? (
                    <Users size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                </span>
                <div>
                  <strong>{r.flow_name}</strong>
                  <small>
                    {r.contact_name} · {r.detail}
                  </small>
                </div>
                <time>{time(r.created_at)}</time>
              </div>
            ))
          ) : (
            <Empty title="Events will appear here" description="Run a flow to see its results." />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Waiting for your reply</h2>
              <p>Conversations handed to the team</p>
            </div>
            <Badge tone="amber">{human.length}</Badge>
          </div>
          {human.length ? (
            human.slice(0, 3).map((c) => {
              const person = data.contacts.find((x) => x.id === c.contact_id);
              return (
                <button className="handoff-row" key={c.id} onClick={() => openInbox(c.id)}>
                  <div>
                    <strong>{person?.name || person?.username || 'Instagram user'}</strong>
                    <p>{c.last_message}</p>
                    <small>
                      {day(c.last_message_at)} · {time(c.last_message_at)}
                    </small>
                  </div>
                  <ArrowUpRight size={18} />
                </button>
              );
            })
          ) : (
            <Empty
              title="You're all caught up"
              description="Conversations that need your team will appear here."
            />
          )}
        </section>
      </div>
    </>
  );
}
