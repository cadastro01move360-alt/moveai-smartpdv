import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrganization } from '../lib/useOrganization'
import { brl, dateBR } from '../lib/format'
import { ErrorBanner, LoadingPanel } from '../components/OperationalUI'
import { PageHeader } from '../components/UI'

if(!supabase){
  throw new Error('Supabase não configurado.')
}
const db=supabase

type SaleRow={
  order_id:string
  channel:string
  status:string
  total:number|string
  cmv:number|string
  gross_profit:number|string
  gross_margin_percent:number|string
  item_quantity:number|string
  created_at:string
  closed_at:string|null
}

type ProductDay={
  sale_date:string
  product_id:string|null
  product_name:string
  quantity_sold:number|string
  revenue:number|string
  cmv:number|string
  gross_profit:number|string
  gross_margin_percent:number|string
}

type PaymentDay={
  payment_date:string
  method:string
  payment_count:number
  amount:number|string
}

type ProductionRow={
  production_order_id:string
  code:string
  recipe_name:string
  product_name:string|null
  planned_yield:number|string
  actual_yield:number|string|null
  standard_cost:number|string
  actual_cost:number|string|null
  status:string
  created_at:string
  completed_at:string|null
}

type StockRow={
  product_id:string
  name:string
  category:string|null
  stock_unit_symbol:string
  sale_price:number|string
  minimum_stock:number|string
  available_quantity:number|string
  unit_cost:number|string
  stock_value:number|string
  active:boolean
  available:boolean
}

type FinancialTitle={
  id:string
  title_type:'pagar'|'receber'
  description:string
  due_date:string
  original_amount:number|string
  settled_amount:number|string
  open_amount:number|string
  display_status:'aberto'|'parcial'|'quitado'|'vencido'|'cancelado'
}

type FinancialTx={
  id:string
  direction:'entrada'|'saida'
  category:string
  amount:number|string
  occurred_at:string
  description:string|null
}

type AccountRow={
  account_id:string
  name:string
  account_type:'caixa'|'banco'|'adquirente'
  active:boolean
  current_balance:number|string
}

type Tab='geral'|'vendas'|'producao'|'estoque'|'financeiro'

const num=(v:unknown)=>Number(v||0)

function localDate(d:Date){
  const y=d.getFullYear()
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

function initialRange(){
  const end=new Date()
  const start=new Date()
  start.setDate(start.getDate()-29)
  return {start:localDate(start),end:localDate(end)}
}

function rangeIso(start:string,end:string){
  const startDate=new Date(`${start}T00:00:00`)
  const endDate=new Date(`${end}T00:00:00`)
  endDate.setDate(endDate.getDate()+1)
  return {from:startDate.toISOString(),to:endDate.toISOString()}
}

function percent(value:number){
  return `${value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`
}

function methodLabel(v:string){
  const key=String(v||'').toLowerCase()
  if(key==='pix')return 'PIX'
  if(key==='dinheiro')return 'Dinheiro'
  if(key==='debito'||key==='débito')return 'Débito'
  if(key==='credito'||key==='crédito')return 'Crédito'
  return v||'Outros'
}

export default function Reports(){
  const org=useOrganization()
  const initial=useMemo(initialRange,[])
  const [startDate,setStartDate]=useState(initial.start)
  const [endDate,setEndDate]=useState(initial.end)
  const [tab,setTab]=useState<Tab>('geral')
  const [sales,setSales]=useState<SaleRow[]>([])
  const [products,setProducts]=useState<ProductDay[]>([])
  const [payments,setPayments]=useState<PaymentDay[]>([])
  const [production,setProduction]=useState<ProductionRow[]>([])
  const [stock,setStock]=useState<StockRow[]>([])
  const [titles,setTitles]=useState<FinancialTitle[]>([])
  const [transactions,setTransactions]=useState<FinancialTx[]>([])
  const [accounts,setAccounts]=useState<AccountRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    const orgId=org.organization?.id
    if(!orgId)return
    setLoading(true);setError('')
    const iso=rangeIso(startDate,endDate)

    const [
      salesRes,
      productsRes,
      paymentsRes,
      productionRes,
      stockRes,
      titlesRes,
      txRes,
      accountsRes
    ]=await Promise.all([
      db.from('sales_order_summary')
        .select('order_id,channel,status,total,cmv,gross_profit,gross_margin_percent,item_quantity,created_at,closed_at')
        .eq('organization_id',orgId)
        .eq('status','fechado')
        .gte('closed_at',iso.from)
        .lt('closed_at',iso.to)
        .order('closed_at',{ascending:false}),
      db.from('report_sales_product_daily')
        .select('sale_date,product_id,product_name,quantity_sold,revenue,cmv,gross_profit,gross_margin_percent')
        .eq('organization_id',orgId)
        .gte('sale_date',startDate)
        .lte('sale_date',endDate),
      db.from('report_payment_method_daily')
        .select('payment_date,method,payment_count,amount')
        .eq('organization_id',orgId)
        .gte('payment_date',startDate)
        .lte('payment_date',endDate),
      db.from('production_order_summary')
        .select('production_order_id,code,recipe_name,product_name,planned_yield,actual_yield,standard_cost,actual_cost,status,created_at,completed_at')
        .eq('organization_id',orgId)
        .eq('status','concluida')
        .gte('completed_at',iso.from)
        .lt('completed_at',iso.to)
        .order('completed_at',{ascending:false}),
      db.from('product_stock_summary')
        .select('product_id,name,category,stock_unit_symbol,sale_price,minimum_stock,available_quantity,unit_cost,stock_value,active,available')
        .eq('organization_id',orgId)
        .eq('active',true)
        .order('name'),
      db.from('financial_titles_summary')
        .select('id,title_type,description,due_date,original_amount,settled_amount,open_amount,display_status')
        .eq('organization_id',orgId)
        .order('due_date',{ascending:true}),
      db.from('financial_transactions')
        .select('id,direction,category,amount,occurred_at,description')
        .eq('organization_id',orgId)
        .gte('occurred_at',iso.from)
        .lt('occurred_at',iso.to)
        .order('occurred_at',{ascending:false}),
      db.from('financial_account_balances')
        .select('account_id,name,account_type,active,current_balance')
        .eq('organization_id',orgId)
        .eq('active',true)
        .order('name')
    ])

    const firstError=[
      salesRes.error,productsRes.error,paymentsRes.error,productionRes.error,
      stockRes.error,titlesRes.error,txRes.error,accountsRes.error
    ].find(Boolean)

    if(firstError){
      setError(firstError.message)
    }

    setSales((salesRes.data||[]) as SaleRow[])
    setProducts((productsRes.data||[]) as ProductDay[])
    setPayments((paymentsRes.data||[]) as PaymentDay[])
    setProduction((productionRes.data||[]) as ProductionRow[])
    setStock((stockRes.data||[]) as StockRow[])
    setTitles((titlesRes.data||[]) as FinancialTitle[])
    setTransactions((txRes.data||[]) as FinancialTx[])
    setAccounts((accountsRes.data||[]) as AccountRow[])
    setLoading(false)
  }

  useEffect(()=>{
    if(org.organization?.id)load()
  },[org.organization?.id])

  const kpi=useMemo(()=>{
    const revenue=sales.reduce((s,r)=>s+num(r.total),0)
    const cmv=sales.reduce((s,r)=>s+num(r.cmv),0)
    const grossProfit=sales.reduce((s,r)=>s+num(r.gross_profit),0)
    const salesCount=sales.length
    const ticket=salesCount?revenue/salesCount:0
    const items=sales.reduce((s,r)=>s+num(r.item_quantity),0)
    const margin=revenue?grossProfit/revenue*100:0
    return {revenue,cmv,grossProfit,salesCount,ticket,items,margin}
  },[sales])

  const productRanking=useMemo(()=>{
    const map=new Map<string,{name:string;quantity:number;revenue:number;cmv:number;profit:number}>()
    products.forEach(p=>{
      const key=p.product_id||p.product_name
      const current=map.get(key)||{name:p.product_name,quantity:0,revenue:0,cmv:0,profit:0}
      current.quantity+=num(p.quantity_sold)
      current.revenue+=num(p.revenue)
      current.cmv+=num(p.cmv)
      current.profit+=num(p.gross_profit)
      map.set(key,current)
    })
    return Array.from(map.values()).sort((a,b)=>b.revenue-a.revenue)
  },[products])

  const paymentRanking=useMemo(()=>{
    const map=new Map<string,{method:string,count:number;amount:number}>()
    payments.forEach(p=>{
      const current=map.get(p.method)||{method:p.method,count:0,amount:0}
      current.count+=Number(p.payment_count||0)
      current.amount+=num(p.amount)
      map.set(p.method,current)
    })
    return Array.from(map.values()).sort((a,b)=>b.amount-a.amount)
  },[payments])

  const channelRanking=useMemo(()=>{
    const map=new Map<string,{channel:string,count:number;amount:number}>()
    sales.forEach(s=>{
      const current=map.get(s.channel)||{channel:s.channel,count:0,amount:0}
      current.count+=1
      current.amount+=num(s.total)
      map.set(s.channel,current)
    })
    return Array.from(map.values()).sort((a,b)=>b.amount-a.amount)
  },[sales])

  const productionKpi=useMemo(()=>{
    const count=production.length
    const standard=production.reduce((s,r)=>s+num(r.standard_cost),0)
    const actual=production.reduce((s,r)=>s+num(r.actual_cost),0)
    const plannedYield=production.reduce((s,r)=>s+num(r.planned_yield),0)
    const actualYield=production.reduce((s,r)=>s+num(r.actual_yield),0)
    const yieldRate=plannedYield?actualYield/plannedYield*100:0
    const variance=actual-standard
    return {count,standard,actual,plannedYield,actualYield,yieldRate,variance}
  },[production])

  const stockKpi=useMemo(()=>{
    const value=stock.reduce((s,r)=>s+num(r.stock_value),0)
    const quantity=stock.reduce((s,r)=>s+num(r.available_quantity),0)
    const critical=stock.filter(r=>num(r.available_quantity)<=num(r.minimum_stock)).length
    const available=stock.filter(r=>r.available&&num(r.available_quantity)>0).length
    return {value,quantity,critical,available}
  },[stock])

  const financeKpi=useMemo(()=>{
    const entradas=transactions.filter(t=>t.direction==='entrada').reduce((s,t)=>s+num(t.amount),0)
    const saidas=transactions.filter(t=>t.direction==='saida').reduce((s,t)=>s+num(t.amount),0)
    const payable=titles
      .filter(t=>t.title_type==='pagar'&&!['quitado','cancelado'].includes(t.display_status))
      .reduce((s,t)=>s+num(t.open_amount),0)
    const receivable=titles
      .filter(t=>t.title_type==='receber'&&!['quitado','cancelado'].includes(t.display_status))
      .reduce((s,t)=>s+num(t.open_amount),0)
    const overdue=titles
      .filter(t=>t.display_status==='vencido')
      .reduce((s,t)=>s+num(t.open_amount),0)
    const bankBalance=accounts
      .filter(a=>a.account_type!=='caixa')
      .reduce((s,a)=>s+num(a.current_balance),0)
    return {entradas,saidas,net:entradas-saidas,payable,receivable,overdue,bankBalance}
  },[transactions,titles,accounts])

  function quick(days:number){
    const end=new Date()
    const start=new Date()
    start.setDate(start.getDate()-(days-1))
    setStartDate(localDate(start))
    setEndDate(localDate(end))
  }

  function monthCurrent(){
    const d=new Date()
    setStartDate(localDate(new Date(d.getFullYear(),d.getMonth(),1)))
    setEndDate(localDate(d))
  }

  function exportCsv(){
    const rows=[
      ['Relatório MoveAI SmartPDV'],
      ['Período',startDate,endDate],
      [],
      ['Indicador','Valor'],
      ['Faturamento',kpi.revenue.toFixed(2)],
      ['CMV',kpi.cmv.toFixed(2)],
      ['Lucro bruto',kpi.grossProfit.toFixed(2)],
      ['Margem bruta %',kpi.margin.toFixed(2)],
      ['Vendas',String(kpi.salesCount)],
      ['Ticket médio',kpi.ticket.toFixed(2)],
      ['Entradas financeiras',financeKpi.entradas.toFixed(2)],
      ['Saídas financeiras',financeKpi.saidas.toFixed(2)],
      ['Estoque atual',stockKpi.value.toFixed(2)],
      [],
      ['Produtos mais vendidos'],
      ['Produto','Quantidade','Faturamento','CMV','Lucro bruto'],
      ...productRanking.map(p=>[p.name,String(p.quantity),p.revenue.toFixed(2),p.cmv.toFixed(2),p.profit.toFixed(2)])
    ]
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url
    a.download=`relatorio-${startDate}-a-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if(org.loading||loading)return <LoadingPanel text="Carregando relatórios..." />

  return <div className="page">
    <PageHeader title="Relatórios" description="Vendas, CMV, produção, estoque e financeiro consolidados em uma única visão." />

    <ErrorBanner message={error}/>

    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Período analisado</h3>
          <p>Indicadores de vendas, produção e movimentações financeiras respeitam este intervalo.</p>
        </div>
        <div className="panel-actions">
          <button className="secondary" onClick={()=>quick(7)}>7 dias</button>
          <button className="secondary" onClick={()=>quick(30)}>30 dias</button>
          <button className="secondary" onClick={monthCurrent}>Mês atual</button>
          <button className="secondary" onClick={exportCsv}>Exportar CSV</button>
          <button className="primary" onClick={load}>Atualizar</button>
        </div>
      </div>
      <div className="form-grid two">
        <label className="field"><span>De</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label className="field"><span>Até</span><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
      </div>
    </div>

    <div className="filter-row">
      {([
        ['geral','Visão geral'],
        ['vendas','Vendas'],
        ['producao','Produção'],
        ['estoque','Estoque'],
        ['financeiro','Financeiro']
      ] as [Tab,string][]).map(([key,label])=>
        <button key={key} className={tab===key?'filter-chip active':'filter-chip'} onClick={()=>setTab(key)}>{label}</button>
      )}
    </div>

    {tab==='geral'&&<>
      <div className="stats-grid">
        <div className="stat-card"><span>Faturamento</span><strong>{brl.format(kpi.revenue)}</strong><small>{kpi.salesCount} venda(s) no período.</small></div>
        <div className="stat-card"><span>CMV</span><strong>{brl.format(kpi.cmv)}</strong><small>Custo dos produtos vendidos.</small></div>
        <div className="stat-card"><span>Lucro bruto</span><strong>{brl.format(kpi.grossProfit)}</strong><small>Margem {percent(kpi.margin)}.</small></div>
        <div className="stat-card"><span>Ticket médio</span><strong>{brl.format(kpi.ticket)}</strong><small>{kpi.items.toLocaleString('pt-BR')} item(ns) vendidos.</small></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Estoque acabado</span><strong>{brl.format(stockKpi.value)}</strong><small>Posição atual, não histórica.</small></div>
        <div className="stat-card"><span>Custo de produção</span><strong>{brl.format(productionKpi.actual)}</strong><small>{productionKpi.count} ordem(ns) concluída(s).</small></div>
        <div className="stat-card"><span>Fluxo financeiro</span><strong>{brl.format(financeKpi.net)}</strong><small>Entradas menos saídas no período.</small></div>
        <div className="stat-card"><span>Saldo bancário</span><strong>{brl.format(financeKpi.bankBalance)}</strong><small>Posição atual de bancos/adquirentes.</small></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Produtos com maior faturamento</h3><p>Ranking consolidado do período selecionado.</p></div></div>
        {productRanking.length===0?<div className="panel-empty">Nenhuma venda no período.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Produto</th><th>Qtd.</th><th>Faturamento</th><th>CMV</th><th>Lucro bruto</th><th>Margem</th></tr></thead>
            <tbody>{productRanking.slice(0,10).map(p=><tr key={p.name}>
              <td><strong>{p.name}</strong></td>
              <td>{p.quantity.toLocaleString('pt-BR')}</td>
              <td>{brl.format(p.revenue)}</td>
              <td>{brl.format(p.cmv)}</td>
              <td>{brl.format(p.profit)}</td>
              <td>{percent(p.revenue?p.profit/p.revenue*100:0)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}

    {tab==='vendas'&&<>
      <div className="stats-grid">
        <div className="stat-card"><span>Vendas</span><strong>{kpi.salesCount}</strong><small>Pedidos fechados.</small></div>
        <div className="stat-card"><span>Faturamento</span><strong>{brl.format(kpi.revenue)}</strong><small>Valor total vendido.</small></div>
        <div className="stat-card"><span>Ticket médio</span><strong>{brl.format(kpi.ticket)}</strong><small>Faturamento ÷ vendas.</small></div>
        <div className="stat-card"><span>Margem bruta</span><strong>{percent(kpi.margin)}</strong><small>Lucro bruto sobre faturamento.</small></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Formas de pagamento</h3><p>Recebimentos registrados nas vendas fechadas do período.</p></div></div>
        {paymentRanking.length===0?<div className="panel-empty">Nenhum pagamento no período.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Forma</th><th>Registros</th><th>Valor</th><th>Participação</th></tr></thead>
            <tbody>{paymentRanking.map(p=><tr key={p.method}>
              <td><strong>{methodLabel(p.method)}</strong></td>
              <td>{p.count}</td>
              <td>{brl.format(p.amount)}</td>
              <td>{percent(kpi.revenue?p.amount/kpi.revenue*100:0)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Canais de venda</h3><p>Distribuição por balcão, retirada, encomenda ou outros canais registrados.</p></div></div>
        {channelRanking.length===0?<div className="panel-empty">Nenhuma venda no período.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Canal</th><th>Vendas</th><th>Faturamento</th><th>Participação</th></tr></thead>
            <tbody>{channelRanking.map(c=><tr key={c.channel}>
              <td><strong>{c.channel}</strong></td>
              <td>{c.count}</td>
              <td>{brl.format(c.amount)}</td>
              <td>{percent(kpi.revenue?c.amount/kpi.revenue*100:0)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}

    {tab==='producao'&&<>
      <div className="stats-grid">
        <div className="stat-card"><span>Ordens concluídas</span><strong>{productionKpi.count}</strong><small>No período selecionado.</small></div>
        <div className="stat-card"><span>Custo padrão</span><strong>{brl.format(productionKpi.standard)}</strong><small>Planejamento das ordens.</small></div>
        <div className="stat-card"><span>Custo real</span><strong>{brl.format(productionKpi.actual)}</strong><small>Consumo efetivamente realizado.</small></div>
        <div className="stat-card"><span>Rendimento</span><strong>{percent(productionKpi.yieldRate)}</strong><small>Realizado ÷ planejado.</small></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Ordens concluídas</h3><p>Comparação entre custo e rendimento planejados e realizados.</p></div></div>
        {production.length===0?<div className="panel-empty">Nenhuma produção concluída no período.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Ordem</th><th>Produto / receita</th><th>Planejado</th><th>Realizado</th><th>Custo padrão</th><th>Custo real</th><th>Conclusão</th></tr></thead>
            <tbody>{production.map(p=><tr key={p.production_order_id}>
              <td><strong>{p.code}</strong></td>
              <td>{p.product_name||p.recipe_name}</td>
              <td>{num(p.planned_yield).toLocaleString('pt-BR')}</td>
              <td>{num(p.actual_yield).toLocaleString('pt-BR')}</td>
              <td>{brl.format(num(p.standard_cost))}</td>
              <td>{brl.format(num(p.actual_cost))}</td>
              <td>{p.completed_at?dateBR(p.completed_at):'—'}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}

    {tab==='estoque'&&<>
      <div className="stats-grid">
        <div className="stat-card"><span>Valor em acabados</span><strong>{brl.format(stockKpi.value)}</strong><small>Saldo atual × custo médio.</small></div>
        <div className="stat-card"><span>Quantidade total</span><strong>{stockKpi.quantity.toLocaleString('pt-BR')}</strong><small>Soma das unidades de estoque.</small></div>
        <div className="stat-card"><span>Produtos disponíveis</span><strong>{stockKpi.available}</strong><small>Ativos, vendáveis e com saldo.</small></div>
        <div className="stat-card"><span>Estoque crítico</span><strong>{stockKpi.critical}</strong><small>No ou abaixo do mínimo.</small></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Posição atual de produtos acabados</h3><p>Este quadro representa o estoque atual, independentemente do período selecionado.</p></div></div>
        {stock.length===0?<div className="panel-empty">Nenhum produto ativo.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Produto</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Custo unit.</th><th>Valor estoque</th><th>Status</th></tr></thead>
            <tbody>{stock.map(p=>{
              const critical=num(p.available_quantity)<=num(p.minimum_stock)
              return <tr key={p.product_id}>
                <td><strong>{p.name}</strong></td>
                <td>{p.category||'—'}</td>
                <td>{num(p.available_quantity).toLocaleString('pt-BR')} {p.stock_unit_symbol}</td>
                <td>{num(p.minimum_stock).toLocaleString('pt-BR')}</td>
                <td>{brl.format(num(p.unit_cost))}</td>
                <td>{brl.format(num(p.stock_value))}</td>
                <td>{critical?'Crítico':'Disponível'}</td>
              </tr>
            })}</tbody>
          </table></div>}
      </div>
    </>}

    {tab==='financeiro'&&<>
      <div className="stats-grid">
        <div className="stat-card"><span>Entradas no período</span><strong>{brl.format(financeKpi.entradas)}</strong><small>Movimentações financeiras.</small></div>
        <div className="stat-card"><span>Saídas no período</span><strong>{brl.format(financeKpi.saidas)}</strong><small>Movimentações financeiras.</small></div>
        <div className="stat-card"><span>Fluxo líquido</span><strong>{brl.format(financeKpi.net)}</strong><small>Entradas menos saídas.</small></div>
        <div className="stat-card"><span>Saldo bancário</span><strong>{brl.format(financeKpi.bankBalance)}</strong><small>Posição atual.</small></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><span>Contas a pagar</span><strong>{brl.format(financeKpi.payable)}</strong><small>Saldo atual em aberto.</small></div>
        <div className="stat-card"><span>Contas a receber</span><strong>{brl.format(financeKpi.receivable)}</strong><small>Saldo atual em aberto.</small></div>
        <div className="stat-card"><span>Vencidos</span><strong>{brl.format(financeKpi.overdue)}</strong><small>Títulos vencidos não quitados.</small></div>
        <div className="stat-card"><span>Posição projetada</span><strong>{brl.format(financeKpi.receivable-financeKpi.payable)}</strong><small>Receber menos pagar.</small></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Movimentações do período</h3><p>Entradas e saídas registradas no livro financeiro.</p></div></div>
        {transactions.length===0?<div className="panel-empty">Nenhuma movimentação no período.</div>:
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead>
            <tbody>{transactions.slice(0,100).map(t=><tr key={t.id}>
              <td>{dateBR(t.occurred_at)}</td>
              <td>{t.direction==='entrada'?'Entrada':'Saída'}</td>
              <td>{t.category}</td>
              <td>{t.description||'—'}</td>
              <td>{t.direction==='entrada'?'+ ':'- '}{brl.format(num(t.amount))}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}
  </div>
}
