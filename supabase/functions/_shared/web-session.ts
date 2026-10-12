import { createClient, type User } from 'npm:@supabase/supabase-js@2.117.3';
import { digest, hmac, readCookie, SESSION_COOKIE } from '../../../shared/security.ts';
import { decryptToken, encryptToken } from './crypto.ts';
import { env, HttpError, rpc, type Database } from './http.ts';
export type Tokens = { access_token: string; refresh_token: string };
export type WebSession = {
  auth_session_id: string;
  id: string;
  user_id: string;
  state: 'mfa' | 'active' | 'waitlist';
  ciphertext: string;
  user_agent_hash: string;
  factor_id: string | null;
  challenge_id: string | null;
  mfa_at: string | null;
  expires_at: string;
};
export function userClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function sealed(tokens: Tokens, id: string) {
  return await encryptToken(JSON.stringify(tokens), id, 'SESSION_ENCRYPTION_KEY');
}
export async function webSession(req: Request, db: Database, agent: string) {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) throw new HttpError(401, 'Войдите заново.');
  const row = await rpc<WebSession | null>(db, 'service_session_get', {
    hash: await digest(cookie),
  });
  if (!row || row.user_agent_hash !== (await hmac(agent, env('RATE_LIMIT_SECRET'))))
    throw new HttpError(401, 'Войдите заново.');
  const lock = crypto.randomUUID(),
    key = 'web-session:' + row.id;
  if (!(await rpc<boolean>(db, 'service_lock', { key, lock_token: lock })))
    throw new HttpError(409, 'Сессия обновляется. Повторите через секунду.');
  const client = userClient();
  let user: User;
  let tokens: Tokens;
  try {
    const stored = JSON.parse(
      await decryptToken(row.ciphertext, row.id, 'SESSION_ENCRYPTION_KEY'),
    ) as Tokens;
    const { data, error } = await client.auth.setSession(stored);
    if (
      error ||
      !data.session ||
      !data.user ||
      data.user.id !== row.user_id ||
      !data.user.email_confirmed_at
    )
      throw new HttpError(401, 'Войдите заново.');
    user = data.user;
    tokens = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    if (tokens.access_token !== stored.access_token) {
      await rpc(db, 'service_session_update', {
        sid: row.id,
        sealed: await sealed(tokens, row.id),
        session_state: row.state,
        factor: row.factor_id,
        challenge: row.challenge_id,
      });
    }
  } finally {
    await rpc(db, 'service_unlock', { key, lock_token: lock });
  }
  const teamRole =
    row.state !== 'waitlist'
      ? await rpc<string | null>(db, 'service_claim_invite', { uid: user.id })
      : null;
  if (row.state !== 'waitlist' && !teamRole) {
    await rpc(db, 'service_session_revoke', { sid: row.id });
    throw new HttpError(403, 'Доступ к команде закрыт.');
  }
  if (row.state === 'active') {
    const { data, error } = await client.auth.getClaims(tokens.access_token);
    const trusted = await rpc<string | null>(db, 'service_trusted_factor', { uid: user.id });
    if (
      error ||
      data?.claims.aal !== 'aal2' ||
      data.claims.sub !== user.id ||
      data.claims.session_id !== row.auth_session_id ||
      !trusted ||
      trusted !== row.factor_id
    )
      throw new HttpError(403, 'Подтвердите двухфакторный вход.');
  }
  await rpc(db, 'service_session_touch', { sid: row.id });
  return { row, client, user, tokens, teamRole };
}
export function recentMfa(row: WebSession) {
  if (!row.mfa_at || Date.parse(row.mfa_at) < Date.now() - 5 * 60000)
    throw new HttpError(428, 'STEP_UP_REQUIRED');
}
