import { describe, expect, it } from 'vitest';
import { MetaError } from '../shared/meta-errors.ts';
describe('Meta send errors', () => {
  it('retries rate limits that Meta reports with HTTP 400', () => {
    expect(new MetaError(400, 613).rateLimited).toBe(true);
    expect(new MetaError(429, 0).rateLimited).toBe(true);
    expect(new MetaError(400, 100).rateLimited).toBe(false);
  });
  it('explains common failures to the team', () => {
    expect(new MetaError(400, 10, false, 2534022).message).toBe(
      'Instagram only allows this message within the reply window. (HTTP 400, code 10)',
    );
    expect(new MetaError(400, 551).message).toContain('not available');
    expect(new MetaError(400, 190).revoked).toBe(true);
  });
});
