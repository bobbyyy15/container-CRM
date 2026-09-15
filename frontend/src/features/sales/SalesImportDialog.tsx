import React, { useRef, useState } from 'react'
import { api } from '../../lib/api'
import { toast } from '../../lib/notify'
import { invalidateCache } from '../../lib/dataCache'

/**
 * Imports the sales spreadsheet the client already keeps.
 *
 * The file is read here and the rows are sent as they appear in the sheet; the server owns
 * the mapping, the validation, the duplicate checks and which customer account every row
 * lands on, so one set of rules covers the import however it is driven. Nothing is written
 * on the first pass: the server reports what it would do to every row and the import only
 * commits when the person says so.
 */
const CHUNK = 500

type Row = {
  rowNumber: number
  companyName: string
  invoiceNumber?: string
  releaseNumber?: string
  account?: 'new' | 'existing'
  accountLabel?: string
  saleDate?: string
  quantity: number
  type?: string
  size?: string
  condition?: string
  buyingRate: number
  sellingPrice: number
  buyingCost: number
  revenue: number
  grossProfit: number
  margin: number
  status: string
  errors: string[]
  notices: string[]
}

const money = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const SalesImportDialog = ({ onClose, onImported }: { onClose: () => void; onImported: () => void }) => {
  const [filename, setFilename] = useState<string>()
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])
  const [preview, setPreview] = useState<{ summary: any; rows: Row[] } | null>(null)
  const [reading, setReading] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const choose = async (file?: File) => {
    if (!file) return
    setMessage('')
    setPreview(null)
    setFilename(file.name)
    setReading(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    try {
      const { read, utils } = await import('xlsx')
      const workbook = read(await file.arrayBuffer(), { type: 'array', cellDates: false })
      // Rows keyed by the sheet's own headers -- the server knows what those mean.
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '' })
        .filter(row => Object.values(row).some(value => String(value ?? '').trim()))
      setRawRows(rows)
      if (!rows.length) {
        setMessage('That sheet has no rows.')
        return
      }
      await runPreview(rows)
    } catch (error: any) {
      setMessage(error?.message ?? 'Could not read that file.')
    } finally {
      setReading(false)
    }
  }

  const runPreview = async (rows: Record<string, unknown>[]) => {
    setWorking(true)
    try {
      const response = await api.post('/deals/sales/import', { rows: rows.slice(0, CHUNK * 10), dryRun: true, filename })
      setPreview(response.data.data)
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message ?? error?.message ?? 'Could not check that file.')
    } finally {
      setWorking(false)
    }
  }

  const commit = async () => {
    if (!preview?.summary.importable) return
    setWorking(true)
    setMessage('')
    try {
      let imported = 0
      let rejected = 0
      for (let index = 0; index < rawRows.length; index += CHUNK) {
        const response = await api.post('/deals/sales/import', { rows: rawRows.slice(index, index + CHUNK), dryRun: false, filename })
        imported += response.data.data.summary.imported
        rejected += response.data.data.summary.rejected
      }
      toast(`${imported} sale${imported === 1 ? '' : 's'} imported${rejected ? ` · ${rejected} rejected` : ''}.`, rejected ? 'error' : 'success')
      invalidateCache('deals:sales')
      invalidateCache('customers')
      onImported()
      onClose()
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message ?? error?.message ?? 'Import failed.')
    } finally {
      setWorking(false)
    }
  }

  const rows = preview?.rows ?? []
  const problems = rows.filter(r => r.errors.length)
  const notices = rows.filter(r => !r.errors.length && r.notices.length)
  const cell = { fontSize: 12 }
  const mono = { fontSize: 11.5 }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(1100px, 96vw)' }} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Import sales</div>
            <div className="modal-desc">Checked and previewed before anything is written. Duplicates are refused, never overwritten.</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div
            onClick={() => inputRef.current?.click()}
            style={{ border: '1.5px dashed var(--border)', borderRadius: 12, padding: 22, textAlign: 'center', cursor: 'pointer', background: 'var(--s2)' }}
          >
            <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={e => choose(e.target.files?.[0])} />
            <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{filename ?? 'Choose the sales spreadsheet (.xlsx, .xls, .csv)'}</div>
            <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 4 }}>
              {reading
                ? 'Reading the file…'
                : 'Date · Invoice Number · Release Number · Company Name · Contact · Contact Number · Email Address · State · City · Quantity · Type · Condition · Size · Buying Rate · Selling Price · Remarks / Status'}
            </div>
            {!reading && (
              <div style={{ color: 'var(--t4)', fontSize: 11.5, marginTop: 4 }}>
                A row whose phone or email belongs to an existing client is a repurchase. A new client's first transaction needs both phone and email.
              </div>
            )}
          </div>

          {preview && (
            <>
              <div style={{ display: 'flex', gap: 18, fontSize: 12.5, margin: '14px 0 8px', flexWrap: 'wrap' }}>
                <span><b>{preview.summary.total}</b> rows read</span>
                <span style={{ color: 'var(--green)' }}><b>{preview.summary.importable}</b> ready to import</span>
                {preview.summary.newAccounts > 0 && <span><b>{preview.summary.newAccounts}</b> new clients (first transaction)</span>}
                {preview.summary.rejected > 0 && <span style={{ color: 'var(--red)' }}><b>{preview.summary.rejected}</b> rejected</span>}
              </div>

              {problems.length > 0 && (
                <div style={{ marginBottom: 10, border: '1px solid var(--border-s)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                    Rows that will not be imported
                  </div>
                  <div style={{ maxHeight: 150, overflow: 'auto', padding: '6px 12px' }}>
                    {problems.slice(0, 30).map(row => (
                      <div key={row.rowNumber} style={{ fontSize: 12, color: 'var(--t2)', padding: '2px 0' }}>
                        <b>Row {row.rowNumber}</b> {row.companyName || '(no company)'} — {row.errors.join('; ')}
                      </div>
                    ))}
                    {problems.length > 30 && <div style={{ fontSize: 12, color: 'var(--t4)' }}>…and {problems.length - 30} more.</div>}
                  </div>
                </div>
              )}

              {notices.length > 0 && (
                <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--t3)' }}>
                  {notices.length} row{notices.length === 1 ? '' : 's'} imported with a note, e.g. row {notices[0].rowNumber}: {notices[0].notices[0]}
                </div>
              )}

              <div style={{ border: '1px solid var(--border-s)', borderRadius: 8, overflow: 'auto', maxHeight: 280 }}>
                <table className="crm" style={{ width: '100%' }}>
                  <thead><tr>
                    <th>Row</th><th>Invoice #</th><th>Release #</th><th>Client</th><th>Date</th><th>Company</th>
                    <th>Type</th><th>Size</th><th>Condition</th><th className="r">Qty</th>
                    <th className="r">Buy/Unit</th><th className="r">Sell/Unit</th><th className="r">Total Buy</th>
                    <th className="r">Total Sell</th><th className="r">Profit</th><th className="r">Margin</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {rows.slice(0, 100).map(row => (
                      <tr key={row.rowNumber} style={{ background: row.errors.length ? 'var(--red-bg)' : undefined }}>
                        <td className="mono" style={mono}>{row.rowNumber}</td>
                        <td className="mono" style={mono}>{row.invoiceNumber || '—'}</td>
                        <td className="mono" style={mono}>{row.releaseNumber || <span style={{ color: 'var(--t4)' }}>auto</span>}</td>
                        <td style={cell}>{row.account === 'new' ? 'First transaction' : row.account === 'existing' ? `Repurchase${row.accountLabel ? ` · ${row.accountLabel}` : ''}` : '—'}</td>
                        <td className="mono" style={mono}>{row.saleDate || '—'}</td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{row.companyName || '—'}</td>
                        <td style={cell}>{row.type || '—'}</td>
                        <td style={cell}>{row.size || '—'}</td>
                        <td style={cell}>{row.condition || '—'}</td>
                        <td className="r mono" style={cell}>{row.quantity}</td>
                        <td className="r mono" style={cell}>{money(row.buyingRate)}</td>
                        <td className="r mono" style={cell}>{money(row.sellingPrice)}</td>
                        <td className="r mono" style={cell}>{money(row.buyingCost)}</td>
                        <td className="r mono" style={cell}>{money(row.revenue)}</td>
                        <td className="r mono" style={cell}>{money(row.grossProfit)}</td>
                        <td className="r mono" style={cell}>{row.margin.toFixed(1)}%</td>
                        <td style={cell}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && <div style={{ fontSize: 12, color: 'var(--t4)', marginTop: 6 }}>Showing the first 100 of {rows.length} rows.</div>}
            </>
          )}

          {message && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12 }}>{message}</div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={working || reading || !preview?.summary.importable}
            onClick={commit}
          >
            {working ? 'Importing…' : preview ? `Import ${preview.summary.importable} sales` : 'Choose a file first'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SalesImportDialog
