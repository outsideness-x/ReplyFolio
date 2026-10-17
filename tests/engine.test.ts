import { describe, expect, it } from 'vitest';
import {
  assertMessage,
  canPrivateReply,
  canSend,
  matchesKeyword,
  MAX_REMINDERS,
  normalize,
  routeEvent,
  runFlow,
  selectFlow,
  triggerConflicts,
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
  name: 'Learning resources',
  description: '',
  enabled: true,
  trigger_kind: comment ? 'comment_keyword' : 'dm_keyword',
  keywords: ['price', 'materials'],
  post_ids: [],
  definition: comment ? commentTemplate() : materialTemplate(),
  created_at: new Date(now).toISOString(),
  updated_at: new Date(now).toISOString(),
});
describe('Instagram rules and validation', () => {
  it('matches whole Unicode phrases, ignoring punctuation and case', () => {
    expect(matchesKeyword('Please send the PRICE!', ['price'])).toBe(true);
    expect(matchesKeyword('priceless list', ['price'])).toBe(false);
    expect(matchesKeyword("I'd like a free—lesson", ['free lesson'])).toBe(true);
    expect(matchesKeyword('anything', [''])).toBe(false);
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
    expect(selectFlow([any, keyword], 'dm', 'price')?.id).toBe('flow');
    const comment = { ...flow(true), post_ids: ['123'] };
    expect(selectFlow([comment], 'comment', 'price', '124')).toBeUndefined();
    expect(selectFlow([comment], 'comment', 'price', '123')?.id).toBe('flow');
  });
});
describe('trigger conflicts', () => {
  it('finds enabled flows that would compete for the same keyword', () => {
    const a = { ...flow(), id: 'a', keywords: ['Price!'] },
      b = { ...flow(), id: 'b', keywords: ['price', 'cost'] },
      off = { ...flow(), id: 'off', enabled: false },
      comment = { ...flow(true), id: 'comment', keywords: ['price'] };
    expect(triggerConflicts(a, [a, b, off, comment]).map((f) => f.id)).toEqual(['b']);
    const any = { ...flow(), id: 'any', trigger_kind: 'dm_any' as const, keywords: [] };
    expect(triggerConflicts({ ...any, id: 'any2' }, [any, a]).map((f) => f.id)).toEqual(['any']);
  });
});
describe('durable flow sessions', () => {
  it('keeps an active conversation on the version that started it', () => {
    const f = flow(),
      start = runFlow(f);
    f.definition.nodes = f.definition.nodes.filter((n) => n.id !== 'price');
    const choice = f.definition.nodes.find((n) => n.id === 'interest');
    if (choice?.type === 'choice') choice.options[1].next = 'email';
    const result = runFlow(f, { session: start.session, input: { text: 'Course pricing' } });
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
      input: { text: 'Course pricing' },
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
    expect(lead.tags).toContain('Interested in learning');
    expect(lead.session).toBeNull();
  });
  it('sends only one private reply until the recipient answers', () => {
    const f = flow(true),
      first = runFlow(f, { privateReply: true, now });
    expect(first.actions).toHaveLength(1);
    expect(first.session?.waiting).toBe('reply');
    expect(runFlow(f, { session: first.session, now }).actions).toHaveLength(0);
    const resumed = runFlow(f, { session: first.session, input: { text: 'price' }, now });
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
        { id: 'send', type: 'send', text: 'Done', next: null },
      ],
    };
    const waiting = runFlow(f, { now });
    expect(waiting.session?.resumeAt).toBe(new Date(now + 300000).toISOString());
    expect(runFlow(f, { session: waiting.session, now: now + 1000 }).actions).toHaveLength(0);
    expect(runFlow(f, { session: waiting.session, now: now + 300000 }).actions[0].text).toBe(
      'Done',
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
        { id: 'human', type: 'handoff', text: 'Passing you to our team', next: null },
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
    expect(() => runFlow(f)).toThrow('The flow material was deleted or is unavailable.');
    const result = runFlow(f, {
      materials: [
        {
          id: 'asset',
          workspace_id: 'workspace',
          title: 'Lesson',
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
describe('routing an active conversation', () => {
  const pricing = (): Flow => ({
    ...flow(),
    id: 'pricing',
    keywords: ['pricing', 'cost'],
    created_at: new Date(now + 1).toISOString(),
  });
  const materials = (): Flow => ({ ...flow(), keywords: ['materials'] });
  const atChoice = () => runFlow(materials(), { now }).session!;
  const atCapture = (field: 'email' | 'name') => {
    const f = materials();
    const node = f.definition.nodes.find((n) => n.id === 'email');
    if (node?.type !== 'capture') throw new Error('fixture');
    node.field = field;
    const session = runFlow(f, { now }).session!;
    return { f, session: runFlow(f, { session, input: { text: 'Course pricing' }, now }).session! };
  };
  it('starts another flow when its keyword replaces an answer', () => {
    const route = routeEvent(
      [materials(), pricing()],
      atChoice(),
      {
        kind: 'dm',
        text: 'What is the cost?',
      },
      now,
    );
    expect(route.flow?.id).toBe('pricing');
    expect(route.session).toBeNull();
    expect(route.discard).toBe(true);
  });
  it('keeps the current question when the answer itself contains a keyword', () => {
    const choice = routeEvent(
      [materials(), pricing()],
      atChoice(),
      {
        kind: 'dm',
        text: 'Course pricing',
      },
      now,
    );
    expect(choice.flow?.id).toBe('flow');
    expect(choice.session?.nodeId).toBe('interest');
    const { f, session } = atCapture('email');
    const email = routeEvent(
      [f, pricing()],
      session,
      {
        kind: 'dm',
        text: 'anna.cost@example.com',
      },
      now,
    );
    expect(email.flow?.id).toBe('flow');
    expect(email.session?.waiting).toBe('capture');
  });
  it('treats a keyword as a request rather than a typed name', () => {
    const { f, session } = atCapture('name');
    expect(routeEvent([f, pricing()], session, { kind: 'dm', text: 'cost' }, now).flow?.id).toBe(
      'pricing',
    );
  });
  it('forgets unanswered questions after the messaging window', () => {
    const route = routeEvent(
      [materials(), pricing()],
      atChoice(),
      {
        kind: 'dm',
        text: 'hello again',
      },
      now + WINDOW_MS,
    );
    expect(route.flow).toBeUndefined();
    expect(route.discard).toBe(true);
  });
  it('continues a comment flow when the reply arrives days later', () => {
    const comment = flow(true),
      session = runFlow(comment, { privateReply: true, now }).session!;
    const route = routeEvent(
      [comment, pricing()],
      session,
      {
        kind: 'dm',
        text: 'pricing',
      },
      now + 3 * WINDOW_MS,
    );
    expect(route.flow?.id).toBe('flow');
    expect(route.session?.waiting).toBe('reply');
  });
  it('drops a session whose flow was disabled and ignores comments during a live flow', () => {
    const disabled = { ...materials(), enabled: false };
    expect(routeEvent([disabled], atChoice(), { kind: 'dm', text: 'x' }, now)).toEqual({
      flow: undefined,
      session: null,
      discard: true,
    });
    const comment = { ...flow(true), id: 'comment' };
    expect(
      routeEvent([materials(), comment], atChoice(), { kind: 'comment', text: 'lesson' }, now),
    ).toEqual({ session: null, discard: false });
  });
  it('lets a delay resume on schedule unless a keyword starts a new flow', () => {
    const f = materials();
    f.definition = {
      version: 1,
      start: 'wait',
      nodes: [
        { id: 'wait', type: 'delay', minutes: 30, next: 'send' },
        { id: 'send', type: 'send', text: 'Done', next: null },
      ],
    };
    const session = runFlow(f, { now }).session!;
    expect(routeEvent([f, pricing()], session, { kind: 'dm', text: 'thanks' }, now)).toEqual({
      session: null,
      discard: false,
    });
    expect(routeEvent([f, pricing()], session, { kind: 'dm', text: 'cost' }, now).flow?.id).toBe(
      'pricing',
    );
  });
  it('sends a limited number of reminders and then leaves the question to the team', () => {
    const f = materials();
    let session = atChoice();
    for (let i = 1; i <= MAX_REMINDERS; i++) {
      const reminder = runFlow(f, { session, input: { text: 'when does it start?' }, now });
      expect(reminder.actions[0].text).toBe('Please choose one of the options.');
      expect(reminder.actions[0].quickReplies).toHaveLength(2);
      session = reminder.session!;
      expect(session.retries).toBe(i);
    }
    const stopped = runFlow(f, { session, input: { text: 'hello?' }, now });
    expect(stopped.actions).toHaveLength(0);
    expect(stopped.session).toBeNull();
    expect(stopped.note).toBe(`Stopped after ${MAX_REMINDERS + 1} unrecognized replies`);
    const answered = runFlow(f, { session, input: { text: 'Learning resources' }, now });
    expect(answered.session?.retries).toBeUndefined();
  });
  it('uses a custom reminder and never captures an attachment', () => {
    const { f, session } = atCapture('name');
    const node = session.definition!.nodes.find((n) => n.id === 'email');
    if (node?.type !== 'capture') throw new Error('fixture');
    node.retry = 'Напишите, пожалуйста, ваше имя.';
    const result = runFlow(f, { session, input: { text: 'Attachment', attachment: true }, now });
    expect(result.variables.name).toBeUndefined();
    expect(result.actions[0].text).toBe('Напишите, пожалуйста, ваше имя.');
    const long = materials();
    const choice = long.definition.nodes.find((n) => n.type === 'choice');
    if (choice?.type !== 'choice') throw new Error('fixture');
    choice.retry = 'я'.repeat(501);
    expect(() => validateFlow(long)).toThrow('reminder');
  });
});
