import { digest, hmac, proxyCanonical } from '../../../shared/security.ts';
import { constantTimeEqual } from '../../../shared/meta-events.ts';
import { env, HttpError, rpc, readBody, type Database } from './http.ts';
export async function gateway(req: Request, db: Database): Promise<{ ip: string; agent: string }> {
  const time = req.headers.get('x-proxy-time') ?? '',
    nonce = req.headers.get('x-proxy-nonce') ?? '',
    ip = req.headers.get('x-proxy-ip') ?? '',
    agent = req.headers.get('x-proxy-agent') ?? '',
    signature = req.headers.get('x-proxy-signature') ?? '';
  if (
    !/^\d{13}$/.test(time) ||
    Math.abs(Date.now() - Number(time)) > 60000 ||
    !/^\w{64}$/.test(nonce) ||
    !ip ||
    agent.length > 512 ||
    !/^\w{64}$/.test(signature)
  )
    throw new HttpError(403, 'Защищённый вход недоступен.');
  const endpoint = new URL(req.url).pathname.split('/').pop()!;
  const body = await readBody(req.clone());
  const expected = await hmac(
    await proxyCanonical(
      req.method,
      endpoint,
      new URL(req.url).search,
      time,
      nonce,
      ip,
      agent,
      req.headers.get('cookie') ?? '',
      body,
    ),
    env('GATEWAY_SECRET'),
  );
  if (
    !constantTimeEqual(signature, expected) ||
    !(await rpc<boolean>(db, 'service_proxy_nonce', { nonce_hash: await digest(nonce) }))
  )
    throw new HttpError(403, 'Защищённый вход недоступен.');
  return { ip, agent };
}
export async function limit(
  db: Database,
  value: string,
  count: number,
  seconds: number,
): Promise<void> {
  const bucket = await hmac(value, env('RATE_LIMIT_SECRET'));
  if (
    !(await rpc<boolean>(db, 'service_rate_limit', {
      bucket,
      limit_count: count,
      window_seconds: seconds,
    }))
  )
    throw new HttpError(429, 'Слишком много попыток. Попробуйте позже.');
}
