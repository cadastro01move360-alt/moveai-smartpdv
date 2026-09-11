import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useOrganization } from "../lib/useOrganization"
import {
  canAccess,
  firstAllowedPath,
} from "../lib/permissions"
import { LoadingPanel } from "./OperationalUI"

type Props = {
  children: ReactNode
  path: string
}

export function RequirePermission({
  children,
  path,
}: Props) {
  const org = useOrganization()

  if (org.loading) {
    return (
      <LoadingPanel text="Validando permissões..." />
    )
  }

  const role = org.membership?.role

  if (!canAccess(role, path)) {
    return (
      <Navigate
        to={firstAllowedPath(role)}
        replace
      />
    )
  }

  return <>{children}</>
}
