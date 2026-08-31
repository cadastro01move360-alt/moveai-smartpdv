-- MoveAI SmartPDV - ordens de produção e consumo real por lote
-- Migration incremental: depende de 001, 002 e 003.

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null,
  recipe_version_id uuid not null references public.recipe_versions(id),
  stock_location_id uuid not null references public.stock_locations(id),
  planned_batches numeric(18,6) not null default 1 check(planned_batches > 0),
  planned_yield numeric(18,6) not null check(planned_yield > 0),
  actual_yield numeric(18,6),
  standard_cost numeric(18,6) not null default 0 check(standard_cost >= 0),
  actual_cost numeric(18,6),
  status text not null default 'planejada' check(status in ('planejada','concluida','cancelada')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(organization_id,code)
);

create table if not exists public.production_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  recipe_item_id uuid not null references public.recipe_items(id),
  ingredient_base_id uuid not null references public.ingredient_bases(id),
  stock_lot_id uuid not null references public.stock_lots(id),
  quantity numeric(18,6) not null check(quantity > 0),
  unit_cost numeric(18,6) not null check(unit_cost >= 0),
  total_cost numeric(18,6) not null check(total_cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_production_orders_org_created on public.production_orders(organization_id,created_at desc);
create index if not exists idx_production_consumptions_order on public.production_consumptions(production_order_id);

alter table public.production_orders enable row level security;
alter table public.production_consumptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='production_orders' and policyname='org_read_production_orders') then
    create policy org_read_production_orders on public.production_orders for select using (public.is_org_member(organization_id));
    create policy org_insert_production_orders on public.production_orders for insert with check (public.is_org_member(organization_id));
    create policy org_update_production_orders on public.production_orders for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='production_consumptions' and policyname='org_read_production_consumptions') then
    create policy org_read_production_consumptions on public.production_consumptions for select using (public.is_org_member(organization_id));
    create policy org_insert_production_consumptions on public.production_consumptions for insert with check (public.is_org_member(organization_id));
  end if;
end $$;

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
  po.notes,
  po.created_at,
  po.completed_at
from public.production_orders po
join public.recipe_versions rv on rv.id=po.recipe_version_id and rv.organization_id=po.organization_id
join public.recipes r on r.id=rv.recipe_id and r.organization_id=po.organization_id
join public.units u on u.id=rv.yield_unit_id
join public.stock_locations sl on sl.id=po.stock_location_id and sl.organization_id=po.organization_id;

create or replace function public.create_production_order(
  p_organization_id uuid,
  p_recipe_version_id uuid,
  p_stock_location_id uuid,
  p_batches numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_rv record;
  v_cost numeric(18,6);
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.is_org_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if coalesce(p_batches,0) <= 0 then raise exception 'Quantidade de produção inválida'; end if;

  select rv.id, rv.yield_quantity, rv.status, r.name
  into v_rv
  from public.recipe_versions rv
  join public.recipes r on r.id=rv.recipe_id and r.organization_id=rv.organization_id
  where rv.id=p_recipe_version_id and rv.organization_id=p_organization_id;
  if v_rv.id is null then raise exception 'Ficha técnica não encontrada'; end if;
  if v_rv.status <> 'ativa' then raise exception 'Somente fichas técnicas ativas podem gerar produção'; end if;

  if not exists(select 1 from public.stock_locations where id=p_stock_location_id and organization_id=p_organization_id and active=true) then
    raise exception 'Local de estoque inválido';
  end if;

  select coalesce(total_cost,0) into v_cost
  from public.recipe_cost_summary
  where recipe_version_id=p_recipe_version_id and organization_id=p_organization_id;

  v_code := 'OP-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.production_orders(
    organization_id,code,recipe_version_id,stock_location_id,planned_batches,planned_yield,standard_cost,notes,created_by
  ) values(
    p_organization_id,v_code,p_recipe_version_id,p_stock_location_id,p_batches,v_rv.yield_quantity*p_batches,coalesce(v_cost,0)*p_batches,nullif(trim(p_notes),''),auth.uid()
  ) returning id into v_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(p_organization_id,auth.uid(),'production_orders',v_id,'criar_ordem',jsonb_build_object('code',v_code,'recipe_version_id',p_recipe_version_id,'batches',p_batches));

  return v_id;
end;
$$;

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
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

  select * into v_order from public.production_orders where id=p_production_order_id for update;
  if v_order.id is null then raise exception 'Ordem de produção não encontrada'; end if;
  if not public.is_org_member(v_order.organization_id) then raise exception 'Acesso negado'; end if;
  if v_order.status='concluida' then return; end if;
  if v_order.status<>'planejada' then raise exception 'Ordem não pode ser concluída'; end if;
  if coalesce(p_actual_yield,v_order.planned_yield) <= 0 then raise exception 'Rendimento real inválido'; end if;

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
  set status='concluida', actual_yield=coalesce(p_actual_yield,planned_yield), actual_cost=v_actual_cost, completed_at=now(), updated_at=now()
  where id=v_order.id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(v_order.organization_id,auth.uid(),'production_orders',v_order.id,'concluir_ordem',jsonb_build_object('actual_yield',coalesce(p_actual_yield,v_order.planned_yield),'actual_cost',v_actual_cost));
end;
$$;
