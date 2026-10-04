import { describe, it, expect } from 'vitest';
import { fetchAllPages } from './paginate';

/** Builds a fake paged endpoint over `total` rows; the page size comes from the requested range. */
function pager(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => ({ id: `row-${from + i}` }),
    );
    return { rows, error: null };
  };
  return { fetchPage, calls };
}

describe('fetchAllPages', () => {
  it('makes one request when the first page is short', async () => {
    const { fetchPage, calls } = pager(3);
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(3);
    expect(calls).toEqual([[0, 9]]);
  });

  it('returns an empty result without looping', async () => {
    const { fetchPage, calls } = pager(0);
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.rows).toEqual([]);
    expect(calls).toEqual([[0, 9]]);
  });

  it('keeps paging past the server cap until a short page arrives', async () => {
    const { fetchPage, calls } = pager(25);
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.rows).toHaveLength(25);
    expect(calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });

  it('issues one extra request when the total is an exact multiple of the page size', async () => {
    // 20 rows at page size 10: the second page is full, so the loop cannot
    // know it is done until a third, empty page comes back.
    const { fetchPage, calls } = pager(20);
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.rows).toHaveLength(20);
    expect(calls).toEqual([[0, 9], [10, 19], [20, 29]]);
  });

  it('preserves order across page boundaries', async () => {
    const { fetchPage } = pager(25);
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.rows.map((x) => (x as { id: string }).id)).toEqual(
      Array.from({ length: 25 }, (_, i) => `row-${i}`),
    );
  });

  it('propagates an error from the first page and returns no rows', async () => {
    const fetchPage = async () => ({ rows: [], error: new Error('offline') });
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.error?.message).toBe('offline');
    expect(r.rows).toEqual([]);
  });

  it('propagates an error from a later page rather than returning a partial result', async () => {
    let call = 0;
    const fetchPage = async () => {
      call++;
      if (call === 1) {
        return { rows: Array.from({ length: 10 }, (_, i) => ({ id: `a${i}` })), error: null };
      }
      return { rows: [], error: new Error('dropped mid-pull') };
    };
    const r = await fetchAllPages(fetchPage, 10);
    expect(r.error?.message).toBe('dropped mid-pull');
    // A partial result must not be reported as success — pullTable would
    // advance the watermark past rows it never received.
    expect(r.rows).toEqual([]);
  });
});
