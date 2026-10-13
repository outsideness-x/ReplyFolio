-- Set an English name for newly provisioned workspaces without renaming existing ones.
create or replace function public.service_team_workspace(uid uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare ws uuid; team_role text;
begin
 if not private.is_team_member(uid) then raise exception 'Team access denied'; end if;
 select role into team_role from private.team_invites where claimed_user_id=uid and enabled;
 select workspace_id into ws from private.team_settings where singleton for update;
 if ws is null then
   if team_role<>'owner' then return null; end if;
   select id into ws from public.workspaces where owner_id=uid;
   if ws is null then insert into public.workspaces(owner_id,name) values(uid,'Our team') returning id into ws; end if;
   update private.team_settings set workspace_id=ws where singleton;
 end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(ws,uid,team_role)
 on conflict(workspace_id,user_id) do update set role=excluded.role;
 return ws;
end; $$;
