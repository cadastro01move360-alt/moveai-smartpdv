import {
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom"
import {
  BarChart3,
  BadgeDollarSign,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  CreditCard,
  Factory,
  FileBarChart,
  Landmark,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  WalletCards,
} from "lucide-react"
import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useOrganization } from "../lib/useOrganization"
import { canAccess } from "../lib/permissions"
import { useBranding } from "../lib/useBranding"
import { usePlatformAdmin } from "../lib/usePlatformAdmin"
import { BrandingRuntime } from "./BrandingRuntime"

const items = [
  ["/", "Visão Geral", BarChart3],
  ["/insumos", "Insumos", Boxes],
  ["/fornecedores", "Fornecedores", Truck],
  ["/compras", "Compras", ShoppingCart],
  ["/estoque", "Estoque", PackageSearch],
  ["/receitas", "Receitas", Coffee],
  ["/producao", "Produção", Factory],
  ["/produtos", "Produtos", Coffee],
  ["/pdv", "Vendas / PDV", Store],
  ["/encomendas", "Encomendas", ClipboardList],
  ["/caixa", "Caixa", WalletCards],
  ["/bancos", "Bancos", Landmark],
  ["/financeiro", "Financeiro", CreditCard],
  ["/relatorios", "Relatórios", FileBarChart],
  ["/usuarios", "Usuários", Users],
  ["/configuracoes", "Configurações", Settings],
  ["/assinatura", "Assinatura", BadgeDollarSign],
  ["/plataforma", "Plataforma SaaS", ShieldCheck],
] as const

export function AppShell() {
  const [collapsed, setCollapsed] =
    useState(false)

  const location = useLocation()
  const org = useOrganization()
  const role = org.membership?.role
  const brand = useBranding(org.organization?.id)
  const platform = usePlatformAdmin()

  const active =
    items.find(
      ([path]) => path === location.pathname,
    )?.[1] ?? "MoveAI SmartPDV"

  const visibleItems = items.filter(([path]) => {
    if (path === "/plataforma") {
      return platform.isPlatformAdmin
    }

    return canAccess(role, path)
  })

  const brandName =
    brand.branding.display_name ||
    org.organization?.name ||
    "MoveAI SmartPDV"

  const logoUrl =
    brand.branding.logo_url ||
    "/move360-logo.png"

  return (
    <>
      <BrandingRuntime branding={brand.branding} />

      <div className="app-shell">
      <aside
        className={
          collapsed
            ? "sidebar collapsed"
            : "sidebar"
        }
      >
        <div className="brand">
          {collapsed ? (
            <div className="brand-mark compact">
              M
            </div>
          ) : (
            <>
              <img
                src={logoUrl}
                alt={brandName}
                className="sidebar-logo"
              />

              <div>
                <strong>{brandName}</strong>

                {brand.branding.show_powered_by && (
                  <span>by Move360</span>
                )}
              </div>
            </>
          )}
        </div>

        <nav>
          {visibleItems.map(
            ([path, label, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                className={({ isActive }) =>
                  isActive
                    ? "nav-item active"
                    : "nav-item"
                }
              >
                <Icon size={19} />
                {!collapsed && (
                  <span>{label}</span>
                )}
              </NavLink>
            ),
          )}
        </nav>

        <button
          className="collapse-btn"
          onClick={() =>
            setCollapsed((value) => !value)
          }
        >
          {collapsed ? (
            <ChevronRight />
          ) : (
            <>
              <ChevronLeft />
              <span>Recolher menu</span>
            </>
          )}
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              {brandName} /
            </div>

            <h1>{active}</h1>
          </div>

          <div className="top-actions">
            <button
              className="icon-btn"
              aria-label="Menu"
            >
              <Menu size={20} />
            </button>

            <button
              className="ghost"
              onClick={() =>
                supabase?.auth.signOut()
              }
            >
              <LogOut size={17} />
              Sair
            </button>
          </div>
        </header>

        <section className="page">
          <Outlet />
        </section>
      </main>
    </div>
    </>
  )
}