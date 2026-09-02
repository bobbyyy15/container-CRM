import React, { useState } from 'react';
import { supabase } from './config/supabase';
import { api } from './lib/api';
import { toast } from './lib/notify';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [identifier, setIdentifier] = useState('');

  // Registration fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // resetPasswordForEmail() needs a real email -- reuse the same username-or-email
  // resolution as sign-in, since the "Forgot password?" field also accepts either.
  const resolveEmail = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.includes('@')) return trimmed;
    const response = await api.post('/auth/resolve-login', { identifier: trimmed });
    return response.data.data.email as string;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const targetEmail = await resolveEmail(identifier);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err: any) {
      // Don't reveal whether the account exists via a different error for "not found" --
      // resolveEmail's 404 and Supabase's own errors both just show a generic message.
      setError(err.response?.data?.error?.message ?? err.message ?? 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  };

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
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              full_name: fullName.trim() || undefined
            }
          }
        });

        if (signUpError) throw signUpError;

        // If email confirmation is required, signUp succeeds but returns no session --
        // there is nothing to log in to yet. Calling onLogin() here regardless was the
        // bug: it claimed success while the account couldn't actually sign in until the
        // confirmation link was clicked.
        if (!signUpData.session) {
          toast("Registration successful! Check your email to confirm your account before signing in.", 'success');
          setIsRegistering(false);
          setIdentifier(email);
        } else {
          onLogin();
        }

      } else {
        if (!identifier || !password) {
          throw new Error("Please enter your email or username and password.");
        }

        // Supabase Auth only signs in by email, but this CRM allows logging in with either
        // email or username -- resolve a username to its email first.
        let loginEmail = identifier.trim();
        if (!loginEmail.includes('@')) {
          const response = await api.post('/auth/resolve-login', { identifier: loginEmail });
          loginEmail = response.data.data.email;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password
        });

        if (signInError) throw signInError;
        onLogin();
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? err.message ?? 'An unexpected error occurred.');
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
            {showForgot ? 'Reset your password' : isRegistering ? 'Create your account' : 'Sign in to your account'}
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {showForgot ? (
          resetSent ? (
            <div>
              <div style={{ padding: 12, background: 'var(--brand-bg)', color: 'var(--t1)', fontSize: 13, borderRadius: 8, marginBottom: 16 }}>
                If an account matches that email or username, a password reset link has been sent. Check your inbox.
              </div>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--t4)' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setShowForgot(false); setResetSent(false); setError(''); }}>Back to sign in</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Email or Username</label>
                <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: 'var(--brand)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--t4)' }}>
                <span style={{ color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setShowForgot(false); setError(''); }}>Back to sign in</span>
              </div>
            </form>
          )
        ) : (
        <>
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Email or Username</label>
              <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--t1)', boxSizing: 'border-box' }} required />
            {!isRegistering && (
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setShowForgot(true); setError(''); }}>Forgot password?</span>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: 'var(--brand)', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8 }}>
            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ padding: '0 12px', fontSize: 12, color: 'var(--t4)', fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button 
          onClick={async () => {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
                queryParams: {
                  access_type: 'offline',
                  prompt: 'consent',
                },
                redirectTo: window.location.origin
              }
            });
            if (error) setError(error.message);
          }}
          style={{ width: '100%', padding: '10px', background: 'white', color: '#333', border: '1px solid #ccc', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: 18, height: 18 }} />
          Sign in with Google
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--t4)' }}>
          {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
          <span style={{ color: 'var(--brand)', fontWeight: 600, cursor: 'pointer' }} onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Sign In' : 'Register'}
          </span>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
