import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite(),
  owner = '11111111-1111-4111-8111-111111111111',
  manager = '22222222-2222-4222-8222-222222222222',
  outsider = '33333333-3333-4333-8333-333333333333';
let workspace: string;
const authSid = '77777777-7777-4777-8777-777777777777';
async function user(uid: string, aal = 'aal2') {
  await db.exec('reset role;set role authenticated');
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [uid, JSON.stringify({ sub: uid, aal, session_id: authSid })],
  );
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,name text,bucket_id text);alter table storage.objects enable row level security;
 insert into auth.users values('${owner}','owner@team.invalid',now()),('${manager}','member@team.invalid',now()),('${outsider}','visitor@external.invalid',now());`);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(name, dir), 'utf8'));
  await db.exec(
    "insert into private.team_invites(email,role) values('owner@team.invalid','owner'),('member@team.invalid','manager')",
  );
  await db.query('select public.service_claim_invite($1)', [owner]);
  workspace = (
    await db.query<{ service_team_workspace: string }>('select public.service_team_workspace($1)', [
      owner,
    ])
  ).rows[0].service_team_workspace;
  await db.query("select public.service_trusted_factor($1,'trusted')", [owner]);
  const baseline = '88888888-8888-4888-8888-888888888888';
  await db.query(
    "select public.service_session_create($1,'baseline-cookie',$2,'mfa','sealed','agent',$3)",
    [baseline, owner, authSid],
  );
  await db.query("select public.service_session_update($1,'sealed','active','trusted',null,true)", [
    baseline,
  ]);
}, 30000);
afterAll(() => db.close());
describe('closed-team security in PostgreSQL', () => {
  it('rejects an AAL2 token from a separate public Auth login session', async () => {
    await user(owner);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: owner, aal: 'aal2', session_id: outsider }),
    ]);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(false);
  });
  it('denies public table access even with a valid invited AAL2 identity', async () => {
    await user(owner);
    await expect(db.query('select * from public.instagram_accounts')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query('select * from private.team_invites')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query('select * from private.waitlist')).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.create_workspace('Bypass')")).rejects.toThrow(
      /permission denied/,
    );
  });
  it('requires both MFA and membership, including when identifiers are guessed', async () => {
    await user(owner, 'aal1');
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(false);
    await user(owner);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(true);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [outsider])).rows[0]
        .is_member,
    ).toBe(false);
    await user(outsider);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(false);
    await expect(db.query('select public.service_session_get($1)', ['stolen'])).rejects.toThrow(
      /permission denied/,
    );
  });
  it('never provisions an outsider, but allows a verified outsider to request the waitlist', async () => {
    await db.exec('reset role');
    expect(
      (
        await db.query<{ service_claim_invite: string | null }>(
          'select public.service_claim_invite($1)',
          [outsider],
        )
      ).rows[0].service_claim_invite,
    ).toBeNull();
    await expect(db.query('select public.service_team_workspace($1)', [outsider])).rejects.toThrow(
      /Team access denied/,
    );
    await db.query('select public.service_join_waitlist($1)', [outsider]);
    expect((await db.query('select * from private.waitlist')).rows).toHaveLength(1);
    expect((await db.query('select * from public.workspaces')).rows).toHaveLength(1);
  });
  it('binds an invitation to a user ID and blocks email reuse by a different account', async () => {
    await db.exec('reset role');
    await db.query('update auth.users set email=$1 where id=$2', ['owner@team.invalid', outsider]);
    expect(
      (
        await db.query<{ service_claim_invite: string | null }>(
          'select public.service_claim_invite($1)',
          [outsider],
        )
      ).rows[0].service_claim_invite,
    ).toBeNull();
    await db.query('update auth.users set email=$1 where id=$2', [
      'visitor@external.invalid',
      outsider,
    ]);
    await db.query('update auth.users set email=$1 where id=$2', ['changed@team.invalid', owner]);
    await user(owner);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(false);
    await db.exec('reset role');
    await db.query('update auth.users set email=$1 where id=$2', ['owner@team.invalid', owner]);
  });
  it('adds the second team member to the same workspace without granting ownership', async () => {
    await db.exec('reset role');
    await db.query('select public.service_claim_invite($1)', [manager]);
    expect(
      (
        await db.query<{ service_team_workspace: string }>(
          'select public.service_team_workspace($1)',
          [manager],
        )
      ).rows[0].service_team_workspace,
    ).toBe(workspace);
    expect(
      (
        await db.query<{ role: string }>(
          'select role from public.workspace_members where user_id=$1',
          [manager],
        )
      ).rows[0].role,
    ).toBe('manager');
  });
  it('does not replace the trusted MFA factor with a newly enrolled factor', async () => {
    await db.exec('reset role');
    expect(
      (
        await db.query<{ service_trusted_factor: string }>(
          'select public.service_trusted_factor($1,$2)',
          [owner, 'trusted'],
        )
      ).rows[0].service_trusted_factor,
    ).toBe('trusted');
    expect(
      (
        await db.query<{ service_trusted_factor: string }>(
          'select public.service_trusted_factor($1,$2)',
          [owner, 'attacker-factor'],
        )
      ).rows[0].service_trusted_factor,
    ).toBe('trusted');
  });
  it('limits brute-force attempts and rejects a replayed proxy nonce', async () => {
    await db.exec('reset role');
    for (let n = 0; n < 3; n++)
      expect(
        (
          await db.query<{ service_rate_limit: boolean }>(
            "select public.service_rate_limit('limit',3,60)",
          )
        ).rows[0].service_rate_limit,
      ).toBe(true);
    expect(
      (
        await db.query<{ service_rate_limit: boolean }>(
          "select public.service_rate_limit('limit',3,60)",
        )
      ).rows[0].service_rate_limit,
    ).toBe(false);
    await db.query("select public.service_login_begin('challenge','owner@team.invalid')");
    for (let n = 0; n < 5; n++)
      expect(
        (
          await db.query<{ service_login_attempt: string }>(
            "select public.service_login_attempt('challenge')",
          )
        ).rows[0].service_login_attempt,
      ).toBeTruthy();
    expect(
      (
        await db.query<{ service_login_attempt: string | null }>(
          "select public.service_login_attempt('challenge')",
        )
      ).rows[0].service_login_attempt,
    ).toBeNull();
    expect(
      (
        await db.query<{ service_proxy_nonce: boolean }>(
          "select public.service_proxy_nonce('nonce')",
        )
      ).rows[0].service_proxy_nonce,
    ).toBe(true);
    expect(
      (
        await db.query<{ service_proxy_nonce: boolean }>(
          "select public.service_proxy_nonce('nonce')",
        )
      ).rows[0].service_proxy_nonce,
    ).toBe(false);
  });
  it('binds OAuth to the initiating session and browser, and consumes state once', async () => {
    await db.exec('reset role');
    const sid = '44444444-4444-4444-8444-444444444444';
    await db.query(
      "select public.service_session_create($1,'cookie',$2,'mfa','sealed','agent',$3)",
      [sid, owner, authSid],
    );
    await db.query(
      "select public.service_session_update($1,'sealed','active','trusted',null,true)",
      [sid],
    );
    await db.query('select public.service_put_oauth_bound($1,$2,$3,$4,$5)', [
      workspace,
      owner,
      sid,
      'state',
      'proof',
    ]);
    expect(
      (
        await db.query<{ service_take_oauth_bound: string | null }>(
          "select public.service_take_oauth_bound('state','wrong-browser')",
        )
      ).rows[0].service_take_oauth_bound,
    ).toBeNull();
    expect(
      (
        await db.query<{ service_take_oauth_bound: string | null }>(
          "select public.service_take_oauth_bound('state','proof')",
        )
      ).rows[0].service_take_oauth_bound,
    ).toBe(workspace);
    expect(
      (
        await db.query<{ service_take_oauth_bound: string | null }>(
          "select public.service_take_oauth_bound('state','proof')",
        )
      ).rows[0].service_take_oauth_bound,
    ).toBeNull();
    await db.query('select public.service_put_oauth_bound($1,$2,$3,$4,$5)', [
      workspace,
      owner,
      sid,
      'revoked-state',
      'proof',
    ]);
    await db.query('select public.service_session_revoke($1)', [sid]);
    expect(
      (
        await db.query<{ service_take_oauth_bound: string | null }>(
          "select public.service_take_oauth_bound('revoked-state','proof')",
        )
      ).rows[0].service_take_oauth_bound,
    ).toBeNull();
    expect(
      (
        await db.query<{ service_session_get: unknown }>(
          "select public.service_session_get('cookie')",
        )
      ).rows[0].service_session_get,
    ).toBeNull();
  });
  it('rejects a pending OAuth return after owner downgrade or factor replacement', async () => {
    await db.exec('reset role');
    const sid = '55555555-5555-4555-8555-555555555555';
    await db.query(
      "select public.service_session_create($1,'owner-check',$2,'mfa','sealed','agent',$3)",
      [sid, owner, authSid],
    );
    await db.query(
      "select public.service_session_update($1,'sealed','active','trusted',null,true)",
      [sid],
    );
    for (const change of ['role', 'factor']) {
      await db.query('select public.service_put_oauth_bound($1,$2,$3,$4,$5)', [
        workspace,
        owner,
        sid,
        change,
        'proof',
      ]);
      if (change === 'role')
        await db.query("update private.team_invites set role='manager' where claimed_user_id=$1", [
          owner,
        ]);
      else
        await db.query(
          "update private.team_invites set trusted_factor_id='replacement' where claimed_user_id=$1",
          [owner],
        );
      expect(
        (
          await db.query<{ service_take_oauth_bound: string | null }>(
            'select public.service_take_oauth_bound($1,$2)',
            [change, 'proof'],
          )
        ).rows[0].service_take_oauth_bound,
      ).toBeNull();
      await expect(
        db.query('select public.service_put_oauth_bound($1,$2,$3,$4,$5)', [
          workspace,
          owner,
          sid,
          'new-' + change,
          'proof',
        ]),
      ).rejects.toThrow(/OAuth access denied/);
      await db.query(
        "update private.team_invites set role='owner',trusted_factor_id='trusted' where claimed_user_id=$1",
        [owner],
      );
    }
  });
  it('revocation blocks an existing team identity immediately', async () => {
    await db.exec('reset role');
    await db.query('update private.team_invites set enabled=false where claimed_user_id=$1', [
      manager,
    ]);
    await user(manager);
    expect(
      (await db.query<{ is_member: boolean }>('select private.is_member($1)', [workspace])).rows[0]
        .is_member,
    ).toBe(false);
  });
});
