begin;
create function private.cleanup_access() returns void language plpgsql security definer set search_path='' as $$
begin
  delete from private.oauth_states where expires_at<now();
  delete from private.proxy_nonces where expires_at<now();
  delete from private.login_challenges where expires_at<now();
  delete from private.rate_buckets where window_started<now()-interval '3 days';
  delete from private.web_sessions where expires_at<now()-interval '1 day';
  delete from private.security_events where created_at<now()-interval '30 days';
end;
$$;
revoke all on function private.cleanup_access() from public,anon,authenticated,service_role;
commit;
