# MoveAI SmartPDV

Projeto inicial do MoveAI SmartPDV, um ERP/PDV verticalizado para cafeterias, confeitarias e panificadoras com produção própria, usando a identidade da Move360.


## Identidade visual
- Marca do produto: **MoveAI SmartPDV**
- Assinatura: **by Move360**
- Cor principal: vermelho institucional aproximado `#BC0E1D`, extraído da logotipo fornecida
- Interface: neutros tecnológicos, alto contraste e acentos vermelhos para ações e estados ativos
- A logotipo está em `public/move360-logo.png`

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL
- RLS por `organization_id`
- Interface pt-BR, moeda BRL e fuso America/Sao_Paulo

## Rodar localmente
1. Copie `.env.example` para `.env`.
2. Informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Rode a migration `supabase/migrations/001_foundation.sql` no SQL Editor do Supabase.
4. Execute:

```bash
npm install
npm run dev
```

## Publicar na Vercel
1. Suba esta pasta para um repositório GitHub.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis de ambiente do Supabase.
4. Faça o deploy.
5. Em **Settings > Domains**, adicione, por exemplo, `erp.seudominio.com.br`.
6. No provedor do seu domínio, crie o registro DNS indicado pela Vercel.

## Estrutura já preparada
- Sidebar e navegação dos módulos principais
- Login com Supabase
- Visão Geral sem KPIs fictícios
- Telas-base de Insumos, Compras, Estoque, Receitas, Produção, Produtos, Encomendas, Caixa, Bancos, Financeiro, Relatórios, Usuários e Configurações
- PDV touch-friendly em estrutura inicial
- Banco multi-organização com RLS
- Livro-razão de estoque e função transacional inicial para confirmação de compra

## Próximas implementações
Este pacote é a fundação técnica. Os fluxos operacionais completos devem ser implementados incrementalmente sobre o banco e as regras já definidas, sem substituir backend real por mocks.
