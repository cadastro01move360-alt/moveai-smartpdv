from pathlib import Path

p = Path("src/App.tsx")
s = p.read_text()

imp = "import Finance from './pages/Finance'\n"
if imp not in s:
    anchor = "import Products from './pages/Products'\n"
    if anchor in s:
        s = s.replace(anchor, anchor + imp)
    else:
        # fallback: insere antes de const modules
        s = s.replace("const modules = [", imp + "\nconst modules = [")

# remove Financeiro do ModulePage genérico para evitar rota duplicada
s = s.replace("  ['/financeiro','Financeiro','Contas a pagar/receber, recorrências e fluxo de caixa.','Novo lançamento'],\n", "")

route = '      <Route path="/financeiro" element={<Finance/>}/>\n'
if 'path="/financeiro" element={<Finance' not in s:
    anchor = '      <Route path="/bancos" element={<Banks/>}/>\n'
    if anchor in s:
        s = s.replace(anchor, anchor + route)
    else:
        anchor = '      <Route path="/pdv" element={<PDV/>}/>\n'
        s = s.replace(anchor, anchor + route)

p.write_text(s)
print("App.tsx atualizado: /financeiro agora usa Finance.tsx.")
