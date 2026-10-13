import { expect, it } from 'vitest';
import { loadPages } from '../src/data/pagination.ts';
it('loads contacts beyond the Supabase row limit without losing the last page', async () => {
  const records = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const loaded = await loadPages(async (from, to) => ({
    data: records.slice(from, to + 1),
    error: null,
  }));
  expect(loaded).toEqual(records);
});
it('does not silently return a partial workspace after a failed page', async () => {
  await expect(
    loadPages(
      async (from) => ({ data: from ? null : [1, 2], error: from ? new Error('Offline') : null }),
      2,
    ),
  ).rejects.toThrow('load');
});
