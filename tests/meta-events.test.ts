import { describe, expect, it } from 'vitest';
import { parseMetaEvents, verifyMetaSignature } from '../shared/meta-events.ts';
describe('Meta webhook normalization', () => {
  it('keeps messages beyond the first hundred instead of acknowledging a truncated batch', () => {
    const messaging = Array.from({ length: 130 }, (_, n) => ({
      sender: { id: '200' },
      recipient: { id: '100' },
      message: { mid: 'batch.' + n, text: 'price' },
    }));
    const result = parseMetaEvents({ object: 'instagram', entry: [{ id: '100', messaging }] });
    expect(result).toHaveLength(130);
    expect(result[129].messageId).toBe('batch.129');
  });
  it('ignores deliveries and keeps stable message identities across retries', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: '100',
          time: 1791795600,
          messaging: [
            {
              sender: { id: '200' },
              recipient: { id: '100' },
              timestamp: 1791795600000,
              message: { mid: 'mid.1', text: 'price' },
            },
            { sender: { id: '200' }, read: { watermark: 1 } },
          ],
        },
      ],
    };
    const a = parseMetaEvents(payload),
      b = parseMetaEvents({ ...payload, entry: [{ ...payload.entry[0], time: 1791795601 }] });
    expect(a).toHaveLength(1);
    expect(a[0].key).toBe(b[0].key);
  });
  it('distinguishes operator echoes and parses comment IDs', () => {
    const result = parseMetaEvents({
      object: 'instagram',
      entry: [
        {
          id: '100',
          messaging: [
            {
              sender: { id: '100' },
              recipient: { id: '200' },
              message: { mid: 'echo.1', is_echo: true, text: 'Hello' },
            },
          ],
          changes: [
            {
              field: 'comments',
              value: {
                id: '300',
                text: 'lesson',
                from: { id: '200', username: 'student' },
                media: { id: '400' },
              },
            },
          ],
        },
      ],
    });
    expect(result[0].kind).toBe('echo');
    expect(result[0].senderId).toBe('200');
    expect(result[1].commentId).toBe('300');
    expect(result[1].postId).toBe('400');
  });
  it('verifies the original bytes, refusing altered bodies', async () => {
    const raw = new TextEncoder().encode('{"test":true}'),
      secret = 'test-secret';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw));
    const signature = 'sha256=' + [...digest].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(await verifyMetaSignature(raw, signature, secret)).toBe(true);
    expect(await verifyMetaSignature(new TextEncoder().encode('{}'), signature, secret)).toBe(
      false,
    );
    expect(await verifyMetaSignature(raw, null, secret)).toBe(false);
  });
});
