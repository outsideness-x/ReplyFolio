import { env, rpc, type Database } from './http.ts';
import { decryptToken } from './crypto.ts';
export { MetaError } from '../../../shared/meta-errors.ts';
import { MetaError } from '../../../shared/meta-errors.ts';
export async function metaRequest(
  path: string,
  token: string,
  method = 'GET',
  body?: unknown,
): Promise<Record<string, unknown>> {
  const version = Deno.env.get('META_GRAPH_VERSION') || 'v26.0';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Graph version');
  let response: Response;
  try {
    response = await fetch(`https://graph.instagram.com/${version}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MetaError(0, 0, method === 'POST');
  }
  let value: Record<string, unknown>;
  try {
    value = await response.json();
  } catch {
    throw new MetaError(response.status, 0, method === 'POST');
  }
  if (!response.ok || value.error) {
    const err = value.error as { code?: number; error_subcode?: number } | undefined;
    throw new MetaError(
      response.status,
      err?.code ?? 0,
      method === 'POST' && response.status >= 500,
      err?.error_subcode ?? 0,
    );
  }
  return value;
}
export async function accountToken(db: Database, account: string): Promise<string> {
  const encrypted = await rpc<string | null>(db, 'service_get_credentials', { account });
  if (!encrypted) throw new Error('Account credentials are missing');
  return await decryptToken(encrypted, account);
}
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ token: string; expiresIn: number }> {
  const form = new URLSearchParams({
    client_id: env('META_APP_ID'),
    client_secret: env('META_APP_SECRET'),
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  const short = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  const shortBody = await short.json();
  if (!short.ok || typeof shortBody.access_token !== 'string')
    throw new Error('Instagram authorization failed');
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env('META_APP_SECRET'),
    access_token: shortBody.access_token,
  });
  const long = await fetch('https://graph.instagram.com/access_token?' + params, {
    signal: AbortSignal.timeout(15000),
  });
  const longBody = await long.json();
  if (
    !long.ok ||
    typeof longBody.access_token !== 'string' ||
    typeof longBody.expires_in !== 'number'
  )
    throw new Error('Long-lived token exchange failed');
  return { token: longBody.access_token, expiresIn: longBody.expires_in };
}
