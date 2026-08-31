import { PageHeader, StatCard } from '../components/UI'

export default function Dashboard(){
  return <>
    <div className="brand-hero">
      <div>
        <div className="hero-kicker">MoveAI SmartPDV</div>
        <h2>Gestão conectada. Decisão mais inteligente.</h2>
        <p>Compras, estoque, produção, vendas, caixa e financeiro organizados em uma única operação, com rastreabilidade e dados reais.</p>
      </div>
      <div className="hero-badge"><strong>by Move360</strong><span>Tecnologia para operação e crescimento</span></div>
    </div>
    <PageHeader title="Visão Geral" description="Acompanhe operação, estoque, produção, vendas e finanças a partir de dados reais." />
    <div className="stats-grid">
      <StatCard label="Faturamento hoje" value="Sem dados" helper="Será calculado após as primeiras vendas." />
      <StatCard label="Ticket médio" value="Sem dados" helper="Baseado em vendas concluídas." />
      <StatCard label="Estoque crítico" value="Sem dados" helper="Usa estoque mínimo por insumo." />
      <StatCard label="Contas vencidas" value="Sem dados" helper="Somente registros financeiros reais." />
    </div>
    <div className="grid-2">
      <div className="panel"><h3>Alertas operacionais</h3><div className="panel-empty">Nenhum alerta disponível ainda.</div></div>
      <div className="panel"><h3>Ações rápidas</h3><div className="quick-grid"><a href="/compras">Nova compra</a><a href="/producao">Programar produção</a><a href="/pdv">Abrir PDV</a><a href="/caixa">Abrir caixa</a></div></div>
    </div>
  </>
}
