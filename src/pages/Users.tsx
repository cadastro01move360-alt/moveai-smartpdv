import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from "lucide-react"
import { supabase } from "../lib/supabase"
import { useOrganization } from "../lib/useOrganization"
import {
  DataTable,
  ErrorBanner,
  Field,
  FormActions,
  LoadingPanel,
  Modal,
  OrganizationSetup,
} from "../components/OperationalUI"
import { PageHeader } from "../components/UI"

type Role =
  | "administrador"
  | "financeiro"
  | "producao"
  | "atendimento_caixa"

type UserRow = {
  user_id: string
  full_name: string
  email: string
  role: Role
  active: boolean
  created_at: string | null
}

const roleNames: Record<Role, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  producao: "Produção",
  atendimento_caixa: "Atendimento / Caixa",
}

async function invokeUsers(
  payload: Record<string, unknown>,
) {
  if (!supabase) {
    throw new Error("Supabase não configurado.")
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error("Sua sessão expirou. Entre novamente.")
  }

  const { data, error } = await supabase.functions.invoke(
    "manage-users",
    {
      body: payload,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  )

  if (error) {
    throw new Error(error.message)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export default function Users() {
  const org = useOrganization()

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [passwordUser, setPasswordUser] =
    useState<UserRow | null>(null)

  const isAdmin = org.membership?.role === "administrador"

  const load = useCallback(async () => {
    if (!org.organization?.id || !isAdmin) return

    setLoading(true)
    setError("")

    try {
      const data = await invokeUsers({
        action: "list",
        organization_id: org.organization.id,
      })

      setUsers((data?.users || []) as UserRow[])
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar usuários.",
      )
    } finally {
      setLoading(false)
    }
  }, [org.organization?.id, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const active = users.filter((user) => user.active).length
    const admins = users.filter(
      (user) => user.active && user.role === "administrador",
    ).length

    return {
      total: users.length,
      active,
      inactive: users.length - active,
      admins,
    }
  }, [users])

  if (org.loading) {
    return <LoadingPanel text="Carregando usuários..." />
  }

  if (!org.organization) {
    return (
      <>
        <PageHeader
          title="Usuários"
          description="Gerencie usuários, perfis e acessos ao SmartPDV."
        />
        <OrganizationSetup onCreate={org.bootstrap} />
      </>
    )
  }

  if (!isAdmin) {
    return (
      <>
        <PageHeader
          title="Usuários"
          description="Gerencie usuários, perfis e acessos ao SmartPDV."
        />
        <ErrorBanner message="Somente administradores podem acessar o gerenciamento de usuários." />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Usuários"
        description={`Gerencie pessoas, perfis e acessos da organização ${org.organization.name}.`}
        action={
          <button
            className="primary"
            onClick={() => setNewOpen(true)}
          >
            <Plus size={17} />
            Novo usuário
          </button>
        }
      />

      <ErrorBanner message={error || org.error} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Stat
          icon={<UsersIcon size={20} />}
          label="Usuários"
          value={stats.total}
        />

        <Stat
          icon={<UserCheck size={20} />}
          label="Ativos"
          value={stats.active}
        />

        <Stat
          icon={<UserX size={20} />}
          label="Inativos"
          value={stats.inactive}
        />

        <Stat
          icon={<ShieldCheck size={20} />}
          label="Administradores"
          value={stats.admins}
        />
      </div>

      <div className="panel">
        <div
          className="panel-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h3>Equipe e acessos</h3>
            <p>
              Perfis determinam as áreas liberadas para cada usuário.
            </p>
          </div>

          <button onClick={() => void load()}>
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>

        {loading ? (
          <LoadingPanel text="Atualizando usuários..." />
        ) : users.length === 0 ? (
          <div style={{ padding: 20 }}>
            Nenhum usuário encontrado.
          </div>
        ) : (
          <DataTable
            headers={[
              "Nome",
              "E-mail",
              "Perfil",
              "Status",
              "Ações",
            ]}
          >
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>
                  <strong>
                    {user.full_name || "Sem nome"}
                  </strong>
                </td>

                <td>{user.email}</td>

                <td>{roleNames[user.role] || user.role}</td>

                <td>
                  <span
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {user.active ? "Ativo" : "Inativo"}
                  </span>
                </td>

                <td>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => setEditing(user)}
                      title="Editar usuário"
                    >
                      <Pencil size={15} />
                      Editar
                    </button>

                    <button
                      onClick={() => setPasswordUser(user)}
                      title="Alterar senha"
                    >
                      <KeyRound size={15} />
                      Senha
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      {newOpen && (
        <NewUserModal
          organizationId={org.organization.id}
          onClose={() => setNewOpen(false)}
          onSaved={async () => {
            setNewOpen(false)
            await load()
          }}
        />
      )}

      {editing && (
        <EditUserModal
          organizationId={org.organization.id}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}

      {passwordUser && (
        <PasswordModal
          organizationId={org.organization.id}
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSaved={() => {
            setPasswordUser(null)
          }}
        />
      )}
    </>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        {icon}

        <div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            {label}
          </div>

          <strong style={{ fontSize: 22 }}>
            {value}
          </strong>
        </div>
      </div>
    </div>
  )
}

function NewUserModal({
  organizationId,
  onClose,
  onSaved,
}: {
  organizationId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] =
    useState<Role>("atendimento_caixa")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()

    setSaving(true)
    setError("")

    try {
      await invokeUsers({
        action: "create",
        organization_id: organizationId,
        full_name: name,
        email,
        password,
        role,
      })

      onSaved()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao criar usuário.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Novo usuário" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />

        <Field label="Nome completo">
          <input
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Nome do usuário"
            required
          />
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="usuario@empresa.com"
            required
          />
        </Field>

        <Field
          label="Senha inicial"
          hint="Mínimo de 6 caracteres."
        >
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
            minLength={6}
          />
        </Field>

        <Field label="Perfil de acesso">
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as Role)
            }
          >
            <option value="administrador">
              Administrador
            </option>

            <option value="financeiro">
              Financeiro
            </option>

            <option value="producao">
              Produção
            </option>

            <option value="atendimento_caixa">
              Atendimento / Caixa
            </option>
          </select>
        </Field>

        <FormActions>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            className="primary"
            type="submit"
            disabled={saving}
          >
            {saving ? "Criando..." : "Criar usuário"}
          </button>
        </FormActions>
      </form>
    </Modal>
  )
}

function EditUserModal({
  organizationId,
  user,
  onClose,
  onSaved,
}: {
  organizationId: string
  user: UserRow
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(user.full_name)
  const [email, setEmail] = useState(user.email)
  const [role, setRole] = useState<Role>(user.role)
  const [active, setActive] = useState(user.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()

    setSaving(true)
    setError("")

    try {
      await invokeUsers({
        action: "update",
        organization_id: organizationId,
        user_id: user.user_id,
        full_name: name,
        email,
        role,
        active,
      })

      onSaved()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao atualizar usuário.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Editar usuário" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />

        <Field label="Nome completo">
          <input
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            required
          />
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />
        </Field>

        <Field label="Perfil">
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as Role)
            }
          >
            <option value="administrador">
              Administrador
            </option>

            <option value="financeiro">
              Financeiro
            </option>

            <option value="producao">
              Produção
            </option>

            <option value="atendimento_caixa">
              Atendimento / Caixa
            </option>
          </select>
        </Field>

        <Field label="Status">
          <select
            value={active ? "ativo" : "inativo"}
            onChange={(event) =>
              setActive(event.target.value === "ativo")
            }
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </Field>

        <FormActions>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            className="primary"
            type="submit"
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </FormActions>
      </form>
    </Modal>
  )
}

function PasswordModal({
  organizationId,
  user,
  onClose,
  onSaved,
}: {
  organizationId: string
  user: UserRow
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (password.length < 6) {
      setError(
        "A nova senha precisa ter pelo menos 6 caracteres.",
      )
      return
    }

    if (password !== confirmation) {
      setError("As senhas informadas são diferentes.")
      return
    }

    setSaving(true)
    setError("")

    try {
      await invokeUsers({
        action: "reset_password",
        organization_id: organizationId,
        user_id: user.user_id,
        password,
      })

      onSaved()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao alterar senha.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Alterar senha — ${user.full_name || user.email}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ErrorBanner message={error} />

        <Field
          label="Nova senha"
          hint="Mínimo de 6 caracteres."
        >
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            minLength={6}
            required
          />
        </Field>

        <Field label="Confirmar nova senha">
          <input
            type="password"
            value={confirmation}
            onChange={(event) =>
              setConfirmation(event.target.value)
            }
            minLength={6}
            required
          />
        </Field>

        <FormActions>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            className="primary"
            type="submit"
            disabled={saving}
          >
            <KeyRound size={16} />
            {saving ? "Alterando..." : "Alterar senha"}
          </button>
        </FormActions>
      </form>
    </Modal>
  )
}
