import { useCallback, useEffect, useState } from 'react'
import { PageHeader, StatCard } from '../components/UI'
import { ErrorBanner, LoadingPanel, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type StockSummary={available_quantity:number;stock_value:number;minimum_stock:number}

export default function Dashboard(){
  const org=useOrganization();const [stock,setStock]=useState<StockSummary[]>([]);const [purchaseCount,setPurchaseCount]=useState(0);const [supplierCount,setSupplierCount]=useState(0);const [loading,setLoading]=useState(false);const [error,setError]=useState('')
  const load=useCallback(async()=>{if(!supabase||!org.organization)return;setLoading(true);setError('');const oid=org.organization.id;const [s,p,f]=await Promise.all([
    supabase.from('ingredient_stock_summary').select('available_quantity,stock_value,minimum_stock').eq('organization_id',oid),
    supabase.from('purchases').select('id',{count:'exact',head:true}).eq('organization_id',oid).eq('status','confirmada'),
    supabase.from('suppliers').select('id',{count:'exact',head:true}).eq('organization_id',oid).eq('active',true),
  ]);const e=s.error||p.error||f.error;if(e)setError(e.message);setStock((s.data??[]) as StockSummary[]);setPurchaseCount(p.count??0);setSupplierCount(f.count??0);setLoading(false)},[org.organization])
  useEffect(()=>{load()},[load])

  return <>
    <div className="brand-hero"><div><div className="hero-kicker">MoveAI SmartPDV</div><h2>Gestão conectada. Decisão mais inteligente.</h2><p>Compras, estoque, produção, vendas, caixa e financeiro organizados em uma única operação, com rastreabilidade e dados reais.</p></div><div className="hero-badge"><strong>by Move360</strong><span>Tecnologia para operação e crescimento</span></div></div>
    <PageHeader title="Visão Geral" description="Acompanhe operação, estoque, produção, vendas e finanças a partir de dados reais." />
    {org.loading?<LoadingPanel/>:!org.organization?<OrganizationSetup onCreate={org.bootstrap}/>:<DashboardData stock={stock} purchaseCount={purchaseCount} supplierCount={supplierCount} loading={loading} error={error||org.error}/>} 
  </>
}

function DashboardData({stock,purchaseCount,supplierCount,loading,error}:{stock:StockSummary[];purchaseCount:number;supplierCount:number;loading:boolean;error:string}){
  if(loading)return <LoadingPanel text="Carregando indicadores operacionais…"/>
  const stockValue=stock.reduce((a,s)=>a+Number(s.stock_value||0),0);const critical=stock.filter(s=>Number(s.available_quantity)<=Number(s.minimum_stock)).length
  return <><ErrorBanner message={error}/><div className="stats-grid"><StatCard label="Valor em estoque" value={brl.format(stockValue)} helper="Custo histórico dos lotes disponíveis."/><StatCard label="Estoque crítico" value={String(critical)} helper="Insumos abaixo ou no mínimo definido."/><StatCard label="Compras confirmadas" value={String(purchaseCount)} helper="Compras que já movimentaram estoque."/><StatCard label="Fornecedores ativos" value={String(supplierCount)} helper="Disponíveis para novas compras."/></div><div className="grid-2"><div className="panel"><h3>Alertas operacionais</h3><div className="panel-empty">{critical>0?`${critical} insumo(s) precisam de reposição.`:'Nenhum alerta crítico de estoque agora.'}</div></div><div className="panel"><h3>Ações rápidas</h3><div className="quick-grid"><a href="/insumos">Cadastrar insumo</a><a href="/fornecedores">Novo fornecedor</a><a href="/compras">Nova compra</a><a href="/estoque">Ver estoque</a></div></div></div></>
}
