begin;
create function public.service_enqueue_events(events jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events)>1000 then
    raise exception 'Invalid webhook batch';
  end if;
  insert into private.jobs(kind,event_key,payload,due_at,created_at)
  select 'event',item->>'key',item,now()+ordinality*interval '1 microsecond',now()+ordinality*interval '1 microsecond'
  from jsonb_array_elements(events) with ordinality as items(item,ordinality)
  on conflict(event_key) do nothing;
  get diagnostics inserted=row_count;
  return inserted;
end;
$$;
revoke all on function public.service_enqueue_events(jsonb) from public,anon,authenticated;
grant execute on function public.service_enqueue_events(jsonb) to service_role;
commit;

