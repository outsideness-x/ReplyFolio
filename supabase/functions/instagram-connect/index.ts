import {
  database,
  env,
  HttpError,
  json,
  member,
  readJson,
  rpc,
  serve,
  uuid,
} from '../_shared/http.ts';
import { hash } from '../_shared/crypto.ts';
import { OAUTH_COOKIE, opaqueToken, secureCookie } from '../../../shared/security.ts';
import { recentMfa } from '../_shared/web-session.ts';
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Используйте POST.');
  // Keep the original body available for the gateway signature check in member().
  const body = await readJson(req.clone()),
    workspaceId = uuid(body.workspaceId),
    db = database();
  const membership = await member(req, db, workspaceId);
  if (membership.role !== 'owner') throw new HttpError(403, 'Подключить Instagram может владелец.');
  recentMfa(membership.session);
  const state = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const proof = opaqueToken();
  await rpc(db, 'service_put_oauth_bound', {
    ws: workspaceId,
    uid: membership.userId,
    sid: membership.session.id,
    state_hash: await hash(state),
    proof: await hash(proof),
  });
  const params = new URLSearchParams({
    client_id: env('META_APP_ID'),
    redirect_uri: env('APP_URL') + '/api/instagram-callback',
    response_type: 'code',
    scope:
      'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments',
    state,
    force_authentication: '1',
    enable_fb_login: '0',
  });
  const response = json({ url: 'https://www.instagram.com/oauth/authorize?' + params });
  response.headers.append('set-cookie', secureCookie(OAUTH_COOKIE, proof, 600, 'Lax'));
  await rpc(db, 'service_security_event', {
    event_kind: 'instagram_connect_started',
    uid: membership.userId,
  });
  return response;
});
