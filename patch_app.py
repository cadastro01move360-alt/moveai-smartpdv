from pathlib import Path
import re

p=Path("src/App.tsx")
s=p.read_text()

if "import Cash from './pages/Cash'" not in s:
    marker="import Products from './pages/Products'"
    if marker not in s:
        raise SystemExit("Não encontrei o import de Products no App.tsx.")
    s=s.replace(marker, marker+"\nimport Cash from './pages/Cash'")

s=re.sub(
    r"\n\s*\['/caixa','Caixa','Abra sessões, registre sangrias e confira fechamento\.','Abrir caixa'\],",
    "",
    s
)

route='<Route path="/caixa" element={<Cash/>}/>'
if route not in s:
    marker='<Route path="/pdv" element={<PDV/>}/>'
    if marker not in s:
        raise SystemExit("Não encontrei a rota /pdv no App.tsx.")
    s=s.replace(marker, marker+"\n        "+route)

p.write_text(s)
print("App.tsx atualizado: /caixa agora usa Cash.tsx.")
