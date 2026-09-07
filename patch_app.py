from pathlib import Path
import re

p=Path("src/App.tsx")
s=p.read_text()

if "import Banks from './pages/Banks'" not in s:
    marker="import Cash from './pages/Cash'"
    if marker not in s:
        marker="import Products from './pages/Products'"
    if marker not in s:
        raise SystemExit("Não encontrei um ponto seguro para inserir o import de Banks.")
    s=s.replace(marker, marker+"\nimport Banks from './pages/Banks'")

s=re.sub(
    r"\n\s*\['/bancos','Bancos','Controle contas financeiras, transferências e conciliação\.','Nova conta'\],",
    "",
    s
)

route='<Route path="/bancos" element={<Banks/>}/>'
if route not in s:
    marker='<Route path="/caixa" element={<Cash/>}/>'
    if marker not in s:
        marker='<Route path="/pdv" element={<PDV/>}/>'
    if marker not in s:
        raise SystemExit("Não encontrei uma rota segura para inserir /bancos.")
    s=s.replace(marker, marker+"\n        "+route)

p.write_text(s)
print("App.tsx atualizado: /bancos agora usa Banks.tsx.")
