import React from 'react'
import SuggestInput from '../../components/ui/SuggestInput'
import { useCustomers } from '../../hooks/useCustomers'

export type AccountChoiceValue = {
  /** Required: null until the person answers. */
  firstTransaction: boolean | null
  /** For a first transaction, the new account's Client ID (blank allocates one); otherwise the existing account's. */
  clientCode: string
  /** An existing account already known to the caller, e.g. from the inquiry behind a quotation. */
  customerAccountId?: string
}

/** Why the choice cannot be saved yet, or an empty string when it can. */
export const accountChoiceError = (value: AccountChoiceValue) => {
  if (value.firstTransaction === null) return 'First Transaction is required: say whether this sale opens a new customer account.'
  if (value.firstTransaction === false && !value.clientCode.trim() && !value.customerAccountId) {
    return 'Choose the existing customer account (Client ID) this sale belongs to.'
  }
  return ''
}

const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t4)', marginTop: 4 }
const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }

/**
 * First Transaction, as a required question rather than something inferred.
 *
 * The same company can hold several customer accounts, so the company name cannot say
 * whether a sale opens a new account or adds to one -- the person recording it answers, and
 * a repeat sale names its account by Client ID.
 */
const AccountChoice = ({ value, onChange, knownAccountLabel }: {
  value: AccountChoiceValue
  onChange: (value: AccountChoiceValue) => void
  /** Shown instead of the picker when the existing account is already known. */
  knownAccountLabel?: string
}) => {
  const accounts = useCustomers('All', '', 0, undefined, 'master')
  const options = accounts
    .filter(account => account.clientCode)
    .map(account => ({ value: account.clientCode, label: `${account.clientCode} — ${account.co}`, sublabel: account.state !== '-' ? account.state : undefined }))
  const typed = value.clientCode.trim().toUpperCase()
  const matched = value.firstTransaction === false && typed
    ? accounts.find(account => String(account.clientCode).toUpperCase() === typed)
    : undefined

  return (
    <div style={{ gridColumn: '1 / -1', padding: 12, border: '1px solid var(--border-s)', borderRadius: 8, background: 'var(--s2)', display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>
        First transaction <span style={{ color: 'var(--red)' }}>*</span>
      </div>
      <div role="radiogroup" aria-label="First transaction" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" checked={value.firstTransaction === true} onChange={() => onChange({ firstTransaction: true, clientCode: '' })} />
          Yes — this sale opens a new customer account
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="radio"
            checked={value.firstTransaction === false}
            onChange={() => onChange({ firstTransaction: false, clientCode: '', customerAccountId: value.customerAccountId })}
          />
          No — it belongs to an existing account
        </label>
      </div>

      {value.firstTransaction === true && (
        <div>
          <div style={label}>Client ID <span style={{ color: 'var(--t4)', fontWeight: 400 }}>(optional)</span></div>
          <input className="inp" value={value.clientCode} onChange={event => onChange({ ...value, clientCode: event.target.value })} placeholder="Blank allocates the next Client ID" />
        </div>
      )}

      {value.firstTransaction === false && (value.customerAccountId && knownAccountLabel && !value.clientCode ? (
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          {knownAccountLabel}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => onChange({ firstTransaction: false, clientCode: '' })}>Choose another</button>
        </div>
      ) : (
        <div>
          <div style={label}>Existing account (Client ID) <span style={{ color: 'var(--red)' }}>*</span></div>
          <SuggestInput
            value={value.clientCode}
            onChange={clientCode => onChange({ firstTransaction: false, clientCode })}
            options={options}
            placeholder="Type a Client ID or company name"
          />
          <div style={hint}>
            {matched
              ? `${matched.co} · first transaction ${matched.firstTransaction}`
              : typed
                ? 'Not in the list you can see; the Client ID is checked when the sale is saved.'
                : 'One company can hold several accounts, so the sale is placed by Client ID, not by company name.'}
          </div>
        </div>
      ))}
    </div>
  )
}

export default AccountChoice
