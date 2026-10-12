begin;
drop function public.service_queue_message(uuid,text,text,jsonb,text,text);
create function public.service_queue_message(conversation uuid, key text, body text, replies jsonb, sender text, comment_id text default null, comment_time timestamptz default null, allow_handoff boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare msg uuid; c public.conversations;
begin
  if octet_length(trim(body)) not between 1 and 1000 then raise exception 'Invalid message size'; end if;
  select * into strict c from public.conversations where id=conversation;
  insert into public.messages(workspace_id,conversation_id,operation_key,direction,body,quick_replies,source,status)
  values(c.workspace_id,c.id,key,'out',body,replies,sender,'queued') on conflict(operation_key) do nothing returning id into msg;
  if msg is not null then
    perform public.service_enqueue('send','send:'||msg::text,jsonb_build_object('messageId',msg,'conversationId',c.id,'accountId',c.account_id,'commentId',comment_id,'commentAt',comment_time,'modeRevision',c.mode_revision,'allowHandoff',allow_handoff));
  end if;
  return msg;
end;
$$;
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
  where id=c.contact_id returning coalesce(nullif(name,''),nullif(username,''),'Пользователь Instagram') into display_name;
  if result->'session' is null or result->'session'='null'::jsonb then delete from private.sessions where conversation_id=c.id;
  else insert into private.sessions values(c.id,result->'session',now()) on conflict(conversation_id) do update set data=excluded.data, updated_at=now(); end if;
  if coalesce((result->>'handoff')::boolean,false) then update public.conversations set mode='human',mode_revision=mode_revision+1 where id=c.id; end if;
  for action in select jsonb_array_elements(result->'actions') loop
    perform public.service_queue_message(c.id,key||':'||seq::text,action->>'text',coalesce(action->'quickReplies','[]'::jsonb),'bot',comment_id,(result->>'commentAt')::timestamptz,coalesce((result->>'handoff')::boolean,false));
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
create function public.service_ingest(account uuid, sender text, body text, key text, message_id text, event_time timestamptz, kind text, user_name text default '', record_message boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.instagram_accounts; c public.contacts; v public.conversations; inserted uuid;
begin
  select * into strict a from public.instagram_accounts where id=account;
  insert into public.contacts(workspace_id,instagram_scoped_id,username,source)
  values(a.workspace_id,sender,user_name,case when kind='comment' then 'Комментарий' else 'Direct' end)
  on conflict(workspace_id,instagram_scoped_id) do update set username=case when excluded.username='' then public.contacts.username else excluded.username end
  returning * into c;
  insert into public.conversations(workspace_id,account_id,contact_id,last_message_at)
  values(a.workspace_id,a.id,c.id,event_time) on conflict(account_id,contact_id) do nothing;
  select * into strict v from public.conversations where account_id=a.id and contact_id=c.id;
  if record_message then
    insert into public.messages(workspace_id,conversation_id,operation_key,instagram_message_id,direction,body,source,status,created_at)
    values(a.workspace_id,v.id,'incoming:'||key,message_id,case when kind='echo' then 'out' else 'in' end,case when kind='comment' then '[Комментарий] '||body else body end,case when kind='echo' then 'operator' else 'customer' end,case when kind='echo' then 'accepted' else 'received' end,event_time)
    on conflict(operation_key) do nothing returning id into inserted;
    if inserted is not null then
      update public.conversations set
      last_message=case when event_time>=last_message_at then body else last_message end,
      last_message_at=greatest(last_message_at,event_time),
      window_expires_at=case when kind='dm' then greatest(window_expires_at,event_time+interval '24 hours') else window_expires_at end,
      unread_count=unread_count+case when kind='echo' then 0 else 1 end
      where id=v.id returning * into v;
    end if;
  end if;
  return jsonb_build_object('contact',to_jsonb(c),'conversation',to_jsonb(v));
end;
$$;
create or replace function public.service_claim_jobs(batch_size integer default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update private.jobs set status='failed',error='Retry limit exceeded' where attempts>=5 and (status='pending' or (status='processing' and lease_until<now()));
  with candidates as (
    select id from private.jobs where attempts<5 and due_at<=now() and (status='pending' or (status='processing' and lease_until<now()))
    order by due_at,created_at for update skip locked limit least(greatest(batch_size,1),5)
  ), claimed as (
    update private.jobs j set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=attempts+1
    from candidates c where j.id=c.id returning j.id,j.kind,j.payload,j.lease,j.attempts,j.event_key
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;
create function public.service_cleanup() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.oauth_states where expires_at<now();
  delete from private.locks where expires_at<now()-interval '1 hour';
  delete from private.jobs where status in ('done','failed') and created_at<now()-interval '30 days';
  delete from private.applied_events where created_at<now()-interval '30 days';
end;
$$;
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'service\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',fn.name);
    execute format('grant execute on function %s to service_role',fn.name);
  end loop;
end $$;
commit;
