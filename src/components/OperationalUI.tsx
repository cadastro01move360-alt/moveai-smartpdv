import { FormEvent, ReactNode, useState } from 'react'
import { Building2, X } from 'lucide-react'

export function Modal({title, children, onClose, wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className={wide ? 'modal-card wide' : 'modal-card'} role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}>
      <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div>
      {children}
    </div>
  </div>
}

export function Field({label, children, hint}:{label:string;children:ReactNode;hint?:string}) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function FormActions({children}:{children:ReactNode}) { return <div className="form-actions">{children}</div> }

export function DataTable({headers, children}:{headers:string[];children:ReactNode}) {
  return <div className="table-wrap"><table className="data-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

export function LoadingPanel({text='Carregando dados…'}:{text?:string}) { return <div className="panel loading-panel">{text}</div> }

export function ErrorBanner({message}:{message:string}) { return message ? <div className="error-banner">{message}</div> : null }

export function OrganizationSetup({onCreate}:{onCreate:(name:string)=>Promise<{error:string}>}) {
  const [name,setName] = useState('Move360')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  async function submit(e:FormEvent){
    e.preventDefault(); setLoading(true); setError('')
    const result = await onCreate(name)
    if(result.error) setError(result.error)
    setLoading(false)
  }
  return <div className="setup-card panel">
    <div className="setup-icon"><Building2/></div>
    <div><h3>Configure a primeira empresa</h3><p>Seu usuário está autenticado, mas ainda não pertence a uma organização do SmartPDV. Essa configuração cria a empresa, unidades padrão e o estoque principal.</p></div>
    <form onSubmit={submit} className="setup-form">
      <Field label="Nome da empresa"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Minha Cafeteria" required /></Field>
      {error && <ErrorBanner message={error}/>}<button className="primary" disabled={loading}>{loading?'Configurando…':'Criar empresa'}</button>
    </form>
  </div>
}
