import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { useInventory, useInventorySummary } from '../../hooks/useInventory'
import { useCatalogList } from '../../hooks/useCatalogList'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'In Stock':     { bg: '#D1FAE5', color: '#065F46' },
  'Low Stock':    { bg: '#FEF3C7', color: '#92400E' },
  'Out of Stock': { bg: '#FEE2E2', color: '#991B1B' },
  'Reserved':     { bg: '#EDE9FE', color: '#4C1D95' },
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

// Shapes the report into the flat tables used by every export format, so the
// Excel workbook, the Google Sheet and the on-screen document never drift apart.

// ─── Admin pages ──────────────────────────────────────────────────────────────


const InventoryManagement = ({ role }: { role?: string }) => {
  const [search, setSearch]             = useState('')
  const [sizeFilter, setSizeFilter]     = useState('')
  const [condFilter, setCondFilter]     = useState('')
  const [depotFilter, setDepotFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [revision, setRevision]         = useState(0)
  const [showNew, setShowNew]           = useState(false)
  const [showPaste, setShowPaste]       = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [editRow, setEditRow]           = useState<any>(null)
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState('')

  const filters: Record<string, string> = {}
  if (search)       filters.search              = search
  if (sizeFilter)   filters.container_size      = sizeFilter
  if (condFilter)   filters.container_condition = condFilter
  if (depotFilter)  filters.depot_name          = depotFilter
  if (statusFilter) filters.status              = statusFilter

  const inventory = useInventory(filters, revision)
  const summary   = useInventorySummary(revision)
  const canWrite  = ['admin', 'procurement', 'operations'].includes(role ?? '')
  const refresh   = () => setRevision(r => r + 1)

  const sizes  = [...new Set(inventory.map((r: any) => r.container_size))].filter(Boolean).sort() as string[]
  const conds  = [...new Set(inventory.map((r: any) => r.container_condition))].filter(Boolean).sort() as string[]
  const depots = [...new Set(inventory.map((r: any) => r.depot_name))].filter(Boolean).sort() as string[]

  const handleStockDelta = async (id: string, field: 'available' | 'reserved', delta: number) => {
    try {
      await api.patch(`/inventory/${id}/stock`, {
        delta_available: field === 'available' ? delta : 0,
        delta_reserved:  field === 'reserved'  ? delta : 0,
      })
      refresh()
    } catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to adjust stock', 'error') }
  }

  const handleDelete = async (id: string) => {
    const { confirmed } = await askConfirm({
      title: 'Delete inventory record',
      message: 'Delete this inventory record? This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    try { await api.delete(`/inventory/${id}`); refresh() }
    catch (e: any) { toast(e?.response?.data?.error?.message || 'Failed to delete', 'error') }
  }

  // ── New / Edit form ──────────────────────────────────────────────────────
  const InventoryForm = ({ initial, onClose }: { initial?: any; onClose: () => void }) => {
    const isEdit = !!initial?.id
    const [form, setForm] = useState({
      container_size: initial?.container_size || '', container_condition: initial?.container_condition || '',
      container_category: initial?.container_category || 'Dry', vendor_supplier: initial?.vendor_supplier || '',
      depot_name: initial?.depot_name || '', city: initial?.city || '',
      state_province: initial?.state_province || '', country: initial?.country || 'USA',
      quantity_available: initial?.quantity_available ?? 0, quantity_reserved: initial?.quantity_reserved ?? 0,
      unit_cost: initial?.unit_cost ?? 0, target_sell_price: initial?.target_sell_price ?? 0, notes: initial?.notes || '',
    })
    const set = (k: string) => (e: React.ChangeEvent<any>) => setForm(f => ({ ...f, [k]: e.target.value }))
    // Reuse the same container_sizes/container_conditions/container_categories catalog that
    // Inquiries and Quotations already draw from -- the "Live Stock Check" widget on a ticket
    // matches by exact name against this catalog, so inventory has to speak the same
    // vocabulary or that lookup silently never finds a match.
    const SZ = useCatalogList('/catalog/sizes').map(s => s.name)
    const CD = useCatalogList('/catalog/conditions').map(c => c.name)
    const CT = useCatalogList('/catalog/categories').map(c => c.name)
    const handleSubmit = async () => {
      if (!form.container_size || !form.container_condition || !form.depot_name) { setFormError('Size, condition, and depot are required.'); return }
      setSaving(true); setFormError('')
      try {
        const payload = { ...form, quantity_available: Number(form.quantity_available), quantity_reserved: Number(form.quantity_reserved), unit_cost: Number(form.unit_cost), target_sell_price: Number(form.target_sell_price) }
        isEdit ? await api.patch(`/inventory/${initial.id}`, payload) : await api.post('/inventory', payload)
        refresh(); onClose()
      } catch (e: any) { setFormError(e?.response?.data?.error?.message || 'Failed to save') }
      finally { setSaving(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">{isEdit ? 'Edit Inventory Record' : 'Add Inventory'}</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {formError && <div style={{ gridColumn:'1/-1', color:'#DC2626', fontSize:12, padding:'8px 12px', background:'#FEF2F2', borderRadius:7 }}>{formError}</div>}
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Container Size *</label><select className="inp" value={form.container_size} onChange={set('container_size')}><option value="">— Select —</option>{SZ.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><label className="form-label">Condition *</label><select className="inp" value={form.container_condition} onChange={set('container_condition')}><option value="">— Select —</option>{CD.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label className="form-label">Category</label><select className="inp" value={form.container_category} onChange={set('container_category')}>{CT.map(c=><option key={c}>{c}</option>)}</select></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Depot / Yard Name *</label><input className="inp" placeholder="e.g. Long Beach Depot A" value={form.depot_name} onChange={set('depot_name')} /></div>
            <div><label className="form-label">Vendor / Supplier</label><input className="inp" placeholder="e.g. Maersk Surplus" value={form.vendor_supplier} onChange={set('vendor_supplier')} /></div>
            <div><label className="form-label">City</label><input className="inp" value={form.city} onChange={set('city')} /></div>
            <div><label className="form-label">State / Province</label><input className="inp" value={form.state_province} onChange={set('state_province')} /></div>
            <div><label className="form-label">Country</label><input className="inp" value={form.country} onChange={set('country')} /></div>
            <div><label className="form-label">Units Available</label><input className="inp" type="number" min={0} value={form.quantity_available} onChange={set('quantity_available')} /></div>
            <div><label className="form-label">Units Reserved</label><input className="inp" type="number" min={0} value={form.quantity_reserved} onChange={set('quantity_reserved')} /></div>
            <div><label className="form-label">Unit Cost ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.unit_cost} onChange={set('unit_cost')} /></div>
            <div><label className="form-label">Target Sell Price ($)</label><input className="inp" type="number" min={0} step="0.01" value={form.target_sell_price} onChange={set('target_sell_price')} /></div>
            <div style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="inp" rows={2} style={{ resize:'vertical' }} value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Inventory'}</button></div>
        </div>
      </div>
    )
  }

  // ── Paste Bulk Modal ─────────────────────────────────────────────────────
  const PasteBulkModal = ({ onClose }: { onClose: () => void }) => {
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMNS = ['container_size','container_condition','depot_name','vendor_supplier','city','state_province','country','quantity_available','unit_cost','target_sell_price']
    const parseText = (raw: string) => raw.trim().split('\n').filter(l=>l.trim()).map(line => {
      const cols = line.split('\t'); const row: any = {}
      COLUMNS.forEach((col, i) => { if (cols[i]) row[col] = cols[i].trim() }); return row
    })
    const rows = parseText(text)
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Paste Bulk from Excel</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)', marginBottom:4 }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626' }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <p style={{ fontSize:12.5, color:'var(--t3)', marginBottom:8 }}>Copy rows from Excel and paste below. Columns (tab-separated):</p>
                <div style={{ fontSize:10.5, fontFamily:'var(--mono)', background:'var(--s3)', padding:'6px 10px', borderRadius:6, marginBottom:12, color:'var(--t3)', wordBreak:'break-all' }}>
                  size | condition | depot | vendor | city | state | country | qty | cost | sell_price
                </div>
                <textarea className="inp" rows={8} style={{ fontFamily:'var(--mono)', fontSize:11, resize:'vertical' }} placeholder="Paste Excel rows here…" value={text} onChange={e => setText(e.target.value)} />
                {rows.length > 0 && <div style={{ fontSize:11, color:'var(--t4)', marginTop:6 }}>{rows.length} rows detected · Preview: {rows[0]?.container_size} | {rows[0]?.depot_name}</div>}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && <button className="btn btn-primary" disabled={!text.trim() || importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  // ── Excel Import Modal ───────────────────────────────────────────────────
  const ExcelImportModal = ({ onClose }: { onClose: () => void }) => {
    const [file, setFile] = useState<File | null>(null)
    const [rows, setRows] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<any>(null)
    const COLUMN_MAP: Record<string, string> = {
      'container size':'container_size','size':'container_size','condition':'container_condition','container condition':'container_condition',
      'depot':'depot_name','depot name':'depot_name','yard':'depot_name','vendor':'vendor_supplier','supplier':'vendor_supplier',
      'city':'city','state':'state_province','state/province':'state_province','country':'country',
      'quantity':'quantity_available','qty':'quantity_available','available':'quantity_available',
      'unit cost':'unit_cost','cost':'unit_cost','buying cost':'unit_cost','sell price':'target_sell_price','target price':'target_sell_price','notes':'notes',
    }
    const handleFile = async (f: File) => {
      setFile(f)
      const XLSX = await import('xlsx')
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type:'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval:'' })
      const mapped = raw.map(row => {
        const out: any = {}
        Object.entries(row).forEach(([k,v]) => { const mk = COLUMN_MAP[k.toLowerCase().trim()]; if (mk) out[mk] = String(v).trim() })
        return out
      }).filter(r => r.container_size || r.depot_name)
      setRows(mapped)
    }
    const handleImport = async () => {
      if (!rows.length) return; setImporting(true)
      try { const res = await api.post('/inventory/bulk', { rows }); setResult(res.data.data); refresh() }
      catch (e: any) { toast(e?.response?.data?.error?.message || 'Import failed', 'error') }
      finally { setImporting(false) }
    }
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ width: 600, maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header"><div className="modal-title">Import Excel / CSV</div><Btn variant="ghost" sm onClick={onClose} ariaLabel="Close"><Ic n={I.x} size={16} /></Btn></div>
          <div className="modal-body">
            {result ? (
              <div style={{ textAlign:'center', padding:24 }}>
                <div style={{ fontSize:32, fontWeight:800, color:'var(--green)', marginBottom:8 }}>{result.imported}</div>
                <div style={{ fontSize:14, color:'var(--t2)' }}>rows imported successfully</div>
                {result.errors > 0 && <div style={{ fontSize:12, color:'#DC2626', marginTop:4 }}>{result.errors} rows had errors and were skipped</div>}
              </div>
            ) : (
              <>
                <div style={{ border:'2px dashed var(--border)', borderRadius:10, padding:32, textAlign:'center', cursor:'pointer', marginBottom:16 }}
                  onClick={() => document.getElementById('inv-file-input')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
                  <Ic n={I.upload} size={24} style={{ color:'var(--t4)', marginBottom:8 }} />
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--t2)' }}>{file ? file.name : 'Drop .xlsx or .csv here, or click to browse'}</div>
                  <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>Columns are auto-detected from the header row</div>
                  <input id="inv-file-input" type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
                </div>
                {rows.length > 0 && (
                  <div style={{ fontSize:11, fontFamily:'var(--mono)', background:'var(--s3)', borderRadius:6, padding:8 }}>
                    <div style={{ fontWeight:600, color:'var(--t4)', marginBottom:4 }}>{rows.length} rows detected — preview:</div>
                    {rows.slice(0,3).map((row,i) => <div key={i} style={{ padding:'2px 0', borderBottom:'1px solid var(--border-s)' }}>{row.container_size} | {row.container_condition} | {row.depot_name} | Qty: {row.quantity_available||0}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
            {!result && rows.length > 0 && <button className="btn btn-primary" disabled={importing} onClick={handleImport}>{importing ? 'Importing…' : `Import ${rows.length} rows`}</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-scroll">
      {showNew    && <InventoryForm onClose={() => { setShowNew(false); setFormError('') }} />}
      {editRow    && <InventoryForm initial={editRow} onClose={() => { setEditRow(null); setFormError('') }} />}
      {showPaste  && <PasteBulkModal onClose={() => setShowPaste(false)} />}
      {showImport && <ExcelImportModal onClose={() => setShowImport(false)} />}

      <div className="page-header">
        <div>
          <div className="page-title">Inventory Management</div>
          <div className="page-desc">Track container stock across all depots and vendors.</div>
        </div>
        {canWrite && (
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="ghost" sm onClick={() => setShowImport(true)}><Ic n={I.upload} size={13} /> Import Excel</Btn>
            <Btn variant="secondary" sm onClick={() => setShowPaste(true)}><Ic n={I.copy} size={13} /> Paste Bulk</Btn>
            <Btn variant="primary" sm onClick={() => setShowNew(true)}><Ic n={I.plus} size={13} /> Add Inventory</Btn>
          </div>
        )}
      </div>

      <div style={{ padding:'0 24px 16px', display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12 }}>
        {[
          { label:'Total Records',   val: summary?.total_records    ?? 0, color:'var(--t1)' },
          { label:'Units Available', val: summary?.total_available  ?? 0, color:'var(--green)' },
          { label:'Units Reserved',  val: summary?.total_reserved   ?? 0, color:'var(--amber)' },
          { label:'Active Depots',   val: summary?.active_depots    ?? 0, color:'var(--brand)' },
          { label:'Low / Out Stock', val: `${summary?.low_stock_count ?? 0} / ${summary?.out_of_stock_count ?? 0}`, color:'#DC2626' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-field"><Ic n={I.search} size={13} /><input placeholder="Search size, condition, depot, vendor…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="sel" value={sizeFilter}   onChange={e => setSizeFilter(e.target.value)}><option value="">All Sizes</option>{sizes.map(s=><option key={s}>{s}</option>)}</select>
        <select className="sel" value={condFilter}   onChange={e => setCondFilter(e.target.value)}><option value="">All Conditions</option>{conds.map(c=><option key={c}>{c}</option>)}</select>
        <select className="sel" value={depotFilter}  onChange={e => setDepotFilter(e.target.value)}><option value="">All Depots</option>{depots.map(d=><option key={d}>{d}</option>)}</select>
        <select className="sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Statuses</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option><option>Reserved</option></select>
        <div className="toolbar-right">
          <span className="count-label">{inventory.length} records</span>
          <ExportMenu data={inventory} filename="inventory" />
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 24px' }}>
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="crm">
            <thead><tr>
              <th>Container Spec</th><th>Condition</th><th>Depot / Yard</th><th>Vendor</th>
              <th className="r">Available</th><th className="r">Reserved</th>
              <th className="r">Unit Cost</th><th className="r">Target Price</th>
              <th>Status</th>{canWrite && <th>Actions</th>}
            </tr></thead>
            <tbody>
              {inventory.length === 0 ? (
                <tr><td colSpan={canWrite ? 10 : 9} style={{ textAlign:'center', padding:40, color:'var(--t4)' }}>
                  No inventory records found.{canWrite ? ' Click "Add Inventory" or import a vendor sheet to get started.' : ''}
                </td></tr>
              ) : inventory.map((row: any) => {
                const sc = STATUS_COLORS[row.status] || { bg:'var(--s3)', color:'var(--t3)' }
                return (
                  <tr key={row.id}>
                    <td><div style={{ fontWeight:600, fontSize:13 }}>{row.container_size}</div><div style={{ fontSize:11, color:'var(--t4)' }}>{row.container_category}</div></td>
                    <td style={{ fontSize:12.5 }}>{row.container_condition}</td>
                    <td><div style={{ fontWeight:500, fontSize:13 }}>{row.depot_name}</div>{(row.city||row.state_province) && <div style={{ fontSize:11, color:'var(--t4)' }}>{[row.city,row.state_province,row.country].filter(Boolean).join(', ')}</div>}</td>
                    <td style={{ fontSize:12.5, color:'var(--t3)' }}>{row.vendor_supplier||'—'}</td>
                    <td className="r">
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',-1)}>−</button>}
                        <span style={{ fontWeight:700, fontFamily:'var(--mono)', minWidth:24, textAlign:'center' }}>{row.quantity_available}</span>
                        {canWrite && <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, width:20, height:20, cursor:'pointer', fontSize:13, color:'var(--t3)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => handleStockDelta(row.id,'available',1)}>+</button>}
                      </div>
                    </td>
                    <td className="r mono">{row.quantity_reserved}</td>
                    <td className="r mono">${Number(row.unit_cost).toLocaleString()}</td>
                    <td className="r mono">${Number(row.target_sell_price||0).toLocaleString()}</td>
                    <td><span style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600, background:sc.bg, color:sc.color }}>{row.status}</span></td>
                    {canWrite && <td><div style={{ display:'flex', gap:4 }}><Btn variant="ghost" sm title="Edit" onClick={() => setEditRow(row)}><Ic n={I.edit} size={13} /></Btn>{role==='admin' && <Btn variant="ghost" sm title="Delete" onClick={() => handleDelete(row.id)}><Ic n={I.removed} size={13} /></Btn>}</div></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


export default InventoryManagement
