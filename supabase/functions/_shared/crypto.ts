import { env } from './http.ts';
const encode = (value: Uint8Array): string => btoa(String.fromCharCode(...value));
const decode = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (x) => x.charCodeAt(0));
async function encryptionKey(): Promise<CryptoKey> {
  const bytes = decode(env('TOKEN_ENCRYPTION_KEY'));
  if (bytes.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must contain 32 bytes');
  return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptToken(token: string, accountId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(accountId) },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(bytes))}`;
}
export async function decryptToken(encrypted: string, accountId: string): Promise<string> {
  const [version, iv, body] = encrypted.split('.');
  if (version !== 'v1' || !iv || !body) throw new Error('Unsupported encrypted token');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(accountId) },
      await encryptionKey(),
      decode(body),
    ),
  );
}
export async function hash(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
