import type { ReactNode } from "react"
import {
  Navigate,
  useLocation,
} from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useOrganization } from "../lib/useOrganization"
import { useSubscription } from "../lib/useSubscription"
import { usePlatformAdmin } from "../lib/usePlatformAdmin"
import { LoadingPanel } from "./OperationalUI"

const activeStatuses = [
  "active",
  "trialing",
]

const statusNames: Record<string, string> = {
  pending: "Aguardando ativação",
  past_due: "Pagamento pendente",
  suspended: "Assinatura suspensa",
  canceled: "Assinatura cancelada",
}

export function SubscriptionGate({
  children,
}: {
  children: ReactNode
}) {
  const location = useLocation()
  const org = useOrganization()
  const platform = usePlatformAdmin()
  const sub = useSubscription(
    org.organization?.id,
  )

  if (
    org.loading ||
    platform.loading ||
    (org.organization && sub.loading)
  ) {
    return (
      <LoadingPanel text="Validando acesso..." />
    )
  }

  if (platform.isPlatformAdmin) {
    return <>{children}</>
  }

  if (!org.organization) {
    return <>{children}</>
  }

  const status =
    sub.subscription?.status || "pending"

  if (activeStatuses.includes(status)) {
    return <>{children}</>
  }

  const isOrgAdmin =
    org.membership?.role === "administrador"

  if (
    isOrgAdmin &&
    location.pathname !== "/assinatura"
  ) {
    return (
      <Navigate
        to="/assinatura"
        replace
      />
    )
  }

  if (
    isOrgAdmin &&
    location.pathname === "/assinatura"
  ) {
    return <>{children}</>
  }

  return (
    <div className="subscription-blocked">
      <div className="subscription-blocked-card">
        <div className="eyebrow">
          MoveAI SmartPDV
        </div>

        <h2>
          {statusNames[status] ||
            "Assinatura indisponível"}
        </h2>

        <p>
          O acesso operacional desta empresa
          está temporariamente bloqueado.
          Entre em contato com o administrador
          da sua empresa.
        </p>

        <button
          className="primary"
          type="button"
          onClick={() =>
            void supabase?.auth.signOut()
          }
        >
          Sair
        </button>
      </div>
    </div>
  )
}
