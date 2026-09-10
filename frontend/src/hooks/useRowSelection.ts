import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Checkbox selection for a filtered table, shared by every grid with bulk actions.
 *
 * Selection is kept as ids rather than rows, and pruned against the rows currently
 * in view whenever the filters change: a selection that survived a filter change
 * would otherwise delete records the user can no longer see.
 */
export const useRowSelection = (visibleIds: string[]) => {
  const [selected, setSelected] = useState<string[]>([])
  const selectAllRef = useRef<HTMLInputElement>(null)

  const key = visibleIds.join(',')
  useEffect(() => {
    const inView = new Set(visibleIds)
    setSelected(current => {
      const kept = current.filter(id => inView.has(id))
      return kept.length === current.length ? current : kept
    })
    // Re-run on the set of visible ids, not the array identity, which changes on
    // every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const allSelected = visibleIds.length > 0 && selected.length === visibleIds.length
  const someSelected = selected.length > 0 && !allSelected

  // The tri-state "some selected" look has no HTML attribute; it is a DOM property.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  return {
    selected,
    setSelected,
    selectAllRef,
    allSelected,
    someSelected,
    isSelected: (id: string) => selectedSet.has(id),
    toggle: (id: string) =>
      setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]),
    toggleAll: (checked: boolean) => setSelected(checked ? [...visibleIds] : []),
    clear: () => setSelected([]),
    /** Drop the ids a bulk action has just consumed. */
    remove: (ids: string[]) => {
      const done = new Set(ids)
      setSelected(current => current.filter(id => !done.has(id)))
    },
  }
}
