import { hmac, opaqueToken, proxyCanonical, sameOriginMutation } from '../../shared/security.ts';
type Environment = { SUPABASE_URL: string; GATEWAY_SECRET: string };
type Context = { request: Request; env: Environment; params: Record<string, string | string[]> };
const routes = new Set(['auth', 'workspace-api', 'instagram-connect', 'instagram-callback']);
function responseHeaders() {
  return new Headers({
    'cache-control': 'no-store, private',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
}
function failure(status: number) {
  const headers = responseHeaders();
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify({ error: 'Request unavailable.' }), {
    status,
    headers,
  });
}
export async function onRequest(context: Context): Promise<Response> {
  const req = context.request,
    url = new URL(req.url),
    endpoint = url.pathname.replace(/^\/api\//, '');
  if (!routes.has(endpoint) || !['GET', 'POST'].includes(req.method)) return failure(404);
  if (req.method === 'POST' && !sameOriginMutation(req)) return failure(403);
  if (req.method === 'GET' && !['auth', 'instagram-callback'].includes(endpoint))
    return failure(405);
  if (
    !context.env.GATEWAY_SECRET ||
    context.env.GATEWAY_SECRET.length < 32 ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(context.env.SUPABASE_URL)
  )
    return failure(503);
  if (req.method === 'POST' && !req.headers.get('content-type')?.startsWith('application/json'))
    return failure(415);
  if (Number(req.headers.get('content-length')) > 65536) return failure(413);
  const reader = req.body?.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        return failure(413);
      }
      chunks.push(value);
    }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  const time = String(Date.now()),
    nonce = opaqueToken(),
    ip = req.headers.get('cf-connecting-ip') ?? '',
    agent = req.headers.get('user-agent') ?? '',
    cookie = req.headers.get('cookie') ?? '';
  if (!ip || agent.length > 512 || cookie.length > 8192) return failure(400);
  const signature = await hmac(
    await proxyCanonical(req.method, endpoint, url.search, time, nonce, ip, agent, cookie, body),
    context.env.GATEWAY_SECRET,
  );
  const headers = new Headers({
    'x-proxy-time': time,
    'x-proxy-nonce': nonce,
    'x-proxy-ip': ip,
    'x-proxy-agent': agent,
    'x-proxy-signature': signature,
    cookie: cookie,
    'content-type': 'application/json',
  });
  const origin = req.headers.get('origin');
  if (origin) headers.set('origin', origin);
  try {
    const target = new URL('/functions/v1/' + endpoint, context.env.SUPABASE_URL);
    target.search = url.search;
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const outgoing = responseHeaders();
    for (const name of ['content-type', 'location']) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) outgoing.append('set-cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return failure(502);
  }
}
