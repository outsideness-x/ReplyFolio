import type {
  CaptureField,
  EngineResult,
  Flow,
  FlowDefinition,
  FlowNode,
  FlowSession,
  Material,
  SendAction,
} from './types.ts';

export const MESSAGE_BYTE_LIMIT = 1000;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const PRIVATE_REPLY_MS = 7 * 24 * 60 * 60 * 1000;
export function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export function matchesKeyword(text: string, keywords: string[]): boolean {
  const padded = ` ${normalize(text)} `;
  return keywords.some(
    (keyword) => normalize(keyword) !== '' && padded.includes(` ${normalize(keyword)} `),
  );
}
export function isStopCommand(text: string): boolean {
  return ['стоп', 'stop', 'отписаться', 'unsubscribe'].includes(normalize(text));
}
export function isHandoffCommand(text: string): boolean {
  return ['менеджер', 'оператор', 'человек'].includes(normalize(text));
}
export function validMessage(text: string): boolean {
  return text.trim().length > 0 && new TextEncoder().encode(text).length <= MESSAGE_BYTE_LIMIT;
}
export function assertMessage(text: string): void {
  if (!validMessage(text))
    throw new Error('Сообщение должно содержать от 1 до 1000 байт UTF-8. Сократите текст.');
}
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function canSend(windowExpiresAt: string | null, now = Date.now()): boolean {
  return !!windowExpiresAt && Date.parse(windowExpiresAt) > now;
}
export function canPrivateReply(commentAt: string, now = Date.now()): boolean {
  const elapsed = now - Date.parse(commentAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < PRIVATE_REPLY_MS;
}
export function renderText(text: string, variables: Record<string, string>): string {
  return text.replace(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_, key: string) => variables[key] ?? '',
  );
}
export function selectFlow(
  flows: Flow[],
  kind: 'dm' | 'comment',
  text: string,
  postId?: string,
): Flow | undefined {
  const active = flows
    .filter((f) => f.enabled)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (kind === 'comment')
    return active.find(
      (f) =>
        f.trigger_kind === 'comment_keyword' &&
        matchesKeyword(text, f.keywords) &&
        (!f.post_ids.length || (!!postId && f.post_ids.includes(postId))),
    );
  return (
    active.find((f) => f.trigger_kind === 'dm_keyword' && matchesKeyword(text, f.keywords)) ??
    active.find((f) => f.trigger_kind === 'dm_any')
  );
}
function pointers(node: FlowNode): (string | null)[] {
  if (node.type === 'end' || node.type === 'handoff') return [];
  if (node.type === 'condition') return [node.yes, node.no];
  if (node.type === 'choice') return node.options.map((o) => o.next);
  return [node.next];
}
export function validateDefinition(
  value: unknown,
  comment = false,
): asserts value is FlowDefinition {
  if (!value || typeof value !== 'object') throw new Error('Сценарий должен быть объектом.');
  const d = value as FlowDefinition;
  if (d.version !== 1 || !Array.isArray(d.nodes) || d.nodes.length < 1 || d.nodes.length > 50)
    throw new Error('В сценарии должно быть от 1 до 50 блоков.');
  const ids = new Set<string>();
  for (const node of d.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[\w-]{1,64}$/.test(node.id) || ids.has(node.id))
      throw new Error('У блоков должны быть уникальные идентификаторы.');
    ids.add(node.id);
    if (node.next !== null && typeof node.next !== 'string')
      throw new Error('Укажите следующий блок.');
    switch (node.type) {
      case 'send':
        if (typeof node.text !== 'string') throw new Error('Укажите текст сообщения.');
        assertMessage(node.text);
        if (node.assetId !== undefined && typeof node.assetId !== 'string')
          throw new Error('Некорректный материал.');
        break;
      case 'choice': {
        if (typeof node.text !== 'string') throw new Error('Укажите вопрос.');
        assertMessage(node.text);
        if (!Array.isArray(node.options) || node.options.length < 1 || node.options.length > 13)
          throw new Error('Добавьте от 1 до 13 вариантов ответа.');
        const optionIds = new Set<string>();
        for (const o of node.options) {
          if (
            !o ||
            typeof o.id !== 'string' ||
            !/^[\w-]{1,64}$/.test(o.id) ||
            optionIds.has(o.id) ||
            typeof o.label !== 'string' ||
            !o.label.trim() ||
            [...o.label].length > 20 ||
            (o.next !== null && typeof o.next !== 'string')
          )
            throw new Error('Варианты должны иметь уникальные ID и подписи до 20 символов.');
          optionIds.add(o.id);
        }
        break;
      }
      case 'capture':
        if (!['name', 'email', 'phone'].includes(node.field) || typeof node.text !== 'string')
          throw new Error('Выберите поле контакта и вопрос.');
        assertMessage(node.text);
        break;
      case 'condition':
        if (
          !/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(node.field) ||
          !['equals', 'contains', 'exists'].includes(node.operator) ||
          typeof node.value !== 'string'
        )
          throw new Error('Некорректное условие.');
        break;
      case 'delay':
        if (!Number.isFinite(node.minutes) || node.minutes < 1 || node.minutes > 1440)
          throw new Error('Ожидание должно длиться от 1 до 1440 минут.');
        break;
      case 'tag':
        if (
          !Array.isArray(node.tags) ||
          node.tags.length > 20 ||
          node.tags.some((t) => typeof t !== 'string' || !t.trim() || t.length > 64)
        )
          throw new Error('Некорректные теги.');
        break;
      case 'handoff':
        if (typeof node.text !== 'string' || (node.text.trim() && !validMessage(node.text)))
          throw new Error('Сократите сообщение менеджера.');
        break;
      case 'lead':
      case 'end':
        break;
      default:
        throw new Error('Неизвестный тип блока.');
    }
  }
  if (!ids.has(d.start)) throw new Error('Выберите начальный блок.');
  for (const node of d.nodes)
    for (const id of pointers(node))
      if (id !== null && !ids.has(id))
        throw new Error('Один из переходов указывает на удалённый блок.');
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error('Сценарий содержит цикл. Удалите обратный переход.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of pointers(d.nodes.find((n) => n.id === id)!)) if (next) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);
  if (comment && d.nodes.find((n) => n.id === d.start)?.type !== 'send')
    throw new Error('Сценарий комментария должен начинаться с одного текстового сообщения.');
}
export function validateFlow(flow: Flow): void {
  if (typeof flow.name !== 'string' || !flow.name.trim() || flow.name.length > 120)
    throw new Error('Укажите название до 120 символов.');
  if (!['dm_keyword', 'dm_any', 'comment_keyword'].includes(flow.trigger_kind))
    throw new Error('Неизвестный триггер.');
  if (
    !Array.isArray(flow.keywords) ||
    flow.keywords.length > 30 ||
    flow.keywords.some((x) => typeof x !== 'string' || x.length > 100) ||
    (flow.trigger_kind !== 'dm_any' && !flow.keywords.some((x) => normalize(x)))
  )
    throw new Error('Добавьте хотя бы одно ключевое слово.');
  if (
    !Array.isArray(flow.post_ids) ||
    flow.post_ids.some((x) => typeof x !== 'string' || !/^\d{1,30}$/.test(x))
  )
    throw new Error('ID публикаций должны содержать только цифры.');
  validateDefinition(flow.definition, flow.trigger_kind === 'comment_keyword');
}
function capture(field: CaptureField, text: string): string | null {
  const value = text.trim();
  if (field === 'name') return value.length >= 2 && value.length <= 120 ? value : null;
  if (field === 'email')
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? value.toLowerCase()
      : null;
  const phone = value.replace(/[\s()-]/g, '');
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}
export function runFlow(
  flow: Flow,
  args: {
    session?: FlowSession | null;
    input?: { text: string; payload?: string };
    variables?: Record<string, string>;
    materials?: Material[];
    now?: number;
    privateReply?: boolean;
  } = {},
): EngineResult {
  validateFlow(flow);
  const now = args.now ?? Date.now();
  const old = args.session;
  const definition = structuredClone(old?.definition ?? flow.definition);
  validateDefinition(definition);
  const variables = { ...(args.variables ?? {}), ...(old?.variables ?? {}) };
  const tags = [...(old?.tags ?? [])];
  let lead = old?.lead ?? false,
    handoff = false;
  let cursor: string | null = old?.nodeId ?? definition.start;
  const actions: SendAction[] = [];
  const result = (
    waiting: FlowSession['waiting'] = null,
    resumeAt: string | null = null,
  ): EngineResult => ({
    actions,
    variables,
    tags,
    lead,
    handoff,
    session: cursor
      ? { flowId: flow.id, nodeId: cursor, waiting, resumeAt, variables, tags, lead, definition }
      : null,
  });
  const send = (
    nodeId: string,
    text: string,
    quickReplies: SendAction['quickReplies'] = [],
  ): void => {
    const rendered = renderText(text, variables);
    assertMessage(rendered);
    actions.push({ type: 'send', nodeId, text: rendered, quickReplies });
  };
  if (old?.waiting === 'delay' && old.resumeAt && Date.parse(old.resumeAt) > now)
    return result('delay', old.resumeAt);
  if (old?.waiting === 'reply' && !args.input) return result('reply');
  if ((old?.waiting === 'choice' || old?.waiting === 'capture') && args.input) {
    const node = definition.nodes.find((n) => n.id === cursor);
    if (node?.type === 'choice') {
      const option = node.options.find(
        (o) =>
          args.input!.payload === `rf:${node.id}:${o.id}` ||
          normalize(o.label) === normalize(args.input!.text),
      );
      if (!option) {
        send(
          node.id,
          'Пожалуйста, выберите один из вариантов.',
          node.options.map((o) => ({ title: o.label, payload: `rf:${node.id}:${o.id}` })),
        );
        return result('choice');
      }
      variables.choice = option.label;
      cursor = option.next;
    } else if (node?.type === 'capture') {
      const value = capture(node.field, args.input.text);
      if (!value) {
        send(
          node.id,
          node.field === 'email'
            ? 'Укажите email, например name@example.com.'
            : node.field === 'phone'
              ? 'Укажите телефон с кодом страны, например +375291234567.'
              : 'Напишите имя: от 2 до 120 символов.',
        );
        return result('capture');
      }
      variables[node.field] = value;
      cursor = node.next;
    }
  } else if (old?.waiting === 'choice' || old?.waiting === 'capture') return result(old.waiting);
  for (let steps = 0; cursor && steps < 50; steps++) {
    const node = definition.nodes.find((n) => n.id === cursor);
    if (!node) throw new Error('Текущий блок удалён. Перезапустите сценарий.');
    switch (node.type) {
      case 'send': {
        const material = node.assetId
          ? args.materials?.find((m) => m.id === node.assetId)
          : undefined;
        if (node.assetId && !material) throw new Error('Материал сценария удалён или недоступен.');
        if (material && !isHttpsUrl(material.url))
          throw new Error('Материал должен иметь HTTPS-ссылку.');
        send(node.id, node.text + (material ? `\n${material.url}` : ''));
        cursor = node.next;
        if (args.privateReply) return result(cursor ? 'reply' : null);
        break;
      }
      case 'choice':
        send(
          node.id,
          node.text,
          node.options.map((o) => ({ title: o.label, payload: `rf:${node.id}:${o.id}` })),
        );
        return result('choice');
      case 'capture':
        send(node.id, node.text);
        return result('capture');
      case 'condition': {
        const actual = variables[node.field] ?? '';
        const yes =
          node.operator === 'exists'
            ? actual.trim() !== ''
            : node.operator === 'equals'
              ? normalize(actual) === normalize(node.value)
              : normalize(node.value) !== '' && normalize(actual).includes(normalize(node.value));
        cursor = yes ? node.yes : node.no;
        break;
      }
      case 'delay':
        cursor = node.next;
        return result(cursor ? 'delay' : null, new Date(now + node.minutes * 60000).toISOString());
      case 'tag':
        for (const tag of node.tags) if (!tags.includes(tag)) tags.push(tag);
        cursor = node.next;
        break;
      case 'lead':
        lead = true;
        cursor = node.next;
        break;
      case 'handoff':
        if (node.text.trim()) send(node.id, node.text);
        handoff = true;
        cursor = null;
        return result();
      case 'end':
        cursor = null;
        return result();
    }
  }
  if (cursor) throw new Error('Сценарий превысил лимит шагов.');
  return result();
}
