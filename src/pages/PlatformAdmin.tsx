import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  Building2,
  Plus,
  RefreshCcw,
  UserPlus,
  X,
} from "lucide-react"
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

type BusinessProfile = {
  organization_id: string
  tax_id: string | null
  phone: string | null
  commercial_email: string | null
}

type NewClientForm = {
  companyName: string
  taxId: string
  phone: string
  commercialEmail: string
  adminName: string
  adminEmail: string
  adminPassword: string
  planId: string
  status: string
  dueDate: string
  displayName: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  sidebarColor: string
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

function defaultDueDate() {
  const date = new Date()
  date.setMonth(date.getMonth() + 1)
  return date.toISOString().slice(0, 10)
}

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const numbers = "23456789"
  const symbols = "!@#$%&*"
  const all = upper + lower + numbers + symbols

  let password =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    numbers[Math.floor(Math.random() * numbers.length)] +
    symbols[Math.floor(Math.random() * symbols.length)]

  while (password.length < 12) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")
}

function initialClientForm(
  plans: Plan[],
): NewClientForm {
  const preferred =
    plans.find(
      (plan) =>
        plan.code === "smartpdv-mensal" &&
        plan.active,
    ) ||
    plans.find((plan) => plan.active) ||
    plans[0]

  return {
    companyName: "",
    taxId: "",
    phone: "",
    commercialEmail: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    planId: preferred?.id || "",
    status: "active",
    dueDate: defaultDueDate(),
    displayName: "",
    primaryColor: "#C90D23",
    secondaryColor: "#17181D",
    accentColor: "#E21B36",
    sidebarColor: "#15161A",
  }
}

export default function PlatformAdmin() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [organizations, setOrganizations] =
    useState<Organization[]>([])
  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>([])
  const [businessProfiles, setBusinessProfiles] =
    useState<BusinessProfile[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [showNewPlan, setShowNewPlan] =
    useState(false)
  const [showNewClient, setShowNewClient] =
    useState(false)

  const [planName, setPlanName] =
    useState("")
  const [planCode, setPlanCode] =
    useState("")
  const [planPrice, setPlanPrice] =
    useState("249.90")

  const [client, setClient] =
    useState<NewClientForm>(
      initialClientForm([]),
    )

  const load = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    setError("")

    const [
      plansResult,
      orgsResult,
      subsResult,
      businessResult,
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

      supabase
        .from("organization_business_profiles")
        .select(
          "organization_id,tax_id,phone,commercial_email",
        ),
    ])

    const firstError =
      plansResult.error ||
      orgsResult.error ||
      subsResult.error ||
      businessResult.error

    if (firstError) {
      setError(firstError.message)
    }

    const loadedPlans =
      (plansResult.data || []) as Plan[]

    setPlans(loadedPlans)
    setOrganizations(
      (orgsResult.data ||
        []) as Organization[],
    )
    setSubscriptions(
      (subsResult.data ||
        []) as Subscription[],
    )
    setBusinessProfiles(
      (businessResult.data ||
        []) as BusinessProfile[],
    )

    setClient((current) => {
      if (current.planId) return current
      return initialClientForm(loadedPlans)
    })

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

  function updateClient(
    patch: Partial<NewClientForm>,
  ) {
    setClient((current) => ({
      ...current,
      ...patch,
    }))
  }

  async function createClient(
    event: FormEvent,
  ) {
    event.preventDefault()

    if (!supabase) return

    if (!client.companyName.trim()) {
      setError("Informe o nome da empresa.")
      return
    }

    if (!client.adminName.trim()) {
      setError(
        "Informe o nome do administrador.",
      )
      return
    }

    if (!client.adminEmail.trim()) {
      setError(
        "Informe o e-mail do administrador.",
      )
      return
    }

    if (
      !client.adminPassword ||
      client.adminPassword.length < 8
    ) {
      setError(
        "A senha inicial deve ter pelo menos 8 caracteres.",
      )
      return
    }

    if (!client.planId) {
      setError("Selecione um plano.")
      return
    }

    setSaving("client")
    setError("")
    setSuccess("")

    const { data, error: invokeError } =
      await supabase.functions.invoke(
        "platform-create-client",
        {
          body: {
            company_name:
              client.companyName.trim(),
            tax_id:
              client.taxId.trim() || null,
            phone:
              client.phone.trim() || null,
            commercial_email:
              client.commercialEmail.trim() ||
              null,
            admin_name:
              client.adminName.trim(),
            admin_email:
              client.adminEmail
                .trim()
                .toLowerCase(),
            admin_password:
              client.adminPassword,
            plan_id: client.planId,
            status: client.status,
            due_date:
              client.dueDate || null,
            branding: {
              display_name:
                client.displayName.trim() ||
                client.companyName.trim(),
              primary_color:
                client.primaryColor,
              secondary_color:
                client.secondaryColor,
              accent_color:
                client.accentColor,
              sidebar_color:
                client.sidebarColor,
            },
          },
        },
      )

    if (invokeError) {
      setError(invokeError.message)
      setSaving("")
      return
    }

    if (data?.error) {
      setError(data.error)
      setSaving("")
      return
    }

    setSuccess(
      `Cliente ${client.companyName} criado com sucesso. O administrador já pode entrar com ${client.adminEmail}.`,
    )

    setClient(
      initialClientForm(plans),
    )
    setShowNewClient(false)

    await load()
    setSaving("")
  }

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
        "Informe nome e código do novo plano.",
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
      if (
        insertError.message.includes(
          "saas_plans_code_key",
        )
      ) {
        setError(
          "Já existe um plano com esse código. Use outro código.",
        )
      } else {
        setError(insertError.message)
      }
    } else {
      setSuccess("Novo plano criado.")
      setPlanName("")
      setPlanCode("")
      setPlanPrice("249.90")
      setShowNewPlan(false)
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

  function getBusinessProfile(
    organizationId: string,
  ) {
    return businessProfiles.find(
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

    const now = new Date().toISOString()

    const payload = {
      organization_id: organizationId,
      plan_id: planId,
      status,
      started_at:
        current?.status === "active"
          ? undefined
          : now,
      current_period_start:
        status === "active"
          ? now
          : undefined,
      current_period_end:
        periodEnd
          ? new Date(
              `${periodEnd}T23:59:59`,
            ).toISOString()
          : null,
      canceled_at:
        status === "canceled"
          ? now
          : null,
      updated_at: now,
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
        description="Cadastre clientes, gerencie planos, mensalidades e acesso das empresas."
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

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <button
          className="ghost"
          type="button"
          onClick={() => void load()}
        >
          <RefreshCcw size={16} />
          Atualizar
        </button>

        <button
          className="primary"
          type="button"
          onClick={() => {
            setError("")
            setSuccess("")
            setClient(
              initialClientForm(plans),
            )
            setShowNewClient(true)
          }}
        >
          <UserPlus size={16} />
          Novo cliente
        </button>
      </div>

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

      {showNewClient && (
        <div
          className="panel"
          style={{
            marginTop: 16,
            border:
              "1px solid rgba(201,13,35,.25)",
          }}
        >
          <div
            className="panel-head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div>
              <h3>Novo cliente</h3>
              <p>
                Crie a empresa, o administrador
                principal e a assinatura em uma única etapa.
              </p>
            </div>

            <button
              className="ghost"
              type="button"
              aria-label="Fechar"
              onClick={() =>
                setShowNewClient(false)
              }
            >
              <X size={17} />
            </button>
          </div>

          <form onSubmit={createClient}>
            <h4>Empresa</h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Field label="Nome da empresa">
                <input
                  value={client.companyName}
                  onChange={(event) =>
                    updateClient({
                      companyName:
                        event.target.value,
                    })
                  }
                  required
                />
              </Field>

              <Field label="CNPJ / CPF">
                <input
                  value={client.taxId}
                  onChange={(event) =>
                    updateClient({
                      taxId:
                        event.target.value,
                    })
                  }
                  placeholder="Opcional"
                />
              </Field>

              <Field label="Telefone">
                <input
                  value={client.phone}
                  onChange={(event) =>
                    updateClient({
                      phone:
                        event.target.value,
                    })
                  }
                  placeholder="(00) 00000-0000"
                />
              </Field>

              <Field label="E-mail comercial">
                <input
                  type="email"
                  value={
                    client.commercialEmail
                  }
                  onChange={(event) =>
                    updateClient({
                      commercialEmail:
                        event.target.value,
                    })
                  }
                  placeholder="financeiro@empresa.com"
                />
              </Field>
            </div>

            <h4
              style={{ marginTop: 22 }}
            >
              Administrador principal
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Field label="Nome">
                <input
                  value={client.adminName}
                  onChange={(event) =>
                    updateClient({
                      adminName:
                        event.target.value,
                    })
                  }
                  required
                />
              </Field>

              <Field label="E-mail de acesso">
                <input
                  type="email"
                  value={client.adminEmail}
                  onChange={(event) =>
                    updateClient({
                      adminEmail:
                        event.target.value,
                    })
                  }
                  required
                />
              </Field>

              <Field
                label="Senha inicial"
                hint="Mínimo de 8 caracteres. O cliente poderá alterar depois."
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <input
                    type="text"
                    value={
                      client.adminPassword
                    }
                    onChange={(event) =>
                      updateClient({
                        adminPassword:
                          event.target.value,
                      })
                    }
                    required
                    minLength={8}
                  />

                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      updateClient({
                        adminPassword:
                          generatePassword(),
                      })
                    }
                  >
                    Gerar senha
                  </button>
                </div>
              </Field>
            </div>

            <h4
              style={{ marginTop: 22 }}
            >
              Assinatura
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <Field label="Plano">
                <select
                  value={client.planId}
                  onChange={(event) =>
                    updateClient({
                      planId:
                        event.target.value,
                    })
                  }
                  required
                >
                  <option value="">
                    Selecione
                  </option>

                  {plans
                    .filter(
                      (plan) => plan.active,
                    )
                    .map((plan) => (
                      <option
                        key={plan.id}
                        value={plan.id}
                      >
                        {plan.name} —{" "}
                        {money(
                          plan.monthly_price,
                        )}{" "}
                        / mês
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Status inicial">
                <select
                  value={client.status}
                  onChange={(event) =>
                    updateClient({
                      status:
                        event.target.value,
                    })
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
              </Field>

              <Field label="Próximo vencimento">
                <input
                  type="date"
                  value={client.dueDate}
                  onChange={(event) =>
                    updateClient({
                      dueDate:
                        event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <h4
              style={{ marginTop: 22 }}
            >
              Personalização inicial
            </h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <Field
                label="Nome exibido"
                hint="O cliente poderá trocar depois."
              >
                <input
                  value={client.displayName}
                  onChange={(event) =>
                    updateClient({
                      displayName:
                        event.target.value,
                    })
                  }
                  placeholder={
                    client.companyName ||
                    "Nome da marca"
                  }
                />
              </Field>

              <Field label="Cor principal">
                <input
                  type="color"
                  value={
                    client.primaryColor
                  }
                  onChange={(event) =>
                    updateClient({
                      primaryColor:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Cor secundária">
                <input
                  type="color"
                  value={
                    client.secondaryColor
                  }
                  onChange={(event) =>
                    updateClient({
                      secondaryColor:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Cor de destaque">
                <input
                  type="color"
                  value={
                    client.accentColor
                  }
                  onChange={(event) =>
                    updateClient({
                      accentColor:
                        event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Cor do menu lateral">
                <input
                  type="color"
                  value={
                    client.sidebarColor
                  }
                  onChange={(event) =>
                    updateClient({
                      sidebarColor:
                        event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <p
              style={{
                marginTop: 14,
                opacity: 0.7,
              }}
            >
              Logotipo e banner poderão ser
              enviados pelo administrador do
              cliente em Configurações assim que
              ele acessar o sistema.
            </p>

            <FormActions>
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  setShowNewClient(false)
                }
              >
                Cancelar
              </button>

              <button
                className="primary"
                type="submit"
                disabled={
                  saving === "client"
                }
              >
                <Building2 size={16} />
                {saving === "client"
                  ? "Criando cliente..."
                  : "Criar cliente"}
              </button>
            </FormActions>
          </form>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(280px, .75fr) minmax(0, 2fr)",
          gap: 16,
          marginTop: 16,
          alignItems: "start",
        }}
      >
        <div className="panel">
          <div
            className="panel-head"
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div>
              <h3>Planos</h3>
              <p>
                Planos disponíveis para
                os clientes.
              </p>
            </div>

            <button
              className="ghost"
              type="button"
              onClick={() =>
                setShowNewPlan(
                  (value) => !value,
                )
              }
            >
              <Plus size={16} />
              Novo plano
            </button>
          </div>

          {showNewPlan && (
            <form
              onSubmit={createPlan}
              style={{
                marginBottom: 18,
                paddingBottom: 18,
                borderBottom:
                  "1px solid rgba(0,0,0,.08)",
              }}
            >
              <Field label="Nome">
                <input
                  value={planName}
                  onChange={(event) =>
                    setPlanName(
                      event.target.value,
                    )
                  }
                  placeholder="Ex.: Plano Premium"
                  required
                />
              </Field>

              <Field
                label="Código"
                hint="Use um código único."
              >
                <input
                  value={planCode}
                  onChange={(event) =>
                    setPlanCode(
                      event.target.value,
                    )
                  }
                  placeholder="premium-mensal"
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
          )}

          <div
            style={{
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
            <h3>
              Clientes e assinaturas
            </h3>
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
                  <th>Contato</th>
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
                    businessProfile={
                      getBusinessProfile(
                        org.id,
                      )
                    }
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
  businessProfile,
  subscription,
  plans,
  saving,
  onSave,
}: {
  organization: Organization
  businessProfile?: BusinessProfile
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

        {businessProfile?.tax_id && (
          <div>
            <small>
              {businessProfile.tax_id}
            </small>
          </div>
        )}
      </td>

      <td>
        <div>
          {businessProfile?.commercial_email ||
            "-"}
        </div>
        <small>
          {businessProfile?.phone ||
            ""}
        </small>
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
