import React, { useState } from 'react';
import { supabase } from './config/supabase';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [identifier, setIdentifier] = useState('');
  
  // Registration fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegistering) {
        if (!email || !password || !username) {
          throw new Error("Email, username, and password are required.");
        }
        
        // Supabase Signup
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              full_name: fullName
            }
          }
        });

        if (signUpError) throw signUpError;
        alert("Registration successful! You are now logged in.");
        onLogin();

      } else {
        if (!identifier || !password) {
          throw new Error("Please enter your email and password.");
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password
        });

        if (signInError) throw signInError;
        onLogin();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 400, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, background: 'var(--brand)', borderRadius: 12, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 24 }}>C</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)' }}>Container CRM</div>
          <div style={{ fontSize: 13, color: 'var(--t4)', marginTop: 4 }}>
            {isRegistering ? 'Create your account' : 'Sign in to your account'}
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isRegistering ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Full Name (Optional)</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} />
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Email</label>
              <input type="email" value={identifier} onChange={e => setIdentifier(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: 'var(--brand)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--t4)' }}>
          {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
          <span style={{ color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Sign In' : 'Register'}
          </span>
        </div>
      </div>
    </div>
  );
}
