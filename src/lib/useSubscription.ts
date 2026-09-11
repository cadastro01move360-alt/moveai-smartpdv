import {
  useCallback,
  useEffect,
  useState,
} from "react"
import { supabase } from "./supabase"

export type SaaSPlan = {
  id: string
  code: string
  name: string
  description: string | null
  monthly_price: number | string
  currency: string
  billing_interval: string
  features: Record<string, unknown> | null
  active: boolean
}

export type OrganizationSubscription = {
  id: string
  organization_id: string
  plan_id: string
  status:
    | "pending"
    | "trialing"
    | "active"
    | "past_due"
    | "suspended"
    | "canceled"
  started_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  trial_ends_at: string | null
  canceled_at: string | null
  billing_provider: string | null
  plan: SaaSPlan | null
}

export function useSubscription(
  organizationId?: string | null,
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [subscription, setSubscription] =
    useState<OrganizationSubscription | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setSubscription(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")

    const { data: sub, error: subError } =
      await supabase
        .from("organization_subscriptions")
        .select(
          "id,organization_id,plan_id,status,started_at,current_period_start,current_period_end,trial_ends_at,canceled_at,billing_provider",
        )
        .eq("organization_id", organizationId)
        .maybeSingle()

    if (subError) {
      setError(subError.message)
      setLoading(false)
      return
    }

    if (!sub) {
      setSubscription(null)
      setLoading(false)
      return
    }

    const { data: plan, error: planError } =
      await supabase
        .from("saas_plans")
        .select(
          "id,code,name,description,monthly_price,currency,billing_interval,features,active",
        )
        .eq("id", sub.plan_id)
        .maybeSingle()

    if (planError) {
      setError(planError.message)
    }

    setSubscription({
      ...(sub as Omit<
        OrganizationSubscription,
        "plan"
      >),
      plan: (plan || null) as SaaSPlan | null,
    })

    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    error,
    subscription,
    refresh,
  }
}
