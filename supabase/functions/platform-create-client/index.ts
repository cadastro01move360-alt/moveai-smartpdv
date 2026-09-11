import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  )
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : ""
}

function validHex(
  value: unknown,
  fallback: string,
) {
  const text = cleanText(value)
  return /^#[0-9A-Fa-f]{6}$/.test(text)
    ? text
    : fallback
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return json(
      { error: "Método não permitido." },
      405,
    )
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL")
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceKey
  ) {
    return json(
      {
        error:
          "Configuração do Supabase incompleta.",
      },
      500,
    )
  }

  const authorization =
    req.headers.get("Authorization")

  if (!authorization) {
    return json(
      { error: "Usuário não autenticado." },
      401,
    )
  }

  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  const {
    data: isPlatformAdmin,
    error: platformError,
  } = await userClient.rpc(
    "is_platform_admin",
  )

  if (
    platformError ||
    isPlatformAdmin !== true
  ) {
    return json(
      {
        error:
          "Apenas o administrador da plataforma pode criar clientes.",
      },
      403,
    )
  }

  const admin = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  let createdUserId: string | null = null
  let createdOrgId: string | null = null

  try {
    const body = await req.json()

    const companyName =
      cleanText(body.company_name)
    const taxId =
      cleanText(body.tax_id) || null
    const phone =
      cleanText(body.phone) || null
    const commercialEmail =
      cleanText(body.commercial_email) ||
      null

    const adminName =
      cleanText(body.admin_name)
    const adminEmail =
      cleanText(body.admin_email)
        .toLowerCase()
    const adminPassword =
      String(
        body.admin_password || "",
      )

    const planId =
      cleanText(body.plan_id)
    const status =
      cleanText(body.status) ||
      "active"
    const dueDate =
      cleanText(body.due_date) || null

    const allowedStatuses = [
      "pending",
      "trialing",
      "active",
      "past_due",
      "suspended",
      "canceled",
    ]

    if (!companyName) {
      return json(
        {
          error:
            "Informe o nome da empresa.",
        },
        400,
      )
    }

    if (!adminName) {
      return json(
        {
          error:
            "Informe o nome do administrador.",
        },
        400,
      )
    }

    if (
      !adminEmail ||
      !adminEmail.includes("@")
    ) {
      return json(
        {
          error:
            "Informe um e-mail válido para o administrador.",
        },
        400,
      )
    }

    if (adminPassword.length < 8) {
      return json(
        {
          error:
            "A senha inicial deve ter pelo menos 8 caracteres.",
        },
        400,
      )
    }

    if (!planId) {
      return json(
        {
          error:
            "Selecione um plano.",
        },
        400,
      )
    }

    if (
      !allowedStatuses.includes(status)
    ) {
      return json(
        {
          error:
            "Status de assinatura inválido.",
        },
        400,
      )
    }

    const { data: plan, error: planError } =
      await admin
        .from("saas_plans")
        .select(
          "id,name,monthly_price,active",
        )
        .eq("id", planId)
        .maybeSingle()

    if (planError || !plan) {
      return json(
        {
          error:
            "Plano não encontrado.",
        },
        400,
      )
    }

    if (!plan.active) {
      return json(
        {
          error:
            "O plano selecionado está inativo.",
        },
        400,
      )
    }

    const {
      data: existingUsers,
      error: existingUsersError,
    } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (existingUsersError) {
      throw existingUsersError
    }

    const alreadyExists =
      existingUsers.users.some(
        (user) =>
          user.email?.toLowerCase() ===
          adminEmail,
      )

    if (alreadyExists) {
      return json(
        {
          error:
            "Já existe um usuário com esse e-mail.",
        },
        409,
      )
    }

    const {
      data: createdUser,
      error: userError,
    } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
      },
    })

    if (
      userError ||
      !createdUser.user
    ) {
      throw (
        userError ||
        new Error(
          "Não foi possível criar o usuário.",
        )
      )
    }

    createdUserId =
      createdUser.user.id

    const {
      data: organization,
      error: orgError,
    } = await admin
      .from("organizations")
      .insert({
        name: companyName,
        active: true,
      })
      .select("id,name")
      .single()

    if (orgError || !organization) {
      throw (
        orgError ||
        new Error(
          "Não foi possível criar a empresa.",
        )
      )
    }

    createdOrgId = organization.id

    const {
      error: membershipError,
    } = await admin
      .from("organization_members")
      .insert({
        organization_id:
          organization.id,
        user_id: createdUserId,
        role: "administrador",
        active: true,
      })

    if (membershipError) {
      throw membershipError
    }

    await admin
      .from("profiles")
      .upsert({
        id: createdUserId,
        full_name: adminName,
      })

    const {
      error: businessError,
    } = await admin
      .from(
        "organization_business_profiles",
      )
      .upsert(
        {
          organization_id:
            organization.id,
          tax_id: taxId,
          phone,
          commercial_email:
            commercialEmail,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "organization_id",
        },
      )

    if (businessError) {
      throw businessError
    }

    const branding =
      body.branding || {}

    const {
      error: brandingError,
    } = await admin
      .from("organization_branding")
      .upsert(
        {
          organization_id:
            organization.id,
          display_name:
            cleanText(
              branding.display_name,
            ) || companyName,
          primary_color: validHex(
            branding.primary_color,
            "#C90D23",
          ),
          secondary_color: validHex(
            branding.secondary_color,
            "#17181D",
          ),
          accent_color: validHex(
            branding.accent_color,
            "#E21B36",
          ),
          sidebar_color: validHex(
            branding.sidebar_color,
            "#15161A",
          ),
          show_powered_by: true,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "organization_id",
        },
      )

    if (brandingError) {
      throw brandingError
    }

    let periodEnd: string | null = null

    if (dueDate) {
      const parsed =
        new Date(
          `${dueDate}T23:59:59.000Z`,
        )

      if (
        Number.isNaN(parsed.getTime())
      ) {
        return json(
          {
            error:
              "Data de vencimento inválida.",
          },
          400,
        )
      }

      periodEnd =
        parsed.toISOString()
    } else if (
      status === "active" ||
      status === "trialing"
    ) {
      const next = new Date()
      next.setUTCMonth(
        next.getUTCMonth() + 1,
      )
      periodEnd =
        next.toISOString()
    }

    const now =
      new Date().toISOString()

    const {
      error: subscriptionError,
    } = await admin
      .from(
        "organization_subscriptions",
      )
      .upsert(
        {
          organization_id:
            organization.id,
          plan_id: planId,
          status,
          started_at:
            status === "active" ||
            status === "trialing"
              ? now
              : null,
          current_period_start:
            status === "active" ||
            status === "trialing"
              ? now
              : null,
          current_period_end:
            periodEnd,
          canceled_at:
            status === "canceled"
              ? now
              : null,
          updated_at: now,
        },
        {
          onConflict:
            "organization_id",
        },
      )

    if (subscriptionError) {
      throw subscriptionError
    }

    const {
      error: unitsError,
    } = await admin
      .from("units")
      .insert([
        {
          organization_id:
            organization.id,
          name: "Quilograma",
          symbol: "kg",
          dimension: "massa",
        },
        {
          organization_id:
            organization.id,
          name: "Grama",
          symbol: "g",
          dimension: "massa",
        },
        {
          organization_id:
            organization.id,
          name: "Litro",
          symbol: "L",
          dimension: "volume",
        },
        {
          organization_id:
            organization.id,
          name: "Mililitro",
          symbol: "mL",
          dimension: "volume",
        },
        {
          organization_id:
            organization.id,
          name: "Unidade",
          symbol: "un",
          dimension: "unidade",
        },
      ])

    if (unitsError) {
      throw unitsError
    }

    const {
      error: locationError,
    } = await admin
      .from("stock_locations")
      .insert({
        organization_id:
          organization.id,
        name: "Estoque principal",
      })

    if (locationError) {
      throw locationError
    }

    await admin
      .from("audit_logs")
      .insert({
        organization_id:
          organization.id,
        user_id: createdUserId,
        entity: "organization",
        record_id: organization.id,
        action:
          "platform_create_client",
        new_data: {
          company_name: companyName,
          admin_email: adminEmail,
          plan_id: planId,
          status,
        },
      })

    return json({
      ok: true,
      organization_id:
        organization.id,
      user_id: createdUserId,
      admin_email: adminEmail,
      plan_name: plan.name,
      monthly_price:
        plan.monthly_price,
    })
  } catch (error) {
    console.error(
      "platform-create-client:",
      error,
    )

    if (createdOrgId) {
      await admin
        .from("organizations")
        .delete()
        .eq("id", createdOrgId)
    }

    if (createdUserId) {
      await admin.auth.admin.deleteUser(
        createdUserId,
      )
    }

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o cliente.",
      },
      500,
    )
  }
})
