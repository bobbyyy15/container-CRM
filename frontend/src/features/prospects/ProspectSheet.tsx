import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import RecordDetailModal from '../../components/ui/RecordDetailModal'
import type { Screen, BadgeStatus } from '../../app/types'
import AssignPicModal from '../../components/ui/AssignPicModal'
const ProspectImportDialog = lazy(() => import('../import/ProspectImportDialog'))
import { NewWarmLeadDialog, NewProspectDialog, NewInquiryDialog, usePics, type WarmLeadOption } from '../pipeline/PipelineDialogs'
import { mapPipelineRow } from '../../hooks/mapPipelineRow'
import { useProspects } from '../../hooks/useProspects'
import { useWarmLeads } from '../../hooks/useWarmLeads'
import { exportToCSV, readDensity, writeDensity } from '../../lib/exporters'
import type { DensityOption } from '../../app/types'

const ProspectSheet = ({ mode = 'prospect', onNav }: { mode?: 'prospect' | 'warm'; onNav?: (s: Screen) => void }) => {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [status, setStatus] = useState<'active' | 'converted' | 'removed' | 'all'>('active')
  const [missingContactOnly, setMissingContactOnly] = useState(false)
  const [tab, setTab] = useState('Standard View')

  const [revision, setRevision] = useState(0)
  const [importMode, setImportMode] = useState<'file' | 'paste' | null>(null)
  const [showNewWarmLead, setShowNewWarmLead] = useState(false)
  const [showNewProspect, setShowNewProspect] = useState(false)
  const [inquiryWarmLeadId, setInquiryWarmLeadId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; colField: string; colLabel: string } | null>(null);
  const [showAssignPic, setShowAssignPic] = useState(false)
  const pics = usePics()
  const [localOverrides, setLocalOverrides] = useState<Record<string, Record<string, any>>>({})
  const [editingCell, setEditingCell] = useState<{
    r: number
    c: number
    rowId: string
    field: string
    value: string
    originalValue: string
  } | null>(null)

  const _prospectsData = useProspects(revision, mode === 'prospect' ? status : 'active', mode === 'prospect')
  const _warmData = useWarmLeads(revision, mode === 'warm')
  const prospectsData = mode === 'warm' ? _warmData : _prospectsData

  const commitCellEdit = async (rowId: string, field: string, newValue: string, oldValue: string) => {
    setEditingCell(null)
    if (newValue === oldValue) return
    setLocalOverrides(previous => ({
      ...previous,
      [rowId]: { ...(previous[rowId] || {}), [field]: newValue },
    }))
    try {
      await api.patch(`/leads/${mode === 'prospect' ? 'prospect' : 'warm_lead'}/${rowId}/cell`, {
        field,
        value: newValue,
      })
      toast('Saved', 'success')
    } catch (error: any) {
      toast(error.response?.data?.error?.message ?? 'Failed to update cell', 'error')
      setLocalOverrides(previous => {
        const next = { ...previous }
        if (next[rowId]) {
          const rowOverrides = { ...next[rowId] }
          delete rowOverrides[field]
          if (Object.keys(rowOverrides).length) next[rowId] = rowOverrides
          else delete next[rowId]
        }
        return next
      })
      setRevision(value => value + 1)
    }
  }

  const handleConvert = async (id: string) => {
    try {
      await api.post(`/leads/prospects/${id}/convert-to-warm-lead`);
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Conversion failed.', 'error')
    }
  }

  const handleRemove = async (id: string) => {
    const { confirmed, reason } = await askReason({
      title: 'Remove from active lists',
      message: 'Why should this contact be removed from active CRM lists?',
      confirmLabel: 'Remove',
    })
    if (!confirmed || !reason) return
    try {
      await api.post(`/leads/${mode === 'prospect' ? 'prospect' : 'warm_lead'}/${id}/remove`, { reason })
      setSelected(current => current.filter(value => value !== id))
      setRevision(value => value + 1)
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Removal failed.', 'error')
    }
  }

  const handleAssignPic = async (picId: string) => {
    const stage = mode === 'prospect' ? 'prospect' : 'warm_lead'
    const results = await Promise.allSettled(
      selected.map(id => api.patch(`/leads/${stage}/${id}/pic`, { picId }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setShowAssignPic(false)
    setSelected([])
    setRevision(value => value + 1)
    if (failed > 0) toast(`${failed} of ${selected.length} records could not be reassigned.`, 'error')
  }

  const label = mode === 'prospect' ? 'Prospect Clients' : 'Warm Leads'
  const desc = mode === 'prospect'
    ? 'Companies identified for outreach who have not yet replied or requested pricing.'
    : 'Prospects who replied, showed interest, or requested a quotation.'

  const countries = [...new Set(prospectsData.map(r => r.country).filter(Boolean))].sort() as string[]
  const industries = [...new Set(prospectsData.map(r => r.industry).filter(Boolean))].sort() as string[]
  const filtered = prospectsData.filter(r => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [r.company, r.city, r.contact, r.emailAddr, r.phone]
      .some(value => String(value || '').toLowerCase().includes(term))
    return matchesSearch
      && (!category || r.cat === category)
      && (!country || r.country === country)
      && (!industry || r.industry === industry)
      && (!missingContactOnly || r.contactMissing)
  })

  const proceed = filtered.filter(r => r.cat === 'Proceed').length
  const callElig = filtered.filter(r => r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Calls Only')).length
  const textElig = filtered.filter(r => r.cat === 'Proceed' && (r.sms === 'Call/Text' || r.sms === 'Text Only')).length
  const emailElig = filtered.filter(r => r.cat === 'Proceed' && r.emailAddr).length
  const missingContact = prospectsData.filter(r => r.contactMissing).length

  const COLS = [
    { key: 'A', label: 'Date Added', field: 'added', w: 108 },
    { key: 'B', label: 'PIC', field: 'pic', w: 70 },
    ...(mode === 'warm' ? [{ key: 'B2', label: 'Entry Path', field: 'entryPath', w: 112 }] : []),
    { key: 'C', label: 'Category', field: 'cat', w: 90, badge: true },
    { key: 'D', label: 'SMS Deliv.', field: 'sms', w: 100, badge: true },
    { key: 'E', label: 'Email Deliv.', field: 'email', w: 148, badge: true },
    { key: 'F', label: 'Industry', field: 'industry', w: 110 },
    { key: 'G', label: 'Territory', field: 'territory', w: 110 },
    { key: 'H', label: 'Country', field: 'country', w: 120 },
    { key: 'I', label: 'State/Province', field: 'state', w: 120 },
    { key: 'J', label: 'City', field: 'city', w: 108 },
    { key: 'K', label: 'Company Name', field: 'company', w: 210 },
    { key: 'L', label: 'Contact Person', field: 'contact', w: 140 },
    { key: 'M', label: 'Direct Line', field: 'phone', w: 148, mono: true },
    { key: 'N', label: 'Phone 2', field: 'phone2', w: 140, mono: true },
    { key: 'O', label: 'Email — Active', field: 'emailAddr', w: 200, mono: true },
    { key: 'P', label: 'Email 2', field: 'email2', w: 180, mono: true },
    { key: 'Q', label: 'Address', field: 'address', w: 260 },
  ]

  const getVal = (row: ReturnType<typeof mapPipelineRow>, field: string): string => {
    if (localOverrides[row.id]?.[field] !== undefined) return localOverrides[row.id][field]
    return (row as any)[field] || ''
  }

  const isFieldEditable = (field: string) =>
    !['added', 'entryPath'].includes(field)
    && (mode === 'prospect' || !['cat', 'sms', 'email', 'territory'].includes(field))

  // Each tab is a real column subset of COLS rather than a decorative label --
  // null means "show everything."
  const VIEW_FIELDS: Record<string, string[] | null> = {
    'Standard View':  null,
    'Address Prep':   ['company', 'contact', 'country', 'state', 'city', 'address', 'phone'],
    'Compact Outreach': ['company', 'contact', 'pic', 'cat', 'phone', 'emailAddr'],
  }
  const visibleCols = VIEW_FIELDS[tab] ? COLS.filter(c => VIEW_FIELDS[tab]!.includes(c.field)) : COLS

  // Row density is a personal preference, so it outlives the component. Shared by
  // the Prospect and Warm Lead views, which are the same sheet in two modes.
  const [density, setDensityState] = useState<DensityOption>(() => readDensity())
  const setDensity = (value: DensityOption) => {
    writeDensity(value)
    setDensityState(value)
  }
  const rowHeight = density === 'Compact' ? 30 : density === 'Comfortable' ? 46 : 38

  // ── Spreadsheet-style cell selection ───────────────────────────────────────
  // Clicking a row used to select the whole record, and dragging just ran the
  // browser's native text selection across the entire table. This mirrors a
  // spreadsheet instead: click a cell, drag or shift-click to extend a range, and
  // Ctrl/Cmd+C copies exactly that block as TSV so it pastes into Sheets/Excel
  // with its rows and columns intact. Row selection now lives on the checkbox.
  type CellRef = { r: number; c: number }
  const [anchor, setAnchor] = useState<CellRef | null>(null)
  const [focusCell, setFocusCell] = useState<CellRef | null>(null)
  const draggingRef = useRef(false)

  const bounds = anchor && focusCell
    ? {
        r1: Math.min(anchor.r, focusCell.r), r2: Math.max(anchor.r, focusCell.r),
        c1: Math.min(anchor.c, focusCell.c), c2: Math.max(anchor.c, focusCell.c),
      }
    : null

  const inSelection = (r: number, c: number) =>
    !!bounds && r >= bounds.r1 && r <= bounds.r2 && c >= bounds.c1 && c <= bounds.c2

  const beginSelect = (r: number, c: number, extend: boolean) => {
    draggingRef.current = true
    if (extend && anchor) setFocusCell({ r, c })
    else { setAnchor({ r, c }); setFocusCell({ r, c }) }
  }

  useEffect(() => {
    const stop = () => { draggingRef.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  useEffect(() => {
    if (!bounds || editingCell) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      if (event.key === 'Enter' || event.key === 'F2') {
        if (bounds.r1 === bounds.r2 && bounds.c1 === bounds.c2) {
          const row = filtered[bounds.r1]
          const col = visibleCols[bounds.c1]
          if (row && col && isFieldEditable(col.field)) {
            event.preventDefault()
            const value = getVal(row, col.field)
            setEditingCell({ r: bounds.r1, c: bounds.c1, rowId: row.id, field: col.field, value: String(value || ''), originalValue: String(value || '') })
          }
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        const row = Math.min(filtered.length - 1, bounds.r2 + 1)
        setAnchor({ r: row, c: bounds.c1 }); setFocusCell({ r: row, c: bounds.c1 })
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        const row = Math.max(0, bounds.r1 - 1)
        setAnchor({ r: row, c: bounds.c1 }); setFocusCell({ r: row, c: bounds.c1 })
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        const column = Math.min(visibleCols.length - 1, bounds.c2 + 1)
        setAnchor({ r: bounds.r1, c: column }); setFocusCell({ r: bounds.r1, c: column })
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const column = Math.max(0, bounds.c1 - 1)
        setAnchor({ r: bounds.r1, c: column }); setFocusCell({ r: bounds.r1, c: column })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [bounds, editingCell, filtered, visibleCols, localOverrides])

  // Ctrl/Cmd+C over the grid copies the selected block, not the whole page.
  useEffect(() => {
    if (!bounds) return
    const onCopy = (event: KeyboardEvent) => {
      if (!(event.key === 'c' && (event.ctrlKey || event.metaKey))) return
      const target = event.target as HTMLElement | null
      // Don't hijack copying out of an input the user is editing.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      const rows = filtered.slice(bounds.r1, bounds.r2 + 1)
      const cols = visibleCols.slice(bounds.c1, bounds.c2 + 1)
      const tsv = rows.map(row => cols.map(col => getVal(row, col.field)).join('\t')).join('\n')
      if (!tsv) return
      event.preventDefault()
      navigator.clipboard.writeText(tsv).then(() => {
        const cellCount = rows.length * cols.length
        toast(`Copied ${cellCount} cell${cellCount === 1 ? '' : 's'}.`, 'success')
      }).catch(() => toast('Could not copy to the clipboard.', 'error'))
    }
    window.addEventListener('keydown', onCopy)
    return () => window.removeEventListener('keydown', onCopy)
  }, [bounds, filtered, visibleCols, localOverrides])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">{label}</div>
          <div className="page-desc">{desc}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mode === 'prospect' && <Btn variant="primary" sm onClick={() => setImportMode('file')}><Ic n={I.upload} size={13} /> Import Excel</Btn>}
          {mode === 'prospect' && <Btn variant="secondary" sm onClick={() => setShowNewProspect(true)}><Ic n={I.plus} size={13} /> New Prospect</Btn>}
          {mode === 'warm' && <Btn variant="primary" sm onClick={() => setShowNewWarmLead(true)}><Ic n={I.plus} size={13} /> New Warm Lead</Btn>}
          {mode === 'prospect' && <Btn variant="secondary" sm onClick={() => setImportMode('paste')}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>}
          <ExportMenu data={filtered} filename="pipeline_data" />
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-s)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        {[
          { label: 'Total', val: filtered.length, color: 'var(--t3)' },
          { label: 'Proceed', val: proceed, color: 'var(--green)' },
          { label: 'Call Eligible', val: callElig, color: '#0D9488' },
          { label: 'Text Eligible', val: textElig, color: 'var(--purple)' },
          { label: 'Email Eligible', val: emailElig, color: 'var(--brand)' },
        ].map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 14, borderRight: '1px solid var(--border-s)' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>{s.val}</span>
            <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{s.label}</span>
          </div>
        ))}
        {mode === 'prospect' && missingContact > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMissingContactOnly(value => !value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999,
              background: missingContactOnly ? 'var(--amber-bg, #FEF3C7)' : 'transparent',
              border: '1px solid var(--amber, #D97706)', color: 'var(--amber, #D97706)',
            }}
            title="Companies imported without a named contact yet"
          >
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)' }}>{missingContact}</span>
            <span style={{ fontSize: 11.5 }}>Missing Contact{missingContactOnly ? ' — showing only these' : ''}</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-field">
          <Ic n={I.search} size={13} />
          <input placeholder={`Search ${label}…`} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="sel" value={category} onChange={e => setCategory(e.target.value)}><option value="">All Categories</option><option value="Proceed">Proceed</option></select>
        <select className="sel" value={country} onChange={e => setCountry(e.target.value)}><option value="">All Countries</option>{countries.map(value => <option key={value}>{value}</option>)}</select>
        <select className="sel" value={industry} onChange={e => setIndustry(e.target.value)}><option value="">All Industries</option>{industries.map(value => <option key={value}>{value}</option>)}</select>
        {mode === 'prospect' && (
          <select className="sel" value={status} onChange={e => setStatus(e.target.value as typeof status)}>
            <option value="active">Active Prospects</option>
            <option value="converted">Converted</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        )}

        {selected.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--brand-bg)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
            {selected.length} selected
            <Btn variant="ghost" sm onClick={() => setShowAssignPic(true)}>Assign PIC</Btn>
            {mode === 'prospect'
              ? <Btn variant="ghost" sm onClick={() => Promise.all(selected.map(handleConvert))}>→ Warm Lead</Btn>
              : <Btn variant="ghost" sm onClick={() => setInquiryWarmLeadId(selected[0])}>Create Inquiry</Btn>
            }
          </div>
        )}

        <div className="toolbar-right">
          <span className="count-label">{filtered.length} records</span>
          <Btn
            variant="ghost" sm
            onClick={() => {
              const withPhone = filtered.filter(r => r.phone)
              if (!withPhone.length) return toast('No phone numbers in the current view to copy.', 'error')
              navigator.clipboard.writeText(withPhone.map(r => r.phone).join('\n'))
              toast(`Copied ${withPhone.length} phone numbers for RingCentral.`, 'success')
            }}
          >
            <Ic n={I.phone} size={13} /> Copy for RingCentral
          </Btn>
        </div>
      </div>

      {/* Tabs -- each one shows a real subset of columns, see VIEW_FIELDS above */}
      <div className="tabs">
        {Object.keys(VIEW_FIELDS).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Spreadsheet table */}
      <div className="table-wrap">
        {contextMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'var(--ws)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160 }}>
              <div 
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 4, fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => {
                  const dataToCopy = filtered.map(r => getVal(r, contextMenu.colField)).filter(Boolean).join('\n');
                  navigator.clipboard.writeText(dataToCopy);
                  setContextMenu(null);
                  toast(`Copied ${filtered.map(r => getVal(r, contextMenu.colField)).filter(Boolean).length} ${contextMenu.colLabel}s to clipboard.`, 'success');
                }}
              >
                <Ic n={I.copy} size={14} style={{ color: 'var(--brand)' }} />
                Copy Column ({contextMenu.colLabel})
              </div>
            </div>
          </>
        )}
        <div style={{ minWidth: 'max-content' }}>
          {/* Column header row */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 5, background: 'var(--s2)', borderBottom: '2px solid var(--border)' }}>
            {/* Row num + checkbox */}
            <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', background: 'var(--s2)', position: 'sticky', left: 0, zIndex: 6 }}>
              <input type="checkbox" className="cb" onChange={e => setSelected(e.target.checked ? filtered.map(r => r.id) : [])} />
            </div>
            {visibleCols.map((col, ci) => (
              <div
                key={col.key}
                style={{
                  minWidth: col.w, width: col.w, padding: '7px 12px',
                  borderRight: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
                  display: 'flex', alignItems: 'center',
                  // Highlight the header when its whole column is the active selection.
                  background: bounds && bounds.c1 === ci && bounds.c2 === ci && bounds.r1 === 0 && bounds.r2 === filtered.length - 1
                    ? 'rgba(49,94,246,0.14)' : undefined,
                }}
                title={`Click to select all ${col.label} · Ctrl+C to copy`}
                // One click selects the entire column -- copying "all the numbers"
                // shouldn't mean dragging through every row.
                onClick={() => {
                  if (!filtered.length) return
                  setAnchor({ r: 0, c: ci })
                  setFocusCell({ r: filtered.length - 1, c: ci })
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, colField: col.field, colLabel: col.label });
                }}
              >
                <div>
                  <span className="col-header-letter">{col.key}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
                </div>
              </div>
            ))}
            <div style={{ minWidth: 160, width: 160, padding: '7px 12px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)' }}>ACTIONS</span>
            </div>
          </div>

          {/* Data rows */}
          {filtered.map((row, ri) => {
            const isRemoved = row.cat === 'Removed'
            const isSel = selected.includes(row.id)
            return (
              <div
                key={row.id}
                style={{ display: 'flex', background: isSel ? 'var(--brand-50)' : isRemoved ? 'var(--red-bg)' : ri % 2 === 1 ? 'var(--s2)' : 'var(--ws)', borderBottom: '1px solid var(--border-s)', transition: 'background 0.1s' }}
              >
                {/* Checkbox + row num */}
                <div style={{ width: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border-s)', background: 'var(--s2)', position: 'sticky', left: 0, zIndex: 1, gap: 4 }}>
                  <input
                    type="checkbox"
                    className="cb"
                    checked={isSel}
                    onChange={() => setSelected(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}
                    onClick={e => e.stopPropagation()}
                  />
                  {/* Row number selects the whole row's cells, mirroring the header
                      selecting a whole column. */}
                  <span
                    style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--mono)', cursor: 'pointer', userSelect: 'none' }}
                    title="Click to select this row · Ctrl+C to copy"
                    onClick={() => { setAnchor({ r: ri, c: 0 }); setFocusCell({ r: ri, c: visibleCols.length - 1 }) }}
                  >{ri + 1}</span>
                </div>
                {visibleCols.map((col, ci) => {
                  const val = getVal(row, col.field)
                  const picked = inSelection(ri, ci)
                  const isEditing = editingCell?.r === ri && editingCell.c === ci
                  const isEditable = isFieldEditable(col.field)
                  return (
                    <div
                      key={col.key}
                      onMouseDown={event => {
                        if (isEditing) return
                        event.preventDefault()
                        beginSelect(ri, ci, event.shiftKey)
                      }}
                      onMouseEnter={event => {
                        if (draggingRef.current && anchor && !isEditing) {
                          setFocusCell({ r: ri, c: event.shiftKey ? ci : anchor.c })
                        }
                      }}
                      onDoubleClick={event => {
                        event.stopPropagation()
                        if (!isEditable) return
                        setEditingCell({ r: ri, c: ci, rowId: row.id, field: col.field, value: String(val || ''), originalValue: String(val || '') })
                      }}
                      title={isEditable ? 'Double-click or press Enter to edit' : undefined}
                      style={{
                        minWidth: col.w, width: col.w, padding: isEditing ? 0 : '0 12px', height: rowHeight,
                        display: 'flex', alignItems: 'center', overflow: isEditing ? 'visible' : 'hidden',
                        cursor: isEditing ? 'text' : isEditable ? 'cell' : 'default', userSelect: isEditing ? 'auto' : 'none',
                        position: 'relative',
                        background: picked ? 'rgba(49,94,246,0.14)' : undefined,
                        // Outline the block edges so a range reads as one selection.
                        borderRight: picked && bounds && ci === bounds.c2 ? '1px solid var(--brand)' : '1px solid var(--border-s)',
                        borderLeft: picked && bounds && ci === bounds.c1 ? '1px solid var(--brand)' : undefined,
                        borderTop: picked && bounds && ri === bounds.r1 ? '1px solid var(--brand)' : undefined,
                        borderBottom: picked && bounds && ri === bounds.r2 ? '1px solid var(--brand)' : undefined,
                      }}
                    >
                      {isEditing ? (
                        <div
                          style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--ws, #ffffff)', display: 'flex', alignItems: 'center', boxShadow: '0 0 0 2px var(--brand, #315EF6)' }}
                          onClick={event => event.stopPropagation()}
                          onMouseDown={event => event.stopPropagation()}
                        >
                          {col.field === 'cat' ? (
                            <select
                              autoFocus className="inp" value={editingCell.value}
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 6px', fontSize: 12, background: 'transparent' }}
                              onChange={event => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={() => commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)}
                              onKeyDown={event => { if (event.key === 'Enter') commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue); if (event.key === 'Escape') setEditingCell(null) }}
                            >
                              <option value="Proceed">Proceed</option><option value="Removed">Removed</option>
                            </select>
                          ) : col.field === 'sms' ? (
                            <select
                              autoFocus className="inp" value={editingCell.value}
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 6px', fontSize: 12, background: 'transparent' }}
                              onChange={event => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={() => commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)}
                              onKeyDown={event => { if (event.key === 'Enter') commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue); if (event.key === 'Escape') setEditingCell(null) }}
                            >
                              <option value="">—</option><option value="Call/Text">Call/Text</option><option value="Calls Only">Calls Only</option><option value="Text Only">Text Only</option>
                            </select>
                          ) : col.field === 'email' ? (
                            <select
                              autoFocus className="inp" value={editingCell.value}
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 6px', fontSize: 12, background: 'transparent' }}
                              onChange={event => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={() => commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)}
                              onKeyDown={event => { if (event.key === 'Enter') commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue); if (event.key === 'Escape') setEditingCell(null) }}
                            >
                              {['Available', 'Unavailable', 'Mail Delivery Report', 'Bounced', 'Hard Bounce', 'Soft Bounce', 'Unsubscribed', 'Spam Complaint'].map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                          ) : col.field === 'pic' ? (
                            <select
                              autoFocus className="inp" value={editingCell.value}
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 6px', fontSize: 12, background: 'transparent' }}
                              onChange={event => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={() => commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)}
                              onKeyDown={event => { if (event.key === 'Enter') commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue); if (event.key === 'Escape') setEditingCell(null) }}
                            >
                              <option value="">Unassigned</option>
                              {pics.map(pic => <option key={pic.id} value={pic.name}>{pic.name}</option>)}
                            </select>
                          ) : (
                            <input
                              autoFocus className="inp" value={editingCell.value}
                              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 8px', fontSize: 12.5, background: 'transparent' }}
                              onChange={event => setEditingCell({ ...editingCell, value: event.target.value })}
                              onFocus={event => event.target.select()}
                              onBlur={() => commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)
                                  if (ri < filtered.length - 1) { setAnchor({ r: ri + 1, c: ci }); setFocusCell({ r: ri + 1, c: ci }) }
                                } else if (event.key === 'Tab') {
                                  event.preventDefault()
                                  commitCellEdit(row.id, col.field, editingCell.value, editingCell.originalValue)
                                  const nextColumnIndex = event.shiftKey ? Math.max(0, ci - 1) : Math.min(visibleCols.length - 1, ci + 1)
                                  setAnchor({ r: ri, c: nextColumnIndex }); setFocusCell({ r: ri, c: nextColumnIndex })
                                  const nextColumn = visibleCols[nextColumnIndex]
                                  if (nextColumn && isFieldEditable(nextColumn.field)) {
                                    const nextValue = String(getVal(row, nextColumn.field) || '')
                                    setEditingCell({ r: ri, c: nextColumnIndex, rowId: row.id, field: nextColumn.field, value: nextValue, originalValue: nextValue })
                                  }
                                } else if (event.key === 'Escape') setEditingCell(null)
                              }}
                            />
                          )}
                        </div>
                      ) : col.field === 'contact' && row.contactMissing ? (
                        <span style={{ fontSize: 11.5, color: 'var(--amber, #D97706)', fontStyle: 'italic' }}>No contact yet</span>
                      ) : col.badge && val ? (
                        <Badge status={val as BadgeStatus} />
                      ) : col.mono ? (
                        <span className="mono truncate" style={{ fontSize: 12, color: col.field === 'emailAddr' ? 'var(--brand)' : 'var(--t2)' }}>{val || <span style={{ color: 'var(--border)' }}>—</span>}</span>
                      ) : (
                        <span className="truncate" style={{ fontSize: 12.5, color: col.field === 'company' ? 'var(--t1)' : col.field === 'pic' ? 'var(--brand)' : 'var(--t2)', fontWeight: col.field === 'company' ? 600 : col.field === 'pic' ? 700 : 400 }}>
                          {val || <span style={{ color: 'var(--border)' }}>—</span>}
                        </span>
                      )}
                    </div>
                  )
                })}
                <div style={{ minWidth: 160, width: 160, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {mode === 'prospect'
                    ? <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={(e) => { e.stopPropagation(); handleConvert(row.id); }}>→ Warm</Btn>
                    : <Btn variant="ghost" sm style={{ color: 'var(--brand)' }} onClick={(e) => { e.stopPropagation(); setInquiryWarmLeadId(row.id); }}>Inquiry</Btn>
                  }
                  <Btn variant="ghost" sm style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); handleRemove(row.id); }}>Remove</Btn>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '7px 20px', background: 'var(--s2)', borderTop: '1px solid var(--border-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--t4)', flexShrink: 0 }}>
        <span>
          Showing {filtered.length} of {prospectsData.length} active records
          {bounds && (
            <span style={{ marginLeft: 10, color: 'var(--brand)', fontWeight: 600 }}>
              · {bounds.r2 - bounds.r1 + 1} × {bounds.c2 - bounds.c1 + 1} selected — Ctrl+C to copy
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['Compact', 'Standard', 'Comfortable'] as const).map(d => (
            <button
              key={d} className="btn btn-ghost btn-xs"
              style={{ fontWeight: density === d ? 600 : 400, color: density === d ? 'var(--brand)' : undefined }}
              onClick={() => setDensity(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      {importMode && (
        <Suspense fallback={null}>
        <ProspectImportDialog
          key={importMode}
          open
          initialMode={importMode}
          onClose={() => setImportMode(null)}
          onImported={() => setRevision(value => value + 1)}
        />
        </Suspense>
      )}
      {showNewWarmLead && (
        <NewWarmLeadDialog
          onClose={() => setShowNewWarmLead(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {showNewProspect && (
        <NewProspectDialog
          onClose={() => setShowNewProspect(false)}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {inquiryWarmLeadId && (
        <NewInquiryDialog
          warmLeads={prospectsData as WarmLeadOption[]}
          initialId={inquiryWarmLeadId}
          onClose={() => setInquiryWarmLeadId(null)}
          onSaved={() => { setSelected([]); setRevision(value => value + 1) }}
        />
      )}
      {showAssignPic && (
        <AssignPicModal
          count={selected.length}
          onClose={() => setShowAssignPic(false)}
          onAssign={handleAssignPic}
        />
      )}
    </div>
  )
}


export default ProspectSheet
