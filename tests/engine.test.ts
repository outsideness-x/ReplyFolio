import { describe, expect, it } from 'vitest';
import {
  assertMessage,
  canPrivateReply,
  canSend,
  matchesKeyword,
  normalize,
  runFlow,
  selectFlow,
  validateDefinition,
  validateFlow,
  WINDOW_MS,
} from '../shared/engine.ts';
import { commentTemplate, materialTemplate } from '../shared/templates.ts';
import type { Flow } from '../shared/types.ts';

const now = Date.parse('2026-10-12T09:00:00Z');
const flow = (comment = false): Flow => ({
  id: 'flow',
  workspace_id: 'workspace',
  name: 'Учебные материалы',
  description: '',
  enabled: true,
  trigger_kind: comment ? 'comment_keyword' : 'dm_keyword',
  keywords: ['прайс', 'материалы'],
  post_ids: [],
  definition: comment ? commentTemplate() : materialTemplate(),
  created_at: new Date(now).toISOString(),
  updated_at: new Date(now).toISOString(),
});
describe('Instagram rules and validation', () => {
  it('matches whole Unicode phrases, ignoring punctuation and case', () => {
    expect(matchesKeyword('Пришлите ПРАЙС, пожалуйста!', ['прайс'])).toBe(true);
    expect(matchesKeyword('прайсовый лист', ['прайс'])).toBe(false);
    expect(matchesKeyword('хочу бесплатный—урок', ['бесплатный урок'])).toBe(true);
    expect(matchesKeyword('что угодно', [''])).toBe(false);
    expect(normalize(' ＰＲＩＣＥ ')).toBe('price');
  });
  it('uses UTF-8 byte limits, including Cyrillic', () => {
    expect(() => assertMessage('а'.repeat(501))).toThrow();
    expect(() => assertMessage('а'.repeat(500))).not.toThrow();
    expect(() => assertMessage('  ')).toThrow();
  });
  it('closes ordinary send and private reply windows precisely', () => {
    expect(canSend(new Date(now + 1).toISOString(), now)).toBe(true);
    expect(canSend(new Date(now).toISOString(), now)).toBe(false);
    expect(canSend(null, now)).toBe(false);
    expect(canPrivateReply(new Date(now - 7 * WINDOW_MS).toISOString(), now)).toBe(false);
    expect(canPrivateReply(new Date(now + 1000).toISOString(), now)).toBe(false);
  });
  it('rejects dangling transitions and cycles', () => {
    expect(() =>
      validateDefinition({
        version: 1,
        start: 'a',
        nodes: [{ id: 'a', type: 'send', text: 'test', next: 'missing' }],
      }),
    ).toThrow();
    expect(() =>
      validateDefinition({
        version: 1,
        start: 'a',
        nodes: [{ id: 'a', type: 'send', text: 'test', next: 'a' }],
      }),
    ).toThrow();
  });
  it('requires a plain message to begin a comment flow', () => {
    const f = flow(true);
    f.definition.start = 'email';
    expect(() => validateFlow(f)).toThrow();
  });
  it('gives keyword flows priority and applies post restrictions', () => {
    const any = { ...flow(), id: 'any', trigger_kind: 'dm_any' as const };
    const keyword = flow();
    expect(selectFlow([any, keyword], 'dm', 'прайс')?.id).toBe('flow');
    const comment = { ...flow(true), post_ids: ['123'] };
    expect(selectFlow([comment], 'comment', 'прайс', '124')).toBeUndefined();
    expect(selectFlow([comment], 'comment', 'прайс', '123')?.id).toBe('flow');
  });
});
describe('durable flow sessions', () => {
  it('keeps an active conversation on the version that started it', () => {
    const f = flow(),
      start = runFlow(f);
    f.definition.nodes = f.definition.nodes.filter((n) => n.id !== 'price');
    const choice = f.definition.nodes.find((n) => n.id === 'interest');
    if (choice?.type === 'choice') choice.options[1].next = 'email';
    const result = runFlow(f, { session: start.session, input: { text: 'Стоимость обучения' } });
    expect(result.actions[0].nodeId).toBe('price');
  });
  it('persists a choice, rejects forged payloads, captures an email and creates a lead', () => {
    const f = flow();
    const start = runFlow(f, { now });
    expect(start.actions).toHaveLength(2);
    expect(start.session?.waiting).toBe('choice');
    const bad = runFlow(f, {
      session: start.session,
      input: { text: '', payload: 'rf:another:price' },
      now,
    });
    expect(bad.session?.nodeId).toBe('interest');
    const price = runFlow(f, {
      session: start.session,
      input: { text: 'Стоимость обучения' },
      now,
    });
    expect(price.session?.waiting).toBe('capture');
    const invalid = runFlow(f, { session: price.session, input: { text: 'not-an-email' }, now });
    expect(invalid.lead).toBe(false);
    expect(invalid.session?.waiting).toBe('capture');
    const lead = runFlow(f, {
      session: invalid.session,
      input: { text: ' Name@Example.com ' },
      now,
    });
    expect(lead.variables.email).toBe('name@example.com');
    expect(lead.lead).toBe(true);
    expect(lead.tags).toContain('Интерес к обучению');
    expect(lead.session).toBeNull();
  });
  it('sends only one private reply until the recipient answers', () => {
    const f = flow(true),
      first = runFlow(f, { privateReply: true, now });
    expect(first.actions).toHaveLength(1);
    expect(first.session?.waiting).toBe('reply');
    expect(runFlow(f, { session: first.session, now }).actions).toHaveLength(0);
    const resumed = runFlow(f, { session: first.session, input: { text: 'прайс' }, now });
    expect(resumed.actions).toHaveLength(2);
    expect(resumed.session?.waiting).toBe('capture');
  });
  it('waits durably and resumes a delay only when due', () => {
    const f = flow();
    f.definition = {
      version: 1,
      start: 'wait',
      nodes: [
        { id: 'wait', type: 'delay', minutes: 5, next: 'send' },
        { id: 'send', type: 'send', text: 'Готово', next: null },
      ],
    };
    const waiting = runFlow(f, { now });
    expect(waiting.session?.resumeAt).toBe(new Date(now + 300000).toISOString());
    expect(runFlow(f, { session: waiting.session, now: now + 1000 }).actions).toHaveLength(0);
    expect(runFlow(f, { session: waiting.session, now: now + 300000 }).actions[0].text).toBe(
      'Готово',
    );
  });
  it('evaluates branches and ends a handoff', () => {
    const f = flow();
    f.definition = {
      version: 1,
      start: 'if',
      nodes: [
        {
          id: 'if',
          type: 'condition',
          field: 'email',
          operator: 'exists',
          value: '',
          yes: 'human',
          no: 'end',
          next: null,
        },
        { id: 'human', type: 'handoff', text: 'Передаю менеджеру', next: null },
        { id: 'end', type: 'end', next: null },
      ],
    };
    expect(runFlow(f, { variables: { email: 'a@b.com' } }).handoff).toBe(true);
    expect(runFlow(f).handoff).toBe(false);
  });
  it('fails for removed assets and includes valid material links', () => {
    const f = flow();
    const first = f.definition.nodes[0];
    if (first.type !== 'send') throw new Error('fixture');
    first.assetId = 'asset';
    expect(() => runFlow(f)).toThrow('Материал');
    const result = runFlow(f, {
      materials: [
        {
          id: 'asset',
          workspace_id: 'workspace',
          title: 'Урок',
          description: '',
          kind: 'link',
          url: 'https://example.com/lesson',
          created_at: '',
        },
      ],
    });
    expect(result.actions[0].text).toContain('https://example.com/lesson');
  });
});
