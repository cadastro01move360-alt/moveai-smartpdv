import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { PageHeader, Badge, StatCard } from '../components/UI'
import { DataTable, ErrorBanner, Field, FormActions, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { useOrganization } from '../lib/useOrganization'

type Supplier = { id:string; name:string; document:string|null; phone:string|null; email:string|null; active:boolean; created_at:string }

export default function Suppliers(){
  const org=useOrganization(); const [suppliers,setSuppliers]=useState<Supplier[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false)
  const load=useCallback(async()=>{ if(!supabase||!org.organization)return; setLoading(true);setError(''); const {data,error:e}=await supabase.from('suppliers').select('id,name,document,phone,email,active,created_at').eq('organization_id',org.organization.id).order('name'); if(e)setError(e.message); setSuppliers((data??[]) as Supplier[]);setLoading(false)},[org.organization])
  useEffect(()=>{load()},[load])
  if(org.loading)return <LoadingPanel/>
  if(!org.organization)return <><PageHeader title="Fornecedores" description="Cadastre fornecedores usados nas compras e apresentações de insumos."/><OrganizationSetup onCreate={org.bootstrap}/></>
  const active=suppliers.filter(s=>s.active).length
  return <>
    <PageHeader title="Fornecedores" description="Centralize dados de contato e mantenha os fornecedores vinculados ao histórico de compras." action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Novo fornecedor</button>}/>
    <ErrorBanner message={error||org.error}/>
    <div className="stats-grid compact-stats"><StatCard label="Fornecedores" value={String(suppliers.length)} helper="Cadastros totais."/><StatCard label="Ativos" value={String(active)} helper="Disponíveis para novas compras."/><StatCard label="Inativos" value={String(suppliers.length-active)} helper="Mantidos para preservar histórico."/><StatCard label="Organização" value={org.organization.name} helper="Dados isolados por empresa."/></div>
    <div className="panel module-panel"><div className="panel-toolbar"><div><h3>Lista de fornecedores</h3><p>Dados de contato usados no fluxo de compras.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {loading?<LoadingPanel text="Carregando fornecedores…"/>:suppliers.length===0?<div className="empty"><div className="empty-icon"><Truck/></div><h3>Nenhum fornecedor cadastrado</h3><p>Cadastre um fornecedor antes de registrar a primeira compra.</p><button className="primary" onClick={()=>setOpen(true)}>Novo fornecedor</button></div>:<DataTable headers={['Fornecedor','Documento','Telefone','E-mail','Status']}>
        {suppliers.map(s=><tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.document||'—'}</td><td>{s.phone||'—'}</td><td>{s.email||'—'}</td><td>{s.active?<Badge tone="success">Ativo</Badge>:<Badge>Inativo</Badge>}</td></tr>)}
      </DataTable>}
    </div>
    {open&&<SupplierModal organizationId={org.organization.id} saving={saving} setSaving={setSaving} onClose={()=>setOpen(false)} onSaved={async()=>{setOpen(false);await load()}}/>}
  </>
}

function SupplierModal({organizationId,saving,setSaving,onClose,onSaved}:{organizationId:string;saving:boolean;setSaving:(v:boolean)=>void;onClose:()=>void;onSaved:()=>void}){
  const [name,setName]=useState('');const [document,setDocument]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');const [error,setError]=useState('')
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setSaving(true);setError('');const {error:e2}=await supabase.from('suppliers').insert({organization_id:organizationId,name:name.trim(),document:document.trim()||null,phone:phone.trim()||null,email:email.trim()||null});if(e2){setError(e2.message);setSaving(false);return}setSaving(false);onSaved()}
  return <Modal title="Novo fornecedor" onClose={onClose}><form onSubmit={submit} className="form-grid two-cols">
    <Field label="Nome / Razão social"><input value={name} onChange={e=>setName(e.target.value)} required/></Field>
    <Field label="CPF / CNPJ"><input value={document} onChange={e=>setDocument(e.target.value)} placeholder="Opcional"/></Field>
    <Field label="Telefone"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(00) 00000-0000"/></Field>
    <Field label="E-mail"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contato@fornecedor.com"/></Field>
    <div className="form-full"><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando…':'Salvar fornecedor'}</button></FormActions></div>
  </form></Modal>
}
