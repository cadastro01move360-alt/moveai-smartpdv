-- MoveAI SmartPDV - V7: Vendas / PDV
-- Migration incremental: depende de 001 a 005.
-- Implementa catálogo vendável, finalização atômica da venda,
-- baixa de produto acabado, CMV e margem bruta por pedido.

create or replace view public.pdv_product_catalog
with (security_invoker=true)
as
select
  pss.organization_id,
  pss.product_id,
  pss.name,
  pss.category,
  pss.internal_code,
  pss.barcode,
  pss.stock_unit_id,
  pss.stock_unit_symbol,
  pss.sale_price,
  pss.available_quantity,
  pss.unit_cost,
  pss.gross_profit_unit,
  pss.gross_margin_percent,
  pss.active,
  pss.available
from public.product_stock_summary pss
where pss.active = true
  and pss.available = true
  and pss.sale_price > 0;

create or replace view public.sales_order_summary
with (security_invoker=true)
as
select
  o.organization_id,
  o.id as order_id,
  o.channel,
  o.status,
  o.total,
  coalesce(sum(oi.quantity * oi.unit_cost_snapshot),0)::numeric(18,6) as cmv,
  (o.total - coalesce(sum(oi.quantity * oi.unit_cost_snapshot),0))::numeric(18,6) as gross_profit,
  case
    when o.total > 0 then ((o.total - coalesce(sum(oi.quantity * oi.unit_cost_snapshot),0)) / o.total * 100)::numeric(18,4)
    else 0::numeric(18,4)
  end as gross_margin_percent,
  coalesce(sum(oi.quantity),0)::numeric(18,6) as item_quantity,
  count(oi.id)::integer as item_lines,
  o.created_by,
  o.created_at,
  o.closed_at
from public.orders o
left join public.order_items oi
  on oi.order_id=o.id and oi.organization_id=o.organization_id
group by o.organization_id,o.id,o.channel,o.status,o.total,o.created_by,o.created_at,o.closed_at;

create or replace function public.finalize_pdv_sale(
  p_organization_id uuid,
  p_stock_location_id uuid,
  p_channel text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_product_id uuid;
  v_quantity numeric(18,6);
  v_location_balance numeric(18,6);
  v_total numeric(18,6) := 0;
  v_cmv numeric(18,6) := 0;
  v_line_total numeric(18,6);
  v_line_cmv numeric(18,6);
  v_channel text;
  v_payment text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Acesso negado';
  end if;

  v_channel := lower(coalesce(nullif(trim(p_channel),''),'balcao'));
  if v_channel not in ('mesa','balcao','retirada','encomenda') then
    raise exception 'Canal de venda inválido';
  end if;

  v_payment := lower(coalesce(nullif(trim(p_payment_method),''),'dinheiro'));
  if v_payment not in ('dinheiro','pix','debito','credito','outro') then
    raise exception 'Forma de pagamento inválida';
  end if;

  if not exists(
    select 1 from public.stock_locations sl
    where sl.id=p_stock_location_id
      and sl.organization_id=p_organization_id
      and sl.active=true
  ) then
    raise exception 'Local de estoque inválido';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Adicione pelo menos um item à venda';
  end if;

  insert into public.orders(organization_id,channel,status,total,created_by)
  values(p_organization_id,v_channel,'aberto',0,auth.uid())
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      raise exception 'Item de venda inválido';
    end;

    if v_product_id is null or coalesce(v_quantity,0) <= 0 then
      raise exception 'Produto ou quantidade inválida';
    end if;

    select
      pc.product_id,
      pc.name,
      pc.sale_price,
      pc.unit_cost,
      pc.stock_unit_symbol
    into v_product
    from public.pdv_product_catalog pc
    where pc.organization_id=p_organization_id
      and pc.product_id=v_product_id;

    if v_product.product_id is null then
      raise exception 'Produto indisponível para venda';
    end if;

    select coalesce(sum(psm.quantity),0)::numeric(18,6)
      into v_location_balance
    from public.product_stock_movements psm
    where psm.organization_id=p_organization_id
      and psm.product_id=v_product_id
      and psm.stock_location_id=p_stock_location_id;

    if v_location_balance + 0.0000005 < v_quantity then
      raise exception 'Estoque insuficiente para %: disponível %, solicitado %',
        v_product.name, v_location_balance, v_quantity;
    end if;

    v_line_total := (v_product.sale_price * v_quantity)::numeric(18,6);
    v_line_cmv := (v_product.unit_cost * v_quantity)::numeric(18,6);

    insert into public.order_items(
      organization_id,order_id,product_id,product_name_snapshot,quantity,
      unit_price_snapshot,unit_cost_snapshot
    ) values(
      p_organization_id,v_order_id,v_product_id,v_product.name,v_quantity,
      v_product.sale_price,v_product.unit_cost
    );

    insert into public.product_stock_movements(
      organization_id,product_id,stock_location_id,movement_type,quantity,unit_cost,
      reference_type,reference_id,notes,created_by
    ) values(
      p_organization_id,v_product_id,p_stock_location_id,'saida_venda',-v_quantity,v_product.unit_cost,
      'order',v_order_id,'Baixa automática da venda',auth.uid()
    );

    v_total := v_total + v_line_total;
    v_cmv := v_cmv + v_line_cmv;
  end loop;

  if v_total <= 0 then
    raise exception 'Total da venda inválido';
  end if;

  insert into public.payments(organization_id,order_id,method,amount)
  values(p_organization_id,v_order_id,v_payment,v_total);

  update public.orders
  set total=v_total,status='fechado',closed_at=now()
  where id=v_order_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    p_organization_id,auth.uid(),'orders',v_order_id,'finalizar_venda',
    jsonb_build_object(
      'channel',v_channel,
      'payment_method',v_payment,
      'total',v_total,
      'cmv',v_cmv,
      'gross_profit',v_total-v_cmv
    )
  );

  return jsonb_build_object(
    'order_id',v_order_id,
    'total',v_total,
    'cmv',v_cmv,
    'gross_profit',v_total-v_cmv,
    'gross_margin_percent',case when v_total>0 then ((v_total-v_cmv)/v_total*100) else 0 end
  );
end;
$$;

grant select on public.pdv_product_catalog to authenticated;
grant select on public.sales_order_summary to authenticated;
grant execute on function public.finalize_pdv_sale(uuid,uuid,text,text,jsonb) to authenticated;
