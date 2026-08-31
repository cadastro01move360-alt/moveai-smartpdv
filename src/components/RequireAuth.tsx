import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { hasSupabase, supabase } from '../lib/supabase'

export function RequireAuth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (!hasSupabase) return <>{children}</>
  if (loading) return <div className="login-page"><div className="login-card">Carregando sessão…</div></div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
