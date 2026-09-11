import {
  useCallback,
  useEffect,
  useState,
} from "react"
import { Link } from "react-router-dom"
import {
  PageHeader,
  StatCard,
} from "../components/UI"
import {
  ErrorBanner,
  LoadingPanel,
  OrganizationSetup,
} from "../components/OperationalUI"
import { supabase } from "../lib/supabase"
import { brl } from "../lib/format"
import { useOrganization } from "../lib/useOrganization"

type StockSummary = {
  available_quantity: number
  stock_value: number
  minimum_stock: number
}

const roleLabels: Record<string, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  producao: "Produção",
  atendimento_caixa: "Atendimento / Caixa",
}

export default function Dashboard() {
  const org = useOrganization()
  const role = org.membership?.role || ""

  const [stock, setStock] = useState<StockSummary[]>([])
  const [purchaseCount, setPurchaseCount] = useState(0)
  const [supplierCount, setSupplierCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const canSeeProduction =
    role === "administrador" ||
    role === "producao"

  const load = useCallback(async () => {
    if (
      !supabase ||
      !org.organization ||
      !canSeeProduction
    ) {
      setLoading(false)
      setError("")
      return
    }

    setLoading(true)
    setError("")

    const organizationId =
      org.organization.id

    const [stockResult, purchaseResult, supplierResult] =
      await Promise.all([
        supabase
          .from("ingredient_stock_summary")
          .select(
            "available_quantity,stock_value,minimum_stock",
          )
          .eq("organization_id", organizationId),

        supabase
          .from("purchases")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("organization_id", organizationId)
          .eq("status", "confirmada"),

        supabase
          .from("suppliers")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("organization_id", organizationId)
          .eq("active", true),
      ])

    const firstError =
      stockResult.error ||
      purchaseResult.error ||
      supplierResult.error

    if (firstError) {
      setError(firstError.message)
    }

    setStock(
      (stockResult.data || []) as StockSummary[],
    )
    setPurchaseCount(purchaseResult.count ?? 0)
    setSupplierCount(supplierResult.count ?? 0)
    setLoading(false)
  }, [org.organization, canSeeProduction])

  useEffect(() => {
    void load()
  }, [load])

  if (org.loading) {
    return (
      <LoadingPanel text="Carregando visão geral..." />
    )
  }

  if (!org.organization) {
    return (
      <OrganizationSetup
        onCreate={org.bootstrap}
      />
    )
  }

  if (canSeeProduction && loading) {
    return (
      <LoadingPanel text="Carregando indicadores operacionais..." />
    )
  }

  const roleLabel =
    roleLabels[role] || "Usuário"

  const heroText =
    role === "atendimento_caixa"
      ? "Atendimento, vendas e caixa em uma visão simples, com acesso somente às áreas necessárias para a operação."
      : role === "financeiro"
        ? "Contas, bancos, títulos e relatórios organizados para apoiar o controle financeiro da operação."
        : role === "producao"
          ? "Estoque, compras, insumos, receitas e produção organizados para acompanhar a rotina operacional."
          : "Compras, estoque, produção, vendas, caixa e financeiro organizados em uma única operação, com rastreabilidade e dados reais."

  return (
    <>
      <div className="brand-hero">
        <div>
          <div className="hero-kicker">
            MoveAI SmartPDV
          </div>

          <h2>
            Gestão conectada. Decisão mais inteligente.
          </h2>

          <p>{heroText}</p>
        </div>

        <div className="hero-badge">
          <strong>by Move360</strong>
          <span>
            Tecnologia para operação e crescimento
          </span>
        </div>
      </div>

      <PageHeader
        title="Visão Geral"
        description={`Painel do perfil ${roleLabel}.`}
      />

      <ErrorBanner message={error || org.error} />

      {role === "atendimento_caixa" && (
        <CashierDashboard />
      )}

      {role === "financeiro" && (
        <FinanceDashboard />
      )}

      {role === "producao" && (
        <ProductionDashboard
          stock={stock}
          purchaseCount={purchaseCount}
          supplierCount={supplierCount}
        />
      )}

      {role === "administrador" && (
        <AdminDashboard
          stock={stock}
          purchaseCount={purchaseCount}
          supplierCount={supplierCount}
        />
      )}

      {!role && (
        <div className="panel">
          <h3>Perfil não identificado</h3>
          <p>
            Atualize a sessão ou peça ao administrador
            para revisar seu vínculo com a organização.
          </p>
        </div>
      )}
    </>
  )
}

function ProductionDashboard({
  stock,
  purchaseCount,
  supplierCount,
}: {
  stock: StockSummary[]
  purchaseCount: number
  supplierCount: number
}) {
  const stockValue = stock.reduce(
    (sum, item) =>
      sum + Number(item.stock_value || 0),
    0,
  )

  const critical = stock.filter(
    (item) =>
      Number(item.available_quantity) <=
      Number(item.minimum_stock),
  ).length

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Valor em estoque"
          value={brl.format(stockValue)}
          helper="Custo histórico dos lotes disponíveis."
        />

        <StatCard
          label="Estoque crítico"
          value={String(critical)}
          helper="Insumos abaixo ou no mínimo definido."
        />

        <StatCard
          label="Compras confirmadas"
          value={String(purchaseCount)}
          helper="Compras que já movimentaram estoque."
        />

        <StatCard
          label="Fornecedores ativos"
          value={String(supplierCount)}
          helper="Disponíveis para novas compras."
        />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Alertas operacionais</h3>

          <div className="panel-empty">
            {critical > 0
              ? `${critical} insumo(s) precisam de reposição.`
              : "Nenhum alerta crítico de estoque agora."}
          </div>
        </div>

        <QuickActions
          links={[
            ["/insumos", "Cadastrar insumo"],
            ["/fornecedores", "Novo fornecedor"],
            ["/compras", "Nova compra"],
            ["/estoque", "Ver estoque"],
            ["/receitas", "Receitas"],
            ["/producao", "Produção"],
          ]}
        />
      </div>
    </>
  )
}

function CashierDashboard() {
  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Vendas / PDV"
          value="Liberado"
          helper="Registrar e finalizar vendas."
        />

        <StatCard
          label="Encomendas"
          value="Liberado"
          helper="Acompanhar pedidos futuros."
        />

        <StatCard
          label="Caixa"
          value="Liberado"
          helper="Abertura, movimentações e fechamento."
        />

        <StatCard
          label="Perfil"
          value="Atendimento / Caixa"
          helper="Acesso restrito às áreas operacionais."
        />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Operação do atendimento</h3>

          <div className="panel-empty">
            Use os atalhos ao lado para acessar
            somente as rotinas liberadas para seu perfil.
          </div>
        </div>

        <QuickActions
          links={[
            ["/pdv", "Abrir Vendas / PDV"],
            ["/encomendas", "Ver encomendas"],
            ["/caixa", "Abrir caixa"],
          ]}
        />
      </div>
    </>
  )
}

function FinanceDashboard() {
  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Bancos"
          value="Liberado"
          helper="Contas e movimentações bancárias."
        />

        <StatCard
          label="Financeiro"
          value="Liberado"
          helper="Títulos, recebimentos e pagamentos."
        />

        <StatCard
          label="Relatórios"
          value="Liberado"
          helper="Análise consolidada da operação."
        />

        <StatCard
          label="Perfil"
          value="Financeiro"
          helper="Acesso restrito às áreas financeiras."
        />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Gestão financeira</h3>

          <div className="panel-empty">
            Seu perfil possui acesso às rotinas
            financeiras e aos relatórios autorizados.
          </div>
        </div>

        <QuickActions
          links={[
            ["/bancos", "Abrir bancos"],
            ["/financeiro", "Abrir financeiro"],
            ["/relatorios", "Ver relatórios"],
          ]}
        />
      </div>
    </>
  )
}

function AdminDashboard({
  stock,
  purchaseCount,
  supplierCount,
}: {
  stock: StockSummary[]
  purchaseCount: number
  supplierCount: number
}) {
  const stockValue = stock.reduce(
    (sum, item) =>
      sum + Number(item.stock_value || 0),
    0,
  )

  const critical = stock.filter(
    (item) =>
      Number(item.available_quantity) <=
      Number(item.minimum_stock),
  ).length

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Valor em estoque"
          value={brl.format(stockValue)}
          helper="Custo histórico dos lotes disponíveis."
        />

        <StatCard
          label="Estoque crítico"
          value={String(critical)}
          helper="Insumos abaixo ou no mínimo definido."
        />

        <StatCard
          label="Compras confirmadas"
          value={String(purchaseCount)}
          helper="Compras que já movimentaram estoque."
        />

        <StatCard
          label="Fornecedores ativos"
          value={String(supplierCount)}
          helper="Disponíveis para novas compras."
        />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Visão administrativa</h3>

          <div className="panel-empty">
            {critical > 0
              ? `${critical} insumo(s) precisam de reposição.`
              : "Operação sem alerta crítico de estoque agora."}
          </div>
        </div>

        <QuickActions
          links={[
            ["/pdv", "Vendas / PDV"],
            ["/estoque", "Estoque"],
            ["/producao", "Produção"],
            ["/financeiro", "Financeiro"],
            ["/relatorios", "Relatórios"],
            ["/usuarios", "Usuários"],
            ["/configuracoes", "Configurações"],
          ]}
        />
      </div>
    </>
  )
}

function QuickActions({
  links,
}: {
  links: Array<[string, string]>
}) {
  return (
    <div className="panel">
      <h3>Ações rápidas</h3>

      <div className="quick-grid">
        {links.map(([path, label]) => (
          <Link
            key={path}
            to={path}
            className="quick-action"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
