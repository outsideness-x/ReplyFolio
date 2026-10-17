begin;
-- An "any message" flow greets a conversation at most once a day instead of after every message.
alter table public.conversations add column any_flow_at timestamptz;
create or replace function public.service_apply_result(conversation uuid, flow uuid, key text, result jsonb, comment_id text default null) returns boolean
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
  where id=c.contact_id returning coalesce(nullif(name,''),nullif(username,''),'Instagram user') into display_name;
  if result->'session' is null or result->'session'='null'::jsonb then delete from private.sessions where conversation_id=c.id;
  else insert into private.sessions values(c.id,result->'session',now()) on conflict(conversation_id) do update set data=excluded.data, updated_at=now(); end if;
  if coalesce((result->>'handoff')::boolean,false) then update public.conversations set mode='human',mode_revision=mode_revision+1 where id=c.id; end if;
  if f.trigger_kind='dm_any' then update public.conversations set any_flow_at=now() where id=c.id; end if;
  for action in select jsonb_array_elements(result->'actions') loop
    perform public.service_queue_message(c.id,key||':'||seq::text,action->>'text',coalesce(action->'quickReplies','[]'::jsonb),'bot',comment_id,(result->>'commentAt')::timestamptz,coalesce((result->>'handoff')::boolean,false));
    seq:=seq+1;
  end loop;
  if result->'session'->>'waiting'='delay' then
    perform public.service_enqueue('resume',key||':resume',jsonb_build_object('conversationId',c.id,'accountId',c.account_id,'flowId',f.id,'session',result->'session'),(result->'session'->>'resumeAt')::timestamptz);
  end if;
  insert into public.automation_runs(workspace_id,operation_key,flow_name,contact_name,status,detail)
  values(c.workspace_id,key,f.name,display_name,
    case when (result->>'handoff')::boolean then 'handoff' when result->'session' <> 'null'::jsonb then 'waiting' else 'completed' end,
    coalesce(left(nullif(result->>'note',''),200),format('%s %s prepared',seq,case when seq=1 then 'message' else 'messages' end)));
  return true;
end;
$$;
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'service\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.name);
    execute format('grant execute on function %s to service_role',fn.name);
  end loop;
end $$;
commit;
