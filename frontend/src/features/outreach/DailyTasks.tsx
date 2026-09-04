import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import { usePics } from '../pipeline/PipelineDialogs'

const ACTIVITY_SECTIONS: {
  title: string; icon: string; color: string;
  fields: { key: string; label: string; targetKey?: string }[]
}[] = [
  { title: 'Email Activity', icon: I.mail, color: '#315EF6', fields: [
    { key: 'emails_completed', label: 'Emails Completed', targetKey: 'daily_email_target' },
    { key: 'email_replies',    label: 'Email Replies' },
    { key: 'emails_bounced',   label: 'Bounced / Failed' },
  ]},
  { title: 'Call Activity', icon: I.phone, color: '#0D9488', fields: [
    { key: 'calls_completed',  label: 'Calls Completed', targetKey: 'daily_call_target_min' },
    { key: 'calls_answered',   label: 'Calls Answered' },
    { key: 'calls_unanswered', label: 'Calls Unanswered' },
  ]},
  { title: 'Text / SMS Activity', icon: I.inquiry, color: '#7C3AED', fields: [
    { key: 'texts_completed',  label: 'Texts Completed', targetKey: 'daily_text_target' },
    { key: 'text_replies',     label: 'Text Replies' },
    { key: 'texts_opted_out',  label: 'Opted Out' },
  ]},
]

const BLANK_ACTIVITY: Record<string, number> = Object.fromEntries(
  ACTIVITY_SECTIONS.flatMap(s => s.fields.map(f => [f.key, 0]))
)

const DailyTasks = () => {
  const pics = usePics()
  const [picId, setPicId] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [form, setForm] = useState<Record<string, number>>(BLANK_ACTIVITY)
  const [notes, setNotes] = useState('')
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [results, setResults] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setTargets(res.data.data || {}) })
      .catch(() => {})
  }, [])

  // Default to the signed-in user's own PIC identity where there is one.
  useEffect(() => {
    if (picId || !pics.length) return
    api.get('/auth/me')
      .then(res => {
        const mine = res.data.data?.pic_id
        setPicId(pics.some(p => p.id === mine) ? mine : pics[0].id)
      })
      .catch(() => setPicId(pics[0].id))
  }, [pics, picId])

  // Load whatever is already recorded for this PIC/date so the form edits rather
  // than silently overwrites -- the upsert is keyed on (pic_id, entry_date).
  useEffect(() => {
    if (!picId || !entryDate) return
    setLoading(true)
    api.get('/settings/daily-activity', { params: { pic_id: picId, entry_date: entryDate } })
      .then(res => {
        const { activity, results: derived } = res.data.data || {}
        setResults(derived || {})
        if (activity) {
          setForm(Object.fromEntries(Object.keys(BLANK_ACTIVITY).map(k => [k, activity[k] ?? 0])))
          setNotes(activity.notes || '')
        } else {
          setForm(BLANK_ACTIVITY)
          setNotes('')
        }
      })
      .catch(() => toast('Could not load that day’s activity.', 'error'))
      .finally(() => setLoading(false))
  }, [picId, entryDate])

  const save = async () => {
    if (!picId) return toast('Select a PIC first.', 'error')
    setSaving(true)
    try {
      await api.post('/settings/daily-activity', { pic_id: picId, entry_date: entryDate, ...form, notes })
      toast('Daily activity saved.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save the entry.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async () => {
    setShowHistory(true)
    try {
      const res = await api.get('/settings/daily-activity/recent', { params: { limit: 30 } })
      setHistory(res.data.data || [])
    } catch {
      toast('Could not load previous entries.', 'error')
    }
  }

  const friendlyDate = new Date(`${entryDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="page-scroll">
      <div className="page-header" style={{ borderBottom: 'none' }}>
        <div>
          <div className="page-title">Daily Completed Tasks</div>
          <div className="page-desc">Record outreach activity completed on {friendlyDate}. These numbers feed the Outreach Dashboard and PIC Performance.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" sm onClick={openHistory}><Ic n={I.calendar} size={13} /> Previous Entries</Btn>
          <Btn variant="primary" sm onClick={save} disabled={saving || loading}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : "Save Today's Entry"}
          </Btn>
        </div>
      </div>
      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {ACTIVITY_SECTIONS.map(section => (
          <div key={section.title} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${section.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic n={section.icon} size={16} style={{ color: section.color }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{section.title}</span>
            </div>
            {section.fields.map(f => {
              const target = f.targetKey ? Number(targets[f.targetKey]) || 0 : 0
              const done = Number(form[f.key]) || 0
              return (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{f.label}</span>
                    {target > 0 && (
                      <span style={{ fontWeight: 600, color: done >= target ? 'var(--green)' : 'var(--t4)' }}>
                        {done} / {target}
                      </span>
                    )}
                  </label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] || ''}
                    placeholder="0"
                    onChange={e => setForm({ ...form, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                    style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}
                  />
                </div>
              )
            })}
          </div>
        ))}

        {/* Results are counted from the pipeline itself rather than typed in, so they
            can't drift away from what actually happened in the CRM. */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Leads &amp; Conversions</div>
          <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 14 }}>Counted automatically from this PIC's pipeline activity on this date.</div>
          {[
            { label: 'Warm Leads Generated', key: 'warm_leads' },
            { label: 'Inquiries Generated',  key: 'inquiries' },
            { label: 'Quotations Generated', key: 'quotations' },
            { label: 'Sales Generated',      key: 'sales' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-s)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--t2)' }}>{f.label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>{results[f.key] ?? 0}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 18, gridColumn: '2 / 4' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>PIC &amp; Notes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Entry Date</label>
              <input className="inp" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label">PIC (Person In Charge)</label>
              <select className="sel" style={{ width: '100%', height: 36 }} value={picId} onChange={e => setPicId(e.target.value)}>
                {pics.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="form-label">Notes</label>
            <textarea className="inp" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Daily notes, challenges, observations…" style={{ height: 'auto', padding: '10px 12px' }} />
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" style={{ width: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Previous Entries</div>
              <Btn variant="ghost" sm onClick={() => setShowHistory(false)}><Ic n={I.x} size={16} /></Btn>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: 420, overflow: 'auto' }}>
              {history.length === 0 ? (
                <div className="empty"><div className="empty-title">No entries recorded yet</div><div className="empty-desc">Saved daily activity will appear here.</div></div>
              ) : (
                <table className="crm">
                  <thead><tr>
                    <th>Date</th><th>PIC</th><th className="r">Emails</th><th className="r">Calls</th><th className="r">Texts</th><th>Notes</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h: any) => (
                      <tr key={h.id} onClick={() => { setPicId(h.pic_id); setEntryDate(h.entry_date); setShowHistory(false) }}>
                        <td className="mono" style={{ fontSize: 12 }}>{h.entry_date}</td>
                        <td style={{ fontSize: 12.5, fontWeight: 600 }}>{h.pics?.name || '—'}</td>
                        <td className="r mono">{h.emails_completed}</td>
                        <td className="r mono">{h.calls_completed}</td>
                        <td className="r mono">{h.texts_completed}</td>
                        <td style={{ fontSize: 12, color: 'var(--t3)' }} className="truncate">{h.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default DailyTasks
