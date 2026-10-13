export const SESSION_COOKIE = '__Host-rf-session';
export const LOGIN_COOKIE = '__Host-rf-login';
export const OAUTH_COOKIE = '__Host-rf-oauth';
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254) throw new Error('Enter a valid email.');
  const email = value.trim().toLowerCase();
  if (
    !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    )
  )
    throw new Error('Enter a valid email.');
  return email;
}
export function opaqueToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function readCookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function secureCookie(
  name: string,
  token: string,
  maxAge: number,
  sameSite: 'Strict' | 'Lax' = 'Strict',
): string {
  return (
    name + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=' + sameSite + '; Max-Age=' + maxAge
  );
}
export function sameOriginMutation(request: Request): boolean {
  return (
    request.headers.get('origin') === new URL(request.url).origin &&
    !['cross-site', 'none'].includes(request.headers.get('sec-fetch-site') ?? '')
  );
}
export async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function proxyCanonical(
  method: string,
  endpoint: string,
  query: string,
  time: string,
  nonce: string,
  ip: string,
  agent: string,
  cookie: string,
  body: Uint8Array,
): Promise<string> {
  return [method, endpoint, query, time, nonce, ip, agent, cookie, await digest(body)].join('\n');
}
