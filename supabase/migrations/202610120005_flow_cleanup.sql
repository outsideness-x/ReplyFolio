begin;
create function private.clear_removed_flow() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Invalidate queued bot responses belonging to an active instance of the deleted flow.
  update public.conversations set mode_revision=mode_revision+1
  where workspace_id=old.workspace_id and id in (
    select conversation_id from private.sessions where data->>'flowId'=old.id::text
  );
  delete from private.sessions where data->>'flowId'=old.id::text;
  update private.jobs set status='done',lease=null,lease_until=null,error='Scenario deleted'
  where kind='resume' and payload->>'flowId'=old.id::text and status in ('pending','processing');
  return old;
end;
$$;
revoke all on function private.clear_removed_flow() from public,anon,authenticated,service_role;
create trigger flow_removed after delete on public.flows
for each row execute function private.clear_removed_flow();
commit;

