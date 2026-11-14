// supabase/functions/_shared/paged.ts
// PostgREST returns at most 1000 rows per request (a bigger .limit() is silently cut): read in pages.
export const PAGE = 1000;

// build(from, to) -> a query with .range(from, to); newest first is the caller's order. null on a read error.
export async function readPaged(build: (from: number, to: number) => any, max: number): Promise<any[] | null> {
  const out: any[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build(from, Math.min(from + PAGE, max) - 1);
    if (error) return null;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
