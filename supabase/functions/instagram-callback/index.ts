import { database, env, HttpError, rpc, serve } from '../_shared/http.ts';
import { encryptToken, hash } from '../_shared/crypto.ts';
import { exchangeCode, metaRequest } from '../_shared/meta.ts';
import { OAUTH_COOKIE, readCookie, secureCookie } from '../../../shared/security.ts';
import { gateway } from '../_shared/gateway.ts';
serve(async (req) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Используйте GET.');
  const url = new URL(req.url),
    db = database();
  await gateway(req, db);
  const proof = readCookie(req, OAUTH_COOKIE);
  if (!proof) throw new HttpError(403, 'Подключение нужно завершить в том же браузере.');
  const state = url.searchParams.get('state');
  if (!state || !/^[0-9a-f]{64}$/.test(state))
    throw new HttpError(400, 'Некорректное состояние авторизации.');
  const workspaceId = await rpc<string | null>(db, 'service_take_oauth_bound', {
    hash: await hash(state),
    proof: await hash(proof),
  });
  if (!workspaceId)
    throw new HttpError(400, 'Ссылка подключения истекла. Повторите подключение из кабинета.');
  const destination = new URL(env('APP_URL'));
  destination.hash = '/settings';
  try {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) throw new Error('Authorization cancelled');
    const { token, expiresIn } = await exchangeCode(
      code.replace(/#_$/, ''),
      env('APP_URL') + '/api/instagram-callback',
    );
    const profile = await metaRequest('me?fields=user_id,username', token);
    const igUserId = String(profile.user_id ?? profile.id ?? '');
    if (!/^\d{1,30}$/.test(igUserId)) throw new Error('Invalid Instagram identity');
    const { data: other, error: otherError } = await db
      .from('instagram_accounts')
      .select('workspace_id')
      .eq('ig_user_id', igUserId)
      .maybeSingle();
    if (otherError || (other && other.workspace_id !== workspaceId))
      throw new Error('Instagram account belongs to another workspace');
    const { data: current, error: currentError } = await db
      .from('instagram_accounts')
      .select('ig_user_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    // Existing conversations contain recipient IDs specific to this Instagram account.
    if (currentError || (current && current.ig_user_id !== igUserId))
      throw new Error('Reconnect the same Instagram account');
    const { data: account, error } = await db
      .from('instagram_accounts')
      .upsert(
        {
          workspace_id: workspaceId,
          ig_user_id: igUserId,
          username: String(profile.username ?? ''),
          status: 'disconnected',
          token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          last_error: null,
        },
        { onConflict: 'workspace_id' },
      )
      .select('id')
      .single();
    if (error || !account) throw new Error('Account save failed');
    await rpc(db, 'service_put_credentials', {
      account: account.id,
      encrypted: await encryptToken(token, account.id),
    });
    try {
      const subscription = await metaRequest(`${igUserId}/subscribed_apps`, token, 'POST', {
        subscribed_fields:
          'messages,messaging_postbacks,messaging_referrals,messaging_seen,comments',
      });
      if (subscription.success !== true) throw new Error('Subscription not confirmed');
      const { error: saveError } = await db
        .from('instagram_accounts')
        .update({ status: 'connected', last_error: null })
        .eq('id', account.id);
      if (saveError) throw new Error('Account activation failed');
    } catch (e) {
      await db
        .from('instagram_accounts')
        .update({
          status: 'error',
          last_error:
            'Не удалось подписаться на события Instagram. Проверьте разрешения Meta и повторите подключение.',
        })
        .eq('id', account.id);
      throw e;
    }
    destination.searchParams.set('instagram', 'connected');
  } catch {
    destination.searchParams.set('instagram', 'error');
  }
  const response = new Response(null, {
    status: 303,
    headers: {
      location: destination.toString(),
      'cache-control': 'no-store',
      'set-cookie': secureCookie(OAUTH_COOKIE, '', 0, 'Lax'),
    },
  });
  return response;
});
