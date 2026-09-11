import type { ReactNode } from "react"
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { RequireAuth } from "./components/RequireAuth"
import { RequirePermission } from "./components/RequirePermission"
import Dashboard from "./pages/Dashboard"
import Login from "./pages/Login"
import Orders from "./pages/Orders"
import PDV from "./pages/PDV"
import Ingredients from "./pages/Ingredients"
import Suppliers from "./pages/Suppliers"
import Purchases from "./pages/Purchases"
import Stock from "./pages/Stock"
import Recipes from "./pages/Recipes"
import Production from "./pages/Production"
import Products from "./pages/Products"
import Finance from "./pages/Finance"
import Reports from "./pages/Reports"
import Cash from "./pages/Cash"
import Banks from "./pages/Banks"
import Users from "./pages/Users"
import Settings from "./pages/Settings"

function Protected({
  path,
  children,
}: {
  path: string
  children: ReactNode
}) {
  return (
    <RequirePermission path={path}>
      {children}
    </RequirePermission>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <Protected path="/">
              <Dashboard />
            </Protected>
          }
        />

        <Route
          path="/insumos"
          element={
            <Protected path="/insumos">
              <Ingredients />
            </Protected>
          }
        />

        <Route
          path="/fornecedores"
          element={
            <Protected path="/fornecedores">
              <Suppliers />
            </Protected>
          }
        />

        <Route
          path="/compras"
          element={
            <Protected path="/compras">
              <Purchases />
            </Protected>
          }
        />

        <Route
          path="/estoque"
          element={
            <Protected path="/estoque">
              <Stock />
            </Protected>
          }
        />

        <Route
          path="/receitas"
          element={
            <Protected path="/receitas">
              <Recipes />
            </Protected>
          }
        />

        <Route
          path="/producao"
          element={
            <Protected path="/producao">
              <Production />
            </Protected>
          }
        />

        <Route
          path="/produtos"
          element={
            <Protected path="/produtos">
              <Products />
            </Protected>
          }
        />

        <Route
          path="/pdv"
          element={
            <Protected path="/pdv">
              <PDV />
            </Protected>
          }
        />

        <Route
          path="/encomendas"
          element={
            <Protected path="/encomendas">
              <Orders />
            </Protected>
          }
        />

        <Route
          path="/caixa"
          element={
            <Protected path="/caixa">
              <Cash />
            </Protected>
          }
        />

        <Route
          path="/bancos"
          element={
            <Protected path="/bancos">
              <Banks />
            </Protected>
          }
        />

        <Route
          path="/financeiro"
          element={
            <Protected path="/financeiro">
              <Finance />
            </Protected>
          }
        />

        <Route
          path="/relatorios"
          element={
            <Protected path="/relatorios">
              <Reports />
            </Protected>
          }
        />

        <Route
          path="/usuarios"
          element={
            <Protected path="/usuarios">
              <Users />
            </Protected>
          }
        />

        <Route
          path="/configuracoes"
          element={
            <Protected path="/configuracoes">
              <Settings />
            </Protected>
          }
        />
      </Route>

      <Route
        path="*"
        element={
          <Navigate to="/" replace />
        }
      />
    </Routes>
  )
}
