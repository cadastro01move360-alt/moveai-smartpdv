import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrganization } from '../lib/useOrganization'
import { brl, dateBR } from '../lib/format'
import { ErrorBanner, Field, FormActions, LoadingPanel, Modal } from '../components/OperationalUI'
import { PageHeader } from '../components/UI'

type TitleRow = {
  id:string
  organization_id:string
  title_type:'pagar'|'receber'
  description:string
  category:string
  counterparty_name:string|null
  document_number:string|null
  issue_date:string
  due_date:string
  original_amount:number|string
  settled_amount:number|string
  open_amount:number|string
  display_status:'aberto'|'parcial'|'quitado'|'vencido'|'cancelado'
  notes:string|null
}

type Account = {
  account_id:string
  name:string
  account_type:'caixa'|'banco'|'adquirente'
  active:boolean
  current_balance:number|string
}

const n=(v:unknown)=>Number(v||0)

function badge(status:TitleRow['display_status']){
  const label:{[k:string]:string}={
    aberto:'Aberto',parcial:'Parcial',quitado:'Quitado',vencido:'Vencido',cancelado:'Cancelado'
  }
  return <span className={`status-badge status-${status}`}>{label[status]||status}</span>
}

if(!supabase){
  throw new Error('Supabase não configurado.')
}
const db=supabase

export default function Finance(){
  const org=useOrganization()

  const [titles,setTitles]=useState<TitleRow[]>([])
  const [accounts,setAccounts]=useState<Account[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [filter,setFilter]=useState<'todos'|'pagar'|'receber'|'vencido'>('todos')
  const [newOpen,setNewOpen]=useState(false)
  const [settleTitle,setSettleTitle]=useState<TitleRow|null>(null)
  const [editTitle,setEditTitle]=useState<TitleRow|null>(null)

  async function load(){
    if(!org.organization?.id)return
    setLoading(true);setError('')
    const [{data:t,error:te},{data:a,error:ae}]=await Promise.all([
      db.from('financial_titles_summary')
        .select('*')
        .eq('organization_id',org.organization.id)
        .order('due_date',{ascending:true})
        .order('created_at',{ascending:false}),
      db.from('financial_account_balances')
        .select('account_id,name,account_type,active,current_balance')
        .eq('organization_id',org.organization.id)
        .eq('active',true)
        .order('name')
    ])
    if(te||ae)setError(te?.message||ae?.message||'Erro ao carregar Financeiro.')
    setTitles((t||[]) as TitleRow[])
    setAccounts((a||[]) as Account[])
    setLoading(false)
  }

  useEffect(()=>{if(org.organization?.id)load()},[org.organization?.id])

  const visible=useMemo(()=>{
    if(filter==='todos')return titles
    if(filter==='vencido')return titles.filter(t=>t.display_status==='vencido')
    return titles.filter(t=>t.title_type===filter)
  },[titles,filter])

  const payable=useMemo(()=>titles.filter(t=>t.title_type==='pagar'&&!['quitado','cancelado'].includes(t.display_status)).reduce((s,t)=>s+n(t.open_amount),0),[titles])
  const receivable=useMemo(()=>titles.filter(t=>t.title_type==='receber'&&!['quitado','cancelado'].includes(t.display_status)).reduce((s,t)=>s+n(t.open_amount),0),[titles])
  const overdue=useMemo(()=>titles.filter(t=>t.display_status==='vencido').reduce((s,t)=>s+n(t.open_amount),0),[titles])
  const projected=receivable-payable

  if(org.loading||loading)return <LoadingPanel text="Carregando financeiro..." />

  return <div className="page">
    <PageHeader title="Financeiro" description="Contas a pagar e receber, vencimentos, baixas e integração com Bancos." />

    <ErrorBanner message={error}/>

    <div className="stats-grid">
      <div className="stat-card"><span>Contas a pagar</span><strong>{brl.format(payable)}</strong><small>Saldo em aberto.</small></div>
      <div className="stat-card"><span>Contas a receber</span><strong>{brl.format(receivable)}</strong><small>Saldo pendente de recebimento.</small></div>
      <div className="stat-card"><span>Vencidos</span><strong>{brl.format(overdue)}</strong><small>Títulos vencidos e não quitados.</small></div>
      <div className="stat-card"><span>Posição projetada</span><strong>{brl.format(projected)}</strong><small>Receber menos pagar.</small></div>
    </div>

    <div className="panel">
      <div className="panel-head">
        <div><h3>Agenda financeira</h3><p>Compras futuras podem gerar contas a pagar automaticamente quando confirmadas.</p></div>
        <div className="panel-actions">
          <button className="secondary" onClick={load}>Atualizar</button>
          <button className="primary" onClick={()=>setNewOpen(true)}>+ Novo lançamento</button>
        </div>
      </div>

      <div className="filter-row">
        {(['todos','pagar','receber','vencido'] as const).map(f=>
          <button key={f} className={filter===f?'filter-chip active':'filter-chip'} onClick={()=>setFilter(f)}>
            {f==='todos'?'Todos':f==='pagar'?'A pagar':f==='receber'?'A receber':'Vencidos'}
          </button>
        )}
      </div>

      {visible.length===0
        ? <div className="panel-empty">Nenhum título financeiro neste filtro.</div>
        : <div className="table-wrap"><table className="data-table">
            <thead><tr>
              <th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Original</th><th>Baixado</th><th>Em aberto</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {visible.map(t=><tr key={t.id}>
                <td>{t.title_type==='pagar'?'Pagar':'Receber'}</td>
                <td><strong>{t.description}</strong><small className="cell-helper">{t.counterparty_name||t.document_number||t.category}</small></td>
                <td>{dateBR(t.due_date)}</td>
                <td>{brl.format(n(t.original_amount))}</td>
                <td>{brl.format(n(t.settled_amount))}</td>
                <td>{brl.format(n(t.open_amount))}</td>
                <td>{badge(t.display_status)}</td>
                <td>
                  <div className="table-actions">
                    {!['quitado','cancelado'].includes(t.display_status)&&
                      <button className="table-action" onClick={()=>setSettleTitle(t)}>Baixar</button>}
                    {t.display_status!=='cancelado'&&
                      <button className="table-action" onClick={()=>setEditTitle(t)}>Editar</button>}
                    {['quitado','cancelado'].includes(t.display_status)&&t.display_status==='cancelado'&&
                      <span className="cell-helper">—</span>}
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table></div>
      }
    </div>

    {newOpen&&<NewTitleModal
      orgId={org.organization!.id}
      db={db}
      onClose={()=>setNewOpen(false)}
      onSaved={async()=>{setNewOpen(false);await load()}}
    />}

    {editTitle&&<EditTitleModal
      title={editTitle}
      db={db}
      onClose={()=>setEditTitle(null)}
      onSaved={async()=>{setEditTitle(null);await load()}}
    />}

    {settleTitle&&<SettleModal
      title={settleTitle}
      accounts={accounts.filter(a=>a.account_type!=='caixa')}
      db={db}
      onClose={()=>setSettleTitle(null)}
      onSaved={async()=>{setSettleTitle(null);await load()}}
    />}
  </div>
}

function NewTitleModal({orgId,db,onClose,onSaved}:{orgId:string;db:any;onClose:()=>void;onSaved:()=>void}){
  const [type,setType]=useState<'pagar'|'receber'>('pagar')
  const [description,setDescription]=useState('')
  const [category,setCategory]=useState('geral')
  const [counterparty,setCounterparty]=useState('')
  const [documentNumber,setDocumentNumber]=useState('')
  const [issueDate,setIssueDate]=useState(new Date().toISOString().slice(0,10))
  const [dueDate,setDueDate]=useState(new Date().toISOString().slice(0,10))
  const [amount,setAmount]=useState('')
  const [notes,setNotes]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function submit(e:React.FormEvent){
    e.preventDefault()
    setSaving(true);setError('')
    const value=Number(String(amount).replace(',','.'))
    const {error:rpcError}=await db.rpc('create_financial_title',{
      p_organization_id:orgId,
      p_title_type:type,
      p_description:description,
      p_category:category,
      p_counterparty_name:counterparty||null,
      p_document_number:documentNumber||null,
      p_issue_date:issueDate,
      p_due_date:dueDate,
      p_original_amount:value,
      p_notes:notes||null
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    onSaved()
  }

  return <Modal title="Novo lançamento financeiro" onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Tipo"><select value={type} onChange={e=>setType(e.target.value as any)}><option value="pagar">Conta a pagar</option><option value="receber">Conta a receber</option></select></Field>
        <Field label="Categoria"><input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: aluguel, energia, cliente"/></Field>
        <Field label="Descrição"><input value={description} onChange={e=>setDescription(e.target.value)} required placeholder="Ex.: Aluguel setembro"/></Field>
        <Field label="Fornecedor / cliente"><input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Opcional"/></Field>
        <Field label="Documento"><input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)} placeholder="NF, boleto, referência"/></Field>
        <Field label="Valor"><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required placeholder="0,00"/></Field>
        <Field label="Emissão"><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} required/></Field>
        <Field label="Vencimento"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></Field>
      </div>
      <Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></Field>
      <ErrorBanner message={error}/>
      <FormActions><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando...':'Criar lançamento'}</button></FormActions>
    </form>
  </Modal>
}


function EditTitleModal({title,db,onClose,onSaved}:{title:TitleRow;db:any;onClose:()=>void;onSaved:()=>void}){
  const [description,setDescription]=useState(title.description)
  const [category,setCategory]=useState(title.category)
  const [counterparty,setCounterparty]=useState(title.counterparty_name||'')
  const [documentNumber,setDocumentNumber]=useState(title.document_number||'')
  const [issueDate,setIssueDate]=useState(title.issue_date)
  const [dueDate,setDueDate]=useState(title.due_date)
  const [notes,setNotes]=useState(title.notes||'')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function submit(e:React.FormEvent){
    e.preventDefault()
    setSaving(true);setError('')
    const {error:rpcError}=await db.rpc('update_financial_title',{
      p_title_id:title.id,
      p_description:description,
      p_category:category,
      p_counterparty_name:counterparty||null,
      p_document_number:documentNumber||null,
      p_issue_date:issueDate,
      p_due_date:dueDate,
      p_notes:notes||null
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    onSaved()
  }

  return <Modal title="Editar lançamento financeiro" onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="form-grid two">
        <Field label="Descrição"><input value={description} onChange={e=>setDescription(e.target.value)} required/></Field>
        <Field label="Categoria"><input value={category} onChange={e=>setCategory(e.target.value)}/></Field>
        <Field label="Fornecedor / cliente"><input value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></Field>
        <Field label="Documento"><input value={documentNumber} onChange={e=>setDocumentNumber(e.target.value)}/></Field>
        <Field label="Emissão"><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} required/></Field>
        <Field label="Vencimento"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></Field>
      </div>
      <Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></Field>
      <ErrorBanner message={error}/>
      <FormActions><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button></FormActions>
    </form>
  </Modal>
}

function SettleModal({title,accounts,db,onClose,onSaved}:{title:TitleRow;accounts:Account[];db:any;onClose:()=>void;onSaved:()=>void}){
  const [accountId,setAccountId]=useState(accounts[0]?.account_id||'')
  const [amount,setAmount]=useState(String(n(title.open_amount).toFixed(2)).replace('.',','))
  const [notes,setNotes]=useState('')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  async function submit(e:React.FormEvent){
    e.preventDefault()
    setSaving(true);setError('')
    const value=Number(String(amount).replace(',','.'))
    const {error:rpcError}=await db.rpc('settle_financial_title',{
      p_title_id:title.id,
      p_account_id:accountId,
      p_amount:value,
      p_notes:notes||null
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    onSaved()
  }

  return <Modal title={title.title_type==='pagar'?'Baixar conta a pagar':'Receber conta'} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="checkout-total"><span>Saldo em aberto</span><strong>{brl.format(n(title.open_amount))}</strong></div>
      <Field label="Conta financeira" hint="Caixa físico fica no módulo Caixa.">
        <select value={accountId} onChange={e=>setAccountId(e.target.value)} required>
          <option value="">Selecione...</option>
          {accounts.map(a=><option key={a.account_id} value={a.account_id}>{a.name} · {brl.format(n(a.current_balance))}</option>)}
        </select>
      </Field>
      <Field label="Valor da baixa"><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" required/></Field>
      <Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></Field>
      <ErrorBanner message={error}/>
      <FormActions><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving||!accountId}>{saving?'Processando...':'Confirmar baixa'}</button></FormActions>
    </form>
  </Modal>
}
