import { useOrganization } from "../lib/useOrganization"
import { useSubscription } from "../lib/useSubscription"
import {
  ErrorBanner,
  LoadingPanel,
} from "../components/OperationalUI"
import {
  PageHeader,
  StatCard,
} from "../components/UI"

const statusNames: Record<string, string> = {
  pending: "Aguardando ativação",
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  suspended: "Suspensa",
  canceled: "Cancelada",
}

function money(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0))
}

function date(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString(
    "pt-BR",
  )
}

export default function Subscription() {
  const org = useOrganization()
  const sub = useSubscription(
    org.organization?.id,
  )

  if (org.loading || sub.loading) {
    return (
      <LoadingPanel text="Carregando assinatura..." />
    )
  }

  return (
    <>
      <PageHeader
        title="Assinatura"
        description="Plano contratado, situação da conta e próximo vencimento."
      />

      <ErrorBanner
        message={sub.error || org.error}
      />

      {!sub.subscription ? (
        <div className="panel">
          <h3>Assinatura não encontrada</h3>
          <p>
            Solicite a ativação da sua empresa
            ao administrador da plataforma.
          </p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              label="Plano"
              value={
                sub.subscription.plan?.name ||
                "MoveAI SmartPDV"
              }
              helper="Plano atual da empresa."
            />

            <StatCard
              label="Mensalidade"
              value={money(
                sub.subscription.plan
                  ?.monthly_price || 0,
              )}
              helper="Cobrança mensal."
            />

            <StatCard
              label="Status"
              value={
                statusNames[
                  sub.subscription.status
                ] ||
                sub.subscription.status
              }
              helper="Situação atual da assinatura."
            />

            <StatCard
              label="Próximo vencimento"
              value={date(
                sub.subscription
                  .current_period_end,
              )}
              helper="Período vigente."
            />
          </div>

          <div
            className="panel"
            style={{ marginTop: 16 }}
          >
            <div className="panel-head">
              <h3>
                Plano MoveAI SmartPDV
              </h3>
              <p>
                Acesso ao sistema conforme
                o perfil de cada usuário.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <strong>
                  Personalização visual
                </strong>
                <p>
                  Logo, banner e esquema
                  de cores da empresa.
                </p>
              </div>

              <div>
                <strong>
                  Usuários por setor
                </strong>
                <p>
                  Administrador, Financeiro,
                  Produção e Atendimento/Caixa.
                </p>
              </div>

              <div>
                <strong>
                  Operação completa
                </strong>
                <p>
                  PDV, estoque, produção,
                  encomendas, caixa e financeiro.
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop:
                  "1px solid rgba(0,0,0,.08)",
              }}
            >
              <strong>
                Cobrança automática
              </strong>
              <p>
                A estrutura já está preparada
                para integração posterior com
                um gateway de pagamento.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
