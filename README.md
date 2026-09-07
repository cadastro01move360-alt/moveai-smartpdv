# MoveAI SmartPDV — V6

ERP/PDV verticalizado para cafeterias, confeitarias e panificadoras com produção própria, com foco em CMV, rastreabilidade e integração entre compras, estoque, ficha técnica, produção e venda.

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL
- RLS por `organization_id`
- Vercel
- Interface pt-BR, moeda BRL e fuso America/Sao_Paulo

## O que já está funcional
- **Insumos**: unidade-base, estoque mínimo, validade e apresentações de compra.
- **Fornecedores**: cadastro operacional.
- **Compras**: rascunho, conversão de unidades e confirmação transacional.
- **Estoque de insumos**: lotes, FEFO, custo histórico, valor, ajustes e livro-razão.
- **Receitas / Fichas Técnicas**: versionamento, perdas, custo total e custo por rendimento.
- **Produção**: ordens, consumo real de insumos por FEFO e custo real produzido.
- **Produtos — V6**: catálogo vendável, vínculo com ficha técnica, preço, margem e estoque de produto acabado.

## Migration nova da V6
Execute no Supabase **somente**:

```text
supabase/migrations/005_products_finished_goods.sql
```

Não execute novamente as migrations 001–004 em um banco que já esteja atualizado.

A migration 005:
- amplia `products` com unidade de estoque, estoque mínimo e código de barras;
- cria `product_stock_movements` como livro-razão do produto acabado;
- cria `product_stock_summary` com saldo, custo médio, valor, lucro e margem;
- cria RPCs para cadastrar/editar produto e ajustar estoque;
- atualiza `production_order_summary` para indicar o produto de saída;
- atualiza `complete_production_order(...)` para dar entrada automática no produto acabado quando a ficha técnica estiver vinculada a um produto.

## Regra importante da produção na V6
A entrada no estoque de produto acabado ocorre somente para **produções concluídas depois** que o produto estiver vinculado àquela versão da ficha técnica.

Exemplo:

```text
Produto: Bolo de Chocolate
Ficha: Bolo Chocolate v1
Rendimento da ficha: 10 un
Custo da ficha: R$ 5,00
```

Ao concluir uma nova ordem de 1 lote:

```text
Consumo de farinha: -1.000 g
Entrada de produto acabado: +10 un
Custo real por unidade: R$ 0,50
```

Uma produção concluída antes da criação do produto não é retroativamente lançada no estoque acabado.

## Fluxo de teste recomendado da V6
1. Execute `005_products_finished_goods.sql` no SQL Editor do Supabase.
2. Publique a V6.
3. Entre em **Produtos → Novo produto**.
4. Cadastre `Bolo de Chocolate`.
5. Vincule a ficha correta: `Bolo Chocolate • v1 • 10 un • R$ 0,50/un`.
6. Defina preço de venda, por exemplo `R$ 8,00`.
7. Confira custo, lucro bruto e margem no cadastro.
8. O saldo inicial do produto ficará `0 un`.
9. Entre em **Produção**, crie uma nova ordem de 1 lote usando a mesma ficha v1 e conclua.
10. Volte a **Produtos**: o esperado é `10 un` de saldo e aproximadamente `R$ 5,00` de valor em estoque acabado.
11. O estoque de farinha deverá cair mais `1.000 g`.

## Segurança e integridade
- Movimentações de estoque acabado são registradas em livro-razão; saldo não é editado silenciosamente.
- Ajustes manuais exigem motivo.
- Ajuste de saída não permite saldo negativo.
- A conclusão da produção continua transacional.
- Views usam `security_invoker=true` e respeitam RLS.
- Nunca coloque `service_role` ou `sb_secret_...` no frontend.

## Publicação
Domínio atual:

```text
https://smartpdv.movemkt.com.br
```
