import { api } from './api'

/** Rows per request while walking a list endpoint. */
export const PAGE_SIZE = 1000

/**
 * Reads an entire list endpoint, page by page, instead of showing whatever fitted in the
 * first response.
 *
 * The lists used to ask for 500 rows and stop, so a pipeline of 17,000 prospects showed 500
 * of them with nothing to say the rest existed. Paging continues while the server reports a
 * full page of rows read from the database -- `meta.fetched`, counted before its
 * suppression and downstream filters run, since the filtered length is smaller and would
 * end the walk early.
 *
 * `onPage` reports progress so a screen can show rows as they arrive rather than waiting
 * for the last page.
 */
export const fetchAllPages = async (
  path: string,
  params: Record<string, unknown> = {},
  onPage?: (rowsSoFar: unknown[]) => void,
): Promise<unknown[]> => {
  const all: unknown[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await api.get(path, { params: { ...params, limit: PAGE_SIZE, offset } })
    const rows = response.data?.data ?? []
    all.push(...rows)
    onPage?.(all)
    const fetched = response.data?.meta?.fetched ?? rows.length
    if (fetched < PAGE_SIZE) return all
    // A safety stop: something is wrong if a list never reports a short page.
    if (offset > 500_000) return all
  }
}
