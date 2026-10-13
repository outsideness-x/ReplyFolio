import { it, expect, vi, afterEach } from 'vitest';
import { onRequest } from '../functions/api/[[path]].ts';
import {
  opaqueToken,
  readCookie,
  secureCookie,
  SESSION_COOKIE,
  sameOriginMutation,
  proxyCanonical,
  hmac,
} from '../shared/security.ts';
afterEach(() => vi.unstubAllGlobals());
it('uses secure host-only HttpOnly cookies and rejects duplicates', () => {
  const token = opaqueToken(),
    cookie = secureCookie(SESSION_COOKIE, token, 600);
  expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
  expect(cookie).not.toContain('Domain=');
  expect(
    readCookie(
      new Request('https://app.invalid', { headers: { cookie: SESSION_COOKIE + '=' + token } }),
      SESSION_COOKIE,
    ),
  ).toBe(token);
  expect(
    readCookie(
      new Request('https://app.invalid', {
        headers: { cookie: SESSION_COOKIE + '=' + token + '; ' + SESSION_COOKIE + '=' + token },
      }),
      SESSION_COOKIE,
    ),
  ).toBeNull();
});
it('rejects cross-site changes before forwarding to the backend', async () => {
  const req = new Request('https://app.invalid/api/auth', {
    method: 'POST',
    headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' },
    body: '{}',
  });
  expect(sameOriginMutation(req)).toBe(false);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  expect(
    (
      await onRequest({
        request: req,
        params: {},
        env: { SUPABASE_URL: 'https://test.supabase.co', GATEWAY_SECRET: 'x'.repeat(64) },
      })
    ).status,
  ).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it('binds proxy signatures to the cookie, method, body, IP and nonce', async () => {
  const bytes = new TextEncoder().encode('{}'),
    canonical = await proxyCanonical(
      'POST',
      'auth',
      '',
      '123',
      'nonce',
      'ip',
      'agent',
      'cookie',
      bytes,
    );
  const signature = await hmac(canonical, 'secret');
  for (const changed of [
    await proxyCanonical('GET', 'auth', '', '123', 'nonce', 'ip', 'agent', 'cookie', bytes),
    await proxyCanonical('POST', 'auth', '', '123', 'new-nonce', 'ip', 'agent', 'cookie', bytes),
    await proxyCanonical('POST', 'auth', '', '123', 'nonce', 'other-ip', 'agent', 'cookie', bytes),
    await proxyCanonical('POST', 'auth', '', '123', 'nonce', 'ip', 'agent', 'stolen-cookie', bytes),
    await proxyCanonical(
      'POST',
      'auth',
      '',
      '123',
      'nonce',
      'ip',
      'agent',
      'cookie',
      new TextEncoder().encode('{"admin":true}'),
    ),
  ])
    expect(await hmac(changed, 'secret')).not.toBe(signature);
});
it('forwards only approved endpoints and hides backend authentication headers', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'set-cookie': secureCookie(SESSION_COOKIE, opaqueToken(), 600),
          'x-secret': 'private',
        },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const req = new Request('https://app.invalid/api/auth', {
    method: 'POST',
    headers: {
      origin: 'https://app.invalid',
      'content-type': 'application/json',
      'cf-connecting-ip': '1.2.3.4',
      'user-agent': 'Test',
    },
    body: '{}',
  });
  const result = await onRequest({
    request: req,
    params: {},
    env: { SUPABASE_URL: 'https://test.supabase.co', GATEWAY_SECRET: 'x'.repeat(64) },
  });
  expect(result.status).toBe(200);
  expect(result.headers.get('x-secret')).toBeNull();
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(result.headers.get('cache-control')).toContain('no-store');
  expect(result.headers.get('strict-transport-security')).toContain('max-age=31536000');
  expect(result.headers.get('content-security-policy')).toContain("default-src 'none'");
  const headers = fetch.mock.calls[0][1]?.headers as Headers;
  expect(headers.get('x-proxy-signature')).toMatch(/^[a-f0-9]{64}$/);
  expect(headers.has('authorization')).toBe(false);
  expect(
    (
      await onRequest({
        request: new Request('https://app.invalid/api/automation-worker'),
        params: {},
        env: { SUPABASE_URL: 'https://test.supabase.co', GATEWAY_SECRET: 'x'.repeat(64) },
      })
    ).status,
  ).toBe(404);
});
