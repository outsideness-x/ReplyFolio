// Graph API rate-limit codes: the request was rejected before processing, so a retry is safe.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
function describe(status: number, code: number, subcode: number): string {
  if (RATE_LIMIT_CODES.has(code) || status === 429) return 'Instagram rate limit reached.';
  if (code === 190 || status === 401) return 'Instagram access expired. Reconnect your account.';
  if (code === 10 || subcode === 2534022)
    return 'Instagram only allows this message within the reply window.';
  if (code === 551) return 'This person is not available on Instagram right now.';
  if (code === 200 || code === 3) return 'The Meta app lacks permission to send this message.';
  if (code === 100) return 'Instagram rejected the recipient or message format.';
  return 'Meta rejected the request.';
}
export class MetaError extends Error {
  constructor(
    public status: number,
    public code: number,
    public uncertain = false,
    public subcode = 0,
  ) {
    super(`${describe(status, code, subcode)} (HTTP ${status}, code ${code})`);
  }
  get rateLimited(): boolean {
    return this.status === 429 || RATE_LIMIT_CODES.has(this.code);
  }
  get revoked(): boolean {
    return this.code === 190 || this.status === 401;
  }
}
