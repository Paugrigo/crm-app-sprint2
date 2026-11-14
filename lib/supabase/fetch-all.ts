// Reading every row of a query, page by page. The API returns at most `max_rows` rows per request
// (1000 on Supabase; supabase/config.toml) and silently drops the rest, so a plain select of a
// table that can grow past that loses rows without an error.

import type { PostgrestError } from "@supabase/supabase-js";

/** Rows asked for per request. The server may return fewer (its max_rows); that's handled. */
const PAGE_SIZE = 1000;

/**
 * Every row of a query. `page(from, to)` must run the query with `.range(from, to)` and an
 * order that is unique per row (end it with the primary key), so pages neither overlap nor skip
 * rows. Keeps reading until a page comes back empty: a short page doesn't prove it was the last,
 * since the server's own row limit may be lower than PAGE_SIZE. Throws if a request fails.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
