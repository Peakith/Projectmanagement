import type { PostgrestError } from "@supabase/supabase-js";

type Page = PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>;

/** Haalt alle rijen op in pagina's van 1000 (PostgREST max_rows). */
export async function fetchAll<T>(build: (from: number, to: number) => Page, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return out;
  }
}
