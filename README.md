# MoveAI SmartPDV

ERP/PDV verticalizado para cafeterias, confeitarias e panificadoras com produção própria, desenvolvido com a identidade da Move360.

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL
- RLS por `organization_id`
- Vercel
- Interface pt-BR, moeda BRL e fuso America/Sao_Paulo

## Versão 3 — núcleo operacional
Esta versão torna funcionais os quatro primeiros módulos operacionais:

- **Insumos**: cadastro de insumo-base, unidade de consumo, estoque mínimo, validade e apresentações de compra com fator de conversão.
- **Fornecedores**: cadastro de razão social/nome, documento, telefone e e-mail.
- **Compras**: rascunho com múltiplos itens, conversão para unidade-base, custo por unidade-base e confirmação transacional.
- **Estoque**: saldo por lote, custo histórico, valor disponível, validade, movimentações recentes e ajuste manual auditado.

Também foi incluído onboarding da primeira organização. Um usuário autenticado sem empresa vinculada poderá criar a organização, unidades padrão e o estoque principal usando a função `bootstrap_organization` já existente.

## Migration obrigatória para atualizar da V2
No Supabase, execute **somente a migration nova**:

```text
supabase/migrations/002_operational_core.sql
```

Não execute novamente `001_foundation.sql` em um banco que já esteja configurado.

A migration 002:
- adiciona `label` e `sku` às apresentações de insumos;
- cria views seguras de saldo por lote e por insumo;
- cria `create_purchase_draft(...)` para gravar compra e itens de forma atômica;
- reforça `confirm_purchase(...)`;
- cria `adjust_stock_lot(...)` para ajustes auditáveis sem edição direta de saldo;
- adiciona índices operacionais.

## Publicação
O projeto está preparado para Vercel com React Router através do `vercel.json`.

Domínio de produção atual:

```text
https://smartpdv.movemkt.com.br
```

## Fluxo de teste recomendado
1. Faça login.
2. Se solicitado, crie a primeira organização.
3. Cadastre um fornecedor.
4. Cadastre um insumo, por exemplo `Farinha de trigo`, unidade-base `g`.
5. Adicione uma apresentação `Pacote 5 kg` com quantidade contida `5000 g`.
6. Crie uma compra usando essa apresentação.
7. Confirme a compra no `Estoque principal`.
8. Abra Estoque e confira lote, saldo, custo e valor.
9. Faça um ajuste manual pequeno e confira a movimentação auditada.

## Segurança
- O saldo não é editado diretamente.
- A confirmação da compra usa função transacional no PostgreSQL.
- Valores financeiros e quantidades continuam em `NUMERIC`.
- Views usam `security_invoker=true` e respeitam RLS das tabelas-base.
- Nunca coloque `service_role` ou `sb_secret_...` no frontend.

## V4 — Receitas / Fichas Técnicas

A migration `003_recipes_costing.sql` adiciona:
- cálculo de custo de receita pelo custo médio atual do estoque;
- perda percentual por insumo;
- custo total e custo por rendimento;
- criação da versão 1 e novas versões auditáveis;
- status rascunho/ativa/arquivada.

Execute a migration 003 no Supabase antes de publicar esta versão.
