import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, SlidersHorizontal } from 'lucide-react'
import { Badge, PageHeader, StatCard } from '../components/UI'
import { DataTable, ErrorBanner, Field, FormActions, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { brl, dateBR, numberBR, unitCostBR } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type Lot={organization_id:string;stock_lot_id:string;ingredient_base_id:string|null;ingredient_name:string|null;minimum_stock:number|null;unit_symbol:string|null;brand_name:string|null;location_name:string|null;lot_code:string|null;expires_at:string|null;quantity_received:number;available_quantity:number;unit_cost_base:number;stock_value:number;origin_type:string;created_at:string}
type Movement={id:string;stock_lot_id:string|null;movement_type:string;quantity:number;unit_cost:number;reference_type:string;created_at:string}

export default function Stock(){
  const org=useOrganization();const [lots,setLots]=useState<Lot[]>([]);const [movements,setMovements]=useState<Movement[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [adjustLot,setAdjustLot]=useState<Lot|null>(null)
  const load=useCallback(async()=>{if(!supabase||!org.organization)return;setLoading(true);setError('');const oid=org.organization.id;const [l,m]=await Promise.all([
    supabase.from('stock_lot_summary').select('*').eq('organization_id',oid).order('created_at',{ascending:false}),
    supabase.from('stock_movements').select('id,stock_lot_id,movement_type,quantity,unit_cost,reference_type,created_at').eq('organization_id',oid).order('created_at',{ascending:false}).limit(50),
  ]);const e=l.error||m.error;if(e)setError(e.message);setLots((l.data??[]) as Lot[]);setMovements((m.data??[]) as Movement[]);setLoading(false)},[org.organization])
  useEffect(()=>{load()},[load])
  const activeLots=lots.filter(l=>Number(l.available_quantity)>0);const stockValue=activeLots.reduce((a,l)=>a+Number(l.stock_value||0),0);const expiring=activeLots.filter(l=>isExpiring(l.expires_at,7)).length;const ingredientsLow=useMemo(()=>{const sums=new Map<string,{qty:number;min:number}>();for(const l of lots){if(!l.ingredient_base_id)continue;const current=sums.get(l.ingredient_base_id)??{qty:0,min:Number(l.minimum_stock||0)};current.qty+=Math.max(0,Number(l.available_quantity||0));sums.set(l.ingredient_base_id,current)}return [...sums.values()].filter(v=>v.qty<=v.min).length},[lots])
  if(org.loading)return <LoadingPanel/>
  if(!org.organization)return <><PageHeader title="Estoque" description="Controle lotes, validade e movimentações por local."/><OrganizationSetup onCreate={org.bootstrap}/></>
  return <>
    <PageHeader title="Estoque" description="O saldo é derivado do livro-razão de movimentações. Ajustes criam movimentos auditáveis e não alteram saldos silenciosamente." action={<button className="secondary" onClick={load}>Atualizar</button>}/>
    <ErrorBanner message={error||org.error}/>
    <div className="stats-grid compact-stats"><StatCard label="Lotes com saldo" value={String(activeLots.length)} helper="Lotes disponíveis para consumo."/><StatCard label="Valor atual" value={brl.format(stockValue)} helper="Saldo disponível × custo histórico do lote."/><StatCard label="Vencendo em 7 dias" value={String(expiring)} helper="Lotes com validade próxima."/><StatCard label="Insumos críticos" value={String(ingredientsLow)} helper="Saldo total menor ou igual ao mínimo."/></div>
    <div className="panel module-panel"><div className="panel-toolbar"><div><h3>Lotes e saldos</h3><p>Consulte custo, validade, local e quantidade disponível.</p></div></div>
      {loading?<LoadingPanel text="Carregando estoque…"/>:lots.length===0?<div className="empty"><div className="empty-icon"><Boxes/></div><h3>Estoque vazio</h3><p>Confirme uma compra para criar os primeiros lotes e movimentações.</p></div>:<DataTable headers={['Insumo','Marca / Lote','Local','Saldo','Custo','Valor','Validade','Ações']}>
        {lots.map(l=><tr key={l.stock_lot_id} className={Number(l.available_quantity)<=0?'row-muted':''}><td><strong>{l.ingredient_name||'Item'}</strong><small className="cell-helper">Recebido: {numberBR.format(Number(l.quantity_received))} {l.unit_symbol||''}</small></td><td>{l.brand_name||'Sem marca'}<small className="cell-helper">Lote: {l.lot_code||'—'}</small></td><td>{l.location_name||'—'}</td><td><strong>{numberBR.format(Number(l.available_quantity))} {l.unit_symbol||''}</strong></td><td>{unitCostBR(Number(l.unit_cost_base))}/{l.unit_symbol||'un'}</td><td>{brl.format(Number(l.stock_value))}</td><td>{expiryBadge(l.expires_at)}</td><td><button className="table-action" onClick={()=>setAdjustLot(l)}><SlidersHorizontal size={15}/> Ajustar</button></td></tr>)}
      </DataTable>}
    </div>
    <div className="panel module-panel"><div className="panel-toolbar"><div><h3>Movimentações recentes</h3><p>Últimos 50 lançamentos do livro-razão.</p></div></div>{movements.length===0?<div className="panel-empty">Nenhuma movimentação registrada.</div>:<DataTable headers={['Data','Tipo','Quantidade','Custo unitário','Referência']}>
      {movements.map(m=>{const lot=lots.find(l=>l.stock_lot_id===m.stock_lot_id);return <tr key={m.id}><td>{dateTimeBR(m.created_at)}</td><td><Badge tone={Number(m.quantity)>=0?'success':'danger'}>{movementLabel(m.movement_type)}</Badge></td><td>{Number(m.quantity)>0?'+':''}{numberBR.format(Number(m.quantity))} {lot?.unit_symbol||''}</td><td>{unitCostBR(Number(m.unit_cost))}</td><td>{m.reference_type}</td></tr>})}
    </DataTable>}</div>
    {adjustLot&&<AdjustModal lot={adjustLot} onClose={()=>setAdjustLot(null)} onSaved={async()=>{setAdjustLot(null);await load()}}/>}
  </>
}

function AdjustModal({lot,onClose,onSaved}:{lot:Lot;onClose:()=>void;onSaved:()=>void}){
  const [type,setType]=useState<'entrada'|'saida'>('entrada');const [qty,setQty]=useState('0');const [reason,setReason]=useState('');const [loading,setLoading]=useState(false);const [error,setError]=useState('')
  async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setLoading(true);setError('');const value=Math.abs(Number(qty||0))*(type==='saida'?-1:1);const {error:rpcError}=await supabase.rpc('adjust_stock_lot',{p_stock_lot_id:lot.stock_lot_id,p_quantity:value,p_reason:reason});if(rpcError){setError(rpcError.message);setLoading(false);return}setLoading(false);onSaved()}
  return <Modal title={`Ajustar lote — ${lot.ingredient_name||'Item'}`} onClose={onClose}><form onSubmit={submit} className="form-grid"><div className="confirm-note warning"><AlertTriangle/><div><strong>Ajuste manual auditado</strong><p>Saldo atual: {numberBR.format(Number(lot.available_quantity))} {lot.unit_symbol||''}. Use apenas para divergências físicas justificadas.</p></div></div><Field label="Tipo"><select value={type} onChange={e=>setType(e.target.value as 'entrada'|'saida')}><option value="entrada">Entrada de ajuste</option><option value="saida">Saída de ajuste</option></select></Field><Field label={`Quantidade (${lot.unit_symbol||'un'})`}><input type="number" min="0.000001" step="0.001" value={qty} onChange={e=>setQty(e.target.value)} required/></Field><Field label="Justificativa"><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Ex.: divergência encontrada na contagem física" required/></Field><ErrorBanner message={error}/><FormActions><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={loading}>{loading?'Salvando…':'Registrar ajuste'}</button></FormActions></form></Modal>
}

function isExpiring(value:string|null,days:number){if(!value)return false;const end=new Date(`${value}T23:59:59`);const now=new Date();const diff=(end.getTime()-now.getTime())/86400000;return diff>=0&&diff<=days}
function expiryBadge(value:string|null){if(!value)return <span className="muted">Sem validade</span>;const date=new Date(`${value}T23:59:59`);const days=(date.getTime()-Date.now())/86400000;if(days<0)return <Badge tone="danger">Vencido {dateBR(value)}</Badge>;if(days<=7)return <Badge tone="warning">{dateBR(value)}</Badge>;return <Badge tone="success">{dateBR(value)}</Badge>}
function movementLabel(value:string){return ({entrada_compra:'Entrada de compra',saida_producao:'Saída produção',entrada_producao:'Entrada produção',transferencia_saida:'Transferência saída',transferencia_entrada:'Transferência entrada',ajuste_entrada:'Ajuste entrada',ajuste_saida:'Ajuste saída',estorno:'Estorno'} as Record<string,string>)[value]||value}
function dateTimeBR(value:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
