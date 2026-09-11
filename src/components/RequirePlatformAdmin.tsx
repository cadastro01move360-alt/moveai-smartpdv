import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { usePlatformAdmin } from "../lib/usePlatformAdmin"
import { LoadingPanel } from "./OperationalUI"

export function RequirePlatformAdmin({
  children,
}: {
  children: ReactNode
}) {
  const platform = usePlatformAdmin()

  if (platform.loading) {
    return (
      <LoadingPanel text="Validando administrador da plataforma..." />
    )
  }

  if (!platform.isPlatformAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
