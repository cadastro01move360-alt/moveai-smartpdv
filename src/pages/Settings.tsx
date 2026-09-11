import { useEffect, useState, type FormEvent } from "react"
import { supabase } from "../lib/supabase"
import { useOrganization } from "../lib/useOrganization"
import {
  ErrorBanner,
  Field,
  FormActions,
  LoadingPanel,
  OrganizationSetup,
} from "../components/OperationalUI"
import { PageHeader } from "../components/UI"
import { BrandingSettings } from "../components/BrandingSettings"
import { Link } from "react-router-dom"

const roleNames: Record<string, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  producao: "Produção",
  atendimento_caixa: "Atendimento / Caixa",
}

export default function Settings() {
  const org = useOrganization()

  const [companyName, setCompanyName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [initialEmail, setInitialEmail] = useState("")
  const [password, setPassword] = useState("")
  const [password2, setPassword2] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const isAdmin = org.membership?.role === "administrador"

  useEffect(() => {
    if (org.organization?.name) {
      setCompanyName(org.organization.name)
    }
  }, [org.organization?.name])

  useEffect(() => {
    void loadAccount()
  }, [])

  async function loadAccount() {
    if (!supabase) {
      setError("Supabase não configurado.")
      setLoading(false)
      return
    }

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!auth.user) throw new Error("Usuário não autenticado.")

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", auth.user.id)
        .maybeSingle()

      if (profileError) throw profileError

      const currentEmail = auth.user.email || ""

      setName(
        profile?.full_name ||
          auth.user.user_metadata?.full_name ||
          "",
      )
      setEmail(currentEmail)
      setInitialEmail(currentEmail)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao carregar sua conta.",
      )
    } finally {
      setLoading(false)
    }
  }

  function begin(section: string) {
    setError("")
    setSuccess("")
    setSaving(section)
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault()

    if (!supabase || !org.organization?.id) return

    if (!isAdmin) {
      setError(
        "Somente administradores podem alterar os dados da empresa.",
      )
      return
    }

    const clean = companyName.trim()

    if (!clean) {
      setError("Informe o nome da empresa.")
      return
    }

    begin("company")

    try {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: clean })
        .eq("id", org.organization.id)

      if (updateError) throw updateError

      await org.refresh()
      setSuccess("Dados da empresa atualizados com sucesso.")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao atualizar a empresa.",
      )
    } finally {
      setSaving("")
    }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault()

    if (!supabase) return

    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName) {
      setError("Informe seu nome.")
      return
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Informe um e-mail válido.")
      return
    }

    begin("account")

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!auth.user) throw new Error("Usuário não autenticado.")

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: auth.user.id,
            full_name: cleanName,
          },
          {
            onConflict: "id",
          },
        )

      if (profileError) throw profileError

      const payload: {
        email?: string
        data: { full_name: string }
      } = {
        data: { full_name: cleanName },
      }

      if (cleanEmail !== initialEmail) {
        payload.email = cleanEmail
      }

      const { error: updateError } =
        await supabase.auth.updateUser(payload)

      if (updateError) throw updateError

      const changedEmail = cleanEmail !== initialEmail
      setInitialEmail(cleanEmail)

      setSuccess(
        changedEmail
          ? "Dados atualizados. O novo e-mail pode exigir confirmação."
          : "Dados da conta atualizados com sucesso.",
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao atualizar sua conta.",
      )
    } finally {
      setSaving("")
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()

    if (!supabase) return

    if (password.length < 6) {
      setError(
        "A nova senha precisa ter pelo menos 6 caracteres.",
      )
      return
    }

    if (password !== password2) {
      setError("As senhas não são iguais.")
      return
    }

    begin("password")

    try {
      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        })

      if (updateError) throw updateError

      setPassword("")
      setPassword2("")
      setSuccess("Senha alterada com sucesso.")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao alterar a senha.",
      )
    } finally {
      setSaving("")
    }
  }

  if (org.loading || loading) {
    return (
      <LoadingPanel text="Carregando configurações..." />
    )
  }

  if (!org.organization) {
    return (
      <>
        <PageHeader
          title="Configurações"
          description="Dados da empresa, conta e segurança."
        />

        <OrganizationSetup onCreate={org.bootstrap} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Gerencie a empresa, sua conta e a segurança de acesso."
      />

      <ErrorBanner message={error || org.error} />

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
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="panel" style={{ padding: 16 }}>
          <small>Empresa</small>
          <br />
          <strong>{org.organization.name}</strong>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <small>Perfil</small>
          <br />
          <strong>
            {roleNames[org.membership?.role || ""] ||
              org.membership?.role ||
              "-"}
          </strong>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <small>E-mail</small>
          <br />
          <strong>{email || "-"}</strong>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <small>Unidades</small>
          <br />
          <strong>{org.units?.length || 0}</strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="panel">
          <div className="panel-head">
            <h3>Dados da empresa</h3>
            <p>Informações principais da organização.</p>
          </div>

          <form onSubmit={saveCompany}>
            <Field
              label="Nome da empresa"
              hint={
                isAdmin
                  ? "Usado nas telas do SmartPDV."
                  : "Somente administradores podem alterar."
              }
            >
              <input
                value={companyName}
                onChange={(event) =>
                  setCompanyName(event.target.value)
                }
                disabled={!isAdmin}
                required
              />
            </Field>

            <Field label="ID da organização">
              <input
                value={org.organization.id}
                disabled
              />
            </Field>

            <FormActions>
              <button
                className="primary"
                type="submit"
                disabled={
                  !isAdmin ||
                  saving === "company"
                }
              >
                {saving === "company"
                  ? "Salvando..."
                  : "Salvar empresa"}
              </button>
            </FormActions>
          </form>
        </div>

        <BrandingSettings
          organizationId={org.organization.id}
          isAdmin={isAdmin}
        />

        <div className="panel">
          <div className="panel-head">
            <h3>Usuários e setores</h3>
            <p>
              Defina responsáveis e perfis administrativos por setor.
            </p>
          </div>

          <p>
            Os perfis atuais são Administrador, Financeiro,
            Produção e Atendimento / Caixa.
          </p>

          <FormActions>
            <Link className="primary" to="/usuarios">
              Gerenciar usuários
            </Link>
          </FormActions>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Assinatura</h3>
            <p>
              Consulte plano, valor mensal, status e vencimento.
            </p>
          </div>

          <FormActions>
            <Link className="primary" to="/assinatura">
              Ver assinatura
            </Link>
          </FormActions>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Minha conta</h3>
            <p>Atualize seu nome e e-mail.</p>
          </div>

          <form onSubmit={saveAccount}>
            <Field label="Nome">
              <input
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                required
              />
            </Field>

            <Field
              label="E-mail"
              hint="A alteração pode exigir confirmação por e-mail."
            >
              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
              />
            </Field>

            <FormActions>
              <button
                className="primary"
                type="submit"
                disabled={saving === "account"}
              >
                {saving === "account"
                  ? "Salvando..."
                  : "Salvar minha conta"}
              </button>
            </FormActions>
          </form>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Alterar senha</h3>
            <p>Defina uma nova senha para sua conta.</p>
          </div>

          <form onSubmit={changePassword}>
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
                value={password2}
                onChange={(event) =>
                  setPassword2(event.target.value)
                }
                minLength={6}
                required
              />
            </Field>

            <FormActions>
              <button
                className="primary"
                type="submit"
                disabled={saving === "password"}
              >
                {saving === "password"
                  ? "Alterando..."
                  : "Alterar senha"}
              </button>
            </FormActions>
          </form>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Estrutura do sistema</h3>
            <p>Resumo do ambiente atual.</p>
          </div>

          <p>
            <strong>Perfil:</strong>{" "}
            {roleNames[
              org.membership?.role || ""
            ] ||
              org.membership?.role ||
              "-"}
          </p>

          <p>
            <strong>Unidades:</strong>{" "}
            {org.units?.length || 0}
          </p>

          <p>
            <strong>Locais de estoque:</strong>{" "}
            {org.locations?.length || 0}
          </p>

          <p>
            <strong>Administrador:</strong>{" "}
            {isAdmin ? "Sim" : "Não"}
          </p>
        </div>
      </div>
    </>
  )
}