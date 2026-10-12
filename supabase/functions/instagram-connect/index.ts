import { database, env, HttpError, json, member, readJson, rpc, serve, uuid } from '../_shared/http.ts';
import { hash } from '../_shared/crypto.ts';
serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405,'Используйте POST.');
  const body = await readJson(req), workspaceId = uuid(body.workspaceId), db = database();
  const membership = await member(req,db,workspaceId); if (membership.role !== 'owner') throw new HttpError(403,'Подключить Instagram может владелец.');
  const state = [...crypto.getRandomValues(new Uint8Array(32))].map((x)=>x.toString(16).padStart(2,'0')).join('');
  await rpc(db,'service_put_oauth_state',{ ws:workspaceId,state_hash:await hash(state) });
  const params = new URLSearchParams({ client_id:env('META_APP_ID'),redirect_uri:env('SUPABASE_URL')+'/functions/v1/instagram-callback',response_type:'code',scope:'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments',state,force_authentication:'1',enable_fb_login:'0' });
  return json({ url:'https://www.instagram.com/oauth/authorize?'+params });
});
