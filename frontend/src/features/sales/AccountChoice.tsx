import React, { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatDateOnly } from '../../hooks/mappers'

export type AccountChoiceValue = {
  /** Required: null until the person answers. */
  firstTransaction: boolean | null
  /** For a repurchase: the existing client's account, found by the lookup. */
  customerAccountId?: string
  /** Who that client is, as shown once chosen. */
  accountLabel?: string
}

/** Why the choice cannot be saved yet, or an empty string when it can. */
export const accountChoiceError = (value: AccountChoiceValue) => {
  if (value.firstTransaction === null) return "First Transaction is required: say whether this is a new client's first sale or a repurchase."
  if (value.firstTransaction === false && !value.customerAccountId) return 'Find the existing client this repurchase is for.'
  return ''
}

type LookupResult = {
  customer_account_id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  state: string | null
  status: string
  last_purchase_date: string | null
}

const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t4)', marginTop: 4 }

/**
 * First Transaction, as the client works it: a new client's first sale records their phone
 * and email; every sale after that is a repurchase, found with a fast lookup of the existing
 * clients by phone, email, contact or company name.
 */
const AccountChoice = ({ value, onChange, firstTransactionHint }: {
  value: AccountChoiceValue
  onChange: (value: AccountChoiceValue) => void
  firstTransactionHint?: string
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LookupResult[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'done'>('idle')

  const searching = value.firstTransaction === false && !value.customerAccountId

  useEffect(() => {
    const text = query.trim()
    if (!searching || text.length < 2) {
      setResults([])
      setState('idle')
      return
    }
    setState('searching')
    let cancelled = false
    const handle = setTimeout(() => {
      api.get('/customers/lookup', { params: { q: text } })
        .then(response => { if (!cancelled) { setResults(response.data.data ?? []); setState('done') } })
        .catch(() => { if (!cancelled) { setResults([]); setState('done') } })
    }, 300)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [query, searching])

  const choose = (result: LookupResult) => {
    onChange({
      firstTransaction: false,
      customerAccountId: result.customer_account_id,
      accountLabel: [result.company_name, result.contact_name, result.phone || result.email].filter(Boolean).join(' · '),
    })
    setQuery('')
  }

  return (
    <div style={{ gridColumn: '1 / -1', padding: 12, border: '1px solid var(--border-s)', borderRadius: 8, background: 'var(--s2)', display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
        First transaction <span style={{ color: 'var(--red)' }}>*</span>
      </div>
      <div role="radiogroup" aria-label="First transaction" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" checked={value.firstTransaction === true} onChange={() => onChange({ firstTransaction: true })} />
          Yes — a new client's first transaction
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" checked={value.firstTransaction === false} onChange={() => onChange({ firstTransaction: false })} />
          No — a repurchase by an existing client
        </label>
      </div>

      {value.firstTransaction === true && (
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          {firstTransactionHint ?? "The customer's phone and email are required, so their repurchases can be found later."}
        </div>
      )}

      {value.firstTransaction === false && value.customerAccountId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--t1)' }}>
          <span style={{ fontWeight: 600 }}>{value.accountLabel || 'Existing client'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ firstTransaction: false })}>Change</button>
        </div>
      )}

      {searching && (
        <div>
          <input
            className="inp"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Fast lookup: phone, email, contact or company…"
            autoFocus
          />
          {state === 'idle' && <div style={hint}>Type at least two characters to find the existing client.</div>}
          {state === 'searching' && <div style={hint}>Searching clients…</div>}
          {state === 'done' && results.length === 0 && (
            <div style={hint}>No existing client matches. If this is their first purchase, choose Yes above.</div>
          )}
          {results.length > 0 && (
            <div style={{ marginTop: 6, border: '1px solid var(--border-s)', borderRadius: 8, background: 'var(--ws)', maxHeight: 220, overflow: 'auto' }}>
              {results.map(result => (
                <button
                  key={result.customer_account_id}
                  type="button"
                  onClick={() => choose(result)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border-s)', background: 'transparent', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t1)' }}>{result.company_name}</span>
                    <span style={{ fontSize: 11, color: result.status === 'Active' ? 'var(--green)' : 'var(--amber)' }}>{result.status}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                    {[result.contact_name, result.phone, result.email, result.state].filter(Boolean).join(' · ') || 'No contact on file'}
                  </div>
                  {result.last_purchase_date && (
                    <div style={{ fontSize: 11, color: 'var(--t4)' }}>Last purchase {formatDateOnly(result.last_purchase_date)}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountChoice
