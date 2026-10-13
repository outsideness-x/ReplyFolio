import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { withHeaders } from './responses.ts';
import { gateway, limit } from './gateway.ts';
import { webSession } from './web-session.ts';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
export function database() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export type Database = ReturnType<typeof database>;
export async function rpc<T>(
  db: Database,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Database operation failed: ${name}`);
  return data as T;
}
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
export async function readBody(req: Request, limit = 65536): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length')) > limit)
    throw new HttpError(413, 'Request too large.');
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, 'Request too large.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBody(req)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    throw new HttpError(400, 'Invalid ID.');
  return value;
}
export async function member(req: Request, db: Database, workspaceId: string) {
  const context = await gateway(req, db);
  await limit(db, 'workspace:' + context.ip, 120, 60);
  const s = await webSession(req, db, context.agent);
  if (s.row.state !== 'active') throw new HttpError(403, 'Verified team sign-in required.');
  const teamWorkspace = await rpc<string | null>(db, 'service_team_workspace', { uid: s.user.id });
  if (teamWorkspace !== workspaceId)
    throw new HttpError(403, "You don't have access to this workspace.");
  const { data, error } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', s.user.id)
    .maybeSingle();
  if (error) throw new Error('Membership lookup failed');
  if (!data) throw new HttpError(403, "You don't have access to this workspace.");
  await rpc(db, 'service_security_event', { event_kind: 'workspace_access', uid: s.user.id });
  return {
    userId: s.user.id,
    role: data.role === 'owner' && s.teamRole === 'owner' ? 'owner' : 'manager',
    session: s.row,
  };
}
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    const origin = req.headers.get('Origin'),
      allowed = new URL(env('APP_URL')).origin;
    const headers = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      Vary: 'Origin',
    };
    if (origin && origin !== allowed) return json({ error: 'Request origin not allowed.' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let response: Response;
    try {
      response = await handler(req);
    } catch (e) {
      console.error('request_failed', e instanceof HttpError ? e.status : 'internal');
      response = json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : 'Unable to complete this action. Check your connection settings.',
        },
        e instanceof HttpError ? e.status : 500,
      );
    }
    return withHeaders(response, headers);
  });
}
export async function wakeWorker(): Promise<void> {
  try {
    await fetch(env('SUPABASE_URL') + '/functions/v1/automation-worker', {
      method: 'POST',
      headers: { 'x-worker-secret': env('WORKER_SECRET') },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* The persisted job remains for the scheduled worker. */
  }
}
export function background(task: Promise<unknown>): void {
  const runtime = (
    globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }
  ).EdgeRuntime;
  if (runtime) runtime.waitUntil(task);
  else task.catch(() => undefined);
}
