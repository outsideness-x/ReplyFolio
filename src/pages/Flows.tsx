import { useEffect, useState, type InputHTMLAttributes } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock3,
  Copy,
  GitBranch,
  MessageCircle,
  MousePointerClick,
  Plus,
  Save,
  Tag,
  Trash2,
  UserRound,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import type { Flow, FlowNode, TriggerKind } from '../../shared/types.ts';
import { DEFAULT_CAPTURE_RETRY, DEFAULT_CHOICE_RETRY, MAX_REMINDERS } from '../../shared/engine.ts';
import { commentTemplate, materialTemplate } from '../../shared/templates.ts';
import { Badge, Empty, Modal, useUI } from '../ui.tsx';
const nodeTypes = [
  ['send', 'Message', MessageCircle],
  ['choice', 'Quick replies', MousePointerClick],
  ['capture', 'Collect contact details', UserRound],
  ['condition', 'Condition', GitBranch],
  ['delay', 'Delay', Clock3],
  ['tag', 'Add a tag', Tag],
  ['lead', 'Create a lead', Users],
  ['handoff', 'Hand off to the team', UserRound],
  ['end', 'Finish', X],
] as const;
function nodeName(n: FlowNode, index: number) {
  return `${index + 1}. ${nodeTypes.find((t) => t[0] === n.type)?.[1] ?? n.type}`;
}
function freshNode(type: FlowNode['type'], id: string, next: string | null): FlowNode {
  const base = { id, next };
  switch (type) {
    case 'send':
      return { ...base, type, text: 'New message' };
    case 'choice':
      return {
        ...base,
        type,
        text: 'What are you interested in?',
        options: [{ id: 'yes', label: 'Learn more', next }],
      };
    case 'capture':
      return {
        ...base,
        type,
        field: 'email',
        text: "Leave your email if you'd like our team to contact you about the courses. Type “stop” to leave.",
      };
    case 'condition':
      return { ...base, type, field: 'email', operator: 'exists', value: '', yes: next, no: null };
    case 'delay':
      return { ...base, type, minutes: 5 };
    case 'tag':
      return { ...base, type, tags: ['Interest'] };
    case 'lead':
      return { ...base, type };
    case 'handoff':
      return { ...base, type, next: null, text: "I'm passing this conversation to our team." };
    case 'end':
      return { ...base, type, next: null };
  }
}
function parseList(text: string): string[] {
  return text
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
// Keeps the typed text so spaces and commas survive until the next item is complete.
function ListInput({
  value,
  onChange,
  ...props
}: { value: string[]; onChange: (value: string[]) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const [raw, setRaw] = useState(value.join(', '));
  useEffect(() => {
    setRaw((current) =>
      parseList(current).join('\n') === value.join('\n') ? current : value.join(', '),
    );
  }, [value]);
  return (
    <input
      {...props}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(parseList(e.target.value));
      }}
    />
  );
}
function replaceTarget(n: FlowNode, old: string, next: string | null): FlowNode {
  if (n.type === 'choice')
    return {
      ...n,
      next: n.next === old ? next : n.next,
      options: n.options.map((o) => ({ ...o, next: o.next === old ? next : o.next })),
    };
  if (n.type === 'condition')
    return {
      ...n,
      next: n.next === old ? next : n.next,
      yes: n.yes === old ? next : n.yes,
      no: n.no === old ? next : n.no,
    };
  return { ...n, next: n.next === old ? next : n.next };
}
export function Flows() {
  const { data, repo, perform, busy } = useUI(),
    [editor, setEditor] = useState<Flow | null>(null),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState<Flow | null>(null),
    [filter, setFilter] = useState('all');
  function create(comment = false) {
    const now = new Date().toISOString();
    setEditor({
      id: crypto.randomUUID(),
      workspace_id: data.workspace.id,
      name: comment ? 'Comment → Direct' : 'New flow',
      description: '',
      enabled: false,
      trigger_kind: comment ? 'comment_keyword' : 'dm_keyword',
      keywords: comment ? ['lesson'] : ['price'],
      post_ids: [],
      definition: comment ? commentTemplate() : materialTemplate(),
      created_at: now,
      updated_at: now,
    });
    setCreating(false);
  }
  if (editor) return <FlowEditor flow={editor} onClose={() => setEditor(null)} />;
  const list = data.flows.filter(
    (f) => filter === 'all' || (filter === 'active' ? f.enabled : !f.enabled),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR AUTOMATIONS</div>
          <h1>Flows</h1>
          <p>Simple steps for every new conversation.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          New flow
        </button>
      </div>
      <div className="table-toolbar">
        <div className="segmented">
          {[
            ['all', 'All flows'],
            ['active', 'Active'],
            ['draft', 'Drafts'],
          ].map(([key, label]) => (
            <button
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </div>
        <Badge tone="gray">{data.flows.filter((f) => f.enabled).length} active</Badge>
      </div>
      {list.length ? (
        <div className="flow-list">
          {list.map((f) => (
            <article className="flow-card" key={f.id}>
              <span className="flow-symbol">
                <Workflow size={25} strokeWidth={1.3} />
              </span>
              <div className="flow-card-body">
                <div className="flow-title">
                  <h3>{f.name}</h3>
                  <Badge tone={f.enabled ? 'green' : 'gray'}>
                    {f.enabled ? 'Active' : 'Draft'}
                  </Badge>
                </div>
                <p>{f.description || 'Click “Open” to edit the flow steps.'}</p>
                <div className="flow-metadata">
                  <span>
                    {f.trigger_kind === 'comment_keyword'
                      ? 'Comment → Direct'
                      : f.trigger_kind === 'dm_any'
                        ? 'Any message'
                        : 'Direct keyword'}
                  </span>
                  <i /> <span>{f.definition.nodes.length} blocks</span>
                  {f.keywords.length > 0 && (
                    <>
                      <i />
                      <span>{f.keywords.slice(0, 3).join(', ')}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flow-card-actions">
                <button
                  className={`toggle ${f.enabled ? 'on' : ''}`}
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={'Activate ' + f.name}
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => repo.saveFlow({ ...f, enabled: !f.enabled }),
                      f.enabled ? 'Flow disabled.' : 'Flow enabled.',
                    )
                  }
                >
                  <span />
                </button>
                <button className="button small" onClick={() => setEditor(structuredClone(f))}>
                  Open
                  <ArrowRight size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Duplicate ' + f.name}
                  onClick={() =>
                    setEditor({
                      ...structuredClone(f),
                      id: crypto.randomUUID(),
                      name: f.name + ' — copy',
                      enabled: false,
                      created_at: new Date().toISOString(),
                    })
                  }
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Delete ' + f.name}
                  onClick={() => setDeleting(f)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Your first flow"
            description="Start with a template and adapt it to your courses."
          >
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Create a flow
            </button>
          </Empty>
        </section>
      )}
      {creating && (
        <Modal title="Where shall we start?" onClose={() => setCreating(false)}>
          <p className="form-hint">
            The template includes an introduction, a resource and lead capture. You can edit every
            message.
          </p>
          <div className="template-options">
            <button onClick={() => create()}>
              <BookOpen size={25} />
              <strong>Materials and pricing</strong>
              <span>A customer sends a keyword in Direct</span>
              <ArrowRight size={16} />
            </button>
            <button onClick={() => create(true)}>
              <MessageCircle size={25} />
              <strong>From comments to Direct</strong>
              <span>The first message after a comment</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete this flow?" onClose={() => setDeleting(null)}>
          <p className="form-hint">
            «{deleting.name}” will stop running. Conversations and saved leads will remain.
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await perform(() => repo.deleteFlow(deleting.id), 'Flow deleted.'))
                  setDeleting(null);
              }}
            >
              Delete flow
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function FlowEditor({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const { data, repo, perform, busy, notify } = useUI(),
    [draft, setDraft] = useState(structuredClone(flow)),
    [selected, setSelected] = useState(flow.definition.start),
    [inspector, setInspector] = useState<'node' | 'trigger'>('node'),
    [dirty, setDirty] = useState(false),
    [showPalette, setShowPalette] = useState(false);
  const nodes = draft.definition.nodes,
    node = nodes.find((n) => n.id === selected),
    index = nodes.findIndex((n) => n.id === selected);
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', before);
    function beforeNavigation(e: Event) {
      if (dirty && !confirm('Leave without saving your flow changes?')) e.preventDefault();
    }
    window.addEventListener('replyfolio:navigate', beforeNavigation);
    return () => {
      window.removeEventListener('beforeunload', before);
      window.removeEventListener('replyfolio:navigate', beforeNavigation);
    };
  }, [dirty]);
  function change(value: Flow) {
    setDraft(value);
    setDirty(true);
  }
  function patch(value: Record<string, unknown>) {
    if (!node) return;
    change({
      ...draft,
      definition: {
        ...draft.definition,
        nodes: nodes.map((n) => (n.id === selected ? ({ ...n, ...value } as FlowNode) : n)),
      },
    });
  }
  function add(type: FlowNode['type']) {
    const id = crypto.randomUUID(),
      after = node ?? nodes[nodes.length - 1];
    let next = after.next ?? null;
    let updated = nodes;
    if (after.type === 'end') {
      next = after.id;
      updated = nodes.map((n) => replaceTarget(n, after.id, id));
    } else if (['send', 'capture', 'tag', 'lead', 'delay'].includes(after.type))
      updated = nodes.map((n) => (n.id === after.id ? { ...n, next: id } : n));
    const at = nodes.findIndex((n) => n.id === after.id) + (after.type === 'end' ? 0 : 1),
      fresh = freshNode(type, id, next);
    const list = [...updated.slice(0, at), fresh, ...updated.slice(at)];
    change({
      ...draft,
      definition: {
        ...draft.definition,
        start:
          draft.definition.start === after.id && after.type === 'end' ? id : draft.definition.start,
        nodes: list,
      },
    });
    setSelected(id);
    setInspector('node');
    setShowPalette(false);
  }
  function remove() {
    if (!node || nodes.length === 1) return;
    const next = node.next === node.id ? null : node.next;
    const list = nodes.filter((n) => n.id !== node.id).map((n) => replaceTarget(n, node.id, next));
    change({
      ...draft,
      definition: {
        ...draft.definition,
        start: draft.definition.start === node.id ? (next ?? list[0].id) : draft.definition.start,
        nodes: list,
      },
    });
    setSelected(list[0].id);
  }
  function target(
    value: string | null,
    onChange: (v: string | null) => void,
    label = 'Next block',
  ) {
    return (
      <label>
        {label}
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Finish the flow</option>
          {nodes
            .filter((n) => n.id !== selected)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {nodeName(n, nodes.indexOf(n))}
              </option>
            ))}
        </select>
      </label>
    );
  }
  const close = () => {
    if (!dirty || confirm('Leave without saving your flow changes?')) onClose();
  };
  return (
    <>
      <div className="editor-heading">
        <button className="icon-button" aria-label="Back to flows" onClick={close}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <input
            aria-label="Flow name"
            value={draft.name}
            onChange={(e) => change({ ...draft, name: e.target.value })}
            maxLength={120}
          />
          <span>
            {dirty ? 'Unsaved changes' : 'Flow'} · {nodes.length} blocks
          </span>
        </div>
        <Badge tone={draft.enabled ? 'green' : 'gray'}>{draft.enabled ? 'Active' : 'Draft'}</Badge>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            if (await perform(() => repo.saveFlow(draft), 'Flow saved.')) setDirty(false);
          }}
        >
          <Save size={15} />
          Save
        </button>
      </div>
      <div className="flow-editor">
        <aside className={`node-palette ${showPalette ? 'palette-open' : ''}`}>
          <h3>Add a block</h3>
          <p>Choose a step for your conversation.</p>
          {nodeTypes.map(([type, label, Icon]) => (
            <button key={type} onClick={() => add(type)}>
              <Icon size={17} />
              <span>{label}</span>
              <Plus size={13} />
            </button>
          ))}
          <div className="palette-hint">
            Select a block on the canvas to edit its message and connections.
          </div>
        </aside>
        <section className="flow-canvas">
          <button className="mobile-add button small" onClick={() => setShowPalette(!showPalette)}>
            <Plus size={15} />
            Add a block
          </button>
          <button
            className={`trigger-node ${inspector === 'trigger' ? 'selected' : ''}`}
            onClick={() => setInspector('trigger')}
          >
            <span className="node-icon">
              <Workflow size={19} />
            </span>
            <div>
              <small>FLOW START</small>
              <strong>
                {draft.trigger_kind === 'comment_keyword'
                  ? 'Comment → Direct'
                  : draft.trigger_kind === 'dm_any'
                    ? 'Any message'
                    : draft.keywords.join(', ') || 'Set your keywords'}
              </strong>
            </div>
            <ChevronDown size={15} />
          </button>
          <div className="canvas-start-line" />
          {nodes.map((n, i) => {
            const meta = nodeTypes.find((t) => t[0] === n.type)!,
              Icon = meta[2];
            const text =
              'text' in n
                ? n.text
                : n.type === 'tag'
                  ? n.tags.join(', ')
                  : n.type === 'delay'
                    ? `${n.minutes} min`
                    : n.type === 'condition'
                      ? `${n.field} ${n.operator === 'exists' ? 'is filled' : n.value}`
                      : n.type === 'lead'
                        ? 'Save contact as a lead'
                        : 'Done';
            const transitions =
              n.type === 'choice'
                ? n.options.map(
                    (o) =>
                      `${o.label} → ${
                        o.next
                          ? nodeName(
                              nodes.find((x) => x.id === o.next)!,
                              nodes.findIndex((x) => x.id === o.next),
                            )
                          : 'Done'
                      }`,
                  )
                : n.type === 'condition'
                  ? [
                      'Yes → ' +
                        (nodes.find((x) => x.id === n.yes)
                          ? nodeName(
                              nodes.find((x) => x.id === n.yes)!,
                              nodes.findIndex((x) => x.id === n.yes),
                            )
                          : 'Done'),
                      'No → ' +
                        (nodes.find((x) => x.id === n.no)
                          ? nodeName(
                              nodes.find((x) => x.id === n.no)!,
                              nodes.findIndex((x) => x.id === n.no),
                            )
                          : 'Done'),
                    ]
                  : n.next
                    ? [
                        `Next → ${
                          nodes.find((x) => x.id === n.next)
                            ? nodeName(
                                nodes.find((x) => x.id === n.next)!,
                                nodes.findIndex((x) => x.id === n.next),
                              )
                            : 'Done'
                        }`,
                      ]
                    : [];
            return (
              <div className="canvas-block" key={n.id}>
                <button
                  className={`workflow-node ${selected === n.id && inspector === 'node' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelected(n.id);
                    setInspector('node');
                  }}
                >
                  <div className="workflow-node-heading">
                    <span className="node-icon">
                      <Icon size={17} />
                    </span>
                    <strong>{meta[1]}</strong>
                    <small>{i + 1}</small>
                    {draft.definition.start === n.id && <Badge tone="gray">Start</Badge>}
                  </div>
                  <p>{text}</p>
                  {n.type === 'send' && n.assetId && (
                    <div className="node-material">
                      <BookOpen size={12} />
                      {data.materials.find((m) => m.id === n.assetId)?.title ||
                        'Material unavailable'}
                    </div>
                  )}
                  {transitions.length > 0 && (
                    <div className="node-transitions">
                      {transitions.map((t, j) => (
                        <span key={j}>{t}</span>
                      ))}
                    </div>
                  )}
                </button>
                {i < nodes.length - 1 && (
                  <div className={n.next === nodes[i + 1]?.id ? 'canvas-link' : 'canvas-gap'}>
                    {n.next === nodes[i + 1]?.id && <ChevronDown size={13} />}
                  </div>
                )}
              </div>
            );
          })}
        </section>
        <aside className="node-inspector">
          {inspector === 'trigger' ? (
            <>
              <div className="inspector-heading">
                <h3>Flow start</h3>
                <Workflow size={18} />
              </div>
              <label>
                Trigger
                <select
                  value={draft.trigger_kind}
                  onChange={(e) =>
                    change({ ...draft, trigger_kind: e.target.value as TriggerKind })
                  }
                >
                  <option value="dm_keyword">Direct keyword</option>
                  <option value="dm_any">Any Direct message</option>
                  <option value="comment_keyword">Comment keyword</option>
                </select>
              </label>
              {draft.trigger_kind !== 'dm_any' && (
                <label>
                  Keywords
                  <ListInput
                    aria-label="Keywords"
                    value={draft.keywords}
                    onChange={(keywords) => change({ ...draft, keywords })}
                  />
                  <small>Separate with commas. Matching ignores case and punctuation.</small>
                </label>
              )}
              {draft.trigger_kind === 'comment_keyword' && (
                <>
                  <label>
                    Posts
                    <ListInput
                      value={draft.post_ids}
                      onChange={(post_ids) => change({ ...draft, post_ids })}
                      placeholder="Post IDs, separated by commas"
                      inputMode="numeric"
                    />
                    <small>
                      Leave blank for all posts. You can get IDs through the Instagram API after
                      connecting your account.
                    </small>
                  </label>
                  <p className="inspector-note">
                    The first block must be a single text message. The flow continues after the
                    learner replies.
                  </p>
                </>
              )}
              <label>
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) => change({ ...draft, description: e.target.value })}
                  maxLength={2000}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => change({ ...draft, enabled: e.target.checked })}
                />
                Flow active
              </label>
              <label>
                First block
                <select
                  value={draft.definition.start}
                  onChange={(e) =>
                    change({ ...draft, definition: { ...draft.definition, start: e.target.value } })
                  }
                >
                  {nodes.map((n, i) => (
                    <option key={n.id} value={n.id}>
                      {nodeName(n, i)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : node ? (
            <>
              <div className="inspector-heading">
                <h3>{nodeTypes.find((t) => t[0] === node.type)?.[1]}</h3>
                <span>{index + 1}</span>
              </div>
              {'text' in node && (
                <label>
                  {node.type === 'capture' ? 'Question for the learner' : 'Message text'}
                  <textarea
                    aria-label="Block text"
                    value={node.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    rows={6}
                  />
                  <small>
                    {new TextEncoder().encode(node.text).length}/1000 bytes · You can use{' '}
                    {'{{name}}'}, {'{{email}}'} and {'{{choice}}'}.
                  </small>
                </label>
              )}
              {node.type === 'send' && (
                <label>
                  Material
                  <select
                    value={node.assetId ?? ''}
                    onChange={(e) => patch({ assetId: e.target.value || undefined })}
                  >
                    <option value="">No material</option>
                    {data.materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  <small>The link will be added to the message.</small>
                </label>
              )}
              {node.type === 'capture' && (
                <label>
                  What to save
                  <select value={node.field} onChange={(e) => patch({ field: e.target.value })}>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="name">Name</option>
                  </select>
                </label>
              )}
              {node.type === 'choice' && (
                <>
                  <h4 className="field-heading">QUICK REPLIES</h4>
                  {node.options.map((o, i) => (
                    <div className="option-editor" key={o.id}>
                      <label>
                        Option {i + 1}
                        <div className="option-line">
                          <input
                            aria-label={`Option ${i + 1}`}
                            value={o.label}
                            onChange={(e) =>
                              patch({
                                options: node.options.map((x) =>
                                  x.id === o.id ? { ...x, label: e.target.value } : x,
                                ),
                              })
                            }
                            maxLength={20}
                          />
                          <button
                            className="icon-button"
                            aria-label={'Remove option ' + (i + 1)}
                            onClick={() =>
                              patch({ options: node.options.filter((x) => x.id !== o.id) })
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </label>
                      {target(
                        o.next,
                        (next) =>
                          patch({
                            options: node.options.map((x) => (x.id === o.id ? { ...x, next } : x)),
                          }),
                        'After selection',
                      )}
                    </div>
                  ))}
                  <button
                    className="button small full"
                    disabled={node.options.length >= 13}
                    onClick={() =>
                      patch({
                        options: [
                          ...node.options,
                          { id: crypto.randomUUID(), label: 'New option', next: null },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    Add an option
                  </button>
                </>
              )}
              {(node.type === 'choice' || node.type === 'capture') && (
                <label>
                  Reminder
                  <textarea
                    aria-label="Reminder text"
                    value={node.retry ?? ''}
                    placeholder={
                      node.type === 'choice'
                        ? DEFAULT_CHOICE_RETRY
                        : DEFAULT_CAPTURE_RETRY[node.field]
                    }
                    onChange={(e) => patch({ retry: e.target.value || undefined })}
                    rows={2}
                  />
                  <small>
                    Sent when the reply isn't recognized, up to {MAX_REMINDERS} times. Then the bot
                    stops and the conversation waits for your team. Another flow's keyword starts
                    that flow.
                  </small>
                </label>
              )}
              {node.type === 'condition' && (
                <>
                  <label>
                    Field
                    <select value={node.field} onChange={(e) => patch({ field: e.target.value })}>
                      {['name', 'email', 'phone', 'choice'].map((x) => (
                        <option key={x} value={x}>
                          {
                            (
                              {
                                name: 'Name',
                                email: 'Email',
                                phone: 'Phone',
                                choice: "Learner's choice",
                              } as Record<string, string>
                            )[x]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Condition
                    <select
                      value={node.operator}
                      onChange={(e) => patch({ operator: e.target.value })}
                    >
                      <option value="exists">Is filled</option>
                      <option value="equals">Equals</option>
                      <option value="contains">Contains</option>
                    </select>
                  </label>
                  {node.operator !== 'exists' && (
                    <label>
                      Value
                      <input
                        value={node.value}
                        onChange={(e) => patch({ value: e.target.value })}
                      />
                    </label>
                  )}
                  {target(node.yes, (yes) => patch({ yes }), 'If yes')}
                  {target(node.no, (no) => patch({ no }), 'If no')}
                </>
              )}
              {node.type === 'delay' && (
                <label>
                  Delay, minutes
                  <input
                    type="number"
                    value={node.minutes}
                    min={1}
                    max={1440}
                    onChange={(e) => patch({ minutes: Number(e.target.value) })}
                  />
                  <small>
                    Before sending, the bot checks the permitted messaging window again.
                  </small>
                </label>
              )}
              {node.type === 'tag' && (
                <label>
                  Tags
                  <ListInput
                    key={node.id}
                    aria-label="Tags"
                    value={node.tags}
                    onChange={(tags) => patch({ tags })}
                  />
                  <small>Separate with commas.</small>
                </label>
              )}
              {node.type === 'lead' && (
                <p className="inspector-note">
                  The contact will appear in Leads with the details collected in previous steps.
                </p>
              )}
              {node.type === 'handoff' && (
                <p className="inspector-note">
                  The bot stops and your team takes over the conversation.
                </p>
              )}
              {node.type === 'end' && (
                <p className="inspector-note">
                  The flow ends. A new request can trigger another flow.
                </p>
              )}
              {!['choice', 'condition', 'end', 'handoff'].includes(node.type) &&
                target(node.next, (next) => patch({ next }))}
              <div className="inspector-bottom">
                <button
                  className="button danger small full"
                  disabled={nodes.length === 1}
                  onClick={remove}
                >
                  <Trash2 size={13} />
                  Delete block
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
