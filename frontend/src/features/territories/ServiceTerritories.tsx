import React, { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast, askConfirm, askReason } from '../../lib/notify'
import { Ic, I } from '../../components/ui/icons'
import Btn from '../../components/ui/Button'
import { Badge } from '../../components/ui/primitives'
import ExportMenu from '../../components/ui/ExportMenu'
import type { Screen, BadgeStatus } from '../../app/types'
import type { Territory } from '../../app/types'

const ServiceTerritories = () => {
  const [rows, setRows] = useState<Territory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings/territories')
      .then(res => { if (res.data.success) setRows(res.data.data || []) })
      .catch(() => toast('Could not load territories.', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.patch('/settings/territories', {
        territories: rows.map(r => ({ id: r.id, enabled: r.enabled })),
      })
      setRows(res.data.data || rows)
      toast('Service territories updated.', 'success')
    } catch (e: any) {
      toast(e.response?.data?.error?.message ?? 'Could not save territories.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-row"><span className="spinner" />Loading territories…</div>

  const regions = [...new Set(rows.map(r => r.region))]
  const palette: Record<string, { color: string; bg: string }> = {
    'Northern United States': { color: 'var(--brand)', bg: 'var(--brand-bg)' },
    'Canadian Provinces':     { color: 'var(--green)', bg: 'var(--green-bg)' },
  }

  return (
    <div className="page-scroll">
      <div className="page-content">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">Service Territory Settings</div>
            <div className="page-desc">Click a state or province to enable or disable it, then save.</div>
          </div>
          <Btn variant="primary" sm onClick={save} disabled={saving}>
            <Ic n={I.check} size={13} /> {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {regions.map(region => {
            const tone = palette[region] ?? { color: 'var(--purple)', bg: 'var(--purple-bg)' }
            const inRegion = rows.filter(r => r.region === region)
            return (
              <div key={region} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{region}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{inRegion.filter(r => r.enabled).length} of {inRegion.length} active</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {inRegion.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 7, border: '1px solid transparent',
                        background: t.enabled ? tone.bg : 'var(--s3)',
                        color: t.enabled ? tone.color : 'var(--t4)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                        textDecoration: t.enabled ? 'none' : 'line-through',
                      }}
                    >
                      {t.enabled ? '✓' : '○'} {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ServiceTerritories
