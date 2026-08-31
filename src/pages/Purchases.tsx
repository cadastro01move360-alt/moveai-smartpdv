import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Badge, PageHeader, StatCard } from '../components/UI'
import { DataTable, ErrorBanner, Field, FormActions, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { brl, dateBR, numberBR } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type Supplier={id:string;name:string}
type Presentation={id:string;ingredient_base_id:string;brand_id:string|null;purchase_unit_id:string;base_quantity:number;label:string|null;preferred_supplier_id:string|null;active:boolean}
type Ingredient={id:string;name:string;base_unit_id:string}
type Brand={id:string;name:string}
type Purchase={id:string;supplier_id:string;document_number:string|null;purchase_date:string;entry_date:string;notes:string|null;status:'rascunho'|'confirmada'|'cancelada';created_at:string}
type PurchaseItem={purchase_id:string;quantity:number;unit_price:number;discount:number}
type DraftItem={key:string;presentation_id:string;quantity:string;unit_price:string;discount:string;lot_code:string;expires_at:string}

const today=()=>new Date().toISOString().slice(0,10)
const blankItem=():DraftItem=>({key:crypto.randomUUID(),presentation_id:'',quantity:'1',unit_price:'0',discount:'0',lot_code:'',expires_at:''})

export default function Purchases(){
  const org=useOrganization(); const [suppliers,setSuppliers]=useState<Supplier[]>([]); const [presentations,setPresentations]=useState<Presentation[]>([]); const [ingredients,setIngredients]=useState<Ingredient[]>([]); const [brands,setBrands]=useState<Brand[]>([]); const [purchases,setPurchases]=useState<Purchase[]>([]); const [purchaseItems,setPurchaseItems]=useState<PurchaseItem[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [newOpen,setNewOpen]=useState(false); const [confirming,setConfirming]=useState<Purchase|null>(null)

  const load=useCallback(async()=>{if(!supabase||!org.organization)return;setLoading(true);setError('');const oid=org.organization.id;const [s,p,i,b,pu,pi]=await Promise.all([
    supabase.from('suppliers').select('id,name').eq('organization_id',oid).eq('active',true).order('name'),
    supabase.from('ingredient_presentations').select('id,ingredient_base_id,brand_id,purchase_unit_id,base_quantity,label,preferred_supplier_id,active').eq('organization_id',oid).eq('active',true),
    supabase.from('ingredient_bases').select('id,name,base_unit_id').eq('organization_id',oid).eq('active',true).order('name'),
    supabase.from('brands').select('id,name').eq('organization_id',oid).eq('active',true),
    supabase.from('purchases').select('id,supplier_id,document_number,purchase_date,entry_date,notes,status,created_at').eq('organization_id',oid).order('purchase_date',{ascending:false}).order('created_at',{ascending:false}),
    supabase.from('purchase_items').select('purchase_id,quantity,unit_price,discount').eq('organization_id',oid),
  ]);const e=s.error||p.error||i.error||b.error||pu.error||pi.error;if(e)setError(e.message);setSuppliers((s.data??[]) as Supplier[]);setPresentations((p.data??[]) as Presentation[]);setIngredients((i.data??[]) as Ingredient[]);setBrands((b.data??[]) as Brand[]);setPurchases((pu.data??[]) as Purchase[]);setPurchaseItems((pi.data??[]) as PurchaseItem[]);setLoading(false)},[org.organization])
  useEffect(()=>{load()},[load])
  const supplierMap=useMemo(()=>new Map(suppliers.map(s=>[s.id,s.name])),[suppliers])
  const totals=useMemo(()=>{const map=new Map<string,number>();for(const it of purchaseItems)map.set(it.purchase_id,(map.get(it.purchase_id)??0)+(Number(it.quantity)*Number(it.unit_price)-Number(it.discount||0)));return map},[purchaseItems])
  const confirmed=purchases.filter(p=>p.status==='confirmada').length;const open=purchases.filter(p=>p.status==='rascunho').length;const totalConfirmed=purchases.filter(p=>p.status==='confirmada').reduce((a,p)=>a+(totals.get(p.id)??0),0)
  if(org.loading)return <LoadingPanel/>
  if(!org.organization)return <><PageHeader title="Compras" description="Registre compras e confirme a entrada de lotes no estoque."/><OrganizationSetup onCreate={org.bootstrap}/></>
  return <>
    <PageHeader title="Compras" description="A confirmação da compra cria lotes e movimentações de estoque uma única vez, preservando o custo histórico." action={<button className="primary" onClick={()=>setNewOpen(true)} disabled={suppliers.length===0||presentations.length===0}><Plus size={17}/> Nova compra</button>}/>
    <ErrorBanner message={error||org.error}/>
    {(suppliers.length===0||presentations.length===0)&&<div className="warning-banner">Antes da primeira compra, cadastre pelo menos um fornecedor e uma apresentação de insumo.</div>}
    <div className="stats-grid compact-stats"><StatCard label="Compras" value={String(purchases.length)} helper="Histórico total da organização."/><StatCard label="Rascunhos" value={String(open)} helper="Ainda não movimentaram estoque."/><StatCard label="Confirmadas" value={String(confirmed)} helper="Já geraram lotes e entradas."/><StatCard label="Valor confirmado" value={brl.format(totalConfirmed)} helper="Soma líquida das compras confirmadas."/></div>
    <div className="panel module-panel"><div className="panel-toolbar"><div><h3>Histórico de compras</h3><p>Rascunhos podem ser revisados antes da confirmação.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {loading?<LoadingPanel text="Carregando compras…"/>:purchases.length===0?<div className="empty"><div className="empty-icon"><ShoppingCart/></div><h3>Nenhuma compra registrada</h3><p>Crie um rascunho e confirme para gerar os primeiros lotes de estoque.</p><button className="primary" onClick={()=>setNewOpen(true)} disabled={suppliers.length===0||presentations.length===0}>Nova compra</button></div>:<DataTable headers={['Data','Fornecedor','Documento','Valor líquido','Status','Ações']}>
        {purchases.map(p=><tr key={p.id}><td>{dateBR(p.purchase_date)}</td><td><strong>{supplierMap.get(p.supplier_id)||'Fornecedor'}</strong></td><td>{p.document_number||'—'}</td><td>{brl.format(totals.get(p.id)??0)}</td><td>{p.status==='confirmada'?<Badge tone="success">Confirmada</Badge>:p.status==='cancelada'?<Badge tone="danger">Cancelada</Badge>:<Badge tone="warning">Rascunho</Badge>}</td><td>{p.status==='rascunho'?<button className="table-action success" onClick={()=>setConfirming(p)}><CheckCircle2 size={15}/> Confirmar entrada</button>:<span className="muted">—</span>}</td></tr>)}
      </DataTable>}
    </div>
    {newOpen&&<NewPurchaseModal organizationId={org.organization.id} suppliers={suppliers} presentations={presentations} ingredients={ingredients} brands={brands} units={org.units} onClose={()=>setNewOpen(false)} onSaved={async()=>{setNewOpen(false);await load()}}/>}
    {confirming&&<ConfirmPurchaseModal purchase={confirming} locations={org.locations} onClose={()=>setConfirming(null)} onConfirmed={async()=>{setConfirming(null);await load()}}/>}
  </>
}

function NewPurchaseModal({organizationId,suppliers,presentations,ingredients,brands,units,onClose,onSaved}:{organizationId:string;suppliers:Supplier[];presentations:Presentation[];ingredients:Ingredient[];brands:Brand[];units:{id:string;symbol:string;name:string}[];onClose:()=>void;onSaved:()=>void}){
  const [supplierId,setSupplierId]=useState(suppliers[0]?.id??'');const [document,setDocument]=useState('');const [purchaseDate,setPurchaseDate]=useState(today());const [entryDate,setEntryDate]=useState(today());const [notes,setNotes]=useState('');const [items,setItems]=useState<DraftItem[]>([blankItem()]);const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  const ingredientMap=new Map(ingredients.map(i=>[i.id,i]));const brandMap=new Map(brands.map(b=>[b.id,b.name]));const unitMap=new Map(units.map(u=>[u.id,u]));const presentationMap=new Map(presentations.map(p=>[p.id,p]))
  function label(p:Presentation){const ing=ingredientMap.get(p.ingredient_base_id);const brand=p.brand_id?brandMap.get(p.brand_id):'';const pu=unitMap.get(p.purchase_unit_id)?.symbol||'';return `${ing?.name||'Insumo'} — ${p.label||`${p.base_quantity} ${pu}`} ${brand?`• ${brand}`:''}`}
  function update(key:string,patch:Partial<DraftItem>){setItems(current=>current.map(i=>i.key===key?{...i,...patch}:i))}
  const total=items.reduce((a,i)=>a+Math.max(0,Number(i.quantity||0)*Number(i.unit_price||0)-Number(i.discount||0)),0)
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setSaving(true);setError('');if(items.some(i=>!i.presentation_id)){setError('Selecione a apresentação em todos os itens.');setSaving(false);return}const {error:rpcError}=await supabase.rpc('create_purchase_draft',{p_organization_id:organizationId,p_supplier_id:supplierId,p_document_number:document,p_purchase_date:purchaseDate,p_entry_date:entryDate,p_notes:notes,p_items:items.map(i=>({presentation_id:i.presentation_id,quantity:Number(i.quantity),unit_price:Number(i.unit_price),discount:Number(i.discount||0),lot_code:i.lot_code,expires_at:i.expires_at||null}))});if(rpcError){setError(rpcError.message);setSaving(false);return}setSaving(false);onSaved()}
  return <Modal title="Nova compra" onClose={onClose} wide><form onSubmit={submit} className="form-grid two-cols">
    <Field label="Fornecedor"><select value={supplierId} onChange={e=>setSupplierId(e.target.value)} required>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Documento / NF"><input value={document} onChange={e=>setDocument(e.target.value)} placeholder="Opcional"/></Field>
    <Field label="Data da compra"><input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} required/></Field>
    <Field label="Data de entrada"><input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} required/></Field>
    <div className="form-full"><Field label="Observações"><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/></Field></div>
    <div className="form-full purchase-items"><div className="section-title"><div><strong>Itens da compra</strong><span>Confira a conversão e o custo na unidade-base antes de salvar.</span></div><button type="button" className="secondary" onClick={()=>setItems(v=>[...v,blankItem()])}><Plus size={15}/> Item</button></div>
      {items.map((item,index)=>{const p=presentationMap.get(item.presentation_id);const ing=p?ingredientMap.get(p.ingredient_base_id):undefined;const baseUnit=ing?unitMap.get(ing.base_unit_id):undefined;const totalBase=Number(item.quantity||0)*Number(p?.base_quantity||0);const net=Math.max(0,Number(item.quantity||0)*Number(item.unit_price||0)-Number(item.discount||0));const baseCost=totalBase>0?net/totalBase:0;return <div className="purchase-row" key={item.key}>
        <div className="purchase-row-index">{index+1}</div><Field label="Apresentação"><select value={item.presentation_id} onChange={e=>update(item.key,{presentation_id:e.target.value})} required><option value="">Selecione</option>{presentations.map(pr=><option key={pr.id} value={pr.id}>{label(pr)}</option>)}</select></Field><Field label="Qtd."><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>update(item.key,{quantity:e.target.value})}/></Field><Field label="Valor unitário"><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>update(item.key,{unit_price:e.target.value})}/></Field><Field label="Desconto"><input type="number" min="0" step="0.01" value={item.discount} onChange={e=>update(item.key,{discount:e.target.value})}/></Field><Field label="Lote"><input value={item.lot_code} onChange={e=>update(item.key,{lot_code:e.target.value})}/></Field><Field label="Validade"><input type="date" value={item.expires_at} onChange={e=>update(item.key,{expires_at:e.target.value})}/></Field><div className="conversion-box"><span>Convertido</span><strong>{numberBR.format(totalBase)} {baseUnit?.symbol||''}</strong><small>{brl.format(baseCost)}/{baseUnit?.symbol||'un'}</small></div>{items.length>1&&<button type="button" className="icon-btn danger-icon" onClick={()=>setItems(v=>v.filter(x=>x.key!==item.key))}><Trash2 size={16}/></button>}
      </div>})}
    </div>
    <div className="form-full purchase-total"><span>Total líquido estimado</span><strong>{brl.format(total)}</strong></div>
    <div className="form-full"><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando…':'Salvar rascunho'}</button></FormActions></div>
  </form></Modal>
}

function ConfirmPurchaseModal({purchase,locations,onClose,onConfirmed}:{purchase:Purchase;locations:{id:string;name:string}[];onClose:()=>void;onConfirmed:()=>void}){
  const [locationId,setLocationId]=useState(locations[0]?.id??'');const [loading,setLoading]=useState(false);const [error,setError]=useState('')
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setLoading(true);setError('');const {error:rpcError}=await supabase.rpc('confirm_purchase',{p_purchase_id:purchase.id,p_location_id:locationId});if(rpcError){setError(rpcError.message);setLoading(false);return}setLoading(false);onConfirmed()}
  return <Modal title="Confirmar entrada da compra" onClose={onClose}><form onSubmit={submit} className="form-grid"><div className="confirm-note"><CheckCircle2/><div><strong>Essa ação movimenta o estoque.</strong><p>Serão criados lotes e entradas com o custo histórico calculado a partir de cada item. A confirmação é idempotente.</p></div></div><Field label="Local de estoque"><select value={locationId} onChange={e=>setLocationId(e.target.value)} required><option value="">Selecione</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Voltar</button><button className="primary" disabled={loading||!locationId}>{loading?'Confirmando…':'Confirmar compra'}</button></FormActions></form></Modal>
}
