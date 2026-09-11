import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const allowedRoles = [
  "administrador",
  "financeiro",
  "producao",
  "atendimento_caixa",
]

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Configuração do Supabase incompleta." }, 500)
    }

    const authorization = req.headers.get("Authorization")

    if (!authorization) {
      return json({ error: "Usuário não autenticado." }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser()

    if (callerError || !caller) {
      return json({ error: "Sessão inválida." }, 401)
    }

    const body = await req.json()
    const action = String(body.action || "")
    const organizationId = String(body.organization_id || "")

    if (!organizationId) {
      return json({ error: "Organização não informada." }, 400)
    }

    const { data: callerMembership, error: membershipError } =
      await admin
        .from("organization_members")
        .select("role,active")
        .eq("organization_id", organizationId)
        .eq("user_id", caller.id)
        .maybeSingle()

    if (
      membershipError ||
      !callerMembership ||
      !callerMembership.active ||
      callerMembership.role !== "administrador"
    ) {
      return json(
        { error: "Somente administradores podem gerenciar usuários." },
        403,
      )
    }

    if (action === "list") {
      const { data: memberships, error } = await admin
        .from("organization_members")
        .select("user_id,role,active")
        .eq("organization_id", organizationId)

      if (error) {
        throw error
      }

      const ids = (memberships || []).map((item) => item.user_id)

      let profileMap = new Map<string, string>()

      if (ids.length > 0) {
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id,full_name")
          .in("id", ids)

        if (profileError) {
          throw profileError
        }

        profileMap = new Map(
          (profiles || []).map((profile) => [
            profile.id,
            profile.full_name || "",
          ]),
        )
      }

      const { data: authData, error: authError } =
        await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })

      if (authError) {
        throw authError
      }

      const authMap = new Map(
        authData.users.map((user) => [user.id, user]),
      )

      const users = (memberships || []).map((membership) => {
        const authUser = authMap.get(membership.user_id)

        return {
          user_id: membership.user_id,
          full_name:
            profileMap.get(membership.user_id) ||
            authUser?.user_metadata?.full_name ||
            "",
          email: authUser?.email || "",
          role: membership.role,
          active: membership.active,
          created_at: authUser?.created_at || null,
        }
      })

      users.sort((a, b) =>
        (a.full_name || a.email).localeCompare(
          b.full_name || b.email,
          "pt-BR",
        ),
      )

      return json({ users })
    }

    if (action === "create") {
      const fullName = String(body.full_name || "").trim()
      const email = String(body.email || "").trim().toLowerCase()
      const password = String(body.password || "")
      const role = String(body.role || "")

      if (!fullName) {
        return json({ error: "Informe o nome do usuário." }, 400)
      }

      if (!email || !email.includes("@")) {
        return json({ error: "Informe um e-mail válido." }, 400)
      }

      if (password.length < 6) {
        return json(
          { error: "A senha inicial precisa ter pelo menos 6 caracteres." },
          400,
        )
      }

      if (!allowedRoles.includes(role)) {
        return json({ error: "Perfil de acesso inválido." }, 400)
      }

      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
          },
        })

      if (createError || !created.user) {
        return json(
          { error: createError?.message || "Não foi possível criar usuário." },
          400,
        )
      }

      const newUser = created.user

      const { error: profileError } = await admin
        .from("profiles")
        .upsert(
          {
            id: newUser.id,
            full_name: fullName,
          },
          {
            onConflict: "id",
          },
        )

      if (profileError) {
        await admin.auth.admin.deleteUser(newUser.id)
        throw profileError
      }

      const { error: memberError } = await admin
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: newUser.id,
          role,
          active: true,
        })

      if (memberError) {
        await admin.auth.admin.deleteUser(newUser.id)
        throw memberError
      }

      return json({ success: true })
    }

    if (action === "update") {
      const userId = String(body.user_id || "")
      const fullName = String(body.full_name || "").trim()
      const email = String(body.email || "").trim().toLowerCase()
      const role = String(body.role || "")
      const active = Boolean(body.active)

      if (!userId) {
        return json({ error: "Usuário inválido." }, 400)
      }

      if (!allowedRoles.includes(role)) {
        return json({ error: "Perfil de acesso inválido." }, 400)
      }

      const { data: target } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!target) {
        return json(
          { error: "Usuário não pertence a esta organização." },
          404,
        )
      }

      if (userId === caller.id && !active) {
        return json(
          { error: "Você não pode desativar seu próprio acesso." },
          400,
        )
      }

      if (userId === caller.id && role !== "administrador") {
        return json(
          { error: "Você não pode remover seu próprio perfil de administrador." },
          400,
        )
      }

      if (email) {
        const { error: authUpdateError } =
          await admin.auth.admin.updateUserById(userId, {
            email,
            user_metadata: {
              full_name: fullName,
            },
          })

        if (authUpdateError) {
          return json({ error: authUpdateError.message }, 400)
        }
      }

      const { error: profileUpdateError } = await admin
        .from("profiles")
        .upsert(
          {
            id: userId,
            full_name: fullName,
          },
          {
            onConflict: "id",
          },
        )

      if (profileUpdateError) {
        throw profileUpdateError
      }

      const { error: memberUpdateError } = await admin
        .from("organization_members")
        .update({
          role,
          active,
        })
        .eq("organization_id", organizationId)
        .eq("user_id", userId)

      if (memberUpdateError) {
        throw memberUpdateError
      }

      return json({ success: true })
    }

    if (action === "reset_password") {
      const userId = String(body.user_id || "")
      const password = String(body.password || "")

      if (!userId) {
        return json({ error: "Usuário inválido." }, 400)
      }

      if (password.length < 6) {
        return json(
          { error: "A nova senha precisa ter pelo menos 6 caracteres." },
          400,
        )
      }

      const { data: target } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle()

      if (!target) {
        return json(
          { error: "Usuário não pertence a esta organização." },
          404,
        )
      }

      const { error } = await admin.auth.admin.updateUserById(
        userId,
        {
          password,
        },
      )

      if (error) {
        return json({ error: error.message }, 400)
      }

      return json({ success: true })
    }

    return json({ error: "Ação inválida." }, 400)
  } catch (error) {
    console.error(error)

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao gerenciar usuários.",
      },
      500,
    )
  }
})
