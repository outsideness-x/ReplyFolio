export async function loadPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 500,
): Promise<T[]> {
  const items: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error)
      throw new Error('Unable to load data. Check your connection and access permissions.');
    const page = data ?? [];
    items.push(...page);
    if (page.length < size) return items;
  }
}
