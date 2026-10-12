/** Redirect responses have immutable headers; rebuild before adding CORS headers. */
export function withHeaders(response: Response, additions: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(additions)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
