import {
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom"
import {
  BarChart3,
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
] as const

export function AppShell() {
  const [collapsed, setCollapsed] =
    useState(false)

  const location = useLocation()
  const org = useOrganization()
  const role = org.membership?.role

  const active =
    items.find(
      ([path]) => path === location.pathname,
    )?.[1] ?? "MoveAI SmartPDV"

  const visibleItems = items.filter(
    ([path]) => canAccess(role, path),
  )

  return (
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
                src="/move360-logo.png"
                alt="Move360"
                className="sidebar-logo"
              />

              <div>
                <strong>
                  MoveAI SmartPDV
                </strong>

                <span>by Move360</span>
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
              MoveAI SmartPDV /
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
  )
}
