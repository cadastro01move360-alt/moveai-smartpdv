from pathlib import Path

p=Path("src/App.tsx")
s=p.read_text()

imp="import Reports from './pages/Reports'\n"
if imp not in s:
    anchors=[
        "import Finance from './pages/Finance'\n",
        "import Products from './pages/Products'\n",
    ]
    done=False
    for anchor in anchors:
        if anchor in s:
            s=s.replace(anchor,anchor+imp)
            done=True
            break
    if not done:
        s=s.replace("const modules = [",imp+"\nconst modules = [")

# Remove a rota genérica de Relatórios do array modules.
patterns=[
    "  ['/relatorios','Relatórios','DRE, CMV, margens, perdas e indicadores gerenciais.','Exportar'],\n",
    "  ['/relatorios','Relatorios','DRE, CMV, margens, perdas e indicadores gerenciais.','Exportar'],\n",
]
for old in patterns:
    s=s.replace(old,'')

route='      <Route path="/relatorios" element={<Reports/>}/>\n'
if 'path="/relatorios" element={<Reports' not in s:
    anchors=[
        '      <Route path="/financeiro" element={<Finance/>}/>\n',
        '      <Route path="/bancos" element={<Banks/>}/>\n',
        '      <Route path="/pdv" element={<PDV/>}/>\n',
    ]
    inserted=False
    for anchor in anchors:
        if anchor in s:
            s=s.replace(anchor,anchor+route)
            inserted=True
            break
    if not inserted:
        marker="      {modules.map"
        s=s.replace(marker,route+marker)

p.write_text(s)
print("App.tsx atualizado: /relatorios agora usa Reports.tsx.")
