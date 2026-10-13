begin;
-- Recheck current ownership and the pinned factor at both ends of OAuth.
create or replace function public.service_put_oauth_bound(ws uuid,uid uuid,sid uuid,state_hash text,proof text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_team_member(uid)
 or not exists(select 1 from public.workspace_members where workspace_id=ws and user_id=uid and role='owner')
 or not exists(select 1 from private.web_sessions s join private.team_invites i on i.claimed_user_id=s.user_id
 where s.id=sid and s.user_id=uid and s.state='active' and not s.revoked and s.expires_at>now()
 and s.last_seen_at>now()-interval '30 minutes' and s.mfa_at>now()-interval '5 minutes'
 and s.auth_session_id is not null and i.enabled and i.role='owner' and s.factor_id=i.trusted_factor_id)
 then raise exception 'OAuth access denied'; end if;
 insert into private.oauth_states(state_hash,workspace_id,expires_at,user_id,session_id,proof_hash)
 values(state_hash,ws,now()+interval '10 minutes',uid,sid,proof);
end; $$;
create or replace function public.service_take_oauth_bound(hash text,proof text) returns uuid
language plpgsql security definer set search_path='' as $$
declare record private.oauth_states;
begin
 delete from private.oauth_states where state_hash=hash and proof_hash=proof and expires_at>now() returning * into record;
 if not found or not private.is_team_member(record.user_id)
 or not exists(select 1 from public.workspace_members where workspace_id=record.workspace_id and user_id=record.user_id and role='owner')
 or not exists(select 1 from private.web_sessions s join private.team_invites i on i.claimed_user_id=s.user_id
 where s.id=record.session_id and s.user_id=record.user_id and s.state='active' and not s.revoked and s.expires_at>now()
 and s.last_seen_at>now()-interval '30 minutes' and s.mfa_at>now()-interval '15 minutes'
 and s.auth_session_id is not null and i.enabled and i.role='owner' and s.factor_id=i.trusted_factor_id)
 then return null; end if;
 return record.workspace_id;
end; $$;
commit;
