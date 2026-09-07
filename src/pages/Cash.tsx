import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

if (!supabase) {
  throw new Error('Supabase não configurado.')
}

const db = supabase
import { brl } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'
import {
  DataTable,
  ErrorBanner,
  Field,
  FormActions,
  LoadingPanel,
  Modal,
  OrganizationSetup,
} from '../components/OperationalUI'
import { PageHeader } from '../components/UI'

type CashSession = {
  id:string
  organization_id:string
  operator_id:string
  opening_amount:number|string
  status:'aberta'|'fechada'
  opened_at:string
  closed_at:string|null
  closing_amount:number|string|null
  expected_amount:number|string|null
  difference_amount:number|string|null
  closing_notes:string|null
}

type Summary = {
  session_id:string
  status:string
  operator_id:string
  opened_at:string
  closed_at:string|null
  opening_amount:number
  cash_sales:number
  pix_sales:number
  debit_sales:number
  credit_sales:number
  other_sales:number
  total_sales:number
  supplies:number
  withdrawals:number
  expected_cash:number
  counted_amount:number|null
  difference_amount:number|null
  closing_notes:string|null
}

type Movement = {
  id:string
  direction:'entrada'|'saida'
  category:string
  amount:number|string
  occurred_at:string
}

const num=(v:unknown)=>Number(v ?? 0)
const money=(v:unknown)=>brl.format(num(v))
const dt=(value:string|null)=>{
  if(!value)return '—'
  return new Intl.DateTimeFormat('pt-BR',{
    dateStyle:'short',
    timeStyle:'short',
    timeZone:'America/Sao_Paulo'
  }).format(new Date(value))
}

function normalizeSummary(data:unknown):Summary|null{
  if(!data)return null
  const raw=Array.isArray(data)?data[0]:data
  if(typeof raw==='string'){
    try{return JSON.parse(raw) as Summary}catch{return null}
  }
  return raw as Summary
}

export default function Cash(){
  const {organization,loading:orgLoading,error:orgError,bootstrap}=useOrganization()
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [session,setSession]=useState<CashSession|null>(null)
  const [summary,setSummary]=useState<Summary|null>(null)
  const [history,setHistory]=useState<CashSession[]>([])
  const [movements,setMovements]=useState<Movement[]>([])
  const [operatorId,setOperatorId]=useState<string|null>(null)

  const [openModal,setOpenModal]=useState(false)
  const [openingAmount,setOpeningAmount]=useState('0')
  const [saving,setSaving]=useState(false)

  const [movementModal,setMovementModal]=useState(false)
  const [movementDirection,setMovementDirection]=useState<'entrada'|'saida'>('entrada')
  const [movementAmount,setMovementAmount]=useState('')
  const [movementReason,setMovementReason]=useState('')

  const [closeModal,setCloseModal]=useState(false)
  const [countedAmount,setCountedAmount]=useState('')
  const [closingNotes,setClosingNotes]=useState('')

  const load=useCallback(async()=>{
    if(!organization?.id)return
    setLoading(true)
    setError('')

    const {data:userData,error:userError}=await db.auth.getUser()
    if(userError||!userData.user){
      setError(userError?.message||'Usuário não autenticado.')
      setLoading(false)
      return
    }

    const userId=userData.user.id
    setOperatorId(userId)

    const {data:openData,error:openError}=await db
      .from('cash_sessions')
      .select('id,organization_id,operator_id,opening_amount,status,opened_at,closed_at,closing_amount,expected_amount,difference_amount,closing_notes')
      .eq('organization_id',organization.id)
      .eq('operator_id',userId)
      .eq('status','aberta')
      .order('opened_at',{ascending:false})
      .limit(1)
      .maybeSingle()

    if(openError){
      setError(openError.message)
      setLoading(false)
      return
    }

    const current=(openData||null) as CashSession|null
    setSession(current)

    if(current){
      const {data:summaryData,error:summaryError}=await db.rpc(
        'cash_session_summary',
        {p_cash_session_id:current.id}
      )
      if(summaryError)setError(summaryError.message)
      else setSummary(normalizeSummary(summaryData))

      const {data:movementData,error:movementError}=await db
        .from('financial_transactions')
        .select('id,direction,category,amount,occurred_at')
        .eq('organization_id',organization.id)
        .eq('reference_type','cash_session')
        .eq('reference_id',current.id)
        .order('occurred_at',{ascending:false})

      if(movementError)setError(movementError.message)
      else setMovements((movementData||[]) as Movement[])
    }else{
      setSummary(null)
      setMovements([])
    }

    const {data:historyData,error:historyError}=await db
      .from('cash_sessions')
      .select('id,organization_id,operator_id,opening_amount,status,opened_at,closed_at,closing_amount,expected_amount,difference_amount,closing_notes')
      .eq('organization_id',organization.id)
      .eq('operator_id',userId)
      .order('opened_at',{ascending:false})
      .limit(20)

    if(historyError)setError(historyError.message)
    else setHistory((historyData||[]) as CashSession[])

    setLoading(false)
  },[organization?.id])

  useEffect(()=>{if(organization?.id)void load()},[organization?.id,load])

  async function openCash(e:FormEvent){
    e.preventDefault()
    if(!organization?.id)return
    setSaving(true);setError('');setSuccess('')
    const amount=Number(String(openingAmount).replace(',','.'))
    if(!Number.isFinite(amount)||amount<0){
      setError('Informe um valor de abertura válido.')
      setSaving(false)
      return
    }
    const {error:rpcError}=await db.rpc('open_cash_session',{
      p_organization_id:organization.id,
      p_opening_amount:amount
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    setOpenModal(false)
    setSuccess(`Caixa aberto com ${money(amount)}.`)
    await load()
  }

  function startMovement(direction:'entrada'|'saida'){
    setMovementDirection(direction)
    setMovementAmount('')
    setMovementReason('')
    setMovementModal(true)
  }

  async function saveMovement(e:FormEvent){
    e.preventDefault()
    if(!session)return
    setSaving(true);setError('');setSuccess('')
    const amount=Number(String(movementAmount).replace(',','.'))
    if(!Number.isFinite(amount)||amount<=0){
      setError('Informe um valor maior que zero.')
      setSaving(false)
      return
    }
    const {error:rpcError}=await db.rpc('register_cash_movement',{
      p_cash_session_id:session.id,
      p_direction:movementDirection,
      p_amount:amount,
      p_reason:movementReason.trim()
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    setMovementModal(false)
    setSuccess(
      movementDirection==='entrada'
        ? `Suprimento de ${money(amount)} registrado.`
        : `Sangria de ${money(amount)} registrada.`
    )
    await load()
  }

  function startClose(){
    setCountedAmount(summary?String(num(summary.expected_cash).toFixed(2)):'')
    setClosingNotes('')
    setCloseModal(true)
  }

  async function closeCash(e:FormEvent){
    e.preventDefault()
    if(!session)return
    setSaving(true);setError('');setSuccess('')
    const counted=Number(String(countedAmount).replace(',','.'))
    if(!Number.isFinite(counted)||counted<0){
      setError('Informe o valor contado no caixa.')
      setSaving(false)
      return
    }
    const {data,error:rpcError}=await db.rpc('close_cash_session',{
      p_cash_session_id:session.id,
      p_counted_amount:counted,
      p_notes:closingNotes.trim()||null
    })
    setSaving(false)
    if(rpcError){setError(rpcError.message);return}
    const result=normalizeSummary(data)
    setCloseModal(false)
    setSuccess(
      result
        ? `Caixa fechado. Esperado ${money(result.expected_cash)} • Contado ${money(result.counted_amount)} • Diferença ${money(result.difference_amount)}.`
        : 'Caixa fechado com sucesso.'
    )
    await load()
  }

  const differenceClass=useMemo(()=>{
    if(!summary||summary.difference_amount===null)return ''
    const d=num(summary.difference_amount)
    return d===0?'success-text':d<0?'danger-text':'warning-text'
  },[summary])

  if(orgLoading)return <LoadingPanel text="Carregando organização..." />
  if(!organization)return <OrganizationSetup onCreate={bootstrap}/>

  return <div>
    <PageHeader
      title="Caixa"
      description="Abertura, recebimentos do PDV, suprimentos, sangrias e fechamento com conferência."
    />

    <ErrorBanner message={orgError||error}/>
    {success&&<div className="success-banner">{success}</div>}

    {loading?<LoadingPanel text="Carregando caixa..."/>:!session?<>
      <div className="panel">
        <div className="panel-empty">
          <strong>Caixa fechado</strong>
          <p>Abra uma sessão para começar a controlar o numerário e os recebimentos do PDV.</p>
          <button className="primary" onClick={()=>setOpenModal(true)}>Abrir caixa</button>
        </div>
      </div>
    </>:<>
      <div className="stats-grid compact-stats">
        <div className="stat-card">
          <small>Fundo inicial</small>
          <strong>{money(summary?.opening_amount)}</strong>
          <span>Aberto em {dt(session.opened_at)}</span>
        </div>
        <div className="stat-card">
          <small>Vendas em dinheiro</small>
          <strong>{money(summary?.cash_sales)}</strong>
          <span>Entram no caixa físico.</span>
        </div>
        <div className="stat-card">
          <small>Saldo esperado</small>
          <strong>{money(summary?.expected_cash)}</strong>
          <span>Abertura + dinheiro + suprimentos − sangrias.</span>
        </div>
        <div className="stat-card">
          <small>Vendas totais da sessão</small>
          <strong>{money(summary?.total_sales)}</strong>
          <span>Todas as formas de pagamento.</span>
        </div>
      </div>

      <div className="panel" style={{marginTop:12}}>
        <div className="section-head">
          <div>
            <strong>Sessão aberta</strong>
            <p className="cell-helper">Operador atual • {dt(session.opened_at)}</p>
          </div>
          <div className="form-actions" style={{margin:0}}>
            <button className="secondary" onClick={()=>startMovement('entrada')}>+ Suprimento</button>
            <button className="secondary" onClick={()=>startMovement('saida')}>− Sangria</button>
            <button className="primary" onClick={startClose}>Fechar caixa</button>
            <button className="secondary" onClick={()=>void load()}>Atualizar</button>
          </div>
        </div>

        <div className="stats-grid compact-stats" style={{marginTop:12}}>
          <div className="stat-card"><small>PIX</small><strong>{money(summary?.pix_sales)}</strong><span>Recebimento eletrônico.</span></div>
          <div className="stat-card"><small>Débito</small><strong>{money(summary?.debit_sales)}</strong><span>Não compõe numerário físico.</span></div>
          <div className="stat-card"><small>Crédito</small><strong>{money(summary?.credit_sales)}</strong><span>Não compõe numerário físico.</span></div>
          <div className="stat-card"><small>Outros</small><strong>{money(summary?.other_sales)}</strong><span>Demais métodos registrados.</span></div>
        </div>

        <div className="stats-grid compact-stats" style={{marginTop:12}}>
          <div className="stat-card"><small>Suprimentos</small><strong>{money(summary?.supplies)}</strong><span>Entradas manuais no caixa.</span></div>
          <div className="stat-card"><small>Sangrias</small><strong>{money(summary?.withdrawals)}</strong><span>Retiradas manuais do caixa.</span></div>
        </div>
      </div>

      <div className="panel" style={{marginTop:12}}>
        <div className="section-head">
          <div>
            <strong>Movimentações manuais</strong>
            <p className="cell-helper">Suprimentos e sangrias vinculados à sessão atual.</p>
          </div>
        </div>
        {movements.length===0
          ?<div className="panel-empty">Nenhuma movimentação manual nesta sessão.</div>
          :<DataTable headers={['Data','Tipo','Valor']}>
            {movements.map(m=><tr key={m.id}>
              <td>{dt(m.occurred_at)}</td>
              <td><strong>{m.category==='suprimento'?'Suprimento':'Sangria'}</strong></td>
              <td>{m.direction==='entrada'?'+ ':'− '}{money(m.amount)}</td>
            </tr>)}
          </DataTable>
        }
      </div>
    </>}

    <div className="panel" style={{marginTop:12}}>
      <div className="section-head">
        <div>
          <strong>Histórico de caixas</strong>
          <p className="cell-helper">Últimas sessões do operador autenticado.</p>
        </div>
      </div>
      {history.length===0
        ?<div className="panel-empty">Nenhuma sessão registrada ainda.</div>
        :<DataTable headers={['Abertura','Fechamento','Inicial','Esperado','Contado','Diferença','Status']}>
          {history.map(h=><tr key={h.id}>
            <td>{dt(h.opened_at)}</td>
            <td>{dt(h.closed_at)}</td>
            <td>{money(h.opening_amount)}</td>
            <td>{h.expected_amount===null?'—':money(h.expected_amount)}</td>
            <td>{h.closing_amount===null?'—':money(h.closing_amount)}</td>
            <td>{h.difference_amount===null?'—':money(h.difference_amount)}</td>
            <td><strong>{h.status==='aberta'?'Aberto':'Fechado'}</strong></td>
          </tr>)}
        </DataTable>
      }
    </div>

    {openModal&&<Modal title="Abrir caixa" onClose={()=>setOpenModal(false)}>
      <form onSubmit={openCash}>
        <Field label="Fundo inicial" hint="Valor em dinheiro disponível no caixa no momento da abertura.">
          <input type="number" min="0" step="0.01" value={openingAmount} onChange={e=>setOpeningAmount(e.target.value)} required/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setOpenModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Abrindo...':'Abrir caixa'}</button>
        </FormActions>
      </form>
    </Modal>}

    {movementModal&&<Modal title={movementDirection==='entrada'?'Novo suprimento':'Nova sangria'} onClose={()=>setMovementModal(false)}>
      <form onSubmit={saveMovement}>
        <Field label="Valor">
          <input type="number" min="0.01" step="0.01" value={movementAmount} onChange={e=>setMovementAmount(e.target.value)} required/>
        </Field>
        <Field label="Motivo" hint="Obrigatório para manter a movimentação auditável.">
          <input value={movementReason} onChange={e=>setMovementReason(e.target.value)} placeholder={movementDirection==='entrada'?'Ex.: reforço de troco':'Ex.: depósito no banco'} required/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setMovementModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Salvando...':'Registrar'}</button>
        </FormActions>
      </form>
    </Modal>}

    {closeModal&&<Modal title="Fechar caixa" onClose={()=>setCloseModal(false)}>
      <form onSubmit={closeCash}>
        <div className="panel" style={{marginBottom:12}}>
          <small>Saldo esperado em dinheiro</small>
          <h2>{money(summary?.expected_cash)}</h2>
          <p className="cell-helper">Informe abaixo quanto foi contado fisicamente.</p>
        </div>
        <Field label="Valor contado">
          <input type="number" min="0" step="0.01" value={countedAmount} onChange={e=>setCountedAmount(e.target.value)} required/>
        </Field>
        <Field label="Observações" hint="Opcional. Use para justificar diferenças ou registrar ocorrências.">
          <textarea value={closingNotes} onChange={e=>setClosingNotes(e.target.value)} placeholder="Ex.: diferença de troco, valor reservado para depósito..."/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setCloseModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Fechando...':'Confirmar fechamento'}</button>
        </FormActions>
      </form>
    </Modal>}
  </div>
}
