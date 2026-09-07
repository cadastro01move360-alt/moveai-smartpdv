import { useCallback, useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Minus, PackageSearch, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/UI'
import { ErrorBanner, LoadingPanel, Modal, OrganizationSetup } from '../components/OperationalUI'
import { supabase } from '../lib/supabase'
import { brl, numberBR } from '../lib/format'
import { useOrganization } from '../lib/useOrganization'

type Product={
  product_id:string
  name:string
  category:string|null
  internal_code:string|null
  barcode:string|null
  stock_unit_symbol:string
  sale_price:number
  available_quantity:number
  unit_cost:number
  gross_profit_unit:number
  gross_margin_percent:number
}

type CartItem={product:Product;quantity:number}
type SaleResult={order_id:string;total:number;cmv:number;gross_profit:number;gross_margin_percent:number}

export default function PDV(){
  const org=useOrganization()
  const [products,setProducts]=useState<Product[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('Todos')
  const [cart,setCart]=useState<CartItem[]>([])
  const [checkout,setCheckout]=useState(false)
  const [lastSale,setLastSale]=useState<SaleResult|null>(null)

  const load=useCallback(async()=>{
    if(!supabase||!org.organization)return
    setLoading(true);setError('')
    const {data,error:loadError}=await supabase
      .from('pdv_product_catalog')
      .select('product_id,name,category,internal_code,barcode,stock_unit_symbol,sale_price,available_quantity,unit_cost,gross_profit_unit,gross_margin_percent')
      .eq('organization_id',org.organization.id)
      .order('name')
    if(loadError){setError(loadError.message);setProducts([])}else setProducts((data??[]) as Product[])
    setLoading(false)
  },[org.organization?.id])

  useEffect(()=>{if(org.organization)load()},[org.organization?.id,load])

  const categories=useMemo(()=>['Todos',...Array.from(new Set(products.map(p=>p.category).filter((v):v is string=>!!v))).sort()], [products])
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return products.filter(p=>{
      const categoryMatch=category==='Todos'||p.category===category
      const textMatch=!q||[p.name,p.category,p.internal_code,p.barcode].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))
      return categoryMatch&&textMatch
    })
  },[products,query,category])

  const total=useMemo(()=>cart.reduce((sum,i)=>sum+Number(i.product.sale_price)*i.quantity,0),[cart])
  const cmv=useMemo(()=>cart.reduce((sum,i)=>sum+Number(i.product.unit_cost)*i.quantity,0),[cart])

  function add(product:Product){
    if(Number(product.available_quantity)<=0)return
    setCart(current=>{
      const found=current.find(i=>i.product.product_id===product.product_id)
      if(found){
        if(found.quantity>=Number(product.available_quantity))return current
        return current.map(i=>i.product.product_id===product.product_id?{...i,quantity:i.quantity+1}:i)
      }
      return [...current,{product,quantity:1}]
    })
  }
  function change(productId:string,delta:number){
    setCart(current=>current.flatMap(i=>{
      if(i.product.product_id!==productId)return [i]
      const next=i.quantity+delta
      if(next<=0)return []
      return [{...i,quantity:Math.min(next,Number(i.product.available_quantity))}]
    }))
  }
  function remove(productId:string){setCart(current=>current.filter(i=>i.product.product_id!==productId))}

  if(org.loading)return <LoadingPanel text="Carregando PDV…"/>
  if(!org.organization)return <><PageHeader title="Vendas / PDV" description="Atendimento de balcão com baixa automática do estoque acabado."/><OrganizationSetup onCreate={org.bootstrap}/></>

  return <>
    <PageHeader title="Vendas / PDV" description="Venda produtos acabados com baixa automática de estoque, CMV e margem registrados no pedido."/>
    {lastSale&&<div className="pdv-success"><CheckCircle2/><div><strong>Venda concluída • {brl.format(Number(lastSale.total))}</strong><span>CMV {brl.format(Number(lastSale.cmv))} • Lucro bruto {brl.format(Number(lastSale.gross_profit))} • Margem {numberBR.format(Number(lastSale.gross_margin_percent))}%</span></div></div>}
    <ErrorBanner message={error||org.error}/>
    <div className="pdv">
      <div className="panel pdv-products">
        <div className="search-row"><div className="pdv-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto, código ou categoria..."/></div><button className="secondary" onClick={load}>Atualizar</button></div>
        <div className="category-strip">{categories.map(c=><button key={c} className={category===c?'category-chip active':'category-chip'} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        {loading?<div className="pdv-loading">Carregando produtos…</div>:filtered.length===0?<div className="panel-empty pdv-empty"><PackageSearch/><strong>Nenhum produto disponível</strong><span>{products.length===0?'Cadastre produtos ativos, com preço e estoque acabado para vender.':'Nenhum produto corresponde à busca atual.'}</span></div>:<div className="pdv-grid">{filtered.map(p=><button key={p.product_id} className="pdv-product-card" onClick={()=>add(p)} disabled={Number(p.available_quantity)<=0}><div className="pdv-product-top"><span>{p.category||'Produto'}</span><small>{numberBR.format(Number(p.available_quantity))} {p.stock_unit_symbol}</small></div><strong>{p.name}</strong><div className="pdv-product-bottom"><b>{brl.format(Number(p.sale_price))}</b><small>CMV {brl.format(Number(p.unit_cost))}</small></div></button>)}</div>}
      </div>
      <div className="panel cart">
        <div className="cart-title"><div><ShoppingCart size={18}/><h3>Comanda atual</h3></div>{cart.length>0&&<button className="cart-clear" onClick={()=>setCart([])}>Limpar</button>}</div>
        {cart.length===0?<div className="panel-empty">Nenhum item adicionado.</div>:<div className="cart-items">{cart.map(i=><div className="cart-item" key={i.product.product_id}><div className="cart-item-main"><strong>{i.product.name}</strong><span>{brl.format(Number(i.product.sale_price))} × {numberBR.format(i.quantity)}</span></div><div className="cart-qty"><button onClick={()=>change(i.product.product_id,-1)}><Minus size={14}/></button><b>{numberBR.format(i.quantity)}</b><button onClick={()=>change(i.product.product_id,1)} disabled={i.quantity>=Number(i.product.available_quantity)}><Plus size={14}/></button><button className="remove" onClick={()=>remove(i.product.product_id)}><Trash2 size={14}/></button></div><strong className="cart-line-total">{brl.format(Number(i.product.sale_price)*i.quantity)}</strong></div>)}</div>}
        <div className="cart-footer"><div className="cart-metrics"><span>CMV estimado <b>{brl.format(cmv)}</b></span><span>Margem bruta <b>{brl.format(total-cmv)}</b></span></div><div><span>Total</span><strong>{brl.format(total)}</strong></div><button className="primary receive-btn" disabled={cart.length===0||total<=0} onClick={()=>setCheckout(true)}><Banknote size={17}/> Receber</button></div>
      </div>
    </div>
    {checkout&&<CheckoutModal organizationId={org.organization.id} locations={org.locations} cart={cart} total={total} onClose={()=>setCheckout(false)} onCompleted={async result=>{setCheckout(false);setCart([]);setLastSale(result);await load()}}/>}
  </>
}

function CheckoutModal({organizationId,locations,cart,total,onClose,onCompleted}:{organizationId:string;locations:{id:string;name:string}[];cart:CartItem[];total:number;onClose:()=>void;onCompleted:(result:SaleResult)=>void}){
  const [locationId,setLocationId]=useState(locations[0]?.id??'')
  const [channel,setChannel]=useState('balcao')
  const [method,setMethod]=useState('dinheiro')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  async function finish(){
    if(!supabase)return
    if(!locationId){setError('Selecione o local de estoque.');return}
    setSaving(true);setError('')
    const items=cart.map(i=>({product_id:i.product.product_id,quantity:i.quantity}))
    const {data,error:rpcError}=await supabase.rpc('finalize_pdv_sale',{p_organization_id:organizationId,p_stock_location_id:locationId,p_channel:channel,p_payment_method:method,p_items:items})
    if(rpcError){setError(rpcError.message);setSaving(false);return}

    const raw:any=Array.isArray(data)?data[0]:data
    let result:any=raw

    if(typeof raw==='string'){
      try{result=JSON.parse(raw)}catch{result=null}
    }

    const fallbackCmv=cart.reduce(
      (sum,i)=>sum+Number(i.product.unit_cost)*i.quantity,
      0
    )

    const saleTotal=Number(result?.total ?? result?.total_amount ?? total)
    const saleCmv=Number(result?.cmv ?? result?.total_cost ?? fallbackCmv)
    const saleGross=Number(
      result?.gross_profit ??
      result?.gross_profit_amount ??
      (saleTotal-saleCmv)
    )
    const saleMargin=Number(
      result?.gross_margin_percent ??
      result?.margin_percent ??
      (saleTotal>0 ? saleGross/saleTotal*100 : 0)
    )

    setSaving(false)

    onCompleted({
      order_id:String(result?.order_id ?? ''),
      total:Number.isFinite(saleTotal)?saleTotal:total,
      cmv:Number.isFinite(saleCmv)?saleCmv:fallbackCmv,
      gross_profit:Number.isFinite(saleGross)?saleGross:total-fallbackCmv,
      gross_margin_percent:Number.isFinite(saleMargin)
        ?saleMargin
        :(total>0?(total-fallbackCmv)/total*100:0)
    })
  }
  return <Modal title="Receber venda" onClose={onClose}><div className="checkout-body"><div className="checkout-total"><span>Total a receber</span><strong>{brl.format(total)}</strong></div><label className="field"><span>Canal</span><select value={channel} onChange={e=>setChannel(e.target.value)}><option value="balcao">Balcão</option><option value="retirada">Retirada</option><option value="encomenda">Encomenda</option></select></label><label className="field"><span>Local de estoque</span><select value={locationId} onChange={e=>setLocationId(e.target.value)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="field"><span>Forma de pagamento</span><select value={method} onChange={e=>setMethod(e.target.value)}><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option><option value="outro">Outro</option></select></label><ErrorBanner message={error}/><div className="form-actions"><button className="secondary" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" onClick={finish} disabled={saving}>{saving?'Finalizando…':`Confirmar ${brl.format(total)}`}</button></div></div></Modal>
}
