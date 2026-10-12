begin;
alter table private.web_sessions add column auth_session_id uuid;
drop function public.service_session_create(uuid,text,uuid,text,text,text);
create function public.service_session_create(sid uuid,hash text,uid uuid,session_state text,sealed text,agent text,auth_sid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if session_state not in ('mfa','waitlist') then raise exception 'MFA activation must be separate'; end if;
 insert into private.web_sessions(id,token_hash,user_id,state,ciphertext,user_agent_hash,expires_at,auth_session_id)
 values(sid,hash,uid,session_state,sealed,agent,now()+interval '10 minutes',auth_sid);
 update private.web_sessions set revoked=true where user_id=uid and id not in
 (select id from private.web_sessions where user_id=uid and not revoked order by created_at desc limit 3);
end; $$;
revoke all on function public.service_session_create(uuid,text,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.service_session_create(uuid,text,uuid,text,text,text,uuid) to service_role;
create or replace function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','')='aal2' and private.is_team_member(auth.uid())
 and exists(select 1 from public.workspace_members where workspace_id=ws and user_id=auth.uid())
 and exists(select 1 from private.web_sessions s join private.team_invites i on i.claimed_user_id=s.user_id
 where s.user_id=auth.uid() and s.state='active' and not s.revoked and s.expires_at>now()
 and s.last_seen_at>now()-interval '30 minutes' and s.mfa_at is not null
 and s.auth_session_id::text=auth.jwt()->>'session_id' and s.factor_id=i.trusted_factor_id);
$$;
commit;

