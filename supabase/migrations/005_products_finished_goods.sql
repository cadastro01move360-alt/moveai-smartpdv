-- MoveAI SmartPDV - Produtos e estoque de produtos acabados
-- Migration incremental: depende de 001, 002, 003 e 004.

alter table public.products
  add column if not exists stock_unit_id uuid references public.units(id),
  add column if not exists minimum_stock numeric(18,6) not null default 0 check(minimum_stock >= 0),
  add column if not exists barcode text;

create unique index if not exists idx_products_org_internal_code
  on public.products(organization_id, internal_code)
  where internal_code is not null;

create unique index if not exists idx_products_org_recipe_active
  on public.products(organization_id, recipe_version_id)
  where recipe_version_id is not null and active=true;

create table if not exists public.product_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  product_id uuid not null references public.products(id),
  stock_location_id uuid not null references public.stock_locations(id),
  movement_type text not null check(movement_type in ('entrada_producao','saida_venda','ajuste_entrada','ajuste_saida','estorno')),
  quantity numeric(18,6) not null check(quantity <> 0),
  unit_cost numeric(18,6) not null default 0 check(unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_stock_movements_org_product
  on public.product_stock_movements(organization_id,product_id,stock_location_id,created_at desc);
create index if not exists idx_product_stock_movements_reference
  on public.product_stock_movements(reference_type,reference_id);

alter table public.product_stock_movements enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='product_stock_movements' and policyname='org_read_product_stock_movements'
  ) then
    create policy org_read_product_stock_movements on public.product_stock_movements
      for select using (public.is_org_member(organization_id));
    create policy org_insert_product_stock_movements on public.product_stock_movements
      for insert with check (public.is_org_member(organization_id));
  end if;
end $$;

create or replace view public.product_stock_summary
with (security_invoker=true)
as
with movement_summary as (
  select
    psm.organization_id,
    psm.product_id,
    coalesce(sum(psm.quantity),0)::numeric(18,6) as available_quantity,
    coalesce(
      sum(case when psm.quantity > 0 then psm.quantity * psm.unit_cost else 0 end)
      / nullif(sum(case when psm.quantity > 0 then psm.quantity else 0 end),0),
      0
    )::numeric(18,6) as production_average_cost
  from public.product_stock_movements psm
  group by psm.organization_id,psm.product_id
)
select
  p.organization_id,
  p.id as product_id,
  p.name,
  p.category,
  p.internal_code,
  p.barcode,
  p.recipe_version_id,
  r.name as recipe_name,
  rv.version_number as recipe_version_number,
  p.stock_unit_id,
  coalesce(su.symbol,yu.symbol,'un') as stock_unit_symbol,
  p.sale_price,
  p.minimum_stock,
  p.active,
  p.available,
  coalesce(ms.available_quantity,0)::numeric(18,6) as available_quantity,
  coalesce(nullif(ms.production_average_cost,0),rcs.cost_per_yield,0)::numeric(18,6) as unit_cost,
  (coalesce(ms.available_quantity,0) * coalesce(nullif(ms.production_average_cost,0),rcs.cost_per_yield,0))::numeric(18,6) as stock_value,
  (p.sale_price - coalesce(nullif(ms.production_average_cost,0),rcs.cost_per_yield,0))::numeric(18,6) as gross_profit_unit,
  case
    when p.sale_price > 0 then ((p.sale_price - coalesce(nullif(ms.production_average_cost,0),rcs.cost_per_yield,0)) / p.sale_price * 100)::numeric(18,4)
    else 0::numeric(18,4)
  end as gross_margin_percent,
  p.created_at,
  p.updated_at
from public.products p
left join public.recipe_versions rv on rv.id=p.recipe_version_id and rv.organization_id=p.organization_id
left join public.recipes r on r.id=rv.recipe_id and r.organization_id=p.organization_id
left join public.recipe_cost_summary rcs on rcs.recipe_version_id=p.recipe_version_id and rcs.organization_id=p.organization_id
left join public.units yu on yu.id=rv.yield_unit_id
left join public.units su on su.id=p.stock_unit_id
left join movement_summary ms on ms.organization_id=p.organization_id and ms.product_id=p.id;

create or replace function public.create_product_catalog_item(
  p_organization_id uuid,
  p_name text,
  p_category text,
  p_internal_code text,
  p_barcode text,
  p_recipe_version_id uuid,
  p_stock_unit_id uuid,
  p_sale_price numeric,
  p_minimum_stock numeric,
  p_active boolean default true,
  p_available boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_unit uuid;
  v_recipe_unit uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.is_org_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome do produto'; end if;
  if coalesce(p_sale_price,0) < 0 then raise exception 'Preço de venda inválido'; end if;
  if coalesce(p_minimum_stock,0) < 0 then raise exception 'Estoque mínimo inválido'; end if;

  if p_recipe_version_id is not null then
    select rv.yield_unit_id into v_recipe_unit
    from public.recipe_versions rv
    where rv.id=p_recipe_version_id and rv.organization_id=p_organization_id;
    if v_recipe_unit is null then raise exception 'Ficha técnica inválida'; end if;
    v_unit := v_recipe_unit;
  else
    v_unit := p_stock_unit_id;
  end if;

  if v_unit is null or not exists(
    select 1 from public.units u where u.id=v_unit and u.organization_id=p_organization_id and u.active=true
  ) then
    raise exception 'Unidade de estoque inválida';
  end if;

  insert into public.products(
    organization_id,name,category,internal_code,barcode,recipe_version_id,stock_unit_id,sale_price,minimum_stock,active,available
  ) values(
    p_organization_id,trim(p_name),nullif(trim(p_category),''),nullif(trim(p_internal_code),''),nullif(trim(p_barcode),''),p_recipe_version_id,v_unit,p_sale_price,p_minimum_stock,p_active,p_available
  ) returning id into v_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(p_organization_id,auth.uid(),'products',v_id,'criar_produto',jsonb_build_object('name',trim(p_name),'recipe_version_id',p_recipe_version_id,'sale_price',p_sale_price));

  return v_id;
end;
$$;

create or replace function public.update_product_catalog_item(
  p_product_id uuid,
  p_name text,
  p_category text,
  p_internal_code text,
  p_barcode text,
  p_recipe_version_id uuid,
  p_stock_unit_id uuid,
  p_sale_price numeric,
  p_minimum_stock numeric,
  p_active boolean,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products;
  v_unit uuid;
  v_recipe_unit uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if v_product.id is null then raise exception 'Produto não encontrado'; end if;
  if not public.is_org_member(v_product.organization_id) then raise exception 'Acesso negado'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome do produto'; end if;
  if coalesce(p_sale_price,0) < 0 then raise exception 'Preço de venda inválido'; end if;
  if coalesce(p_minimum_stock,0) < 0 then raise exception 'Estoque mínimo inválido'; end if;

  if p_recipe_version_id is not null then
    select rv.yield_unit_id into v_recipe_unit
    from public.recipe_versions rv
    where rv.id=p_recipe_version_id and rv.organization_id=v_product.organization_id;
    if v_recipe_unit is null then raise exception 'Ficha técnica inválida'; end if;
    v_unit := v_recipe_unit;
  else
    v_unit := p_stock_unit_id;
  end if;

  if v_unit is null or not exists(
    select 1 from public.units u where u.id=v_unit and u.organization_id=v_product.organization_id and u.active=true
  ) then
    raise exception 'Unidade de estoque inválida';
  end if;

  update public.products
  set name=trim(p_name), category=nullif(trim(p_category),''), internal_code=nullif(trim(p_internal_code),''), barcode=nullif(trim(p_barcode),''),
      recipe_version_id=p_recipe_version_id, stock_unit_id=v_unit, sale_price=p_sale_price, minimum_stock=p_minimum_stock,
      active=p_active, available=p_available, updated_at=now()
  where id=v_product.id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(v_product.organization_id,auth.uid(),'products',v_product.id,'editar_produto',jsonb_build_object('name',trim(p_name),'recipe_version_id',p_recipe_version_id,'sale_price',p_sale_price));
end;
$$;

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_stock_location_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product public.products;
  v_type text;
  v_id uuid;
  v_cost numeric(18,6);
  v_available numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  select * into v_product from public.products where id=p_product_id;
  if v_product.id is null then raise exception 'Produto não encontrado'; end if;
  if not public.is_org_member(v_product.organization_id) then raise exception 'Acesso negado'; end if;
  if coalesce(p_quantity,0)=0 then raise exception 'Informe uma quantidade diferente de zero'; end if;
  if not exists(select 1 from public.stock_locations sl where sl.id=p_stock_location_id and sl.organization_id=v_product.organization_id and sl.active=true) then raise exception 'Local de estoque inválido'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Informe o motivo do ajuste'; end if;

  select coalesce(available_quantity,0),coalesce(unit_cost,0)
  into v_available,v_cost
  from public.product_stock_summary where product_id=v_product.id;

  if p_quantity < 0 and v_available + p_quantity < -0.0000005 then
    raise exception 'Saldo insuficiente para o ajuste de saída';
  end if;

  v_type := case when p_quantity > 0 then 'ajuste_entrada' else 'ajuste_saida' end;
  if p_quantity > 0 then
    v_cost := greatest(coalesce(p_unit_cost,v_cost,0),0);
  end if;

  insert into public.product_stock_movements(
    organization_id,product_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by
  ) values(
    v_product.organization_id,v_product.id,p_stock_location_id,v_type,p_quantity,v_cost,'manual_adjustment',v_product.id,trim(p_reason),auth.uid()
  ) returning id into v_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,reason,new_data)
  values(v_product.organization_id,auth.uid(),'products',v_product.id,'ajustar_estoque_produto',trim(p_reason),jsonb_build_object('quantity',p_quantity,'unit_cost',v_cost,'movement_id',v_id));

  return v_id;
end;
$$;

-- Exibe também qual produto acabado receberá a produção, quando houver vínculo com a ficha técnica.
create or replace view public.production_order_summary
with (security_invoker=true)
as
select
  po.organization_id,
  po.id as production_order_id,
  po.code,
  po.recipe_version_id,
  r.name as recipe_name,
  rv.version_number,
  rv.yield_quantity as recipe_yield_quantity,
  u.symbol as yield_unit_symbol,
  po.planned_batches,
  po.planned_yield,
  po.actual_yield,
  po.standard_cost,
  po.actual_cost,
  po.status,
  sl.name as location_name,
  p.id as product_id,
  p.name as product_name,
  po.notes,
  po.created_at,
  po.completed_at
from public.production_orders po
join public.recipe_versions rv on rv.id=po.recipe_version_id and rv.organization_id=po.organization_id
join public.recipes r on r.id=rv.recipe_id and r.organization_id=po.organization_id
join public.units u on u.id=rv.yield_unit_id
join public.stock_locations sl on sl.id=po.stock_location_id and sl.organization_id=po.organization_id
left join public.products p on p.organization_id=po.organization_id and p.recipe_version_id=po.recipe_version_id and p.active=true;

-- Substitui a conclusão da produção: mantém o consumo FEFO e, se existir produto vinculado,
-- registra a entrada do produto acabado pelo rendimento real e custo real unitário.
create or replace function public.complete_production_order(
  p_production_order_id uuid,
  p_actual_yield numeric default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.production_orders;
  v_item record;
  v_lot record;
  v_required numeric(18,6);
  v_remaining numeric(18,6);
  v_take numeric(18,6);
  v_balance numeric(18,6);
  v_actual_cost numeric(18,6) := 0;
  v_actual_yield numeric(18,6);
  v_product_id uuid;
  v_unit_cost numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

  select * into v_order from public.production_orders where id=p_production_order_id for update;
  if v_order.id is null then raise exception 'Ordem de produção não encontrada'; end if;
  if not public.is_org_member(v_order.organization_id) then raise exception 'Acesso negado'; end if;
  if v_order.status='concluida' then return; end if;
  if v_order.status<>'planejada' then raise exception 'Ordem não pode ser concluída'; end if;

  v_actual_yield := coalesce(p_actual_yield,v_order.planned_yield);
  if v_actual_yield <= 0 then raise exception 'Rendimento real inválido'; end if;

  for v_item in
    select ri.id as recipe_item_id, ri.ingredient_base_id,
           (ri.quantity / (1 - ri.loss_percent/100)) * v_order.planned_batches as required_quantity
    from public.recipe_items ri
    where ri.recipe_version_id=v_order.recipe_version_id
      and ri.organization_id=v_order.organization_id
      and ri.item_type='insumo'
  loop
    v_required := v_item.required_quantity;
    v_remaining := v_required;

    for v_lot in
      select sl.id, sl.unit_cost_base, sl.expires_at, sl.created_at,
             coalesce((select sum(sm.quantity) from public.stock_movements sm where sm.organization_id=sl.organization_id and sm.stock_lot_id=sl.id),0) as available
      from public.stock_lots sl
      where sl.organization_id=v_order.organization_id
        and sl.ingredient_base_id=v_item.ingredient_base_id
        and sl.stock_location_id=v_order.stock_location_id
        and coalesce((select sum(sm.quantity) from public.stock_movements sm where sm.organization_id=sl.organization_id and sm.stock_lot_id=sl.id),0) > 0
      order by sl.expires_at asc nulls last, sl.created_at asc
    loop
      exit when v_remaining <= 0;
      v_balance := v_lot.available;
      v_take := least(v_remaining,v_balance);

      insert into public.stock_movements(
        organization_id,stock_lot_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by
      ) values(
        v_order.organization_id,v_lot.id,v_order.stock_location_id,'saida_producao',-v_take,v_lot.unit_cost_base,'production_order',v_order.id,auth.uid()
      );

      insert into public.production_consumptions(
        organization_id,production_order_id,recipe_item_id,ingredient_base_id,stock_lot_id,quantity,unit_cost,total_cost
      ) values(
        v_order.organization_id,v_order.id,v_item.recipe_item_id,v_item.ingredient_base_id,v_lot.id,v_take,v_lot.unit_cost_base,v_take*v_lot.unit_cost_base
      );

      v_actual_cost := v_actual_cost + (v_take*v_lot.unit_cost_base);
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0.0000005 then
      raise exception 'Estoque insuficiente para concluir a produção';
    end if;
  end loop;

  update public.production_orders
  set status='concluida', actual_yield=v_actual_yield, actual_cost=v_actual_cost, completed_at=now(), updated_at=now()
  where id=v_order.id;

  select p.id into v_product_id
  from public.products p
  where p.organization_id=v_order.organization_id
    and p.recipe_version_id=v_order.recipe_version_id
    and p.active=true
  order by p.created_at
  limit 1;

  if v_product_id is not null then
    v_unit_cost := case when v_actual_yield > 0 then v_actual_cost/v_actual_yield else 0 end;
    insert into public.product_stock_movements(
      organization_id,product_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes,created_by
    ) values(
      v_order.organization_id,v_product_id,v_order.stock_location_id,'entrada_producao',v_actual_yield,v_unit_cost,'production_order',v_order.id,'Entrada automática da produção',auth.uid()
    );
  end if;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(v_order.organization_id,auth.uid(),'production_orders',v_order.id,'concluir_ordem',jsonb_build_object('actual_yield',v_actual_yield,'actual_cost',v_actual_cost,'product_id',v_product_id));
end;
$$;
