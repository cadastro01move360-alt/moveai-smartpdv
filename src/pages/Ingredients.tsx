import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, PackagePlus, Plus } from 'lucide-react'
import { Badge, PageHeader, StatCard } from '../components/UI'
import { DataTable, ErrorBanner, Field, FormActions, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { numberBR, brl } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type Ingredient = { id:string; name:string; category:string|null; base_unit_id:string; minimum_stock:number; controls_expiry:boolean; active:boolean }
type StockSummary = { ingredient_base_id:string; available_quantity:number; stock_value:number; average_cost:number; unit_symbol:string|null }
type Supplier = { id:string; name:string }
type Presentation = { id:string; ingredient_base_id:string; label:string|null }

export default function Ingredients(){
  const org = useOrganization()
  const [ingredients,setIngredients] = useState<Ingredient[]>([])
  const [summaries,setSummaries] = useState<StockSummary[]>([])
  const [suppliers,setSuppliers] = useState<Supplier[]>([])
  const [presentations,setPresentations] = useState<Presentation[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [newOpen,setNewOpen] = useState(false)
  const [presentationIngredient,setPresentationIngredient] = useState<Ingredient|null>(null)
  const [saving,setSaving] = useState(false)

  const load = useCallback(async()=>{
    if(!supabase || !org.organization) return
    setLoading(true); setError('')
    const orgId = org.organization.id
    const [ingredientResult, summaryResult, supplierResult, presentationResult] = await Promise.all([
      supabase.from('ingredient_bases').select('id,name,category,base_unit_id,minimum_stock,controls_expiry,active').eq('organization_id',orgId).eq('active',true).order('name'),
      supabase.from('ingredient_stock_summary').select('ingredient_base_id,available_quantity,stock_value,average_cost,unit_symbol').eq('organization_id',orgId),
      supabase.from('suppliers').select('id,name').eq('organization_id',orgId).eq('active',true).order('name'),
      supabase.from('ingredient_presentations').select('id,ingredient_base_id,label').eq('organization_id',orgId).eq('active',true),
    ])
    const firstError = ingredientResult.error || summaryResult.error || supplierResult.error || presentationResult.error
    if(firstError) setError(firstError.message)
    setIngredients((ingredientResult.data ?? []) as Ingredient[])
    setSummaries((summaryResult.data ?? []) as StockSummary[])
    setSuppliers((supplierResult.data ?? []) as Supplier[])
    setPresentations((presentationResult.data ?? []) as Presentation[])
    setLoading(false)
  },[org.organization])

  useEffect(()=>{ load() },[load])

  const summaryMap = useMemo(()=>new Map(summaries.map(s=>[s.ingredient_base_id,s])),[summaries])
  const presentationCount = useMemo(()=>{
    const map = new Map<string,number>()
    for(const p of presentations) map.set(p.ingredient_base_id,(map.get(p.ingredient_base_id)??0)+1)
    return map
  },[presentations])
  const critical = ingredients.filter(i => (Number(summaryMap.get(i.id)?.available_quantity ?? 0) <= Number(i.minimum_stock))).length
  const stockValue = summaries.reduce((acc,s)=>acc+Number(s.stock_value||0),0)

  if(org.loading) return <LoadingPanel/>
  if(!org.organization) return <><PageHeader title="Insumos" description="Cadastre matérias-primas, unidades de consumo e apresentações de compra."/><OrganizationSetup onCreate={org.bootstrap}/></>

  return <>
    <PageHeader title="Insumos" description={`Cadastros da organização ${org.organization.name}. O saldo é calculado pelas movimentações de estoque, sem edição direta.`} action={<button className="primary" onClick={()=>setNewOpen(true)}><Plus size={17}/> Novo insumo</button>}/>
    <ErrorBanner message={error || org.error}/>
    <div className="stats-grid compact-stats">
      <StatCard label="Insumos ativos" value={String(ingredients.length)} helper="Cadastros disponíveis para compras e fichas técnicas."/>
      <StatCard label="Abaixo do mínimo" value={String(critical)} helper="Com saldo menor ou igual ao estoque mínimo."/>
      <StatCard label="Valor em estoque" value={brl.format(stockValue)} helper="Valor histórico dos lotes disponíveis."/>
      <StatCard label="Apresentações" value={String(presentations.length)} helper="Formatos de compra e fatores de conversão."/>
    </div>
    <div className="panel module-panel">
      <div className="panel-toolbar"><div><h3>Cadastro de insumos</h3><p>Unidade-base é a unidade usada no consumo e no custo interno.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {loading ? <LoadingPanel text="Carregando insumos…"/> : ingredients.length===0 ? <div className="empty"><div className="empty-icon"><Boxes/></div><h3>Nenhum insumo cadastrado</h3><p>Cadastre o primeiro insumo para começar o fluxo de compras e estoque.</p><button className="primary" onClick={()=>setNewOpen(true)}>Novo insumo</button></div> :
      <DataTable headers={['Insumo','Categoria','Saldo','Mínimo','Custo médio','Apresentações','Status','Ações']}>
        {ingredients.map(i=>{
          const s=summaryMap.get(i.id); const balance=Number(s?.available_quantity??0); const min=Number(i.minimum_stock||0); const unit=s?.unit_symbol ?? org.units.find(u=>u.id===i.base_unit_id)?.symbol ?? ''
          return <tr key={i.id}>
            <td><strong>{i.name}</strong>{i.controls_expiry && <small className="cell-helper">Controla validade</small>}</td>
            <td>{i.category || '—'}</td>
            <td>{numberBR.format(balance)} {unit}</td>
            <td>{numberBR.format(min)} {unit}</td>
            <td>{brl.format(Number(s?.average_cost??0))}/{unit || 'un'}</td>
            <td>{presentationCount.get(i.id)??0}</td>
            <td>{balance<=min ? <Badge tone="warning">Repor</Badge> : <Badge tone="success">OK</Badge>}</td>
            <td><button className="table-action" onClick={()=>setPresentationIngredient(i)}><PackagePlus size={15}/> Apresentação</button></td>
          </tr>
        })}
      </DataTable>}
    </div>
    {newOpen && <NewIngredientModal units={org.units} organizationId={org.organization.id} saving={saving} setSaving={setSaving} onClose={()=>setNewOpen(false)} onSaved={async()=>{setNewOpen(false);await load()}}/>}
    {presentationIngredient && <PresentationModal ingredient={presentationIngredient} units={org.units} suppliers={suppliers} organizationId={org.organization.id} saving={saving} setSaving={setSaving} onClose={()=>setPresentationIngredient(null)} onSaved={async()=>{setPresentationIngredient(null);await load()}}/>}
  </>
}

function NewIngredientModal({units,organizationId,saving,setSaving,onClose,onSaved}:{units:{id:string;name:string;symbol:string}[];organizationId:string;saving:boolean;setSaving:(v:boolean)=>void;onClose:()=>void;onSaved:()=>void}){
  const [name,setName]=useState(''); const [category,setCategory]=useState(''); const [unitId,setUnitId]=useState(units[0]?.id??''); const [minimum,setMinimum]=useState('0'); const [expiry,setExpiry]=useState(false); const [error,setError]=useState('')
  async function submit(e:FormEvent){
    e.preventDefault(); if(!supabase)return; setSaving(true);setError('')
    const {data,error:insertError}=await supabase.from('ingredient_bases').insert({organization_id:organizationId,name:name.trim(),category:category.trim()||null,base_unit_id:unitId,minimum_stock:Number(minimum||0),controls_expiry:expiry}).select('id').single()
    if(insertError){setError(insertError.message);setSaving(false);return}
    const unit=units.find(u=>u.id===unitId)
    const {error:pError}=await supabase.from('ingredient_presentations').insert({organization_id:organizationId,ingredient_base_id:data.id,purchase_unit_id:unitId,base_quantity:1,label:`Compra em ${unit?.symbol||'un'}`})
    if(pError){setError(`Insumo criado, mas a apresentação padrão falhou: ${pError.message}`);setSaving(false);return}
    setSaving(false);onSaved()
  }
  return <Modal title="Novo insumo" onClose={onClose}><form onSubmit={submit} className="form-grid">
    <Field label="Nome"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Farinha de trigo" required/></Field>
    <Field label="Categoria"><input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Ex.: Farinhas"/></Field>
    <Field label="Unidade-base"><select value={unitId} onChange={e=>setUnitId(e.target.value)} required><option value="">Selecione</option>{units.map(u=><option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}</select></Field>
    <Field label="Estoque mínimo"><input type="number" min="0" step="0.001" value={minimum} onChange={e=>setMinimum(e.target.value)}/></Field>
    <label className="check-field"><input type="checkbox" checked={expiry} onChange={e=>setExpiry(e.target.checked)}/><span>Controlar validade deste insumo</span></label>
    <ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando…':'Salvar insumo'}</button></FormActions>
  </form></Modal>
}

function PresentationModal({ingredient,units,suppliers,organizationId,saving,setSaving,onClose,onSaved}:{ingredient:Ingredient;units:{id:string;name:string;symbol:string}[];suppliers:Supplier[];organizationId:string;saving:boolean;setSaving:(v:boolean)=>void;onClose:()=>void;onSaved:()=>void}){
  const baseUnit=units.find(u=>u.id===ingredient.base_unit_id)
  const [label,setLabel]=useState(''); const [brand,setBrand]=useState(''); const [supplierId,setSupplierId]=useState(''); const [purchaseUnitId,setPurchaseUnitId]=useState(units.find(u=>u.symbol==='un')?.id ?? ingredient.base_unit_id); const [baseQty,setBaseQty]=useState('1'); const [error,setError]=useState('')
  async function submit(e:FormEvent){
    e.preventDefault(); if(!supabase)return; setSaving(true);setError(''); let brandId:string|null=null
    if(brand.trim()){
      const {data:existing}=await supabase.from('brands').select('id').eq('organization_id',organizationId).ilike('name',brand.trim()).limit(1).maybeSingle()
      if(existing?.id) brandId=existing.id
      else { const {data:created,error:bError}=await supabase.from('brands').insert({organization_id:organizationId,name:brand.trim()}).select('id').single(); if(bError){setError(bError.message);setSaving(false);return}; brandId=created.id }
    }
    const {error:pError}=await supabase.from('ingredient_presentations').insert({organization_id:organizationId,ingredient_base_id:ingredient.id,brand_id:brandId,preferred_supplier_id:supplierId||null,purchase_unit_id:purchaseUnitId,base_quantity:Number(baseQty),label:label.trim()||null})
    if(pError){setError(pError.message);setSaving(false);return} setSaving(false);onSaved()
  }
  return <Modal title={`Nova apresentação — ${ingredient.name}`} onClose={onClose}><form onSubmit={submit} className="form-grid">
    <Field label="Nome da apresentação" hint="Ex.: Pacote 5 kg, Caixa com 12 unidades"><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Pacote 5 kg" required/></Field>
    <Field label="Marca"><input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Opcional"/></Field>
    <Field label="Fornecedor preferencial"><select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Sem preferência</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Unidade de compra"><select value={purchaseUnitId} onChange={e=>setPurchaseUnitId(e.target.value)} required>{units.map(u=><option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}</select></Field>
    <Field label={`Quantidade contida em ${baseUnit?.symbol||'un'}`} hint={`Ex.: pacote de 5 kg com unidade-base g = 5000 ${baseUnit?.symbol||''}`}><input type="number" min="0.000001" step="any" value={baseQty} onChange={e=>setBaseQty(e.target.value)} required/></Field>
    <ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando…':'Salvar apresentação'}</button></FormActions>
  </form></Modal>
}
