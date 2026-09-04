import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from './config/supabase'
import { api } from './lib/api'
import { ToastHost } from './lib/notify'
import Login from './Login'
import AppShell from './app/AppShell'

const ResetPassword = lazy(() => import('./features/settings/ResetPassword'))

export default function App() {

  const [session, setSession] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<{ role?: string } | null>(null)

  useEffect(() => {
    if (!session) { setCurrentProfile(null); return }
    api.get('/auth/me').then(res => {
      const p = res.data.data
      setCurrentProfile(p)
    }).catch(console.error)
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
      setAuthChecking(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Clicking a "reset password" email link redirects back here with a temporary session
      // and this event -- show the set-new-password screen instead of dropping the user
      // straight into the app on whatever page they land on.
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
      setSession(session)
      if (session?.provider_refresh_token && session?.user) {
        api.post('/auth/google/sync-provider', {
          refresh_token: session.provider_refresh_token,
          email: session.user.email
        }).catch(console.error);
      }
    })

    return () => subscription.unsubscribe()
  }, [])


  if (authChecking) return null;
  if (isPasswordRecovery) return (
    <>
      <Suspense fallback={<div className="loading-row"><span className="spinner" />Loading…</div>}>
        <ResetPassword onDone={() => setIsPasswordRecovery(false)} />
      </Suspense>
      <ToastHost />
    </>
  );
  if (!session) return <><Login onLogin={() => {}} /><ToastHost /></>;

  return <AppShell session={session} currentProfile={currentProfile} />
}
