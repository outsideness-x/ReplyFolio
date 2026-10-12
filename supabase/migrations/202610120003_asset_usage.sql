begin;
create function public.service_asset_in_use(ws uuid,asset uuid) returns boolean
language sql security definer set search_path='' as $$
  select exists(select 1 from public.flows where workspace_id=ws and definition @> jsonb_build_object('nodes',jsonb_build_array(jsonb_build_object('assetId',asset::text))))
  or exists(select 1 from private.sessions s join public.conversations c on c.id=s.conversation_id where c.workspace_id=ws and s.data @> jsonb_build_object('definition',jsonb_build_object('nodes',jsonb_build_array(jsonb_build_object('assetId',asset::text)))));
$$;
revoke all on function public.service_asset_in_use(uuid,uuid) from public,anon,authenticated;
grant execute on function public.service_asset_in_use(uuid,uuid) to service_role;
commit;
