-- MoveAI SmartPDV - V11 Relatórios
-- Views analíticas read-only para ranking de produtos e formas de pagamento.
-- Os demais indicadores reutilizam as views operacionais já existentes.

create index if not exists idx_orders_org_closed_at
  on public.orders(organization_id, closed_at desc)
  where closed_at is not null;

create index if not exists idx_order_items_org_order
  on public.order_items(organization_id, order_id);

create index if not exists idx_payments_org_created
  on public.payments(organization_id, created_at desc);

create index if not exists idx_financial_transactions_org_occurred
  on public.financial_transactions(organization_id, occurred_at desc);

create or replace view public.report_sales_product_daily
with (security_invoker=true)
as
select
  o.organization_id,
  o.closed_at::date as sale_date,
  oi.product_id,
  oi.product_name_snapshot as product_name,
  coalesce(sum(oi.quantity),0)::numeric(18,6) as quantity_sold,
  coalesce(sum(oi.quantity * oi.unit_price_snapshot),0)::numeric(18,6) as revenue,
  coalesce(sum(oi.quantity * oi.unit_cost_snapshot),0)::numeric(18,6) as cmv,
  coalesce(sum(oi.quantity * (oi.unit_price_snapshot - oi.unit_cost_snapshot)),0)::numeric(18,6) as gross_profit,
  case
    when coalesce(sum(oi.quantity * oi.unit_price_snapshot),0) > 0
    then (
      coalesce(sum(oi.quantity * (oi.unit_price_snapshot - oi.unit_cost_snapshot)),0)
      / sum(oi.quantity * oi.unit_price_snapshot) * 100
    )::numeric(18,4)
    else 0::numeric(18,4)
  end as gross_margin_percent
from public.orders o
join public.order_items oi
  on oi.organization_id=o.organization_id
 and oi.order_id=o.id
where o.status='fechado'
  and o.closed_at is not null
group by
  o.organization_id,
  o.closed_at::date,
  oi.product_id,
  oi.product_name_snapshot;

create or replace view public.report_payment_method_daily
with (security_invoker=true)
as
select
  p.organization_id,
  p.created_at::date as payment_date,
  p.method,
  count(*)::integer as payment_count,
  coalesce(sum(p.amount),0)::numeric(18,6) as amount
from public.payments p
join public.orders o
  on o.organization_id=p.organization_id
 and o.id=p.order_id
where o.status='fechado'
group by
  p.organization_id,
  p.created_at::date,
  p.method;

grant select on public.report_sales_product_daily to authenticated;
grant select on public.report_payment_method_daily to authenticated;
