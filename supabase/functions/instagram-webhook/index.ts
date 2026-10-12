import { constantTimeEqual, parseMetaEvents, verifyMetaSignature } from '../../../shared/meta-events.ts';
import { background, database, env, HttpError, json, readBody, rpc, serve, wakeWorker } from '../_shared/http.ts';
serve(async (req) => {
  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    if (params.get('hub.mode') !== 'subscribe' || !constantTimeEqual(params.get('hub.verify_token') ?? '',env('META_VERIFY_TOKEN'))) throw new HttpError(403,'Verification failed');
    return new Response(params.get('hub.challenge') ?? '',{ headers:{ 'Content-Type':'text/plain' } });
  }
  if (req.method !== 'POST') throw new HttpError(405,'Используйте GET или POST.');
  const raw = await readBody(req,1024*1024);
  if (!await verifyMetaSignature(raw,req.headers.get('x-hub-signature-256'),env('META_APP_SECRET'))) throw new HttpError(403,'Invalid webhook signature');
  let body: unknown; try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400,'Invalid payload'); }
  const db = database(), events = parseMetaEvents(body);
  for (const event of events) await rpc(db,'service_enqueue',{ job_kind:'event',key:event.key,data:event });
  if (events.length) background(wakeWorker());
  return json({ received:true });
});
