import {
  digest,
  hmac,
  LOGIN_COOKIE,
  normalizeEmail,
  opaqueToken,
  readCookie,
  secureCookie,
  SESSION_COOKIE,
} from '../../../shared/security.ts';
import { database, env, HttpError, json, readJson, rpc, serve, uuid } from '../_shared/http.ts';
import { gateway, limit } from '../_shared/gateway.ts';
import { sealed, userClient, webSession } from '../_shared/web-session.ts';
async function captcha(token: unknown, ip: string) {
  if (typeof token !== 'string' || token.length > 2048)
    throw new HttpError(400, 'Complete browser verification.');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env('TURNSTILE_SECRET_KEY'),
      response: token,
      remoteip: ip,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await res.json();
  if (
    !res.ok ||
    result.success !== true ||
    result.hostname !== new URL(env('APP_URL')).hostname ||
    result.action !== 'login'
  )
    throw new HttpError(403, 'Repeat browser verification.');
}
function cookieResponse(data: unknown, cookies: string[]) {
  const res = json(data);
  for (const c of cookies) res.headers.append('set-cookie', c);
  return res;
}
serve(async (req) => {
  const db = database(),
    context = await gateway(req, db);
  await limit(db, 'auth:' + context.ip, 40, 900);
  if (req.method === 'GET') {
    if (!readCookie(req, SESSION_COOKIE)) return json({ state: 'anonymous' });
    try {
      const s = await webSession(req, db, context.agent);
      const ws =
        s.row.state === 'active'
          ? await rpc<string | null>(db, 'service_team_workspace', { uid: s.user.id })
          : null;
      return json({ state: s.row.state, workspaceId: ws, email: s.user.email });
    } catch (e) {
      if (e instanceof HttpError && [401, 403].includes(e.status))
        return cookieResponse({ state: 'anonymous' }, [secureCookie(SESSION_COOKIE, '', 0)]);
      throw e;
    }
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
  const body = await readJson(req),
    action = body.action;
  if (action === 'start') {
    let email: string;
    try {
      email = normalizeEmail(body.email);
    } catch {
      throw new HttpError(400, 'Enter a valid email.');
    }
    await captcha(body.captchaToken, context.ip);
    await limit(db, 'email:' + email, 3, 900);
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !data.properties?.email_otp) throw new Error('Email generation failed');
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env('RESEND_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env('EMAIL_FROM'),
        to: [email],
        subject: 'Your GrowthThread sign-in code',
        text:
          'Sign-in code: ' +
          data.properties.email_otp +
          "\n\nDon't share this code. If you didn't request it, ignore this email.",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!send.ok) throw new Error('Email delivery failed');
    const token = opaqueToken();
    await rpc(db, 'service_login_begin', { hash: await digest(token), verified_email: email });
    await rpc(db, 'service_security_event', { event_kind: 'email_code_requested' });
    return cookieResponse({ state: 'code' }, [secureCookie(LOGIN_COOKIE, token, 600)]);
  }
  if (action === 'verify-email') {
    const token = readCookie(req, LOGIN_COOKIE);
    if (!token || typeof body.code !== 'string' || !/^\d{6,8}$/.test(body.code))
      throw new HttpError(400, 'Check the code in your email.');
    const email = await rpc<string | null>(db, 'service_login_attempt', {
      hash: await digest(token),
    });
    if (!email)
      throw new HttpError(429, 'The code expired or you ran out of attempts. Request a new email.');
    const client = userClient(),
      { data, error } = await client.auth.verifyOtp({ email, token: body.code, type: 'email' });
    if (
      error ||
      !data.session ||
      !data.user?.email_confirmed_at ||
      data.user.email?.toLowerCase() !== email
    )
      throw new HttpError(400, 'Invalid or expired code.');
    await rpc(db, 'service_login_finish', { hash: await digest(token) });
    const role = await rpc<string | null>(db, 'service_claim_invite', { uid: data.user.id });
    const proof = await client.auth.getClaims(data.session.access_token);
    if (proof.error || proof.data?.claims.sub !== data.user.id)
      throw new HttpError(403, 'Sign-in verification incomplete.');
    const id = crypto.randomUUID(),
      sessionToken = opaqueToken(),
      state = role ? 'mfa' : 'waitlist';
    await rpc(db, 'service_session_create', {
      sid: id,
      hash: await digest(sessionToken),
      uid: data.user.id,
      session_state: state,
      sealed: await sealed(data.session, id),
      agent: await hmac(context.agent, env('RATE_LIMIT_SECRET')),
      auth_sid: uuid(proof.data.claims.session_id),
    });
    await rpc(db, 'service_security_event', {
      event_kind: role ? 'team_email_verified' : 'waitlist_email_verified',
      uid: data.user.id,
    });
    return cookieResponse({ state }, [
      secureCookie(LOGIN_COOKIE, '', 0),
      secureCookie(SESSION_COOKIE, sessionToken, 43200),
    ]);
  }
  const s = await webSession(req, db, context.agent);
  if (action === 'logout') {
    await rpc(db, 'service_session_revoke', { sid: s.row.id });
    await s.client.auth.signOut({ scope: 'local' });
    return cookieResponse({ state: 'anonymous' }, [
      secureCookie(SESSION_COOKIE, '', 0),
      secureCookie(LOGIN_COOKIE, '', 0),
    ]);
  }
  if (action === 'waitlist') {
    if (s.row.state !== 'waitlist' || body.consent !== true)
      throw new HttpError(403, 'Confirm your consent to join the waitlist.');
    await rpc(db, 'service_join_waitlist', { uid: s.user.id });
    await rpc(db, 'service_session_revoke', { sid: s.row.id });
    return cookieResponse({ state: 'joined' }, [secureCookie(SESSION_COOKIE, '', 0)]);
  }
  if (s.row.state === 'waitlist') throw new HttpError(403, 'Team access is closed.');
  await limit(db, 'mfa:' + s.row.id, 10, 900);
  if (action === 'mfa-start') {
    const { data, error } = await s.client.auth.mfa.listFactors();
    if (error) throw new Error('MFA lookup failed');
    let trusted = await rpc<string | null>(db, 'service_trusted_factor', { uid: s.user.id }),
      factor = data.totp.find((f) => f.id === trusted && f.status === 'verified'),
      qr: string | undefined,
      secret: string | undefined;
    if (trusted && !factor)
      throw new HttpError(
        403,
        'Authenticator unavailable. The owner must use the secure recovery procedure.',
      );
    if (!trusted) {
      // Never silently choose a factor added through the public Auth API.
      if (data.totp.some((f) => f.status === 'verified'))
        throw new HttpError(
          403,
          'The existing authenticator needs trusted approval from the owner.',
        );
      for (const unverified of data.totp) {
        await s.client.auth.mfa.unenroll({ factorId: unverified.id });
      }
      const enrolled = await s.client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'GrowthThread',
      });
      if (enrolled.error || enrolled.data.type !== 'totp') throw new Error('MFA enrollment failed');
      trusted = enrolled.data.id;
      qr = enrolled.data.totp.qr_code;
      secret = enrolled.data.totp.secret;
    }
    await rpc(db, 'service_session_update', {
      sid: s.row.id,
      sealed: await sealed(s.tokens, s.row.id),
      session_state: s.row.state,
      factor: trusted,
      challenge: null,
    });
    return json({ state: 'mfa', enrollment: !!qr, qr, secret });
  }
  if (action === 'mfa-verify') {
    if (!s.row.factor_id || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code))
      throw new HttpError(400, 'Check your authenticator code.');
    if (!(await rpc<boolean>(db, 'service_session_attempt', { sid: s.row.id }))) {
      await rpc(db, 'service_session_revoke', { sid: s.row.id });
      throw new HttpError(429, 'No attempts remaining. Sign in again.');
    }
    // Separate Edge invocations can use different egress IPs. Supabase binds each
    // challenge to its issuing IP, so create and verify it in this invocation.
    const checked = await s.client.auth.mfa.challengeAndVerify({
      factorId: s.row.factor_id,
      code: body.code,
    });
    if (checked.error) {
      if (checked.error.code === 'mfa_ip_address_mismatch')
        throw new HttpError(
          409,
          'The verification connection changed. Try a fresh authenticator code.',
        );
      if (checked.error.code === 'mfa_challenge_expired')
        throw new HttpError(409, 'Verification expired. Start verification again.');
      if (checked.error.status === 429)
        throw new HttpError(429, 'Too many verification attempts. Please try again later.');
      throw new HttpError(400, 'Invalid authenticator code.');
    }
    const trusted = await rpc<string | null>(db, 'service_trusted_factor', {
      uid: s.user.id,
      factor: s.row.factor_id,
    });
    if (trusted !== s.row.factor_id)
      throw new HttpError(403, "The trusted authenticator doesn't match.");
    const claims = await s.client.auth.getClaims(checked.data.access_token);
    if (
      claims.error ||
      claims.data?.claims.aal !== 'aal2' ||
      claims.data.claims.sub !== s.user.id ||
      claims.data.claims.session_id !== s.row.auth_session_id
    )
      throw new HttpError(403, 'MFA verification incomplete.');
    await rpc(db, 'service_session_update', {
      sid: s.row.id,
      sealed: await sealed(checked.data, s.row.id),
      session_state: 'active',
      factor: trusted,
      authenticated: true,
    });
    const ws = await rpc<string | null>(db, 'service_team_workspace', { uid: s.user.id });
    await rpc(db, 'service_security_event', { event_kind: 'mfa_verified', uid: s.user.id });
    return json({ state: 'active', workspaceId: ws });
  }
  throw new HttpError(400, 'Unknown action.');
});
