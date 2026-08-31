import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ModulePage from './pages/ModulePage'
import PDV from './pages/PDV'
import Ingredients from './pages/Ingredients'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import Stock from './pages/Stock'
import Recipes from './pages/Recipes'
import Production from './pages/Production'

const modules = [
  ['/produtos','Produtos','Gerencie produtos, variantes, adicionais, embalagens e preços.','Novo produto'],
  ['/encomendas','Encomendas','Organize pedidos futuros, sinais, saldo e entrega.','Nova encomenda'],
  ['/caixa','Caixa','Abra sessões, registre sangrias e confira fechamento.','Abrir caixa'],
  ['/bancos','Bancos','Controle contas financeiras, transferências e conciliação.','Nova conta'],
  ['/financeiro','Financeiro','Contas a pagar/receber, recorrências e fluxo de caixa.','Novo lançamento'],
  ['/relatorios','Relatórios','DRE, CMV, margens, perdas e indicadores gerenciais.','Exportar'],
  ['/usuarios','Usuários','Gerencie membros, papéis, permissões e acesso por organização.','Novo usuário'],
  ['/configuracoes','Configurações','Preferências da organização, unidades e regras operacionais.','Editar configurações'],
] as const

export default function App(){
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<RequireAuth><AppShell/></RequireAuth>}>
      <Route index element={<Dashboard/>}/>
      <Route path="/insumos" element={<Ingredients/>}/>
      <Route path="/fornecedores" element={<Suppliers/>}/>
      <Route path="/compras" element={<Purchases/>}/>
      <Route path="/estoque" element={<Stock/>}/>
      <Route path="/receitas" element={<Recipes/>}/>
      <Route path="/producao" element={<Production/>}/>
      <Route path="/pdv" element={<PDV/>}/>
      {modules.map(([path,title,description,cta]) => <Route key={path} path={path} element={<ModulePage title={title} description={description} cta={cta}/>}/>) }
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes>
}
