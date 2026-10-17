import { describe, expect, it } from 'vitest';
import { LocalRepository } from '../src/data/local.ts';
function fixture() {
  const map = new Map<string, string>();
  let now = Date.parse('2026-10-12T09:00:00Z');
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  return {
    repo: new LocalRepository(storage, () => now),
    storage,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe('local demonstration uses the production scenario engine', () => {
  it('persists choices and leads across browser reloads', async () => {
    const f = fixture(),
      id = await f.repo.simulate({ kind: 'dm', text: 'materials' }),
      s = await f.repo.load();
    const contactId = s.conversations.find((c) => c.id === id)!.contact_id;
    const reloaded = new LocalRepository(f.storage, f.now);
    await reloaded.simulate({ kind: 'dm', text: 'Learning resources', contactId });
    await reloaded.simulate({ kind: 'dm', text: 'student@example.com', contactId });
    expect((await reloaded.load()).contacts.find((c) => c.id === contactId)).toMatchObject({
      email: 'student@example.com',
      is_lead: true,
    });
  });
  it('starts another flow when a keyword arrives instead of an answer', async () => {
    const { repo } = fixture(),
      id = await repo.simulate({ kind: 'dm', text: 'materials' }),
      contactId = (await repo.load()).conversations.find((c) => c.id === id)!.contact_id;
    await repo.simulate({ kind: 'dm', text: 'What is the price?', contactId });
    const s = await repo.load(),
      out = s.messages.filter((m) => m.conversation_id === id && m.direction === 'out');
    expect(out.at(-1)?.body).toContain('Leave your email');
    expect(s.runs[0].flow_name).toBe('Pricing and consultation');
  });
  it('does not repeat an any-message greeting after every message', async () => {
    const f = fixture(),
      s = await f.repo.load();
    await f.repo.saveFlow({
      ...s.flows[0],
      id: 'welcome',
      name: 'Welcome',
      trigger_kind: 'dm_any',
      keywords: [],
      definition: {
        version: 1,
        start: 'hi',
        nodes: [{ id: 'hi', type: 'send', text: 'Welcome!', next: null }],
      },
    });
    const id = await f.repo.simulate({ kind: 'dm', text: 'hello' }),
      contactId = (await f.repo.load()).conversations.find((c) => c.id === id)!.contact_id;
    await f.repo.simulate({ kind: 'dm', text: 'thanks', contactId });
    const greetings = () =>
      f.repo
        .load()
        .then((x) => x.messages.filter((m) => m.conversation_id === id && m.body === 'Welcome!'));
    expect(await greetings()).toHaveLength(1);
    f.advance(24 * 3600000);
    await f.repo.simulate({ kind: 'dm', text: 'hello again', contactId });
    expect(await greetings()).toHaveLength(2);
  });
  it('does not open a normal window from a comment', async () => {
    const { repo } = fixture(),
      id = await repo.simulate({ kind: 'comment', text: 'lesson' }),
      s = await repo.load();
    expect(s.conversations.find((c) => c.id === id)?.window_expires_at).toBeNull();
    expect(
      s.messages.filter((m) => m.conversation_id === id && m.direction === 'out'),
    ).toHaveLength(1);
    await expect(repo.send(id, 'Hello')).rejects.toThrow('The messaging window is closed.');
  });
  it('pauses the bot when an operator replies', async () => {
    const { repo } = fixture(),
      id = await repo.simulate({ kind: 'dm', text: 'price' }),
      s = await repo.load();
    await repo.send(id, 'Our team will reply');
    const count = (await repo.load()).messages.length;
    await repo.simulate({
      kind: 'dm',
      text: 'Course pricing',
      contactId: s.conversations.find((c) => c.id === id)!.contact_id,
    });
    expect((await repo.load()).messages).toHaveLength(count + 1);
  });
  it('rejects expired manual replies and deletion of a referenced material', async () => {
    const f = fixture(),
      s = await f.repo.load();
    f.advance(25 * 3600000);
    await expect(f.repo.send(s.conversations[0].id, 'test')).rejects.toThrow();
    await expect(f.repo.deleteMaterial(s.materials[0].id)).rejects.toThrow('used');
  });
});
