import { assertMessage, canSend, isHttpsUrl, validateFlow } from '../../../shared/engine.ts';
import type { Flow } from '../../../shared/types.ts';
import {
  background,
  database,
  HttpError,
  json,
  member,
  readJson,
  rpc,
  serve,
  uuid,
  wakeWorker,
  type Database,
} from '../_shared/http.ts';
import { accountToken, metaRequest } from '../_shared/meta.ts';
async function owned(db: Database, table: string, id: string, ws: string) {
  const { data, error } = await db
    .from(table)
    .select('*')
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle();
  if (error) throw new Error('Lookup failed');
  if (!data) throw new HttpError(404, 'Запись недоступна.');
  return data;
}
function text(value: unknown, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new HttpError(400, 'Проверьте заполненные поля.');
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'Некорректные данные.');
  return value as Record<string, unknown>;
}
async function save(
  db: Database,
  table: string,
  id: string,
  ws: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await db
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle();
  if (error) throw new Error('Lookup failed');
  const result = data
    ? await db.from(table).update(values).eq('id', id).eq('workspace_id', ws)
    : await db.from(table).insert({ id, workspace_id: ws, ...values });
  if (result.error) throw new Error('Save failed');
}
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Используйте POST.');
  const body = await readJson(req),
    ws = uuid(body.workspaceId),
    db = database(),
    membership = await member(req, db, ws);
  const action = body.action;
  if (action === 'save-flow') {
    const raw = object(body.flow),
      id = uuid(raw.id);
    const flow = {
      ...raw,
      id,
      workspace_id: ws,
      name: text(raw.name, 120, true),
      description: text(raw.description ?? '', 2000),
    } as unknown as Flow;
    if (typeof flow.enabled !== 'boolean')
      throw new HttpError(400, 'Некорректный статус сценария.');
    try {
      validateFlow(flow);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Некорректный сценарий.');
    }
    const refs = flow.definition.nodes.flatMap((n) =>
      n.type === 'send' && n.assetId ? [n.assetId] : [],
    );
    if (refs.length) {
      const { data, error } = await db
        .from('materials')
        .select('id,url')
        .eq('workspace_id', ws)
        .in('id', refs);
      if (error) throw new Error('Material lookup failed');
      if (refs.some((id) => !data?.some((m) => m.id === id)))
        throw new HttpError(400, 'Один из материалов недоступен.');
      for (const n of flow.definition.nodes)
        if (n.type === 'send' && n.assetId) {
          const m = data!.find((m) => m.id === n.assetId)!;
          try {
            assertMessage(n.text + '\n' + m.url);
          } catch {
            throw new HttpError(
              400,
              'Сообщение с материалом превышает 1000 байт. Сократите текст.',
            );
          }
        }
    }
    await save(db, 'flows', id, ws, {
      name: flow.name,
      description: flow.description,
      enabled: flow.enabled,
      trigger_kind: flow.trigger_kind,
      keywords: flow.keywords,
      post_ids: flow.post_ids,
      definition: flow.definition,
      updated_at: new Date().toISOString(),
    });
  } else if (action === 'delete-flow') {
    const id = uuid(body.id);
    await owned(db, 'flows', id, ws);
    const { error } = await db.from('flows').delete().eq('id', id).eq('workspace_id', ws);
    if (error) throw new Error('Delete failed');
  } else if (action === 'save-material') {
    const m = object(body.material),
      id = uuid(m.id),
      url = text(m.url, 2048, true);
    if (!isHttpsUrl(url)) throw new HttpError(400, 'Укажите HTTPS-ссылку.');
    if (!['link', 'pdf'].includes(String(m.kind)))
      throw new HttpError(400, 'Некорректный тип материала.');
    const path = m.storage_path ? text(m.storage_path, 300, true) : null;
    if (path && !new RegExp('^' + ws + '/[0-9a-f-]+\\.pdf$', 'i').test(path))
      throw new HttpError(400, 'Некорректный путь файла.');
    if (
      path &&
      url !== Deno.env.get('SUPABASE_URL') + '/storage/v1/object/public/materials/' + path
    )
      throw new HttpError(400, 'Файл должен принадлежать этому пространству.');
    await save(db, 'materials', id, ws, {
      title: text(m.title, 120, true),
      description: text(m.description ?? '', 2000),
      url,
      kind: m.kind,
      storage_path: path,
    });
  } else if (action === 'delete-material') {
    const id = uuid(body.id);
    await owned(db, 'materials', id, ws);
    if (await rpc<boolean>(db, 'service_asset_in_use', { ws, asset: id }))
      throw new HttpError(409, 'Материал используется в сценарии или активном диалоге.');
    const { error } = await db.from('materials').delete().eq('id', id).eq('workspace_id', ws);
    if (error) throw new Error('Delete failed');
  } else if (action === 'update-contact') {
    const id = uuid(body.id),
      patch = object(body.patch);
    await owned(db, 'contacts', id, ws);
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [field, max] of [
      ['name', 120],
      ['email', 254],
      ['phone', 30],
    ] as const)
      if (field in patch) values[field] = text(patch[field], max);
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email)))
      throw new HttpError(400, 'Проверьте email.');
    if (values.phone && !/^\+?\d{7,15}$/.test(String(values.phone).replace(/[\s()-]/g, '')))
      throw new HttpError(400, 'Проверьте номер телефона.');
    if ('status' in patch) {
      if (!['new', 'qualified', 'contacted', 'enrolled', 'archived'].includes(String(patch.status)))
        throw new HttpError(400, 'Некорректный статус.');
      values.status = patch.status;
    }
    if ('tags' in patch) {
      if (!Array.isArray(patch.tags) || patch.tags.length > 20)
        throw new HttpError(400, 'Не более 20 тегов.');
      values.tags = patch.tags.map((t) => text(t, 64, true));
    }
    if ('is_lead' in patch) {
      if (typeof patch.is_lead !== 'boolean')
        throw new HttpError(400, 'Некорректный статус заявки.');
      values.is_lead = patch.is_lead;
    }
    const { error } = await db.from('contacts').update(values).eq('id', id).eq('workspace_id', ws);
    if (error) throw new Error('Contact update failed');
  } else if (action === 'update-conversation' || action === 'send') {
    const id = uuid(body.id);
    await owned(db, 'conversations', id, ws);
    const lockToken = crypto.randomUUID(),
      key = 'conversation:' + id;
    if (!(await rpc<boolean>(db, 'service_lock', { key, lock_token: lockToken })))
      throw new HttpError(
        409,
        'Диалог сейчас обрабатывается. Повторите действие через несколько секунд.',
      );
    try {
      const c = await owned(db, 'conversations', id, ws);
      if (action === 'send') {
        const message = text(body.text, 1000, true);
        try {
          assertMessage(message);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        if (!canSend(c.window_expires_at))
          throw new HttpError(409, 'Окно переписки закрыто. Дождитесь нового сообщения клиента.');
        const account = await owned(db, 'instagram_accounts', c.account_id, ws);
        if (account.status !== 'connected')
          throw new HttpError(409, 'Сначала подключите Instagram.');
        const requestId = uuid(body.requestId);
        const { error } = await db
          .from('conversations')
          .update({ mode: 'human', mode_revision: c.mode_revision + 1 })
          .eq('id', id);
        if (error) throw new Error('Handoff failed');
        await rpc(db, 'service_clear_session', { conversation: id });
        await rpc(db, 'service_queue_message', {
          conversation: id,
          key: 'manual:' + id + ':' + requestId,
          body: message,
          replies: [],
          sender: 'operator',
        });
        background(wakeWorker());
      } else {
        const patch = object(body.patch),
          values: Record<string, unknown> = {};
        if ('mode' in patch) {
          if (!['bot', 'human'].includes(String(patch.mode)))
            throw new HttpError(400, 'Некорректный режим.');
          values.mode = patch.mode;
          if (patch.mode !== c.mode) {
            values.mode_revision = c.mode_revision + 1;
            await rpc(db, 'service_clear_session', { conversation: id });
          }
        }
        if ('status' in patch) {
          if (!['open', 'closed'].includes(String(patch.status)))
            throw new HttpError(400, 'Некорректный статус.');
          values.status = patch.status;
        }
        if ('unread_count' in patch) {
          if (patch.unread_count !== 0) throw new HttpError(400, 'Некорректный счётчик.');
          values.unread_count = 0;
        }
        const { error } = await db.from('conversations').update(values).eq('id', id);
        if (error) throw new Error('Conversation update failed');
      }
    } finally {
      await rpc(db, 'service_unlock', { key, lock_token: lockToken });
    }
  } else if (action === 'rename-workspace') {
    if (membership.role !== 'owner') throw new HttpError(403, 'Действие доступно владельцу.');
    const { error } = await db
      .from('workspaces')
      .update({ name: text(body.name, 120, true) })
      .eq('id', ws);
    if (error) throw new Error('Workspace update failed');
  } else if (action === 'disconnect') {
    if (membership.role !== 'owner') throw new HttpError(403, 'Действие доступно владельцу.');
    const { data: a, error } = await db
      .from('instagram_accounts')
      .select('*')
      .eq('workspace_id', ws)
      .maybeSingle();
    if (error) throw new Error('Lookup failed');
    if (a) {
      let token: string | undefined;
      try {
        token = await accountToken(db, a.id);
      } catch {
        /* Repeating disconnect succeeds even after credentials have been removed. */
      }
      const { error: saveError } = await db
        .from('instagram_accounts')
        .update({ status: 'disconnected', last_error: null })
        .eq('id', a.id);
      if (saveError) throw new Error('Disconnect failed');
      await rpc(db, 'service_delete_credentials', { account: a.id });
      if (token)
        try {
          await metaRequest(`${a.ig_user_id}/subscribed_apps`, token, 'DELETE');
        } catch {
          /* Sending is already disabled; a temporary unsubscribe failure cannot re-enable it. */
        }
    }
  } else throw new HttpError(400, 'Неизвестное действие.');
  return json({ ok: true });
});
