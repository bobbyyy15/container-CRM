import { useRef, useState } from 'react'
import { api } from '../../lib/api'
import {
  parseProspectFile,
  parseProspectPaste,
  downloadProspectTemplate,
  type ParsedProspectImport,
} from './prospectImport'

type Props = {
  open: boolean
  initialMode: 'file' | 'paste'
  onClose: () => void
  onImported: () => void
}

const empty: ParsedProspectImport = { rows: [], submitRows: [], errors: [], sourceRows: 0 }

export default function ProspectImportDialog({ open, initialMode, onClose, onImported }: Props) {
  const [mode, setMode] = useState<'file' | 'paste'>(initialMode)
  const [parsed, setParsed] = useState<ParsedProspectImport>(empty)
  const [paste, setPaste] = useState('')
  const [filename, setFilename] = useState<string>()
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [recorded, setRecorded] = useState<any[] | null>(null)
  const [loadingRecorded, setLoadingRecorded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const chooseFile = async (file?: File) => {
    if (!file) return
    setMessage('')
    setRecorded(null)
    try {
      setFilename(file.name)
      setParsed(await parseProspectFile(file))
    } catch (error: any) {
      setParsed({ ...empty, errors: [{ message: error.message, kind: 'issue' }] })
    }
  }

  const parsePaste = async () => {
    setFilename('pasted-spreadsheet')
    setRecorded(null)
    setParsed(await parseProspectPaste(paste))
  }

  const importRows = async () => {
    if (!parsed.submitRows.length) return
    setWorking(true)
    setMessage('')
    setRecorded(null)
    try {
      // Submit every parsed row, not just the "ready" ones -- a row missing a company name
      // or contact still gets recorded in import history with a specific reason instead of
      // being silently discarded (see process_prospect_import_batch).
      const response = await api.post('/data/imports', { rows: parsed.submitRows, filename })
      const result = response.data.data
      const withoutContact = result.withoutContactCount ? ` (${result.withoutContactCount} without a named contact)` : ''
      setMessage(
        `${result.importedCount} imported${withoutContact} · ${result.duplicateCount} duplicates · ${result.removedCount} removed · ${result.conflictCount} conflicts · ${result.errorCount} recorded for review`,
      )
      onImported()
    } catch (error: any) {
      setMessage(error.response?.data?.error?.message ?? error.message ?? 'Import failed.')
    } finally {
      setWorking(false)
    }
  }

  const loadRecorded = async () => {
    setLoadingRecorded(true)
    try {
      const response = await api.get('/data/imports/conflicts')
      setRecorded((response.data.data ?? []).filter((row: any) => row.status === 'error'))
    } catch (error: any) {
      setMessage(error.response?.data?.error?.message ?? error.message ?? 'Could not load recorded rows.')
    } finally {
      setLoadingRecorded(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Import prospects" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.52)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: 'var(--ws)', boxShadow: '0 24px 80px rgba(15,23,42,.28)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title" style={{ fontSize: 18 }}>Import prospect data</div>
            <div className="page-desc">Preview and validate before anything is written to the CRM.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 20 }}>
          <div className="tabs" style={{ padding: 0, marginBottom: 16 }}>
            <button className={`tab${mode === 'file' ? ' active' : ''}`} onClick={() => { setMode('file'); setParsed(empty) }}>Excel / CSV file</button>
            <button className={`tab${mode === 'paste' ? ' active' : ''}`} onClick={() => { setMode('paste'); setParsed(empty) }}>Paste from sheet</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 12, color: 'var(--t3)' }}>
            <span>Columns may be shuffled and headers may start lower in the sheet. A labeled vertical prospect form is also normalized automatically.</span>
            <button className="btn btn-ghost btn-sm" onClick={downloadProspectTemplate}>Download CRM template</button>
          </div>

          {mode === 'file' ? (
            <div onClick={() => inputRef.current?.click()} style={{ border: '1.5px dashed var(--border)', borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer', background: 'var(--s2)' }}>
              <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv" hidden onChange={event => chooseFile(event.target.files?.[0])} />
              <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{filename ?? 'Choose .xls, .xlsx, or .csv'}</div>
              <div style={{ color: 'var(--t3)', fontSize: 12, marginTop: 5 }}>All worksheets are scanned for recognizable prospect fields.</div>
            </div>
          ) : (
            <div>
              <textarea className="inp" rows={9} value={paste} onChange={event => setPaste(event.target.value)} placeholder="Copy the header and rows from Excel or Google Sheets, then paste here…" style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
              <button className="btn btn-secondary btn-sm" onClick={parsePaste} style={{ marginTop: 8 }}>Preview pasted rows</button>
            </div>
          )}

          {(parsed.sourceRows > 0 || parsed.errors.length > 0) && (() => {
            const issues = parsed.errors.filter(note => note.kind === 'issue')
            const skipped = parsed.errors.filter(note => note.kind === 'skipped')
            return (
              <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', background: 'var(--s2)', display: 'flex', gap: 18, fontSize: 12 }}>
                  <span><b>{parsed.sourceRows}</b> source rows</span>
                  <span style={{ color: 'var(--green)' }}><b>{parsed.rows.length}</b> ready</span>
                  <span style={{ color: 'var(--t3)' }}><b>{skipped.length}</b> skipped (incomplete source data)</span>
                  {issues.length > 0 && <span style={{ color: 'var(--red)' }}><b>{issues.length}</b> need attention</span>}
                </div>
                {parsed.rows.length > 0 && (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--t2)' }}>
                    Preview: {parsed.rows.slice(0, 3).map(row => `${row.company_name} — ${row.contact_person || 'no contact yet'}`).join(' · ')}
                  </div>
                )}
                {issues.length > 0 && (
                  <div style={{ padding: 12, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12, borderTop: skipped.length ? undefined : '1px solid var(--border)' }}>
                    {issues.slice(0, 8).map(note => <div key={note.message}>{note.message}</div>)}
                    {issues.length > 8 && <div>…and {issues.length - 8} more.</div>}
                  </div>
                )}
                {skipped.length > 0 && (
                  <div style={{ padding: 12, background: 'var(--s2)', color: 'var(--t3)', fontSize: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Skipped — normal for incomplete source rows, nothing to fix</div>
                    {skipped.slice(0, 8).map(note => <div key={note.message}>{note.message}</div>)}
                    {skipped.length > 8 && <div>…and {skipped.length - 8} more.</div>}
                  </div>
                )}
              </div>
            )
          })()}

          {message && (
            <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: 'var(--brand-bg)', color: 'var(--t1)', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span>{message}</span>
                <button className="btn btn-ghost btn-sm" onClick={loadRecorded} disabled={loadingRecorded}>
                  {loadingRecorded ? 'Loading…' : 'View recorded rows'}
                </button>
              </div>
              {recorded && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, maxHeight: 220, overflow: 'auto' }}>
                  {recorded.length === 0
                    ? <div style={{ color: 'var(--t3)' }}>No rows are currently recorded for review.</div>
                    : recorded.map(row => (
                      <div key={row.id} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 600 }}>{row.reason ?? 'Recorded for review'}</div>
                        <div style={{ color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {Object.entries(row.raw_data ?? {}).filter(([, value]) => value).map(([k, v]) => `${k}: ${v}`).join(' · ') || '(no data captured)'}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={working || !parsed.submitRows.length} onClick={importRows}>
              {working
                ? 'Importing…'
                : parsed.submitRows.length > parsed.rows.length
                  ? `Import ${parsed.rows.length} as prospects (+${parsed.submitRows.length - parsed.rows.length} recorded for review)`
                  : `Import ${parsed.rows.length} valid rows`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
