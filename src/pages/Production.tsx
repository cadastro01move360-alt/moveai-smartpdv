import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Factory, Play, Plus } from 'lucide-react'
import { Badge, PageHeader, StatCard } from '../components/UI'
import { DataTable, ErrorBanner, Field, FormActions, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { brl, numberBR, unitCostBR } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type Recipe={recipe_version_id:string;recipe_id:string;name:string;version_number:number;status:string;yield_quantity:number;yield_unit_symbol:string;total_cost:number;cost_per_yield:number}
type Location={id:string;name:string}
type Order={organization_id:string;production_order_id:string;code:string;recipe_version_id:string;recipe_name:string;version_number:number;yield_unit_symbol:string;planned_batches:number;planned_yield:number;actual_yield:number|null;standard_cost:number;actual_cost:number|null;status:'planejada'|'concluida'|'cancelada';location_name:string;notes:string|null;created_at:string;completed_at:string|null}

export default function Production(){
  const org=useOrganization(); const [recipes,setRecipes]=useState<Recipe[]>([]); const [locations,setLocations]=useState<Location[]>([]); const [orders,setOrders]=useState<Order[]>([]); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [newOpen,setNewOpen]=useState(false); const [completeOrder,setCompleteOrder]=useState<Order|null>(null)
  const load=useCallback(async()=>{if(!supabase||!org.organization)return;setLoading(true);setError('');const oid=org.organization.id;const [r,l,o]=await Promise.all([
    supabase.from('recipe_cost_summary').select('recipe_version_id,recipe_id,name,version_number,status,yield_quantity,yield_unit_symbol,total_cost,cost_per_yield').eq('organization_id',oid).eq('status','ativa').order('name'),
    supabase.from('stock_locations').select('id,name').eq('organization_id',oid).eq('active',true).order('name'),
    supabase.from('production_order_summary').select('*').eq('organization_id',oid).order('created_at',{ascending:false}),
  ]);const e=r.error||l.error||o.error;if(e)setError(e.message);setRecipes((r.data??[]) as Recipe[]);setLocations((l.data??[]) as Location[]);setOrders((o.data??[]) as Order[]);setLoading(false)},[org.organization])
  useEffect(()=>{load()},[load])
  const planned=orders.filter(o=>o.status==='planejada').length; const done=orders.filter(o=>o.status==='concluida').length; const actualCost=orders.reduce((s,o)=>s+Number(o.actual_cost||0),0)
  if(org.loading)return <LoadingPanel/>
  if(!org.organization)return <><PageHeader title="Produção" description="Planeje e execute ordens com consumo real por lote."/><OrganizationSetup onCreate={org.bootstrap}/></>
  return <>
    <PageHeader title="Produção" description="Ordens usam fichas técnicas ativas. Ao concluir, os insumos são consumidos por lote em FEFO e o custo real fica registrado." action={<button className="primary" onClick={()=>setNewOpen(true)}><Plus size={17}/> Nova ordem</button>}/>
    <ErrorBanner message={error||org.error}/>
    <div className="stats-grid compact-stats"><StatCard label="Ordens" value={String(orders.length)} helper="Total de ordens registradas."/><StatCard label="Planejadas" value={String(planned)} helper="Aguardando conclusão."/><StatCard label="Concluídas" value={String(done)} helper="Com consumo de estoque registrado."/><StatCard label="Custo real produzido" value={brl.format(actualCost)} helper="Soma dos custos reais das ordens concluídas."/></div>
    <div className="panel module-panel"><div className="panel-toolbar"><div><h3>Ordens de produção</h3><p>O estoque só é baixado quando a ordem é concluída.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {loading?<LoadingPanel text="Carregando produção…"/>:orders.length===0?<div className="empty"><div className="empty-icon"><Factory/></div><h3>Nenhuma ordem criada</h3><p>Crie a primeira ordem usando uma ficha técnica ativa.</p><button className="primary" onClick={()=>setNewOpen(true)}>Nova ordem</button></div>:<DataTable headers={['Ordem','Receita','Planejado','Custo padrão','Realizado','Custo real','Status','Ações']}>
        {orders.map(o=><tr key={o.production_order_id}><td><strong>{o.code}</strong><small className="cell-helper">{dateTimeBR(o.created_at)}</small></td><td><strong>{o.recipe_name}</strong><small className="cell-helper">v{o.version_number} • {o.location_name}</small></td><td>{numberBR.format(Number(o.planned_yield))} {o.yield_unit_symbol}<small className="cell-helper">{numberBR.format(Number(o.planned_batches))} lote(s)</small></td><td>{brl.format(Number(o.standard_cost))}</td><td>{o.actual_yield==null?'—':`${numberBR.format(Number(o.actual_yield))} ${o.yield_unit_symbol}`}</td><td>{o.actual_cost==null?'—':brl.format(Number(o.actual_cost))}</td><td>{statusBadge(o.status)}</td><td>{o.status==='planejada'?<button className="table-action" onClick={()=>setCompleteOrder(o)}><Play size={15}/> Concluir</button>:<span className="muted">Concluída</span>}</td></tr>)}
      </DataTable>}
    </div>
    {newOpen&&<NewOrderModal organizationId={org.organization.id} recipes={recipes} locations={locations} onClose={()=>setNewOpen(false)} onSaved={async()=>{setNewOpen(false);await load()}}/>}
    {completeOrder&&<CompleteModal order={completeOrder} onClose={()=>setCompleteOrder(null)} onSaved={async()=>{setCompleteOrder(null);await load()}}/>}
  </>
}

function NewOrderModal({organizationId,recipes,locations,onClose,onSaved}:{organizationId:string;recipes:Recipe[];locations:Location[];onClose:()=>void;onSaved:()=>void}){
  const [recipeId,setRecipeId]=useState(recipes[0]?.recipe_version_id??''); const [locationId,setLocationId]=useState(locations[0]?.id??''); const [batches,setBatches]=useState('1'); const [notes,setNotes]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  const recipe=useMemo(()=>recipes.find(r=>r.recipe_version_id===recipeId),[recipes,recipeId]); const qty=Number(batches||0); const plannedYield=Number(recipe?.yield_quantity||0)*qty; const plannedCost=Number(recipe?.total_cost||0)*qty
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;if(!recipeId){setError('Selecione uma ficha técnica ativa.');return}setSaving(true);setError('');const {error:rpcError}=await supabase.rpc('create_production_order',{p_organization_id:organizationId,p_recipe_version_id:recipeId,p_stock_location_id:locationId,p_batches:qty,p_notes:notes});if(rpcError){setError(rpcError.message);setSaving(false);return}setSaving(false);onSaved()}
  return <Modal title="Nova ordem de produção" onClose={onClose} wide><form onSubmit={submit} className="form-grid"><Field label="Ficha técnica"><select value={recipeId} onChange={e=>setRecipeId(e.target.value)} required><option value="">Selecione</option>{recipes.map(r=><option key={r.recipe_version_id} value={r.recipe_version_id}>{r.name} • v{r.version_number} • {numberBR.format(Number(r.yield_quantity))} {r.yield_unit_symbol} • {brl.format(Number(r.total_cost))}</option>)}</select></Field><div className="form-grid two-cols"><Field label="Quantidade de receitas / lotes"><input type="number" min="0.000001" step="any" value={batches} onChange={e=>setBatches(e.target.value)} required/></Field><Field label="Local de consumo"><select value={locationId} onChange={e=>setLocationId(e.target.value)} required>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><Field label="Rendimento previsto"><div className="cost-display"><strong>{numberBR.format(plannedYield)} {recipe?.yield_unit_symbol||'—'}</strong><span>Baseado na ficha ativa.</span></div></Field><Field label="Custo padrão previsto"><div className="cost-display"><strong>{brl.format(plannedCost)}</strong><span>{plannedYield>0?`${unitCostBR(plannedCost/plannedYield)} por ${recipe?.yield_unit_symbol||'un'}`:'—'}</span></div></Field></div><Field label="Observações"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: produção do turno da manhã"/></Field><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving||recipes.length===0}>{saving?'Criando…':'Criar ordem'}</button></FormActions></form></Modal>
}

function CompleteModal({order,onClose,onSaved}:{order:Order;onClose:()=>void;onSaved:()=>void}){
  const [actualYield,setActualYield]=useState(String(order.planned_yield)); const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setSaving(true);setError('');const {error:rpcError}=await supabase.rpc('complete_production_order',{p_production_order_id:order.production_order_id,p_actual_yield:Number(actualYield)});if(rpcError){setError(rpcError.message);setSaving(false);return}setSaving(false);onSaved()}
  return <Modal title={`Concluir ${order.code}`} onClose={onClose}><form onSubmit={submit} className="form-grid"><div className="confirm-note"><Factory/><div><strong>{order.recipe_name}</strong><p>Ao concluir, o sistema baixa os insumos do estoque por lote. A operação é transacional: se faltar estoque, nenhuma baixa será mantida.</p></div></div><Field label={`Rendimento real (${order.yield_unit_symbol})`}><input type="number" min="0.000001" step="any" value={actualYield} onChange={e=>setActualYield(e.target.value)} required/></Field><div className="cost-display"><span>Custo padrão</span><strong>{brl.format(Number(order.standard_cost))}</strong></div><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Concluindo…':'Concluir produção'}</button></FormActions></form></Modal>
}

function statusBadge(status:Order['status']){if(status==='concluida')return <Badge tone="success">Concluída</Badge>;if(status==='planejada')return <Badge tone="warning">Planejada</Badge>;return <Badge>Cancelada</Badge>}
function dateTimeBR(value:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
