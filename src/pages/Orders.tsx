import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  Plus,
  RefreshCcw,
  Search,
  Truck,
} from "lucide-react"
import { supabase } from "../lib/supabase"
import { brl } from "../lib/format"
import { useOrganization } from "../lib/useOrganization"
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

type Product = {
  id: string
  name: string
  sale_price: number | string
}

type Encomenda = {
  id: string
  customer_name: string | null
  customer_phone: string | null
  fulfillment_type: "retirada" | "entrega"
  scheduled_for: string | null
  delivery_address: string | null
  notes: string | null
  deposit_amount: number | string
  fulfillment_status:
    | "pendente"
    | "confirmado"
    | "em_producao"
    | "pronto"
    | "entregue"
    | "cancelado"
  total: number | string
  status: "aberto" | "fechado" | "cancelado"
  created_at: string
}

type DraftItem = {
  product_id: string
  quantity: string
  notes: string
}

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
}

export default function Orders() {
  const org = useOrganization()

  const [orders, setOrders] = useState<Encomenda[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [fulfillmentType, setFulfillmentType] =
    useState<"retirada" | "entrega">("retirada")
  const [scheduledFor, setScheduledFor] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [depositAmount, setDepositAmount] = useState("0")
  const [items, setItems] = useState<DraftItem[]>([
    {
      product_id: "",
      quantity: "1",
      notes: "",
    },
  ])

  const load = useCallback(async () => {
    if (!supabase || !org.organization?.id) return

    setLoading(true)
    setError("")

    const organizationId = org.organization.id

    const [ordersResult, productsResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id,customer_name,customer_phone,fulfillment_type,scheduled_for,delivery_address,notes,deposit_amount,fulfillment_status,total,status,created_at",
        )
        .eq("organization_id", organizationId)
        .eq("channel", "encomenda")
        .order("scheduled_for", {
          ascending: true,
          nullsFirst: false,
        }),

      supabase
        .from("products")
        .select("id,name,sale_price")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
    ])

    const firstError =
      ordersResult.error || productsResult.error

    if (firstError) {
      setError(firstError.message)
    }

    setOrders((ordersResult.data || []) as Encomenda[])
    setProducts((productsResult.data || []) as Product[])
    setLoading(false)
  }, [org.organization?.id])

  useEffect(() => {
    void load()
  }, [load])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return orders

    return orders.filter((order) => {
      const values = [
        order.customer_name,
        order.customer_phone,
        statusLabels[order.fulfillment_status],
        order.fulfillment_type,
      ]

      return values.some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      )
    })
  }, [orders, search])

  const openCount = orders.filter(
    (order) =>
      !["entregue", "cancelado"].includes(
        order.fulfillment_status,
      ),
  ).length

  const readyCount = orders.filter(
    (order) => order.fulfillment_status === "pronto",
  ).length

  const today = new Date().toDateString()

  const todayCount = orders.filter((order) => {
    if (!order.scheduled_for) return false
    return new Date(order.scheduled_for).toDateString() === today
  }).length

  const openValue = orders
    .filter(
      (order) =>
        !["entregue", "cancelado"].includes(
          order.fulfillment_status,
        ),
    )
    .reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    )

  const draftTotal = items.reduce((sum, item) => {
    const product = products.find(
      (current) => current.id === item.product_id,
    )

    return (
      sum +
      Number(product?.sale_price || 0) *
        Number(item.quantity || 0)
    )
  }, 0)

  function resetForm() {
    setCustomerName("")
    setCustomerPhone("")
    setFulfillmentType("retirada")
    setScheduledFor("")
    setDeliveryAddress("")
    setNotes("")
    setDepositAmount("0")
    setItems([
      {
        product_id: "",
        quantity: "1",
        notes: "",
      },
    ])
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        product_id: "",
        quantity: "1",
        notes: "",
      },
    ])
  }

  function updateItem(
    index: number,
    patch: Partial<DraftItem>,
  ) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, ...patch }
          : item,
      ),
    )
  }

  function removeItem(index: number) {
    setItems((current) => {
      if (current.length === 1) return current
      return current.filter(
        (_, itemIndex) => itemIndex !== index,
      )
    })
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault()

    if (!supabase || !org.organization?.id) return

    const validItems = items.filter(
      (item) =>
        item.product_id &&
        Number(item.quantity) > 0,
    )

    if (!customerName.trim()) {
      setError("Informe o nome do cliente.")
      return
    }

    if (!scheduledFor) {
      setError("Informe a data e hora da encomenda.")
      return
    }

    if (
      fulfillmentType === "entrega" &&
      !deliveryAddress.trim()
    ) {
      setError("Informe o endereço de entrega.")
      return
    }

    if (validItems.length === 0) {
      setError("Adicione pelo menos um produto.")
      return
    }

    if (Number(depositAmount || 0) > draftTotal) {
      setError("O sinal não pode ser maior que o total.")
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")

    try {
      const { error: rpcError } = await supabase.rpc(
        "create_encomenda",
        {
          p_organization_id: org.organization.id,
          p_customer_name: customerName.trim(),
          p_customer_phone:
            customerPhone.trim() || null,
          p_fulfillment_type: fulfillmentType,
          p_scheduled_for: new Date(
            scheduledFor,
          ).toISOString(),
          p_delivery_address:
            fulfillmentType === "entrega"
              ? deliveryAddress.trim()
              : null,
          p_notes: notes.trim() || null,
          p_deposit_amount: Number(
            depositAmount || 0,
          ),
          p_items: validItems.map((item) => ({
            product_id: item.product_id,
            quantity: Number(item.quantity),
            notes: item.notes.trim() || null,
          })),
        },
      )

      if (rpcError) throw rpcError

      setSuccess("Encomenda criada com sucesso.")
      resetForm()
      setShowForm(false)
      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a encomenda.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(
    order: Encomenda,
    fulfillmentStatus: Encomenda["fulfillment_status"],
  ) {
    if (!supabase) return

    setError("")
    setSuccess("")

    const orderStatus =
      fulfillmentStatus === "entregue"
        ? "fechado"
        : fulfillmentStatus === "cancelado"
          ? "cancelado"
          : "aberto"

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        fulfillment_status: fulfillmentStatus,
        status: orderStatus,
        closed_at:
          orderStatus === "aberto"
            ? null
            : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(
      `Status alterado para ${statusLabels[fulfillmentStatus]}.`,
    )
    await load()
  }

  if (org.loading || loading) {
    return (
      <LoadingPanel text="Carregando encomendas..." />
    )
  }

  return (
    <>
      <PageHeader
        title="Encomendas"
        description="Organize pedidos futuros, sinais, saldo, retirada e entrega."
      />

      <ErrorBanner message={error || org.error} />

      {success && (
        <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
          <strong>{success}</strong>
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          label="Em aberto"
          value={String(openCount)}
          helper="Pedidos ainda não finalizados."
        />
        <StatCard
          label="Para hoje"
          value={String(todayCount)}
          helper="Retiradas ou entregas agendadas."
        />
        <StatCard
          label="Prontas"
          value={String(readyCount)}
          helper="Aguardando retirada ou entrega."
        />
        <StatCard
          label="Valor em aberto"
          value={brl.format(openValue)}
          helper="Total das encomendas ativas."
        />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Agenda de encomendas</h3>
            <p style={{ marginBottom: 0 }}>Acompanhe cliente, horário, sinal, saldo e status.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ghost" type="button" onClick={() => void load()}>
              <RefreshCcw size={16} />
              Atualizar
            </button>
            <button className="primary" type="button" onClick={() => setShowForm((value) => !value)}>
              <Plus size={16} />
              Nova encomenda
            </button>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 16 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 12 }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por cliente, telefone ou status"
            style={{ width: "100%", paddingLeft: 38 }}
          />
        </div>
      </div>

      {showForm && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Nova encomenda</h3>

          <form onSubmit={createOrder}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <Field label="Cliente">
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
              </Field>

              <Field label="Telefone">
                <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(00) 00000-0000" />
              </Field>

              <Field label="Retirada ou entrega">
                <select value={fulfillmentType} onChange={(event) => setFulfillmentType(event.target.value as "retirada" | "entrega")}>
                  <option value="retirada">Retirada</option>
                  <option value="entrega">Entrega</option>
                </select>
              </Field>

              <Field label="Data e hora">
                <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} required />
              </Field>

              <Field label="Sinal">
                <input type="number" min="0" step="0.01" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              </Field>
            </div>

            {fulfillmentType === "entrega" && (
              <Field label="Endereço de entrega">
                <input value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} required />
              </Field>
            )}

            <Field label="Observações gerais">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </Field>

            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h3 style={{ margin: 0 }}>Produtos</h3>
                <button className="ghost" type="button" onClick={addItem}>
                  <Plus size={16} />
                  Adicionar item
                </button>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {items.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 2fr) 110px minmax(180px, 1fr) auto",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    <Field label="Produto">
                      <select
                        value={item.product_id}
                        onChange={(event) => updateItem(index, { product_id: event.target.value })}
                        required
                      >
                        <option value="">Selecione</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} — {brl.format(Number(product.sale_price || 0))}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Qtd.">
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: event.target.value })}
                        required
                      />
                    </Field>

                    <Field label="Observação do item">
                      <input
                        value={item.notes}
                        onChange={(event) => updateItem(index, { notes: event.target.value })}
                      />
                    </Field>

                    <button
                      className="ghost"
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, fontSize: 18 }}>
              <strong>Total previsto: {brl.format(draftTotal)}</strong>
            </div>

            <FormActions>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  resetForm()
                  setShowForm(false)
                }}
              >
                Cancelar
              </button>

              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Criar encomenda"}
              </button>
            </FormActions>
          </form>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {filteredOrders.length === 0 ? (
          <div className="panel">
            <div className="panel-empty">Nenhuma encomenda encontrada.</div>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const total = Number(order.total || 0)
            const deposit = Number(order.deposit_amount || 0)
            const balance = Math.max(total - deposit, 0)

            return (
              <div key={order.id} className="panel">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 2fr) repeat(4, minmax(130px, 1fr))",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 17 }}>
                      {order.customer_name || "Cliente"}
                    </strong>
                    <div style={{ opacity: 0.7, marginTop: 4 }}>
                      {order.customer_phone || "Sem telefone"}
                    </div>
                  </div>

                  <div>
                    <small>Agendamento</small>
                    <br />
                    <strong>
                      {order.scheduled_for
                        ? new Date(order.scheduled_for).toLocaleString("pt-BR")
                        : "-"}
                    </strong>
                  </div>

                  <div>
                    <small>Tipo</small>
                    <br />
                    <strong>{order.fulfillment_type === "entrega" ? "Entrega" : "Retirada"}</strong>
                  </div>

                  <div>
                    <small>Total / sinal / saldo</small>
                    <br />
                    <strong>{brl.format(total)}</strong>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      {brl.format(deposit)} / {brl.format(balance)}
                    </div>
                  </div>

                  <div>
                    <small>Status</small>
                    <br />
                    <select
                      value={order.fulfillment_status}
                      onChange={(event) =>
                        void changeStatus(
                          order,
                          event.target.value as Encomenda["fulfillment_status"],
                        )
                      }
                    >
                      <option value="pendente">Pendente</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="em_producao">Em produção</option>
                      <option value="pronto">Pronto</option>
                      <option value="entregue">Entregue</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>

                {(order.delivery_address || order.notes) && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(0,0,0,.08)",
                      display: "grid",
                      gap: 5,
                    }}
                  >
                    {order.delivery_address && (
                      <div>
                        <Truck size={14} style={{ verticalAlign: "middle" }} />{" "}
                        {order.delivery_address}
                      </div>
                    )}

                    {order.notes && <div>Observações: {order.notes}</div>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
