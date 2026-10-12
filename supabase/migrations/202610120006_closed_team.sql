begin;
-- Deliberately empty: provision exact invitations outside Git.
create table private.team_invites (
 email text primary key check(email=lower(trim(email))), role text not null check(role in ('owner','manager')),
 claimed_user_id uuid unique references auth.users(id), trusted_factor_id text, enabled boolean not null default true, created_at timestamptz not null default now()
);
create table private.team_settings(singleton boolean primary key default true check(singleton),workspace_id uuid references public.workspaces(id));
insert into private.team_settings(singleton) values(true);
create table private.web_sessions(
 id uuid primary key, token_hash text not null unique, user_id uuid not null references auth.users(id) on delete cascade,
 state text not null check(state in ('mfa','active','waitlist')), ciphertext text not null,
 user_agent_hash text not null, factor_id text, challenge_id text, mfa_at timestamptz,
 expires_at timestamptz not null, last_seen_at timestamptz not null default now(), revoked boolean not null default false,
 attempts integer not null default 0, created_at timestamptz not null default now()
);
create table private.login_challenges(
 token_hash text primary key, email text not null, expires_at timestamptz not null, attempts integer not null default 0
);
create table private.rate_buckets(key text primary key, window_started timestamptz not null, count integer not null);
create table private.proxy_nonces(nonce_hash text primary key, expires_at timestamptz not null);
create table private.waitlist(email text primary key,user_id uuid not null references auth.users(id),consent_at timestamptz not null default now());
create table private.security_events(id bigint generated always as identity primary key,kind text not null,actor uuid,created_at timestamptz not null default now());
revoke all on all tables in schema private from public,anon,authenticated;
grant all on all tables in schema private to service_role;
grant usage on all sequences in schema private to service_role;

create function private.is_team_member(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.team_invites i join auth.users u on u.id=i.claimed_user_id
 where u.id=uid and i.enabled and i.email=lower(trim(u.email)) and u.email_confirmed_at is not null);
$$;
revoke all on function private.is_team_member(uuid) from public,anon,authenticated;
create or replace function private.is_member(ws uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','')='aal2' and private.is_team_member(auth.uid())
 and exists(select 1 from public.workspace_members m where m.workspace_id=ws and m.user_id=auth.uid());
$$;
-- Prevent bypassing the closed team through the old public provisioning RPC.
revoke all on function public.create_workspace(text) from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['workspaces','workspace_members','instagram_accounts','contacts','conversations','messages','flows','materials','automation_runs'] loop
 execute format('revoke all on table public.%I from anon,authenticated',t);
 end loop;
end $$;
drop policy material_upload on storage.objects;
drop policy material_delete on storage.objects;
drop policy material_owner_read on storage.objects;

create function public.service_claim_invite(uid uuid) returns text language plpgsql security definer set search_path='' as $$
declare verified_email text; invite private.team_invites;
begin
 select lower(trim(email)) into verified_email from auth.users where id=uid and email_confirmed_at is not null;
 if verified_email is null then return null; end if;
 select * into invite from private.team_invites where email=verified_email for update;
 if not found or not invite.enabled or (invite.claimed_user_id is not null and invite.claimed_user_id<>uid) then return null; end if;
 update private.team_invites set claimed_user_id=uid where email=verified_email;
 return invite.role;
end; $$;
create function public.service_team_workspace(uid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare ws uuid; team_role text;
begin
 if not private.is_team_member(uid) then raise exception 'Team access denied'; end if;
 select role into team_role from private.team_invites where claimed_user_id=uid and enabled;
 select workspace_id into ws from private.team_settings where singleton for update;
 if ws is null then
   if team_role<>'owner' then return null; end if;
   select id into ws from public.workspaces where owner_id=uid;
   if ws is null then insert into public.workspaces(owner_id,name) values(uid,'Наша команда') returning id into ws; end if;
   update private.team_settings set workspace_id=ws where singleton;
 end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(ws,uid,team_role)
 on conflict(workspace_id,user_id) do update set role=excluded.role;
 return ws;
end; $$;
create function public.service_trusted_factor(uid uuid,factor text default null) returns text language plpgsql security definer set search_path='' as $$
declare current_factor text;
begin
 if not private.is_team_member(uid) then return null; end if;
 select trusted_factor_id into current_factor from private.team_invites where claimed_user_id=uid and enabled for update;
 if current_factor is null and factor is not null then
   update private.team_invites set trusted_factor_id=factor where claimed_user_id=uid and enabled;
   current_factor:=factor;
 end if;
 return current_factor;
end; $$;
create function public.service_rate_limit(bucket text,limit_count integer,window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin
 insert into private.rate_buckets values(bucket,now(),1)
 on conflict(key) do update set count=case when private.rate_buckets.window_started<now()-make_interval(secs=>window_seconds) then 1 else private.rate_buckets.count+1 end,
 window_started=case when private.rate_buckets.window_started<now()-make_interval(secs=>window_seconds) then now() else private.rate_buckets.window_started end
 returning count into hits;
 return hits<=limit_count;
end; $$;
create function public.service_proxy_nonce(nonce_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted text;
begin
 insert into private.proxy_nonces values(nonce_hash,now()+interval '2 minutes') on conflict do nothing returning private.proxy_nonces.nonce_hash into inserted;
 return inserted is not null;
end; $$;
create function public.service_login_begin(hash text,verified_email text) returns void language sql security definer set search_path='' as $$
 insert into private.login_challenges values(hash,verified_email,now()+interval '10 minutes',0);
$$;
create function public.service_login_attempt(hash text) returns text language plpgsql security definer set search_path='' as $$
declare address text;
begin
 update private.login_challenges set attempts=attempts+1 where token_hash=hash and expires_at>now() and attempts<5 returning email into address;
 return address;
end; $$;
create function public.service_login_finish(hash text) returns void language sql security definer set search_path='' as $$
 delete from private.login_challenges where token_hash=hash;
$$;
create function public.service_session_create(sid uuid,hash text,uid uuid,session_state text,sealed text,agent text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into private.web_sessions(id,token_hash,user_id,state,ciphertext,user_agent_hash,expires_at)
 values(sid,hash,uid,session_state,sealed,agent,now()+interval '10 minutes');
 -- Keep at most three non-revoked login sessions for this user.
 update private.web_sessions set revoked=true where user_id=uid and id not in
 (select id from private.web_sessions where user_id=uid and not revoked order by created_at desc limit 3);
end; $$;
create function public.service_session_get(hash text) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(s) from private.web_sessions s where token_hash=hash and not revoked and expires_at>now() and last_seen_at>now()-interval '30 minutes';
$$;
create function public.service_session_update(sid uuid,sealed text,session_state text,factor text default null,challenge text default null,authenticated boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if authenticated and not private.is_team_member((select user_id from private.web_sessions where id=sid)) then raise exception 'Team access denied'; end if;
 update private.web_sessions set ciphertext=sealed,state=session_state,factor_id=factor,challenge_id=challenge,
 mfa_at=case when authenticated then now() else mfa_at end,expires_at=case when authenticated then created_at+interval '12 hours' else expires_at end,last_seen_at=now(),attempts=case when authenticated then 0 else attempts end
 where id=sid and not revoked and expires_at>now();
end; $$;
create function public.service_session_attempt(sid uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin update private.web_sessions set attempts=attempts+1 where id=sid and not revoked and expires_at>now() returning attempts into hits; return coalesce(hits<=5,false); end; $$;
create function public.service_session_touch(sid uuid) returns void language sql security definer set search_path='' as $$
 update private.web_sessions set last_seen_at=now() where id=sid and not revoked;
$$;
create function public.service_session_revoke(sid uuid) returns void language sql security definer set search_path='' as $$
 update private.web_sessions set revoked=true,ciphertext='' where id=sid;
$$;
create function public.service_join_waitlist(uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare address text;
begin
 select lower(trim(email)) into strict address from auth.users where id=uid and email_confirmed_at is not null;
 insert into private.waitlist(email,user_id) values(address,uid) on conflict(email) do nothing;
end; $$;
create function public.service_security_event(event_kind text,uid uuid default null) returns void language sql security definer set search_path='' as $$
 insert into private.security_events(kind,actor) values(left(event_kind,60),uid);
$$;
-- Bound OAuth states. Legacy states cannot authorize a connection.
alter table private.oauth_states add column user_id uuid references auth.users(id),add column session_id uuid references private.web_sessions(id),add column proof_hash text;
create function public.service_put_oauth_bound(ws uuid,uid uuid,sid uuid,state_hash text,proof text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_team_member(uid) or not exists(select 1 from public.workspace_members where workspace_id=ws and user_id=uid and role='owner')
 or not exists(select 1 from private.web_sessions where id=sid and user_id=uid and state='active' and not revoked and expires_at>now() and mfa_at>now()-interval '5 minutes') then raise exception 'OAuth access denied'; end if;
 insert into private.oauth_states(state_hash,workspace_id,expires_at,user_id,session_id,proof_hash) values(state_hash,ws,now()+interval '10 minutes',uid,sid,proof);
end; $$;
create function public.service_take_oauth_bound(hash text,proof text) returns uuid language plpgsql security definer set search_path='' as $$
declare record private.oauth_states;
begin
 delete from private.oauth_states where state_hash=hash and proof_hash=proof and expires_at>now() returning * into record;
 if not found or not private.is_team_member(record.user_id)
 or not exists(select 1 from public.workspace_members where workspace_id=record.workspace_id and user_id=record.user_id and role='owner')
 or not exists(select 1 from private.web_sessions where id=record.session_id and user_id=record.user_id and not revoked and state='active' and expires_at>now() and last_seen_at>now()-interval '30 minutes') then return null; end if;
 return record.workspace_id;
end; $$;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'service\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.name);
 execute format('grant execute on function %s to service_role',fn.name);
 end loop;
end $$;
commit;

