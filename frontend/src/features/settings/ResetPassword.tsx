import { useState, type FormEvent } from 'react'
import { supabase } from '../../config/supabase'

// Rendered when Supabase's password-recovery link redirects back here (detected via the
// PASSWORD_RECOVERY auth event -- see App.tsx). The recovery link itself already establishes
// a temporary authenticated session; this just lets the user set a new password to replace it.
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      alert('Password updated. You are now signed in with your new password.')
      onDone()
    } catch (err: any) {
      setError(err.message ?? 'Could not update the password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 400, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, background: 'var(--brand)', borderRadius: 12, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 24 }}>C</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>Set a new password</div>
          <div style={{ fontSize: 13, color: 'var(--t4)', marginTop: 4 }}>Choose a new password for your account.</div>
        </div>

        {error && (
          <div style={{ padding: 12, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: 'var(--brand)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
