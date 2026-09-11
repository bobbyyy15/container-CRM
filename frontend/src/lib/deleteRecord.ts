import { api } from './api'
import { toast, askConfirm } from './notify'
import { invalidateCache } from './dataCache'

/**
 * Confirm-then-delete, shared by every grid that offers a Delete action.
 *
 * Deleting is not the same as the Removed Sheet: removing files a record as
 * opted-out and can be restored, whereas this destroys the row. The confirm text
 * says so, because the two actions sit next to each other in most toolbars.
 *
 * The backend refuses to delete anything still linked downstream (a Prospect that
 * became a Warm Lead, a Sale that became a Contract) and answers 409 with a
 * sentence naming the blocker, which is surfaced verbatim.
 */
export const confirmDelete = async ({
  what,
  name,
  endpoint,
  cacheKey,
  detail,
  onDeleted,
}: {
  /** Record type as the user sees it, e.g. 'Prospect', 'Quotation'. */
  what: string
  /** Identifies the specific row -- company name, reference number. */
  name: string
  /** API path to DELETE. */
  endpoint: string
  /** dataCache prefix to drop so the grid does not re-render the deleted row. */
  cacheKey?: string
  /** Extra consequence worth spelling out before the user commits. */
  detail?: string
  onDeleted: () => void
}): Promise<boolean> => {
  const { confirmed } = await askConfirm({
    title: `Delete ${what}?`,
    message:
      `${name} will be permanently deleted.${detail ? ` ${detail}` : ''} ` +
      'This cannot be undone, and unlike removing a record it leaves nothing on the Removed Sheet.',
    danger: true,
    confirmLabel: `Delete ${what}`,
  })
  if (!confirmed) return false

  try {
    const res = await api.delete(endpoint)
    if (cacheKey) invalidateCache(cacheKey)
    toast(res.data?.message || `${what} deleted.`, 'success')
    onDeleted()
    return true
  } catch (e: any) {
    toast(e?.response?.data?.error?.message || `Failed to delete ${what.toLowerCase()}.`, 'error')
    return false
  }
}

/**
 * Delete every selected row, shared by the grids that offer checkbox selection.
 *
 * `bulkEndpoint` takes a whole batch of ids in one request and is what the pipeline
 * stages use: deleting one record at a time meant four queries and a round trip each, so
 * a selection of thousands ran for over half an hour. Screens whose API only exposes a
 * per-record delete still pass `endpoint` and fan out over it, five at a time.
 *
 * A selection normally mixes deletable rows with ones the backend protects (a Prospect
 * that became a Warm Lead, a Quotation that became a Sale). Those are counted and
 * reported rather than aborting the run.
 */
export const confirmBulkDelete = async ({
  what,
  ids,
  endpoint,
  bulkEndpoint,
  bulkChunkSize = 1000,
  onProgress,
  cacheKey,
  detail,
  onDeleted,
}: {
  /** Record type as the user sees it, lowercase, e.g. 'prospect', 'quotation'. */
  what: string
  ids: string[]
  /** API path to DELETE for one id. Used when there is no bulk endpoint. */
  endpoint?: (id: string) => string
  /** Path that accepts { ids } and deletes them in one request. Preferred when present. */
  bulkEndpoint?: string
  /** Ids per bulk request; the API refuses more than 5000. */
  bulkChunkSize?: number
  /** Told how far along a long delete is, so the caller can show progress. */
  onProgress?: (done: number, total: number) => void
  cacheKey?: string
  /** Extra consequence worth spelling out before the user commits. */
  detail?: string
  /** Given the ids actually deleted, refresh the grid. */
  onDeleted: (deletedIds: string[]) => void
}): Promise<string[]> => {
  if (!ids.length) return []
  const plural = `${what}${ids.length === 1 ? '' : 's'}`

  const { confirmed } = await askConfirm({
    title: `Permanently delete ${ids.length} selected ${plural}?`,
    message: `This cannot be undone${detail ? `. ${detail}` : ', and unlike removing a record it leaves nothing on the Removed Sheet'}. `
      + 'Records linked to a later pipeline stage are protected and will not be deleted.',
    danger: true,
    confirmLabel: `Delete ${ids.length}`,
  })
  if (!confirmed) return []

  const deletedIds: string[] = []
  const failures: string[] = []

  if (bulkEndpoint) {
    let deleted = 0
    let blocked = 0
    let notOwned = 0
    for (let index = 0; index < ids.length; index += bulkChunkSize) {
      const chunk = ids.slice(index, index + bulkChunkSize)
      onProgress?.(index, ids.length)
      try {
        const res = await api.post(bulkEndpoint, { ids: chunk })
        deleted += res.data?.deleted ?? 0
        blocked += res.data?.blocked ?? 0
        notOwned += res.data?.notOwned ?? 0
        // The database reports counts, not which ids survived. A chunk that deleted
        // everything it was given is clear; anything protected stays selected so the
        // rows still on screen match the selection.
        if ((res.data?.deleted ?? 0) === chunk.length) deletedIds.push(...chunk)
      } catch (e: any) {
        failures.push(e?.response?.data?.error?.message ?? e?.message ?? 'Delete failed.')
      }
    }
    onProgress?.(ids.length, ids.length)
    if (deleted && cacheKey) invalidateCache(cacheKey)
    onDeleted(deletedIds)

    const notes = [`${deleted} ${what}${deleted === 1 ? '' : 's'} permanently deleted`]
    if (blocked) notes.push(`${blocked} protected by a later stage`)
    if (notOwned) notes.push(`${notOwned} not yours to delete`)
    if (failures.length) notes.push(failures[0])
    toast(notes.join(' · '), blocked || notOwned || failures.length ? 'error' : 'success')
    return deletedIds
  }

  for (let index = 0; index < ids.length; index += 5) {
    const batch = ids.slice(index, index + 5)
    const results = await Promise.all(batch.map(async id => {
      try {
        await api.delete(endpoint!(id))
        return { id, deleted: true as const }
      } catch (e: any) {
        return {
          id,
          deleted: false as const,
          message: e?.response?.data?.error?.message ?? e?.message ?? 'Delete failed.',
        }
      }
    }))
    results.forEach(result => {
      if (result.deleted) deletedIds.push(result.id)
      else failures.push(result.message)
    })
  }

  if (deletedIds.length && cacheKey) invalidateCache(cacheKey)
  onDeleted(deletedIds)

  if (failures.length) {
    toast(`${deletedIds.length} deleted; ${failures.length} protected or failed. ${failures[0]}`, 'error')
  } else {
    toast(`${deletedIds.length} ${what}${deletedIds.length === 1 ? '' : 's'} permanently deleted.`, 'success')
  }
  return deletedIds
}
