begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager')),
  primary key (workspace_id, user_id)
);
create function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated, service_role;

create function public.create_workspace(workspace_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select id into ws from public.workspaces where owner_id = uid;
  if ws is not null then return ws; end if;
  insert into public.workspaces(owner_id, name) values(uid, workspace_name) returning id into ws;
  insert into public.workspace_members values(ws, uid, 'owner');
  return ws;
end;
$$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  ig_user_id text not null unique,
  username text not null default '',
  status text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  token_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(id, workspace_id)
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  instagram_scoped_id text not null,
  username text not null default '', name text not null default '',
  email text not null default '', phone text not null default '',
  tags text[] not null default '{}',
  status text not null default 'new' check (status in ('new','qualified','contacted','enrolled','archived')),
  source text not null default 'Direct', is_lead boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id, instagram_scoped_id), unique(id, workspace_id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null, contact_id uuid not null,
  status text not null default 'open' check(status in ('open','closed')),
  mode text not null default 'bot' check(mode in ('bot','human')),
  mode_revision integer not null default 0,
  window_expires_at timestamptz,
  last_message text not null default '', last_message_at timestamptz not null default now(),
  unread_count integer not null default 0 check(unread_count >= 0),
  unique(account_id, contact_id), unique(id, workspace_id),
  foreign key(account_id, workspace_id) references public.instagram_accounts(id, workspace_id) on delete cascade,
  foreign key(contact_id, workspace_id) references public.contacts(id, workspace_id) on delete cascade
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  instagram_message_id text unique, operation_key text unique,
  direction text not null check(direction in ('in','out')),
  body text not null, quick_replies jsonb not null default '[]',
  source text not null check(source in ('customer','bot','operator')),
  status text not null check(status in ('received','queued','accepted','failed','uncertain')),
  error text, created_at timestamptz not null default now(),
  foreign key(conversation_id, workspace_id) references public.conversations(id, workspace_id) on delete cascade
);
create index messages_conversation_created on public.messages(conversation_id, created_at);
create index conversations_workspace_last on public.conversations(workspace_id, last_message_at desc);
create index contacts_workspace_leads on public.contacts(workspace_id, is_lead);
create table public.flows (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120), description text not null default '',
  enabled boolean not null default false,
  trigger_kind text not null check(trigger_kind in ('dm_keyword','dm_any','comment_keyword')),
  keywords text[] not null default '{}', post_ids text[] not null default '{}',
  definition jsonb not null check(jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, workspace_id)
);
create table public.materials (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 120), description text not null default '',
  url text not null check(url ~ '^https://'), kind text not null check(kind in ('link','pdf')),
  storage_path text, created_at timestamptz not null default now()
);
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_key text not null unique, flow_name text not null, contact_name text not null,
  status text not null check(status in ('completed','waiting','handoff','failed')),
  detail text not null default '', created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['workspaces','workspace_members','instagram_accounts','contacts','conversations','messages','flows','materials','automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (private.is_member(%I))', t, case when t = 'workspaces' then 'id' else 'workspace_id' end);
  end loop;
end $$;

create table private.oauth_states (state_hash text primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade, expires_at timestamptz not null);
create table private.instagram_credentials (account_id uuid primary key references public.instagram_accounts(id) on delete cascade, ciphertext text not null);
create table private.sessions (conversation_id uuid primary key references public.conversations(id) on delete cascade, data jsonb not null, updated_at timestamptz not null default now());
create table private.applied_events (event_key text primary key, created_at timestamptz not null default now());
create table private.jobs (
  id uuid primary key default gen_random_uuid(), event_key text not null unique, kind text not null,
  payload jsonb not null, status text not null default 'pending' check(status in ('pending','processing','done','failed')),
  due_at timestamptz not null default now(), lease uuid, lease_until timestamptz,
  attempts integer not null default 0, error text, created_at timestamptz not null default now()
);
create index jobs_due on private.jobs(status, due_at);
create table private.locks (lock_key text primary key, token uuid not null, expires_at timestamptz not null);
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

create function public.service_put_oauth_state(ws uuid, state_hash text) returns void
language sql security definer set search_path = '' as $$
  insert into private.oauth_states values(state_hash, ws, now() + interval '10 minutes');
$$;
create function public.service_take_oauth_state(hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin delete from private.oauth_states where state_hash = hash and expires_at > now() returning workspace_id into ws; return ws; end;
$$;
create function public.service_put_credentials(account uuid, encrypted text) returns void
language sql security definer set search_path = '' as $$
  insert into private.instagram_credentials values(account, encrypted) on conflict(account_id) do update set ciphertext = excluded.ciphertext;
$$;
create function public.service_get_credentials(account uuid) returns text
language sql security definer set search_path = '' as $$ select ciphertext from private.instagram_credentials where account_id = account; $$;
create function public.service_delete_credentials(account uuid) returns void
language sql security definer set search_path = '' as $$ delete from private.instagram_credentials where account_id = account; $$;
create function public.service_enqueue(job_kind text, key text, data jsonb, due timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare job uuid;
begin
  insert into private.jobs(kind,event_key,payload,due_at) values(job_kind,key,data,due)
  on conflict(event_key) do nothing returning id into job;
  return job;
end;
$$;
create function public.service_claim_jobs(batch_size integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  with candidates as (
    select id from private.jobs where attempts < 5 and due_at <= now()
    and (status = 'pending' or (status = 'processing' and lease_until < now()))
    order by due_at, created_at for update skip locked limit least(greatest(batch_size, 1), 5)
  ), claimed as (
    update private.jobs j set status = 'processing', lease = gen_random_uuid(), lease_until = now() + interval '120 seconds', attempts = attempts + 1
    from candidates c where j.id = c.id returning j.id,j.kind,j.payload,j.lease,j.attempts,j.event_key
  ) select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into result from claimed;
  return result;
end;
$$;
create function public.service_finish_job(job uuid, lease_token uuid, result_status text, detail text default null, retry_at timestamptz default null) returns void
language sql security definer set search_path = '' as $$
  update private.jobs set status = result_status, error = left(detail,500), due_at = coalesce(retry_at,due_at), lease = null, lease_until = null
  where id = job and lease = lease_token;
$$;
create function public.service_lock(key text, lock_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare success boolean;
begin
  insert into private.locks values(key,lock_token,now()+interval '60 seconds')
  on conflict(lock_key) do update set token=excluded.token, expires_at=excluded.expires_at where private.locks.expires_at < now() or private.locks.token=lock_token
  returning true into success;
  return coalesce(success,false);
end;
$$;
create function public.service_unlock(key text, lock_token uuid) returns void
language sql security definer set search_path = '' as $$ delete from private.locks where lock_key=key and token=lock_token; $$;
create function public.service_get_session(conversation uuid) returns jsonb
language sql security definer set search_path = '' as $$ select data from private.sessions where conversation_id=conversation; $$;
create function public.service_clear_session(conversation uuid) returns void
language sql security definer set search_path = '' as $$ delete from private.sessions where conversation_id=conversation; $$;
create function public.service_was_applied(key text) returns boolean
language sql security definer set search_path = '' as $$ select exists(select 1 from private.applied_events where event_key=key); $$;

create function public.service_queue_message(conversation uuid, key text, body text, replies jsonb, sender text, comment_id text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare msg uuid; c public.conversations;
begin
  select * into strict c from public.conversations where id=conversation;
  insert into public.messages(workspace_id,conversation_id,operation_key,direction,body,quick_replies,source,status)
  values(c.workspace_id,c.id,key,'out',body,replies,sender,'queued') on conflict(operation_key) do nothing returning id into msg;
  if msg is not null then
    perform public.service_enqueue('send', 'send:'||msg::text, jsonb_build_object('messageId',msg,'conversationId',c.id,'accountId',c.account_id,'commentId',comment_id,'modeRevision',c.mode_revision));
  end if;
  return msg;
end;
$$;
create function public.service_apply_result(conversation uuid, flow uuid, key text, result jsonb, comment_id text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.conversations; f public.flows; action jsonb; seq integer:=0; inserted text; display_name text;
begin
  insert into private.applied_events(event_key) values(key) on conflict do nothing returning event_key into inserted;
  if inserted is null then return false; end if;
  select * into strict c from public.conversations where id=conversation;
  select * into strict f from public.flows where id=flow and workspace_id=c.workspace_id;
  update public.contacts set
    name=coalesce(result->'variables'->>'name',name), email=coalesce(result->'variables'->>'email',email), phone=coalesce(result->'variables'->>'phone',phone),
    tags=array(select distinct x from unnest(tags || array(select jsonb_array_elements_text(result->'tags'))) x),
    is_lead=is_lead or coalesce((result->>'lead')::boolean,false), updated_at=now()
  where id=c.contact_id returning coalesce(nullif(name,''),nullif(username,''),'Пользователь Instagram') into display_name;
  if result->'session' is null or result->'session'='null'::jsonb then delete from private.sessions where conversation_id=c.id;
  else insert into private.sessions values(c.id,result->'session',now()) on conflict(conversation_id) do update set data=excluded.data, updated_at=now(); end if;
  if coalesce((result->>'handoff')::boolean,false) then update public.conversations set mode='human',mode_revision=mode_revision+1 where id=c.id; end if;
  for action in select jsonb_array_elements(result->'actions') loop
    perform public.service_queue_message(c.id,key||':'||seq::text,action->>'text',coalesce(action->'quickReplies','[]'::jsonb),'bot',comment_id);
    seq:=seq+1;
  end loop;
  if result->'session'->>'waiting'='delay' then
    perform public.service_enqueue('resume',key||':resume',jsonb_build_object('conversationId',c.id,'accountId',c.account_id,'flowId',f.id,'session',result->'session'),(result->'session'->>'resumeAt')::timestamptz);
  end if;
  insert into public.automation_runs(workspace_id,operation_key,flow_name,contact_name,status,detail)
  values(c.workspace_id,key,f.name,display_name,case when (result->>'handoff')::boolean then 'handoff' when result->'session' <> 'null'::jsonb then 'waiting' else 'completed' end,format('%s сообщений подготовлено',seq));
  return true;
end;
$$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'service\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.name);
    execute format('grant execute on function %s to service_role',fn.name);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('materials','materials',true,26214400,array['application/pdf']) on conflict(id) do nothing;
create function private.can_upload_material(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members where user_id=auth.uid() and workspace_id::text=split_part(path,'/',1));
$$;
revoke all on function private.can_upload_material(text) from public;
grant execute on function private.can_upload_material(text) to authenticated;
create policy material_upload on storage.objects for insert to authenticated with check(bucket_id='materials' and private.can_upload_material(name));
create policy material_delete on storage.objects for delete to authenticated using(bucket_id='materials' and private.can_upload_material(name));
create policy material_owner_read on storage.objects for select to authenticated using(bucket_id='materials' and private.can_upload_material(name));

do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['contacts','conversations','messages','flows','materials','instagram_accounts','automation_runs'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
commit;
