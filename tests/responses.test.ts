import { expect, it } from 'vitest';
import { withHeaders } from '../supabase/functions/_shared/responses.ts';
it('preserves the OAuth redirect while safely adding CORS to immutable headers', () => {
  const original = Response.redirect('https://replyfolio.example/#/settings', 303);
  const result = withHeaders(original, { 'Access-Control-Allow-Origin': 'https://replyfolio.example' });
  expect(result.status).toBe(303);
  expect(result.headers.get('Location')).toBe('https://replyfolio.example/#/settings');
  expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://replyfolio.example');
});
