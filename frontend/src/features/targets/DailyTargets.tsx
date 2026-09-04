import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'

const TARGET_FIELDS: { key: string; label: string; section: string }[] = [
  { key: 'monthly_gross_profit_target', label: 'Monthly Gross Profit Target ($)', section: 'Monthly Targets' },
  { key: 'working_days_per_month',      label: 'Working Days per Month',          section: 'Monthly Targets' },
  { key: 'daily_email_target',          label: 'Daily Email Target',              section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_min',       label: 'Daily Call Target (Minimum)',     section: 'Daily Outreach Targets' },
  { key: 'daily_call_target_preferred', label: 'Daily Call Target (Preferred)',   section: 'Daily Outreach Targets' },
  { key: 'daily_text_target',           label: 'Daily Text Target',               section: 'Daily Outreach Targets' },
]

const DailyTargets = () => {
  const [form, setForm] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/targets')
      .then(res => { if (res.data.success) setForm(res.data.data || {}) })
      .catch(() => toast('Could not load targets.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload = Object.fromEntries(TARGET_FIELDS.map(f => [f.key, Number(form[f.key]) || 0]))
      const res = await api.patch('/settings/targets', payload)
      setForm(res.data.data || form)
      toast('Targets saved. Dashboards will use these going forward.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save targets.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading targets…</div>

  let lastSection = ''
  return (
    <div className="page-scroll">
      <div className="page-content" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="page-title">Daily Targets Configuration</div>
          <div className="page-desc">Set the outreach and profit targets used across dashboards and reports.</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {TARGET_FIELDS.map(f => {
            const header = f.section !== lastSection ? (lastSection = f.section) : null
            return (
              <div key={f.key}>
                {header && <div className="form-section">{header}</div>}
                <div style={{ marginBottom: 14 }}>
                  <label className="form-label">{f.label}</label>
                  <input
                    className="inp" type="number" min="0"
                    value={form[f.key] ?? 0}
                    onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  />
                </div>
              </div>
            )
          })}
          <Btn variant="primary" style={{ marginTop: 8 }} onClick={save} disabled={saving}>
            <Ic n={I.check} size={14} /> {saving ? 'Saving…' : 'Save Targets'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export default DailyTargets
