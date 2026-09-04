import React, { useState } from 'react';
import { supabase } from './config/supabase';
import { api } from './lib/api';
import { toast } from './lib/notify';
import ContainerYard from './features/auth/ContainerYard';
import './styles/auth.css';

const IconMail = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
);
const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconEye = ({ off }: { off?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {off ? (
      <><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.15 18.15 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" /></>
    ) : (
      <><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></>
    )}
  </svg>
);
const IconArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);
const IconShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
  </svg>
);

const HERO_POINTS = [
  'Live container inventory',
  'One record per client',
  'Quotation to delivery in one flow',
  'Secure, role-based access',
];

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
  const [showPassword, setShowPassword] = useState(false);

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

  const handleGoogle = async () => {
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
  };

  const heading = showForgot ? 'Reset your password' : isRegistering ? 'Create your account' : 'Sign in to continue';
  const lead = showForgot
    ? 'We will email you a link to set a new password.'
    : isRegistering
      ? 'Register with your company details to get access.'
      : 'Use your authorized company account.';

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <div className="auth-brand">
          <div className="auth-logo">C</div>
          <div className="auth-brand-name">
            Container CRM
            <span>Sales &amp; Fleet Operations</span>
          </div>
        </div>
        <div className="auth-topbar-note">Authorized access only</div>
      </header>

      <section className="auth-hero">
        <div className="auth-eyebrow">Connected container operations</div>
        <h1 className="auth-title">
          Every container.
          <em>Clearly tracked.</em>
        </h1>
        <p className="auth-sub">
          Quote, dispatch, monitor, and report from one reliable workspace
          built for modern container sales teams.
        </p>
        <div className="auth-points">
          {HERO_POINTS.map(point => (
            <div className="auth-point" key={point}>
              <IconCheck />
              {point}
            </div>
          ))}
        </div>

        <ContainerYard />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-chip">Encrypted session</div>
          <div className="auth-kicker">Container CRM</div>
          <h2 className="auth-h1">{heading}</h2>
          <p className="auth-lead">{lead}</p>

          {error && (
            <div className="auth-alert err" role="alert">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {showForgot ? (
            resetSent ? (
              <>
                <div className="auth-alert ok">
                  <IconCheck />
                  <span>
                    If an account matches that email or username, a password reset link has
                    been sent. Check your inbox.
                  </span>
                </div>
                <div className="auth-foot">
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => { setShowForgot(false); setResetSent(false); setError(''); }}
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleForgotPassword} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="auth-reset-id">Email or username</label>
                  <div className="auth-input-wrap">
                    <IconMail />
                    <input
                      id="auth-reset-id"
                      className="auth-input"
                      type="text"
                      autoComplete="username"
                      placeholder="you@company.com"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                  {!loading && <IconArrow />}
                </button>
                <div className="auth-foot">
                  <button
                    type="button"
                    className="auth-link"
                    onClick={() => { setShowForgot(false); setError(''); }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleAuth} className="auth-form">
                {isRegistering ? (
                  <>
                    <div className="auth-field">
                      <label htmlFor="auth-email">Email address</label>
                      <div className="auth-input-wrap">
                        <IconMail />
                        <input
                          id="auth-email"
                          className="auth-input"
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-username">Username</label>
                      <div className="auth-input-wrap">
                        <IconUser />
                        <input
                          id="auth-username"
                          className="auth-input"
                          type="text"
                          autoComplete="username"
                          placeholder="jdelacruz"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-fullname">
                        Full name <span>Optional</span>
                      </label>
                      <div className="auth-input-wrap">
                        <IconUser />
                        <input
                          id="auth-fullname"
                          className="auth-input"
                          type="text"
                          autoComplete="name"
                          placeholder="Juan Dela Cruz"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="auth-field">
                    <label htmlFor="auth-identifier">Email or username</label>
                    <div className="auth-input-wrap">
                      <IconMail />
                      <input
                        id="auth-identifier"
                        className="auth-input"
                        type="text"
                        autoComplete="username"
                        placeholder="you@company.com"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="auth-field">
                  <label htmlFor="auth-password">
                    Password <span>Case-sensitive</span>
                  </label>
                  <div className="auth-input-wrap">
                    <IconLock />
                    <input
                      id="auth-password"
                      className="auth-input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isRegistering ? 'new-password' : 'current-password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="auth-peek"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <IconEye off={showPassword} />
                    </button>
                  </div>
                </div>

                {!isRegistering && (
                  <div className="auth-row">
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => { setShowForgot(true); setError(''); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? 'Processing…' : isRegistering ? 'Create account' : 'Sign in securely'}
                  {!loading && <IconArrow />}
                </button>
              </form>

              <div className="auth-divider"><span>OR</span></div>

              <button type="button" className="auth-google" onClick={handleGoogle}>
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt=""
                  width={18}
                  height={18}
                />
                Continue with Google
              </button>

              <div className="auth-foot">
                {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
                <button type="button" className="auth-link" onClick={() => setIsRegistering(!isRegistering)}>
                  {isRegistering ? 'Sign in' : 'Register'}
                </button>
              </div>
            </>
          )}

          <div className="auth-secure">
            <IconShield />
            Your session is encrypted and access controlled.
          </div>
        </div>
      </section>
    </div>
  );
}
