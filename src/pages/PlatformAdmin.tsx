import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  ErrorBanner,
  Field,
  FormActions,
  LoadingPanel,
} from "../components/OperationalUI"
import {
  PageHeader,
  StatCard,
} from "../components/UI"
import { supabase } from "../lib/supabase"

type Plan = {
  id: string
  code: string
  name: string
  description: string | null
  monthly_price: number | string
  currency: string
  billing_interval: string
  active: boolean
}

type Organization = {
  id: string
  name: string
}

type Subscription = {
  id: string
  organization_id: string
  plan_id: string
  status: string
  current_period_end: string | null
}

const statuses = [
  ["pending", "Aguardando ativação"],
  ["trialing", "Teste"],
  ["active", "Ativa"],
  ["past_due", "Pagamento pendente"],
  ["suspended", "Suspensa"],
  ["canceled", "Cancelada"],
] as const

function money(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0))
}

function toDateInput(value?: string | null) {
  if (!value) return ""
  return new Date(value)
    .toISOString()
    .slice(0, 10)
}

export default function PlatformAdmin() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [organizations, setOrganizations] =
    useState<Organization[]>([])
  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>([])
  const [loading, setLoading] =
    useState(true)
  const [saving, setSaving] =
    useState("")
  const [error, setError] =
    useState("")
  const [success, setSuccess] =
    useState("")

  const [planName, setPlanName] =
    useState("MoveAI SmartPDV")
  const [planCode, setPlanCode] =
    useState("smartpdv-mensal")
  const [planPrice, setPlanPrice] =
    useState("249.90")

  const load = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    setError("")

    const [
      plansResult,
      orgsResult,
      subsResult,
    ] = await Promise.all([
      supabase
        .from("saas_plans")
        .select(
          "id,code,name,description,monthly_price,currency,billing_interval,active",
        )
        .order("created_at"),

      supabase
        .from("organizations")
        .select("id,name")
        .order("name"),

      supabase
        .from("organization_subscriptions")
        .select(
          "id,organization_id,plan_id,status,current_period_end",
        ),
    ])

    const firstError =
      plansResult.error ||
      orgsResult.error ||
      subsResult.error

    if (firstError) {
      setError(firstError.message)
    }

    setPlans(
      (plansResult.data || []) as Plan[],
    )
    setOrganizations(
      (orgsResult.data ||
        []) as Organization[],
    )
    setSubscriptions(
      (subsResult.data ||
        []) as Subscription[],
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeCount = subscriptions.filter(
    (item) =>
      item.status === "active" ||
      item.status === "trialing",
  ).length

  const blockedCount = subscriptions.filter(
    (item) =>
      item.status === "past_due" ||
      item.status === "suspended" ||
      item.status === "canceled",
  ).length

  const mrr = useMemo(() => {
    return subscriptions
      .filter((item) =>
        ["active", "trialing"].includes(
          item.status,
        ),
      )
      .reduce((sum, item) => {
        const plan = plans.find(
          (current) =>
            current.id === item.plan_id,
        )

        return (
          sum +
          Number(plan?.monthly_price || 0)
        )
      }, 0)
  }, [plans, subscriptions])

  async function createPlan(
    event: FormEvent,
  ) {
    event.preventDefault()

    if (!supabase) return

    const cleanName = planName.trim()
    const cleanCode = planCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")

    if (!cleanName || !cleanCode) {
      setError(
        "Informe nome e código do plano.",
      )
      return
    }

    setSaving("plan")
    setError("")
    setSuccess("")

    const { error: insertError } =
      await supabase
        .from("saas_plans")
        .insert({
          name: cleanName,
          code: cleanCode,
          monthly_price: Number(
            planPrice || 0,
          ),
          currency: "BRL",
          billing_interval: "month",
          active: true,
        })

    if (insertError) {
      setError(insertError.message)
    } else {
      setSuccess("Plano criado.")
      await load()
    }

    setSaving("")
  }

  async function togglePlan(plan: Plan) {
    if (!supabase) return

    setSaving(`plan-${plan.id}`)
    setError("")
    setSuccess("")

    const { error: updateError } =
      await supabase
        .from("saas_plans")
        .update({
          active: !plan.active,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", plan.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess("Plano atualizado.")
      await load()
    }

    setSaving("")
  }

  function getSubscription(
    organizationId: string,
  ) {
    return subscriptions.find(
      (item) =>
        item.organization_id ===
        organizationId,
    )
  }

  async function saveSubscription(
    organizationId: string,
    planId: string,
    status: string,
    periodEnd: string,
  ) {
    if (!supabase) return

    if (!planId) {
      setError("Selecione um plano.")
      return
    }

    setSaving(`sub-${organizationId}`)
    setError("")
    setSuccess("")

    const current =
      getSubscription(organizationId)

    const payload = {
      organization_id: organizationId,
      plan_id: planId,
      status,
      started_at:
        current?.status === "active"
          ? undefined
          : new Date().toISOString(),
      current_period_start:
        status === "active"
          ? new Date().toISOString()
          : undefined,
      current_period_end:
        periodEnd
          ? new Date(
              `${periodEnd}T23:59:59`,
            ).toISOString()
          : null,
      canceled_at:
        status === "canceled"
          ? new Date().toISOString()
          : null,
      updated_at:
        new Date().toISOString(),
    }

    const { error: saveError } =
      await supabase
        .from("organization_subscriptions")
        .upsert(payload, {
          onConflict: "organization_id",
        })

    if (saveError) {
      setError(saveError.message)
    } else {
      setSuccess(
        "Assinatura atualizada.",
      )
      await load()
    }

    setSaving("")
  }

  if (loading) {
    return (
      <LoadingPanel text="Carregando plataforma SaaS..." />
    )
  }

  return (
    <>
      <PageHeader
        title="Plataforma SaaS"
        description="Gerencie planos, clientes, mensalidades e acesso das empresas."
      />

      <ErrorBanner message={error} />

      {success && (
        <div
          className="panel"
          style={{
            padding: 14,
            marginBottom: 16,
          }}
        >
          <strong>{success}</strong>
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          label="Empresas"
          value={String(
            organizations.length,
          )}
          helper="Organizações cadastradas."
        />

        <StatCard
          label="Assinaturas ativas"
          value={String(activeCount)}
          helper="Ativas ou em teste."
        />

        <StatCard
          label="MRR estimado"
          value={money(mrr)}
          helper="Receita mensal recorrente."
        />

        <StatCard
          label="Bloqueadas"
          value={String(blockedCount)}
          helper="Pendência, suspensão ou cancelamento."
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(300px, 0.8fr) minmax(0, 2fr)",
          gap: 16,
          marginTop: 16,
          alignItems: "start",
        }}
      >
        <div className="panel">
          <div className="panel-head">
            <h3>Novo plano</h3>
            <p>
              Crie outros planos além do
              MoveAI SmartPDV mensal.
            </p>
          </div>

          <form onSubmit={createPlan}>
            <Field label="Nome">
              <input
                value={planName}
                onChange={(event) =>
                  setPlanName(
                    event.target.value,
                  )
                }
                required
              />
            </Field>

            <Field label="Código">
              <input
                value={planCode}
                onChange={(event) =>
                  setPlanCode(
                    event.target.value,
                  )
                }
                required
              />
            </Field>

            <Field label="Mensalidade">
              <input
                type="number"
                min="0"
                step="0.01"
                value={planPrice}
                onChange={(event) =>
                  setPlanPrice(
                    event.target.value,
                  )
                }
                required
              />
            </Field>

            <FormActions>
              <button
                className="primary"
                type="submit"
                disabled={
                  saving === "plan"
                }
              >
                {saving === "plan"
                  ? "Criando..."
                  : "Criar plano"}
              </button>
            </FormActions>
          </form>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gap: 8,
            }}
          >
            {plans.map((plan) => (
              <div
                key={plan.id}
                style={{
                  padding: 12,
                  border:
                    "1px solid rgba(0,0,0,.08)",
                  borderRadius: 12,
                }}
              >
                <strong>
                  {plan.name}
                </strong>
                <div>
                  {money(
                    plan.monthly_price,
                  )}{" "}
                  / mês
                </div>
                <small>
                  {plan.code}
                </small>

                <div
                  style={{
                    marginTop: 8,
                  }}
                >
                  <button
                    className="ghost"
                    type="button"
                    disabled={
                      saving ===
                      `plan-${plan.id}`
                    }
                    onClick={() =>
                      void togglePlan(plan)
                    }
                  >
                    {plan.active
                      ? "Desativar"
                      : "Ativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Clientes e assinaturas</h3>
            <p>
              Ative, suspenda ou altere
              o plano de cada empresa.
            </p>
          </div>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Vencimento</th>
                  <th>Ação</th>
                </tr>
              </thead>

              <tbody>
                {organizations.map((org) => (
                  <SubscriptionRow
                    key={org.id}
                    organization={org}
                    subscription={
                      getSubscription(
                        org.id,
                      )
                    }
                    plans={plans}
                    saving={
                      saving ===
                      `sub-${org.id}`
                    }
                    onSave={
                      saveSubscription
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function SubscriptionRow({
  organization,
  subscription,
  plans,
  saving,
  onSave,
}: {
  organization: Organization
  subscription?: Subscription
  plans: Plan[]
  saving: boolean
  onSave: (
    organizationId: string,
    planId: string,
    status: string,
    periodEnd: string,
  ) => Promise<void>
}) {
  const [planId, setPlanId] =
    useState(
      subscription?.plan_id ||
        plans[0]?.id ||
        "",
    )

  const [status, setStatus] =
    useState(
      subscription?.status ||
        "pending",
    )

  const [periodEnd, setPeriodEnd] =
    useState(
      toDateInput(
        subscription?.current_period_end,
      ),
    )

  useEffect(() => {
    setPlanId(
      subscription?.plan_id ||
        plans[0]?.id ||
        "",
    )
    setStatus(
      subscription?.status ||
        "pending",
    )
    setPeriodEnd(
      toDateInput(
        subscription?.current_period_end,
      ),
    )
  }, [subscription, plans])

  return (
    <tr>
      <td>
        <strong>
          {organization.name}
        </strong>
      </td>

      <td>
        <select
          value={planId}
          onChange={(event) =>
            setPlanId(
              event.target.value,
            )
          }
        >
          {plans.map((plan) => (
            <option
              key={plan.id}
              value={plan.id}
            >
              {plan.name} —{" "}
              {money(
                plan.monthly_price,
              )}
            </option>
          ))}
        </select>
      </td>

      <td>
        <select
          value={status}
          onChange={(event) =>
            setStatus(
              event.target.value,
            )
          }
        >
          {statuses.map(
            ([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ),
          )}
        </select>
      </td>

      <td>
        <input
          type="date"
          value={periodEnd}
          onChange={(event) =>
            setPeriodEnd(
              event.target.value,
            )
          }
        />
      </td>

      <td>
        <button
          className="primary"
          type="button"
          disabled={saving}
          onClick={() =>
            void onSave(
              organization.id,
              planId,
              status,
              periodEnd,
            )
          }
        >
          {saving
            ? "Salvando..."
            : "Salvar"}
        </button>
      </td>
    </tr>
  )
}
