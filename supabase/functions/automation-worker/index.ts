import {
  assertMessage,
  canPrivateReply,
  canSend,
  HANDOFF_REPLY,
  isHandoffCommand,
  isStopCommand,
  routeEvent,
  runFlow,
} from '../../../shared/engine.ts';
import { constantTimeEqual, type MetaEvent } from '../../../shared/meta-events.ts';
import type {
  Contact,
  Conversation,
  EngineResult,
  Flow,
  FlowSession,
  Material,
  Message,
  InstagramAccount,
} from '../../../shared/types.ts';
import { accountToken, MetaError, metaRequest } from '../_shared/meta.ts';
import { encryptToken } from '../_shared/crypto.ts';
import { database, env, HttpError, json, rpc, serve, type Database } from '../_shared/http.ts';
type Conv = Conversation & { mode_revision: number };
type Job = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  lease: string;
  attempts: number;
  event_key: string;
};
class Retry extends Error {
  constructor(public seconds = 10) {
    super('Temporary processing failure');
  }
}
async function getRow<T>(db: Database, table: string, id: string): Promise<T> {
  const { data, error } = await db.from(table).select('*').eq('id', id).single();
  if (error || !data) throw new Error('Record unavailable');
  return data as T;
}
async function update(
  db: Database,
  table: string,
  id: string,
  value: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from(table).update(value).eq('id', id);
  if (error) throw new Error('Update failed');
}
async function locked<T>(db: Database, conversationId: string, fn: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID(),
    key = 'conversation:' + conversationId;
  if (!(await rpc<boolean>(db, 'service_lock', { key, lock_token: token }))) throw new Retry();
  try {
    return await fn();
  } finally {
    await rpc(db, 'service_unlock', { key, lock_token: token });
  }
}
async function takeHuman(db: Database, c: Conv): Promise<void> {
  await update(db, 'conversations', c.id, { mode: 'human', mode_revision: c.mode_revision + 1 });
  await rpc(db, 'service_clear_session', { conversation: c.id });
}
// Flow errors are deterministic, so the run is logged once instead of being retried.
async function runOrRecord(
  db: Database,
  c: Conv,
  flow: Flow,
  key: string,
  contactName: string,
  run: () => EngineResult,
): Promise<EngineResult | null> {
  try {
    return run();
  } catch (e) {
    await rpc(db, 'service_clear_session', { conversation: c.id });
    const { error } = await db.from('automation_runs').upsert(
      {
        workspace_id: c.workspace_id,
        operation_key: key,
        flow_name: flow.name,
        contact_name: contactName || 'Instagram user',
        status: 'failed',
        detail: (e instanceof Error ? e.message : 'The flow could not run.').slice(0, 500),
      },
      { onConflict: 'operation_key', ignoreDuplicates: true },
    );
    if (error) throw new Retry();
    return null;
  }
}
async function eventJob(db: Database, event: MetaEvent): Promise<void> {
  const { data: a, error } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('ig_user_id', event.accountId)
    .maybeSingle();
  if (error) throw new Retry();
  if (!a || a.status === 'disconnected') return;
  const args = {
    account: a.id,
    sender: event.senderId,
    body: event.text,
    key: event.key,
    message_id: event.messageId ?? null,
    event_time: event.at,
    kind: event.kind,
    user_name: event.username ?? '',
  };
  const initial = await rpc<{ contact: Contact; conversation: Conv }>(db, 'service_ingest', {
    ...args,
    record_message: false,
  });
  await locked(db, initial.conversation.id, async () => {
    if (await rpc<boolean>(db, 'service_was_applied', { key: event.key })) return;
    if (event.kind === 'echo' && event.messageId) {
      const { data: own, error: lookupError } = await db
        .from('messages')
        .select('id')
        .eq('instagram_message_id', event.messageId)
        .maybeSingle();
      if (lookupError) throw new Retry();
      if (own) return;
      // The echo of an unconfirmed send proves delivery; it is not a manager reply.
      const { data: pending, error: pendingError } = await db
        .from('messages')
        .select('id')
        .eq('conversation_id', initial.conversation.id)
        .eq('direction', 'out')
        .eq('status', 'uncertain')
        .is('instagram_message_id', null)
        .eq('body', event.text)
        .order('created_at', { ascending: true })
        .limit(1);
      if (pendingError) throw new Retry();
      if (pending?.length) {
        await update(db, 'messages', pending[0].id, {
          status: 'accepted',
          instagram_message_id: event.messageId,
          error: null,
        });
        return;
      }
    }
    const { contact, conversation: c } = await rpc<{ contact: Contact; conversation: Conv }>(
      db,
      'service_ingest',
      { ...args, record_message: true },
    );
    if (event.kind === 'echo') {
      await takeHuman(db, c);
      return;
    }
    if (isStopCommand(event.text) || isHandoffCommand(event.text)) {
      await takeHuman(db, c);
      if (isHandoffCommand(event.text) && canSend(c.window_expires_at))
        await rpc(db, 'service_queue_message', {
          conversation: c.id,
          key: event.key + ':handoff',
          body: HANDOFF_REPLY,
          replies: [],
          sender: 'bot',
          allow_handoff: true,
        });
      return;
    }
    if (c.mode === 'human' || a.status !== 'connected') return;
    if (event.kind === 'dm' && !canSend(c.window_expires_at)) return;
    if (event.kind === 'comment' && !canPrivateReply(event.at)) return;
    const stored = await rpc<FlowSession | null>(db, 'service_get_session', {
      conversation: c.id,
    });
    const { data: flows, error: flowError } = await db
      .from('flows')
      .select('*')
      .eq('workspace_id', a.workspace_id)
      .eq('enabled', true);
    if (flowError) throw new Retry();
    const route = routeEvent(flows as Flow[], stored, {
      kind: event.kind,
      text: event.text,
      payload: event.payload,
      postId: event.postId,
      attachment: event.attachment,
    });
    const { flow, session } = route;
    if (!flow) {
      if (route.discard) await rpc(db, 'service_clear_session', { conversation: c.id });
      return;
    }
    const { data: materials, error: materialError } = await db
      .from('materials')
      .select('*')
      .eq('workspace_id', a.workspace_id);
    if (materialError) throw new Retry();
    const result = await runOrRecord(db, c, flow, event.key, contact.name || contact.username, () =>
      runFlow(flow, {
        session,
        input: session
          ? { text: event.text, payload: event.payload, attachment: event.attachment }
          : undefined,
        materials: materials as Material[],
        variables: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          username: contact.username,
        },
        privateReply: event.kind === 'comment',
      }),
    );
    if (!result) return;
    await rpc(db, 'service_apply_result', {
      conversation: c.id,
      flow: flow.id,
      key: event.key,
      result: { ...result, commentAt: event.kind === 'comment' ? event.at : null },
      comment_id: event.commentId ?? null,
    });
  });
}
async function resumeJob(db: Database, job: Job): Promise<void> {
  const conversationId = String(job.payload.conversationId);
  await locked(db, conversationId, async () => {
    const c = await getRow<Conv>(db, 'conversations', conversationId);
    if (c.mode !== 'bot' || !canSend(c.window_expires_at)) {
      await rpc(db, 'service_clear_session', { conversation: c.id });
      return;
    }
    const session = await rpc<FlowSession | null>(db, 'service_get_session', {
        conversation: c.id,
      }),
      scheduled = job.payload.session as FlowSession;
    if (
      !session ||
      session.waiting !== 'delay' ||
      session.nodeId !== scheduled.nodeId ||
      session.resumeAt !== scheduled.resumeAt ||
      session.flowId !== scheduled.flowId
    )
      return;
    const f = await getRow<Flow>(db, 'flows', session.flowId);
    if (!f.enabled) {
      await rpc(db, 'service_clear_session', { conversation: c.id });
      return;
    }
    const { data: materials, error } = await db
      .from('materials')
      .select('*')
      .eq('workspace_id', c.workspace_id);
    if (error) throw new Retry();
    const contact = await getRow<Contact>(db, 'contacts', c.contact_id);
    const result = await runOrRecord(
      db,
      c,
      f,
      job.event_key,
      contact.name || contact.username,
      () => runFlow(f, { session, materials: materials as Material[] }),
    );
    if (!result) return;
    await rpc(db, 'service_apply_result', {
      conversation: c.id,
      flow: f.id,
      key: job.event_key,
      result,
    });
  });
}
async function sendJob(db: Database, job: Job): Promise<void> {
  const conversationId = String(job.payload.conversationId),
    messageId = String(job.payload.messageId);
  await locked(db, conversationId, async () => {
    const m = await getRow<Message>(db, 'messages', messageId),
      c = await getRow<Conv>(db, 'conversations', conversationId);
    if (m.status !== 'queued') return; // An uncertain in-flight request is NEVER sent twice.
    const a = await getRow<InstagramAccount>(db, 'instagram_accounts', c.account_id);
    if (a.status !== 'connected') {
      await update(db, 'messages', m.id, {
        status: 'failed',
        error: 'Instagram disconnected. Reconnect your account.',
      });
      return;
    }
    if (
      m.source === 'bot' &&
      (c.mode_revision !== job.payload.modeRevision ||
        (c.mode !== 'bot' && !job.payload.allowHandoff))
    ) {
      await update(db, 'messages', m.id, {
        status: 'failed',
        error: 'Sending canceled: your team has taken over.',
      });
      return;
    }
    const commentId = typeof job.payload.commentId === 'string' ? job.payload.commentId : null;
    if (
      commentId ? !canPrivateReply(String(job.payload.commentAt)) : !canSend(c.window_expires_at)
    ) {
      await update(db, 'messages', m.id, {
        status: 'failed',
        error: 'The permitted messaging window is closed.',
      });
      return;
    }
    assertMessage(m.body);
    const token = await accountToken(db, a.id),
      contact = await getRow<Contact>(db, 'contacts', c.contact_id);
    // Persist uncertainty BEFORE the external request: a crash cannot lead to a duplicate send.
    await update(db, 'messages', m.id, {
      status: 'uncertain',
      error: 'Delivery is not confirmed yet. Check Direct before sending again.',
    });
    try {
      const message: Record<string, unknown> = { text: m.body };
      if (!commentId && m.quick_replies?.length)
        message.quick_replies = m.quick_replies.map((q) => ({
          content_type: 'text',
          title: q.title,
          payload: q.payload,
        }));
      const sent = await metaRequest(`${a.ig_user_id}/messages`, token, 'POST', {
        recipient: commentId ? { comment_id: commentId } : { id: contact.instagram_scoped_id },
        message,
      });
      if (typeof sent.message_id !== 'string') throw new MetaError(200, 0, true);
      await update(db, 'messages', m.id, {
        status: 'accepted',
        instagram_message_id: sent.message_id,
        error: null,
      });
      await update(db, 'conversations', c.id, {
        last_message: m.body,
        last_message_at: new Date().toISOString(),
      });
    } catch (e) {
      if (e instanceof MetaError && e.rateLimited) {
        await update(db, 'messages', m.id, {
          status: 'queued',
          error: 'Instagram rate limit reached. Sending has been delayed.',
        });
        throw new Retry(Math.min(300, 15 * 2 ** job.attempts));
      }
      if (e instanceof MetaError && !e.uncertain) {
        await update(db, 'messages', m.id, { status: 'failed', error: e.message });
        if (e.revoked)
          await update(db, 'instagram_accounts', a.id, {
            status: 'error',
            last_error: 'Instagram revoked access. Reconnect your account.',
          });
      }
      // A network/5xx failure or database failure after acceptance remains uncertain.
    }
  });
}
async function refreshJob(db: Database): Promise<void> {
  const { data: accounts, error } = await db
    .from('instagram_accounts')
    .select('*')
    .eq('status', 'connected');
  if (error) throw new Retry();
  for (const a of accounts as InstagramAccount[]) {
    if (!a.token_expires_at || Date.parse(a.token_expires_at) > Date.now() + 10 * 86400000)
      continue;
    const token = await accountToken(db, a.id),
      params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
    const res = await fetch('https://graph.instagram.com/refresh_access_token?' + params, {
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json();
    if (!res.ok || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      if (res.status >= 500 || res.status === 429) throw new Retry(60);
      await update(db, 'instagram_accounts', a.id, {
        status: 'error',
        last_error: 'Unable to refresh Instagram access. Reconnect your account.',
      });
      continue;
    }
    await rpc(db, 'service_put_credentials', {
      account: a.id,
      encrypted: await encryptToken(body.access_token, a.id),
    });
    await update(db, 'instagram_accounts', a.id, {
      token_expires_at: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      last_error: null,
    });
  }
  await rpc(db, 'service_cleanup');
}
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  if (!constantTimeEqual(req.headers.get('x-worker-secret') ?? '', env('WORKER_SECRET')))
    throw new HttpError(403, 'Invalid worker secret');
  const db = database(),
    deadline = Date.now() + 75000;
  await rpc(db, 'service_enqueue', {
    job_kind: 'refresh',
    key: 'refresh:' + new Date().toISOString().slice(0, 10),
    data: {},
  });
  let processed = 0;
  while (processed < 20 && Date.now() < deadline) {
    const jobs = await rpc<Job[]>(db, 'service_claim_jobs', { batch_size: 1 });
    if (!jobs.length) break;
    const job = jobs[0];
    try {
      if (job.kind === 'event') await eventJob(db, job.payload as unknown as MetaEvent);
      else if (job.kind === 'send') await sendJob(db, job);
      else if (job.kind === 'resume') await resumeJob(db, job);
      else if (job.kind === 'refresh') await refreshJob(db);
      else throw new Error('Unknown job');
      await rpc(db, 'service_finish_job', {
        job: job.id,
        lease_token: job.lease,
        result_status: 'done',
      });
    } catch (e) {
      const retry = job.attempts < 5;
      await rpc(db, 'service_finish_job', {
        job: job.id,
        lease_token: job.lease,
        result_status: retry ? 'pending' : 'failed',
        detail: e instanceof MetaError ? e.message : 'Unable to process the job.',
        retry_at: new Date(
          Date.now() +
            (e instanceof Retry ? e.seconds : Math.min(300, 10 * 2 ** job.attempts)) * 1000,
        ).toISOString(),
      });
      if (!retry && job.kind === 'send') {
        const id = String(job.payload.messageId);
        const m = await getRow<Message>(db, 'messages', id);
        if (m.status === 'queued')
          await update(db, 'messages', id, {
            status: 'failed',
            error: 'Retry limit reached. Check your connection.',
          });
      }
    }
    processed++;
  }
  return json({ processed });
});
