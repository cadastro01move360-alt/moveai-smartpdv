import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasSupabase, supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/', { replace: true })
    })
  }, [navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) { setMessage('Supabase não configurado.'); return }
    setLoading(true); setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMessage(error.message); setLoading(false); return }
    navigate('/', { replace: true })
  }

  return <div className="login-page">
    <div className="login-card">
      <div className="login-brand vertical">
        <img src="/move360-logo.png" alt="Move360" className="brand-logo-banner" />
        <div><h1>MoveAI SmartPDV</h1><span>ERP e PDV inteligente para cafeterias, panificadoras e confeitarias.</span></div>
      </div>
      <form onSubmit={submit}>
        <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        {!hasSupabase && <div className="notice">Supabase ainda não configurado.</div>}
        {message && <div className="error-box">{message}</div>}
      </form>
    </div>
  </div>
}
