/**
 * Supabase caps a single API response at 1000 rows by default. A pull that
 * ignores the cap gets a silent truncation: pullTable applies what arrived,
 * advances the watermark past it and reports success, so the UI shows
 * "Synced" over an incomplete database.
 */
export const PULL_PAGE_SIZE = 1000;

export interface Page<T> {
  rows: T[];
  error: Error | null;
}

/**
 * Requests successive ranges until a short page arrives.
 *
 * An error anywhere discards everything fetched so far and surfaces the
 * failure. Returning a partial result would be worse than failing: the caller
 * cannot tell it apart from a complete one and would advance its watermark
 * past rows it never received.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize: number = PULL_PAGE_SIZE,
): Promise<Page<T>> {
  const all: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { rows, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows: [], error };

    all.push(...rows);
    if (rows.length < pageSize) return { rows: all, error: null };
  }
}
