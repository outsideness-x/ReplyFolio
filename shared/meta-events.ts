export type MetaEvent = {
  key: string;
  kind: 'dm' | 'comment' | 'echo';
  accountId: string;
  senderId: string;
  text: string;
  payload?: string;
  // A message without text, such as a photo, voice note or story mention.
  attachment?: boolean;
  username?: string;
  messageId?: string;
  commentId?: string;
  postId?: string;
  at: string;
};
type Obj = Record<string, unknown>;
function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}
function str(v: unknown, max = 2048): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function id(v: unknown): string {
  const s = str(v, 30);
  return /^\d+$/.test(s) ? s : '';
}
function date(v: unknown, fallback: number): string {
  const n =
    typeof v === 'number'
      ? v < 1e12
        ? v * 1000
        : v
      : typeof v === 'string'
        ? Date.parse(v)
        : fallback;
  return new Date(Number.isFinite(n) ? Math.min(n, fallback) : fallback).toISOString();
}
export function parseMetaEvents(body: unknown, now = Date.now()): MetaEvent[] {
  const root = obj(body);
  if (root.object !== 'instagram' || !Array.isArray(root.entry)) return [];
  const events: MetaEvent[] = [];
  if (root.entry.length > 1000) throw new Error('Webhook batch exceeds Meta limit');
  for (const e of root.entry) {
    const entry = obj(e),
      accountId = id(entry.id);
    if (!accountId) continue;
    const entryAt = date(entry.time, now);
    for (const raw of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const m = obj(raw),
        message = obj(m.message),
        postback = obj(m.postback);
      const senderId = id(obj(m.sender).id),
        recipientId = id(obj(m.recipient).id);
      const echo = message.is_echo === true;
      const peer = echo ? recipientId : senderId;
      if (!peer || peer === accountId) continue;
      const at = date(m.timestamp, Date.parse(entryAt));
      if (str(message.mid)) {
        if (message.is_deleted === true || message.is_unsupported === true) continue;
        const mid = str(message.mid),
          text = str(message.text, 10000);
        events.push({
          key: `message:${accountId}:${mid}`,
          kind: echo ? 'echo' : 'dm',
          accountId,
          senderId: peer,
          text: text || 'Attachment',
          payload: str(obj(message.quick_reply).payload, 1000) || undefined,
          ...(text.trim() ? {} : { attachment: true }),
          messageId: mid,
          at,
        });
      } else if (str(postback.payload, 1000)) {
        const payload = str(postback.payload, 1000),
          mid = str(postback.mid);
        events.push({
          key: `postback:${accountId}:${peer}:${mid || at}:${payload}`,
          kind: 'dm',
          accountId,
          senderId: peer,
          text: str(postback.title, 1000),
          payload,
          messageId: mid || undefined,
          at,
        });
      }
    }
    for (const raw of Array.isArray(entry.changes) ? entry.changes : []) {
      const change = obj(raw),
        value = obj(change.value),
        from = obj(value.from);
      if (change.field !== 'comments') continue;
      const senderId = id(from.id),
        commentId = id(value.id);
      if (!senderId || !commentId || senderId === accountId) continue;
      events.push({
        key: `comment:${accountId}:${commentId}`,
        kind: 'comment',
        accountId,
        senderId,
        text: str(value.text, 10000),
        username: str(from.username, 100),
        commentId,
        postId: id(obj(value.media).id),
        at: date(value.timestamp, Date.parse(entryAt)),
      });
    }
  }
  if (events.length > 1000) throw new Error('Webhook batch exceeds Meta limit');
  return events;
}
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export async function verifyMetaSignature(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, raw as Uint8Array<ArrayBuffer>),
  );
  const expected = 'sha256=' + [...signed].map((x) => x.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(expected, signature);
}
