export type AppRole =
  | "administrador"
  | "financeiro"
  | "producao"
  | "atendimento_caixa"

const permissions: Record<AppRole, string[]> = {
  administrador: ["*"],

  financeiro: [
    "/",
    "/bancos",
    "/financeiro",
    "/relatorios",
  ],

  producao: [
    "/",
    "/insumos",
    "/fornecedores",
    "/compras",
    "/estoque",
    "/receitas",
    "/producao",
    "/produtos",
  ],

  atendimento_caixa: [
    "/",
    "/pdv",
    "/encomendas",
    "/caixa",
  ],
}

export function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/"

  const normalized = pathname.replace(/\/+$/, "")
  return normalized || "/"
}

export function canAccess(
  role: string | null | undefined,
  pathname: string,
) {
  const path = normalizePath(pathname)

  if (!role) {
    return path === "/"
  }

  const allowed = permissions[role as AppRole]

  if (!allowed) {
    return path === "/"
  }

  if (allowed.includes("*")) {
    return true
  }

  return allowed.includes(path)
}

export function firstAllowedPath(
  role: string | null | undefined,
) {
  if (!role) return "/"

  const allowed = permissions[role as AppRole]

  if (!allowed || allowed.includes("*")) {
    return "/"
  }

  return allowed[0] || "/"
}
