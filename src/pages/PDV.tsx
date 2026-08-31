import { PageHeader } from '../components/UI'

export default function PDV(){
  return <><PageHeader title="Vendas / PDV" description="Atendimento touch-friendly para balcão, mesas, retirada e encomendas." />
  <div className="pdv">
    <div className="panel pdv-products"><div className="search-row"><input placeholder="Buscar produto..."/><button className="secondary">Categorias</button></div><div className="panel-empty">Cadastre produtos e preços para iniciar as vendas.</div></div>
    <div className="panel cart"><h3>Comanda atual</h3><div className="panel-empty">Nenhum item adicionado.</div><div className="cart-footer"><div><span>Total</span><strong>R$ 0,00</strong></div><button className="primary" disabled>Receber</button></div></div>
  </div></>
}
