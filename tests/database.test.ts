import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const db = new PGlite();
const userA='11111111-1111-4111-8111-111111111111', userB='22222222-2222-4222-8222-222222222222';
let wsA: string, wsB: string;
async function asUser(user: string) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`); }
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${userA}'),('${userB}');
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,name text,bucket_id text); alter table storage.objects enable row level security;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610120001_core.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610120002_operations.sql', import.meta.url), 'utf8'));
  await asUser(userA); wsA=(await db.query<{ create_workspace:string }>("select public.create_workspace('Команда A')")).rows[0].create_workspace;
  await asUser(userB); wsB=(await db.query<{ create_workspace:string }>("select public.create_workspace('Команда B')")).rows[0].create_workspace;
},30000);
afterAll(async () => { await db.close(); });
describe('real PostgreSQL permissions and queue transactions', () => {
  it('isolates workspaces without recursive membership policies', async () => {
    await asUser(userA);
    expect((await db.query<{ id:string }>('select id from public.workspaces')).rows.map((r)=>r.id)).toEqual([wsA]);
    expect((await db.query('select * from public.workspace_members')).rows).toHaveLength(1);
    expect((await db.query('select * from public.workspaces where id=$1',[wsB])).rows).toHaveLength(0);
  });
  it('prevents authenticated users from calling private token and worker functions', async () => {
    await asUser(userA);
    await expect(db.query('select public.service_get_credentials($1)',[wsA])).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from private.jobs')).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.contacts(workspace_id,instagram_scoped_id) values($1,'123')",[wsA])).rejects.toThrow(/permission denied/);
  });
  it('creates one workspace even when provisioning is repeated', async () => {
    await asUser(userA);
    expect((await db.query<{ create_workspace:string }>("select public.create_workspace('Повтор')")).rows[0].create_workspace).toBe(wsA);
  });
  it('deduplicates jobs and refuses a completion with the wrong lease', async () => {
    await db.exec('reset role');
    const job=(await db.query<{ service_enqueue:string }>("select public.service_enqueue('event','event-key','{}'::jsonb)")).rows[0].service_enqueue;
    expect((await db.query<{ service_enqueue:string|null }>("select public.service_enqueue('event','event-key','{}'::jsonb)")).rows[0].service_enqueue).toBeNull();
    const batch=(await db.query<{ service_claim_jobs:{ id:string; lease:string }[] }>('select public.service_claim_jobs(5)')).rows[0].service_claim_jobs;
    expect(batch).toHaveLength(1);
    expect((await db.query<{ service_claim_jobs:unknown[] }>('select public.service_claim_jobs(5)')).rows[0].service_claim_jobs).toHaveLength(0);
    await db.query("select public.service_finish_job($1,$2,'done')",[job,userA]);
    expect((await db.query<{ status:string }>('select status from private.jobs where id=$1',[job])).rows[0].status).toBe('processing');
    await db.query("select public.service_finish_job($1,$2,'done')",[job,batch[0].lease]);
    expect((await db.query<{ status:string }>('select status from private.jobs where id=$1',[job])).rows[0].status).toBe('done');
  });
  it('locks a conversation so two workers cannot advance it at the same time', async () => {
    await db.exec('reset role');
    expect((await db.query<{ service_lock:boolean }>("select public.service_lock('conversation', $1)",[userA])).rows[0].service_lock).toBe(true);
    expect((await db.query<{ service_lock:boolean }>("select public.service_lock('conversation', $1)",[userB])).rows[0].service_lock).toBe(false);
    await db.query("select public.service_unlock('conversation',$1)",[userB]);
    expect((await db.query<{ service_lock:boolean }>("select public.service_lock('conversation', $1)",[userB])).rows[0].service_lock).toBe(false);
    await db.query("select public.service_unlock('conversation',$1)",[userA]);
    expect((await db.query<{ service_lock:boolean }>("select public.service_lock('conversation', $1)",[userB])).rows[0].service_lock).toBe(true);
  });
  it('ingests a retried incoming event once and opens an ordinary reply window', async () => {
    await db.exec('reset role');
    const account='33333333-3333-4333-8333-333333333333';
    await db.query("insert into public.instagram_accounts(id,workspace_id,ig_user_id,status) values($1,$2,'100','connected')",[account,wsA]);
    const params=[account,'200','прайс','stable-mid','mid.1',new Date().toISOString(),'dm'];
    const first=(await db.query<{service_ingest:{conversation:{id:string;unread_count:number;window_expires_at:string}}}>('select public.service_ingest($1,$2,$3,$4,$5,$6,$7)',params)).rows[0].service_ingest;
    const retry=(await db.query<{service_ingest:{conversation:{id:string;unread_count:number}}}>('select public.service_ingest($1,$2,$3,$4,$5,$6,$7)',params)).rows[0].service_ingest;
    expect(first.conversation.window_expires_at).toBeTruthy();
    expect(first.conversation.id).toBe(retry.conversation.id);
    expect(retry.conversation.unread_count).toBe(1);
  });
  it('atomically applies a handoff and queues its final notice only once', async () => {
    await db.exec('reset role');
    const f='44444444-4444-4444-8444-444444444444';
    await db.query("insert into public.flows(id,workspace_id,name,trigger_kind,definition) values($1,$2,'Прайс','dm_keyword','{}')",[f,wsA]);
    const c=(await db.query<{id:string}>('select id from public.conversations where workspace_id=$1',[wsA])).rows[0].id;
    const result={actions:[{text:'Передаю менеджеру',quickReplies:[]}],variables:{email:'student@example.com'},tags:['Обучение'],lead:true,handoff:true,session:null};
    const params=[c,f,'apply-once',JSON.stringify(result)];
    expect((await db.query<{service_apply_result:boolean}>('select public.service_apply_result($1,$2,$3,$4::jsonb)',params)).rows[0].service_apply_result).toBe(true);
    expect((await db.query<{service_apply_result:boolean}>('select public.service_apply_result($1,$2,$3,$4::jsonb)',params)).rows[0].service_apply_result).toBe(false);
    expect((await db.query<{mode:string}>('select mode from public.conversations where id=$1',[c])).rows[0].mode).toBe('human');
    const jobs=(await db.query<{payload:{allowHandoff:boolean}}> ("select payload from private.jobs where kind='send'")).rows;
    expect(jobs).toHaveLength(1);expect(jobs[0].payload.allowHandoff).toBe(true);
    expect((await db.query<{email:string;is_lead:boolean}>('select email,is_lead from public.contacts where workspace_id=$1',[wsA])).rows[0]).toMatchObject({email:'student@example.com',is_lead:true});
  });
});
