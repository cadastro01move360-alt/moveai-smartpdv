import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
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

if(!supabase){
  throw new Error('Supabase não configurado.')
}
const db=supabase

type Account={
  account_id:string
  organization_id:string
  name:string
  account_type:'caixa'|'banco'|'adquirente'
  institution_name:string|null
  branch:string|null
  account_number:string|null
  pix_key:string|null
  opening_balance:number|string
  current_balance:number|string
  active:boolean
  notes:string|null
  created_at:string
  updated_at:string
}

type Mapping={
  id:string
  method:'pix'|'debito'|'credito'
  account_id:string
}

type Transaction={
  id:string
  account_id:string
  direction:'entrada'|'saida'
  category:string
  amount:number|string
  reference_type:string|null
  occurred_at:string
  description:string|null
}

const n=(v:unknown)=>Number(v??0)
const money=(v:unknown)=>brl.format(n(v))
const dt=(v:string)=>{
  return new Intl.DateTimeFormat('pt-BR',{
    dateStyle:'short',
    timeStyle:'short',
    timeZone:'America/Sao_Paulo'
  }).format(new Date(v))
}
const accountType=(v:string)=>({
  caixa:'Caixa físico',
  banco:'Banco',
  adquirente:'Adquirente'
} as Record<string,string>)[v]||v
const methodLabel=(v:string)=>({
  pix:'PIX',
  debito:'Débito',
  credito:'Crédito'
} as Record<string,string>)[v]||v

export default function Banks(){
  const {organization,loading:orgLoading,error:orgError,bootstrap}=useOrganization()
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [accounts,setAccounts]=useState<Account[]>([])
  const [mappings,setMappings]=useState<Mapping[]>([])
  const [transactions,setTransactions]=useState<Transaction[]>([])

  const [accountModal,setAccountModal]=useState(false)
  const [accountName,setAccountName]=useState('')
  const [accountTypeValue,setAccountTypeValue]=useState<'banco'|'adquirente'>('banco')
  const [institution,setInstitution]=useState('')
  const [branch,setBranch]=useState('')
  const [accountNumber,setAccountNumber]=useState('')
  const [pixKey,setPixKey]=useState('')
  const [openingBalance,setOpeningBalance]=useState('0')
  const [accountNotes,setAccountNotes]=useState('')

  const [movementModal,setMovementModal]=useState(false)
  const [movementAccountId,setMovementAccountId]=useState('')
  const [movementDirection,setMovementDirection]=useState<'entrada'|'saida'>('entrada')
  const [movementAmount,setMovementAmount]=useState('')
  const [movementCategory,setMovementCategory]=useState('ajuste')
  const [movementDescription,setMovementDescription]=useState('')

  const [transferModal,setTransferModal]=useState(false)
  const [sourceAccountId,setSourceAccountId]=useState('')
  const [destinationAccountId,setDestinationAccountId]=useState('')
  const [transferAmount,setTransferAmount]=useState('')
  const [transferDescription,setTransferDescription]=useState('')

  const [mappingModal,setMappingModal]=useState(false)
  const [mappingDraft,setMappingDraft]=useState<Record<string,string>>({
    pix:'',
    debito:'',
    credito:''
  })

  const [saving,setSaving]=useState(false)

  const load=useCallback(async()=>{
    if(!organization?.id)return
    setLoading(true)
    setError('')

    const {data:accountData,error:accountError}=await db
      .from('financial_account_balances')
      .select('account_id,organization_id,name,account_type,institution_name,branch,account_number,pix_key,opening_balance,current_balance,active,notes,created_at,updated_at')
      .eq('organization_id',organization.id)
      .order('created_at',{ascending:true})

    if(accountError){
      setError(accountError.message)
      setLoading(false)
      return
    }

    const acc=(accountData||[]) as Account[]
    setAccounts(acc)

    const {data:mappingData,error:mappingError}=await db
      .from('payment_method_accounts')
      .select('id,method,account_id')
      .eq('organization_id',organization.id)

    if(mappingError)setError(mappingError.message)
    else{
      const rows=(mappingData||[]) as Mapping[]
      setMappings(rows)
      const draft:{[key:string]:string}={pix:'',debito:'',credito:''}
      rows.forEach(r=>{draft[r.method]=r.account_id})
      setMappingDraft(draft)
    }

    const {data:transactionData,error:transactionError}=await db
      .from('financial_transactions')
      .select('id,account_id,direction,category,amount,reference_type,occurred_at,description')
      .eq('organization_id',organization.id)
      .order('occurred_at',{ascending:false})
      .limit(100)

    if(transactionError)setError(transactionError.message)
    else setTransactions((transactionData||[]) as Transaction[])

    setLoading(false)
  },[organization?.id])

  useEffect(()=>{if(organization?.id)void load()},[organization?.id,load])

  const accountMap=useMemo(
    ()=>Object.fromEntries(accounts.map(a=>[a.account_id,a])),
    [accounts]
  )

  const totalBalance=useMemo(
    ()=>accounts.filter(a=>a.active&&a.account_type!=='caixa').reduce((s,a)=>s+n(a.current_balance),0),
    [accounts]
  )
  const bankBalance=useMemo(
    ()=>accounts.filter(a=>a.active&&a.account_type==='banco').reduce((s,a)=>s+n(a.current_balance),0),
    [accounts]
  )
  const acquirerBalance=useMemo(
    ()=>accounts.filter(a=>a.active&&a.account_type==='adquirente').reduce((s,a)=>s+n(a.current_balance),0),
    [accounts]
  )

  async function createAccount(e:FormEvent){
    e.preventDefault()
    if(!organization?.id)return
    setSaving(true);setError('');setSuccess('')

    const opening=Number(String(openingBalance).replace(',','.'))
    if(!Number.isFinite(opening)){
      setError('Informe um saldo inicial válido.')
      setSaving(false)
      return
    }

    const {error:rpcError}=await db.rpc('create_financial_account',{
      p_organization_id:organization.id,
      p_name:accountName.trim(),
      p_account_type:accountTypeValue,
      p_institution_name:institution.trim()||null,
      p_branch:branch.trim()||null,
      p_account_number:accountNumber.trim()||null,
      p_pix_key:pixKey.trim()||null,
      p_opening_balance:opening,
      p_notes:accountNotes.trim()||null
    })

    setSaving(false)
    if(rpcError){setError(rpcError.message);return}

    setAccountModal(false)
    setAccountName('')
    setInstitution('')
    setBranch('')
    setAccountNumber('')
    setPixKey('')
    setOpeningBalance('0')
    setAccountNotes('')
    setSuccess('Conta financeira criada.')
    await load()
  }

  function startMovement(accountId?:string){
    setMovementAccountId(accountId||accounts.find(a=>a.active&&a.account_type!=='caixa')?.account_id||'')
    setMovementDirection('entrada')
    setMovementAmount('')
    setMovementCategory('ajuste')
    setMovementDescription('')
    setMovementModal(true)
  }

  async function saveMovement(e:FormEvent){
    e.preventDefault()
    const amount=Number(String(movementAmount).replace(',','.'))
    if(!movementAccountId||!Number.isFinite(amount)||amount<=0){
      setError('Selecione a conta e informe um valor maior que zero.')
      return
    }
    setSaving(true);setError('');setSuccess('')

    const {error:rpcError}=await db.rpc('register_financial_movement',{
      p_account_id:movementAccountId,
      p_direction:movementDirection,
      p_amount:amount,
      p_category:movementCategory.trim(),
      p_description:movementDescription.trim()||null
    })

    setSaving(false)
    if(rpcError){setError(rpcError.message);return}

    setMovementModal(false)
    setSuccess('Movimentação registrada.')
    await load()
  }

  function startTransfer(){
    const active=accounts.filter(a=>a.active&&a.account_type!=='caixa')
    setSourceAccountId(active[0]?.account_id||'')
    setDestinationAccountId(active[1]?.account_id||'')
    setTransferAmount('')
    setTransferDescription('')
    setTransferModal(true)
  }

  async function saveTransfer(e:FormEvent){
    e.preventDefault()
    const amount=Number(String(transferAmount).replace(',','.'))
    if(!sourceAccountId||!destinationAccountId||sourceAccountId===destinationAccountId){
      setError('Selecione contas de origem e destino diferentes.')
      return
    }
    if(!Number.isFinite(amount)||amount<=0){
      setError('Informe um valor maior que zero.')
      return
    }
    setSaving(true);setError('');setSuccess('')

    const {error:rpcError}=await db.rpc('transfer_between_financial_accounts',{
      p_source_account_id:sourceAccountId,
      p_destination_account_id:destinationAccountId,
      p_amount:amount,
      p_description:transferDescription.trim()||null
    })

    setSaving(false)
    if(rpcError){setError(rpcError.message);return}

    setTransferModal(false)
    setSuccess('Transferência concluída.')
    await load()
  }

  async function saveMappings(e:FormEvent){
    e.preventDefault()
    if(!organization?.id)return

    const entries=(['pix','debito','credito'] as const)
      .filter(method=>Boolean(mappingDraft[method]))

    if(entries.length===0){
      setError('Vincule ao menos uma forma de pagamento.')
      return
    }

    setSaving(true);setError('');setSuccess('')

    for(const method of entries){
      const {error:rpcError}=await db.rpc('set_payment_method_account',{
        p_organization_id:organization.id,
        p_method:method,
        p_account_id:mappingDraft[method],
        p_backfill:true
      })
      if(rpcError){
        setSaving(false)
        setError(rpcError.message)
        return
      }
    }

    setSaving(false)
    setMappingModal(false)
    setSuccess('Regras de recebimento atualizadas. Pagamentos anteriores compatíveis foram integrados.')
    await load()
  }

  if(orgLoading)return <LoadingPanel text="Carregando organização..."/>
  if(!organization)return <OrganizationSetup onCreate={bootstrap}/>

  return <div>
    <PageHeader
      title="Bancos"
      description="Contas financeiras, recebimentos eletrônicos, transferências e extrato consolidado."
    />

    <ErrorBanner message={orgError||error}/>
    {success&&<div className="success-banner">{success}</div>}

    <div className="stats-grid compact-stats">
      <div className="stat-card">
        <small>Saldo total</small>
        <strong>{money(totalBalance)}</strong>
        <span>Somatório das contas ativas.</span>
      </div>
      <div className="stat-card">
        <small>Bancos</small>
        <strong>{money(bankBalance)}</strong>
        <span>Contas bancárias ativas.</span>
      </div>
      <div className="stat-card">
        <small>Adquirentes</small>
        <strong>{money(acquirerBalance)}</strong>
        <span>Cartões e recebíveis.</span>
      </div>
      <div className="stat-card">
        <small>Contas ativas</small>
        <strong>{accounts.filter(a=>a.active&&a.account_type!=='caixa').length}</strong>
        <span>Bancos e adquirentes.</span>
      </div>
    </div>

    <div className="panel" style={{marginTop:12}}>
      <div className="section-head">
        <div>
          <strong>Contas financeiras</strong>
          <p className="cell-helper">Bancos e adquirentes com saldo calculado pelo livro financeiro.</p>
        </div>
        <div className="form-actions" style={{margin:0}}>
          <button className="secondary" onClick={()=>setMappingModal(true)}>Regras do PDV</button>
          <button className="secondary" onClick={startTransfer} disabled={accounts.filter(a=>a.active&&a.account_type!=='caixa').length<2}>Transferir</button>
          <button className="secondary" onClick={()=>startMovement()}>Movimentar</button>
          <button className="primary" onClick={()=>setAccountModal(true)}>+ Nova conta</button>
          <button className="secondary" onClick={()=>void load()}>Atualizar</button>
        </div>
      </div>

      {loading?<LoadingPanel text="Carregando contas..."/>:
        accounts.length===0?<div className="panel-empty">Nenhuma conta financeira cadastrada.</div>:
        <DataTable headers={['Conta','Tipo','Instituição','Identificação','Saldo inicial','Saldo atual','Ações']}>
          {accounts.filter(a=>a.active&&a.account_type!=='caixa').map(a=><tr key={a.account_id}>
            <td><strong>{a.name}</strong>{a.pix_key&&<small className="cell-helper">PIX: {a.pix_key}</small>}</td>
            <td>{accountType(a.account_type)}</td>
            <td>{a.institution_name||'—'}</td>
            <td>{[a.branch,a.account_number].filter(Boolean).join(' / ')||'—'}</td>
            <td>{money(a.opening_balance)}</td>
            <td><strong>{money(a.current_balance)}</strong></td>
            <td><button className="table-action" onClick={()=>startMovement(a.account_id)}>Movimentar</button></td>
          </tr>)}
        </DataTable>
      }
    </div>

    <div className="panel" style={{marginTop:12}}>
      <div className="section-head">
        <div>
          <strong>Regras de recebimento do PDV</strong>
          <p className="cell-helper">Define para qual conta financeira cada recebimento eletrônico será lançado.</p>
        </div>
        <button className="secondary" onClick={()=>setMappingModal(true)}>Configurar</button>
      </div>
      <DataTable headers={['Forma','Conta vinculada']}>
        {(['pix','debito','credito'] as const).map(method=>{
          const mapping=mappings.find(m=>m.method===method)
          return <tr key={method}>
            <td><strong>{methodLabel(method)}</strong></td>
            <td>{mapping?accountMap[mapping.account_id]?.name||'Conta não encontrada':'Não configurado'}</td>
          </tr>
        })}
      </DataTable>
    </div>

    <div className="panel" style={{marginTop:12}}>
      <div className="section-head">
        <div>
          <strong>Extrato financeiro</strong>
          <p className="cell-helper">Últimos 100 lançamentos das contas da organização.</p>
        </div>
      </div>
      {transactions.filter(t=>accountMap[t.account_id]?.account_type!=='caixa').length===0?<div className="panel-empty">Nenhum lançamento financeiro registrado.</div>:
        <DataTable headers={['Data','Conta','Tipo','Categoria','Descrição','Valor']}>
          {transactions.filter(t=>accountMap[t.account_id]?.account_type!=='caixa').map(t=><tr key={t.id}>
            <td>{dt(t.occurred_at)}</td>
            <td>{accountMap[t.account_id]?.name||'Conta'}</td>
            <td>{t.direction==='entrada'?'Entrada':'Saída'}</td>
            <td>{t.category}</td>
            <td>{t.description||'—'}</td>
            <td>{t.direction==='entrada'?'+ ':'− '}{money(t.amount)}</td>
          </tr>)}
        </DataTable>
      }
    </div>

    {accountModal&&<Modal title="Nova conta financeira" onClose={()=>setAccountModal(false)}>
      <form onSubmit={createAccount}>
        <Field label="Nome da conta">
          <input value={accountName} onChange={e=>setAccountName(e.target.value)} placeholder="Ex.: Banco Inter" required/>
        </Field>
        <Field label="Tipo">
          <select value={accountTypeValue} onChange={e=>setAccountTypeValue(e.target.value as 'banco'|'adquirente')}>
            <option value="banco">Banco</option>
            <option value="adquirente">Adquirente / cartões</option>
          </select>
        </Field>
        <Field label="Instituição">
          <input value={institution} onChange={e=>setInstitution(e.target.value)} placeholder="Ex.: Banco Inter, Stone, Cielo"/>
        </Field>
        <Field label="Agência">
          <input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Opcional"/>
        </Field>
        <Field label="Conta / identificação">
          <input value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} placeholder="Ex.: 123456-7"/>
        </Field>
        <Field label="Chave PIX">
          <input value={pixKey} onChange={e=>setPixKey(e.target.value)} placeholder="Opcional"/>
        </Field>
        <Field label="Saldo inicial">
          <input type="number" step="0.01" value={openingBalance} onChange={e=>setOpeningBalance(e.target.value)} required/>
        </Field>
        <Field label="Observações">
          <textarea value={accountNotes} onChange={e=>setAccountNotes(e.target.value)} placeholder="Opcional"/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setAccountModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Salvando...':'Criar conta'}</button>
        </FormActions>
      </form>
    </Modal>}

    {movementModal&&<Modal title="Nova movimentação" onClose={()=>setMovementModal(false)}>
      <form onSubmit={saveMovement}>
        <Field label="Conta">
          <select value={movementAccountId} onChange={e=>setMovementAccountId(e.target.value)} required>
            <option value="">Selecione</option>
            {accounts.filter(a=>a.active&&a.account_type!=='caixa').map(a=><option key={a.account_id} value={a.account_id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select value={movementDirection} onChange={e=>setMovementDirection(e.target.value as 'entrada'|'saida')}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </Field>
        <Field label="Valor">
          <input type="number" min="0.01" step="0.01" value={movementAmount} onChange={e=>setMovementAmount(e.target.value)} required/>
        </Field>
        <Field label="Categoria">
          <input value={movementCategory} onChange={e=>setMovementCategory(e.target.value)} placeholder="Ex.: tarifa, aporte, ajuste" required/>
        </Field>
        <Field label="Descrição">
          <input value={movementDescription} onChange={e=>setMovementDescription(e.target.value)} placeholder="Opcional"/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setMovementModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Salvando...':'Registrar'}</button>
        </FormActions>
      </form>
    </Modal>}

    {transferModal&&<Modal title="Transferir entre contas" onClose={()=>setTransferModal(false)}>
      <form onSubmit={saveTransfer}>
        <Field label="Conta de origem">
          <select value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)} required>
            <option value="">Selecione</option>
            {accounts.filter(a=>a.active&&a.account_type!=='caixa').map(a=><option key={a.account_id} value={a.account_id}>{a.name} • {money(a.current_balance)}</option>)}
          </select>
        </Field>
        <Field label="Conta de destino">
          <select value={destinationAccountId} onChange={e=>setDestinationAccountId(e.target.value)} required>
            <option value="">Selecione</option>
            {accounts.filter(a=>a.active&&a.account_type!=='caixa').map(a=><option key={a.account_id} value={a.account_id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Valor">
          <input type="number" min="0.01" step="0.01" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)} required/>
        </Field>
        <Field label="Descrição">
          <input value={transferDescription} onChange={e=>setTransferDescription(e.target.value)} placeholder="Ex.: transferência para conta principal"/>
        </Field>
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setTransferModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Transferindo...':'Transferir'}</button>
        </FormActions>
      </form>
    </Modal>}

    {mappingModal&&<Modal title="Regras de recebimento do PDV" onClose={()=>setMappingModal(false)} wide>
      <form onSubmit={saveMappings}>
        <p className="cell-helper" style={{marginBottom:12}}>
          Ao salvar, pagamentos anteriores compatíveis também serão lançados nas contas escolhidas, sem duplicar movimentos já integrados.
        </p>
        {(['pix','debito','credito'] as const).map(method=><Field key={method} label={methodLabel(method)}>
          <select value={mappingDraft[method]} onChange={e=>setMappingDraft(v=>({...v,[method]:e.target.value}))}>
            <option value="">Não vinculado</option>
            {accounts.filter(a=>a.active&&a.account_type!=='caixa').map(a=><option key={a.account_id} value={a.account_id}>{a.name} • {accountType(a.account_type)}</option>)}
          </select>
        </Field>)}
        <FormActions>
          <button type="button" className="secondary" onClick={()=>setMappingModal(false)}>Cancelar</button>
          <button className="primary" disabled={saving}>{saving?'Salvando...':'Salvar regras'}</button>
        </FormActions>
      </form>
    </Modal>}
  </div>
}
