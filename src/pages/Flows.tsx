import { useEffect, useState } from 'react';
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
import { commentTemplate, materialTemplate } from '../../shared/templates.ts';
import { Badge, Empty, Modal, useUI } from '../ui.tsx';
const nodeTypes = [
  ['send', 'Сообщение', MessageCircle],
  ['choice', 'Варианты ответа', MousePointerClick],
  ['capture', 'Сбор контакта', UserRound],
  ['condition', 'Условие', GitBranch],
  ['delay', 'Ожидание', Clock3],
  ['tag', 'Добавить тег', Tag],
  ['lead', 'Создать заявку', Users],
  ['handoff', 'Передать менеджеру', UserRound],
  ['end', 'Завершить', X],
] as const;
function nodeName(n: FlowNode, index: number) {
  return `${index + 1}. ${nodeTypes.find((t) => t[0] === n.type)?.[1] ?? n.type}`;
}
function freshNode(type: FlowNode['type'], id: string, next: string | null): FlowNode {
  const base = { id, next };
  switch (type) {
    case 'send':
      return { ...base, type, text: 'Новое сообщение' };
    case 'choice':
      return {
        ...base,
        type,
        text: 'Что вас интересует?',
        options: [{ id: 'yes', label: 'Узнать больше', next }],
      };
    case 'capture':
      return {
        ...base,
        type,
        field: 'email',
        text: 'Оставьте email, если хотите получить ответ команды по поводу обучения. Для выхода напишите «стоп».',
      };
    case 'condition':
      return { ...base, type, field: 'email', operator: 'exists', value: '', yes: next, no: null };
    case 'delay':
      return { ...base, type, minutes: 5 };
    case 'tag':
      return { ...base, type, tags: ['Интерес'] };
    case 'lead':
      return { ...base, type };
    case 'handoff':
      return { ...base, type, next: null, text: 'Передаю диалог менеджеру.' };
    case 'end':
      return { ...base, type, next: null };
  }
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
      name: comment ? 'Комментарий → Direct' : 'Новый сценарий',
      description: '',
      enabled: false,
      trigger_kind: comment ? 'comment_keyword' : 'dm_keyword',
      keywords: comment ? ['урок'] : ['прайс'],
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
          <h1>Сценарии</h1>
          <p>Простые шаги для каждого нового диалога.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Новый сценарий
        </button>
      </div>
      <div className="table-toolbar">
        <div className="segmented">
          {[
            ['all', 'Все сценарии'],
            ['active', 'Активные'],
            ['draft', 'Черновики'],
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
        <Badge tone="gray">{data.flows.filter((f) => f.enabled).length} активных</Badge>
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
                    {f.enabled ? 'Активен' : 'Черновик'}
                  </Badge>
                </div>
                <p>{f.description || 'Нажмите «Открыть», чтобы настроить шаги сценария.'}</p>
                <div className="flow-metadata">
                  <span>
                    {f.trigger_kind === 'comment_keyword'
                      ? 'Комментарий → Direct'
                      : f.trigger_kind === 'dm_any'
                        ? 'Любое сообщение'
                        : 'Ключевое слово в Direct'}
                  </span>
                  <i /> <span>{f.definition.nodes.length} блоков</span>
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
                  aria-label={'Активировать ' + f.name}
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => repo.saveFlow({ ...f, enabled: !f.enabled }),
                      f.enabled ? 'Сценарий выключен.' : 'Сценарий включён.',
                    )
                  }
                >
                  <span />
                </button>
                <button className="button small" onClick={() => setEditor(structuredClone(f))}>
                  Открыть
                  <ArrowRight size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Копировать ' + f.name}
                  onClick={() =>
                    setEditor({
                      ...structuredClone(f),
                      id: crypto.randomUUID(),
                      name: f.name + ' — копия',
                      enabled: false,
                      created_at: new Date().toISOString(),
                    })
                  }
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Удалить ' + f.name}
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
            title="Ваш первый сценарий"
            description="Начните с готового шаблона и адаптируйте его под своё обучение."
          >
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Создать сценарий
            </button>
          </Empty>
        </section>
      )}
      {creating && (
        <Modal title="С чего начнём?" onClose={() => setCreating(false)}>
          <p className="form-hint">
            Шаблон уже содержит шаги знакомства, выдачи материала и сбора заявки. Все тексты можно
            изменить.
          </p>
          <div className="template-options">
            <button onClick={() => create()}>
              <BookOpen size={25} />
              <strong>Материалы и прайс</strong>
              <span>Человек пишет ключевое слово в Direct</span>
              <ArrowRight size={16} />
            </button>
            <button onClick={() => create(true)}>
              <MessageCircle size={25} />
              <strong>Из комментария в Direct</strong>
              <span>Первое сообщение после комментария</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="Удалить сценарий?" onClose={() => setDeleting(null)}>
          <p className="form-hint">
            «{deleting.name}» перестанет запускаться. Переписка и сохранённые заявки останутся.
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(null)}>
              Отмена
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await perform(() => repo.deleteFlow(deleting.id), 'Сценарий удалён.'))
                  setDeleting(null);
              }}
            >
              Удалить сценарий
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
    return () => window.removeEventListener('beforeunload', before);
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
    label = 'Следующий блок',
  ) {
    return (
      <label>
        {label}
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Завершить сценарий</option>
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
    if (!dirty || confirm('Выйти без сохранения изменений сценария?')) onClose();
  };
  return (
    <>
      <div className="editor-heading">
        <button className="icon-button" aria-label="Назад к сценариям" onClick={close}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <input
            aria-label="Название сценария"
            value={draft.name}
            onChange={(e) => change({ ...draft, name: e.target.value })}
            maxLength={120}
          />
          <span>
            {dirty ? 'Есть несохранённые изменения' : 'Сценарий'} · {nodes.length} блоков
          </span>
        </div>
        <Badge tone={draft.enabled ? 'green' : 'gray'}>
          {draft.enabled ? 'Активен' : 'Черновик'}
        </Badge>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            if (await perform(() => repo.saveFlow(draft), 'Сценарий сохранён.')) setDirty(false);
          }}
        >
          <Save size={15} />
          Сохранить
        </button>
      </div>
      <div className="flow-editor">
        <aside className={`node-palette ${showPalette ? 'palette-open' : ''}`}>
          <h3>Добавить блок</h3>
          <p>Выберите шаг для вашего диалога.</p>
          {nodeTypes.map(([type, label, Icon]) => (
            <button key={type} onClick={() => add(type)}>
              <Icon size={17} />
              <span>{label}</span>
              <Plus size={13} />
            </button>
          ))}
          <div className="palette-hint">
            Выберите блок на схеме, чтобы настроить его текст и переходы.
          </div>
        </aside>
        <section className="flow-canvas">
          <button className="mobile-add button small" onClick={() => setShowPalette(!showPalette)}>
            <Plus size={15} />
            Добавить блок
          </button>
          <button
            className={`trigger-node ${inspector === 'trigger' ? 'selected' : ''}`}
            onClick={() => setInspector('trigger')}
          >
            <span className="node-icon">
              <Workflow size={19} />
            </span>
            <div>
              <small>НАЧАЛО СЦЕНАРИЯ</small>
              <strong>
                {draft.trigger_kind === 'comment_keyword'
                  ? 'Комментарий → Direct'
                  : draft.trigger_kind === 'dm_any'
                    ? 'Любое сообщение'
                    : draft.keywords.join(', ') || 'Настройте ключевые слова'}
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
                    ? `${n.minutes} мин`
                    : n.type === 'condition'
                      ? `${n.field} ${n.operator === 'exists' ? 'заполнено' : n.value}`
                      : n.type === 'lead'
                        ? 'Сохранить контакт как заявку'
                        : 'Готово';
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
                          : 'Готово'
                      }`,
                  )
                : n.type === 'condition'
                  ? [
                      'Да → ' +
                        (nodes.find((x) => x.id === n.yes)
                          ? nodeName(
                              nodes.find((x) => x.id === n.yes)!,
                              nodes.findIndex((x) => x.id === n.yes),
                            )
                          : 'Готово'),
                      'Нет → ' +
                        (nodes.find((x) => x.id === n.no)
                          ? nodeName(
                              nodes.find((x) => x.id === n.no)!,
                              nodes.findIndex((x) => x.id === n.no),
                            )
                          : 'Готово'),
                    ]
                  : n.next
                    ? [
                        `Далее → ${
                          nodes.find((x) => x.id === n.next)
                            ? nodeName(
                                nodes.find((x) => x.id === n.next)!,
                                nodes.findIndex((x) => x.id === n.next),
                              )
                            : 'Готово'
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
                    {draft.definition.start === n.id && <Badge tone="gray">Старт</Badge>}
                  </div>
                  <p>{text}</p>
                  {n.type === 'send' && n.assetId && (
                    <div className="node-material">
                      <BookOpen size={12} />
                      {data.materials.find((m) => m.id === n.assetId)?.title ||
                        'Материал недоступен'}
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
                <h3>Начало сценария</h3>
                <Workflow size={18} />
              </div>
              <label>
                Триггер
                <select
                  value={draft.trigger_kind}
                  onChange={(e) =>
                    change({ ...draft, trigger_kind: e.target.value as TriggerKind })
                  }
                >
                  <option value="dm_keyword">Ключевое слово в Direct</option>
                  <option value="dm_any">Любое сообщение в Direct</option>
                  <option value="comment_keyword">Комментарий с ключевым словом</option>
                </select>
              </label>
              {draft.trigger_kind !== 'dm_any' && (
                <label>
                  Ключевые слова
                  <input
                    value={draft.keywords.join(', ')}
                    onChange={(e) =>
                      change({ ...draft, keywords: e.target.value.split(',').map((x) => x.trim()) })
                    }
                  />
                  <small>Через запятую. Регистр и пунктуация не влияют на поиск.</small>
                </label>
              )}
              {draft.trigger_kind === 'comment_keyword' && (
                <>
                  <label>
                    Публикации
                    <input
                      value={draft.post_ids.join(', ')}
                      onChange={(e) =>
                        change({
                          ...draft,
                          post_ids: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="ID публикаций через запятую"
                    />
                    <small>
                      Пустое поле — все публикации. ID можно получить через Instagram API после
                      подключения аккаунта.
                    </small>
                  </label>
                  <p className="inspector-note">
                    Первым блоком должно быть одно текстовое сообщение. Продолжение запустится после
                    ответа ученика.
                  </p>
                </>
              )}
              <label>
                Описание
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
                Сценарий активен
              </label>
              <label>
                Первый блок
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
                  {node.type === 'capture' ? 'Вопрос ученику' : 'Текст сообщения'}
                  <textarea
                    aria-label="Текст блока"
                    value={node.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    rows={6}
                  />
                  <small>
                    {new TextEncoder().encode(node.text).length}/1000 байт · Можно использовать{' '}
                    {'{{name}}'}, {'{{email}}'} и {'{{choice}}'}.
                  </small>
                </label>
              )}
              {node.type === 'send' && (
                <label>
                  Материал
                  <select
                    value={node.assetId ?? ''}
                    onChange={(e) => patch({ assetId: e.target.value || undefined })}
                  >
                    <option value="">Без материала</option>
                    {data.materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  <small>Ссылка будет добавлена к сообщению.</small>
                </label>
              )}
              {node.type === 'capture' && (
                <label>
                  Что сохранить
                  <select value={node.field} onChange={(e) => patch({ field: e.target.value })}>
                    <option value="email">Email</option>
                    <option value="phone">Телефон</option>
                    <option value="name">Имя</option>
                  </select>
                </label>
              )}
              {node.type === 'choice' && (
                <>
                  <h4 className="field-heading">ВАРИАНТЫ ОТВЕТА</h4>
                  {node.options.map((o, i) => (
                    <div className="option-editor" key={o.id}>
                      <label>
                        Вариант {i + 1}
                        <div className="option-line">
                          <input
                            aria-label={`Вариант ${i + 1}`}
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
                            aria-label={'Убрать вариант ' + (i + 1)}
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
                        'После выбора',
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
                          { id: crypto.randomUUID(), label: 'Новый вариант', next: null },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    Добавить вариант
                  </button>
                </>
              )}
              {node.type === 'condition' && (
                <>
                  <label>
                    Поле
                    <select value={node.field} onChange={(e) => patch({ field: e.target.value })}>
                      {['name', 'email', 'phone', 'choice'].map((x) => (
                        <option key={x} value={x}>
                          {
                            (
                              {
                                name: 'Имя',
                                email: 'Email',
                                phone: 'Телефон',
                                choice: 'Выбор ученика',
                              } as Record<string, string>
                            )[x]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Условие
                    <select
                      value={node.operator}
                      onChange={(e) => patch({ operator: e.target.value })}
                    >
                      <option value="exists">Заполнено</option>
                      <option value="equals">Равно</option>
                      <option value="contains">Содержит</option>
                    </select>
                  </label>
                  {node.operator !== 'exists' && (
                    <label>
                      Значение
                      <input
                        value={node.value}
                        onChange={(e) => patch({ value: e.target.value })}
                      />
                    </label>
                  )}
                  {target(node.yes, (yes) => patch({ yes }), 'Если да')}
                  {target(node.no, (no) => patch({ no }), 'Если нет')}
                </>
              )}
              {node.type === 'delay' && (
                <label>
                  Ожидание, минут
                  <input
                    type="number"
                    value={node.minutes}
                    min={1}
                    max={1440}
                    onChange={(e) => patch({ minutes: Number(e.target.value) })}
                  />
                  <small>Перед отправкой бот повторно проверит разрешённое окно переписки.</small>
                </label>
              )}
              {node.type === 'tag' && (
                <label>
                  Теги
                  <input
                    value={node.tags.join(', ')}
                    onChange={(e) =>
                      patch({
                        tags: e.target.value
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
              {node.type === 'lead' && (
                <p className="inspector-note">
                  Контакт появится в разделе «Заявки» с данными, собранными на предыдущих шагах.
                </p>
              )}
              {node.type === 'handoff' && (
                <p className="inspector-note">
                  Бот остановится, а диалог перейдёт на ручное управление.
                </p>
              )}
              {node.type === 'end' && (
                <p className="inspector-note">
                  Сценарий завершится. Следующее обращение сможет запустить другой сценарий.
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
                  Удалить блок
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </>
  );
}
