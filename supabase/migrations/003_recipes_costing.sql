-- MoveAI SmartPDV - fichas técnicas, custos e versionamento de receitas
-- Migration incremental: depende de 001_foundation.sql e 002_operational_core.sql.

create index if not exists idx_recipes_org_active on public.recipes(organization_id, active);
create index if not exists idx_recipe_versions_recipe_version on public.recipe_versions(recipe_id, version_number desc);
create index if not exists idx_recipe_items_version on public.recipe_items(recipe_version_id);

create or replace view public.recipe_version_item_costs
with (security_invoker=true)
as
select
  ri.organization_id,
  ri.id as recipe_item_id,
  ri.recipe_version_id,
  ri.ingredient_base_id,
  ib.name as ingredient_name,
  u.symbol as unit_symbol,
  ri.quantity,
  ri.loss_percent,
  case
    when ri.loss_percent >= 100 then 0::numeric
    else (ri.quantity / (1 - (ri.loss_percent / 100)))::numeric(18,6)
  end as gross_quantity,
  coalesce(iss.average_cost,0)::numeric(18,6) as average_cost,
  case
    when ri.loss_percent >= 100 then 0::numeric
    else ((ri.quantity / (1 - (ri.loss_percent / 100))) * coalesce(iss.average_cost,0))::numeric(18,6)
  end as item_cost
from public.recipe_items ri
join public.ingredient_bases ib
  on ib.id=ri.ingredient_base_id
 and ib.organization_id=ri.organization_id
join public.units u on u.id=ib.base_unit_id
left join public.ingredient_stock_summary iss
  on iss.organization_id=ri.organization_id
 and iss.ingredient_base_id=ri.ingredient_base_id
where ri.item_type='insumo';

create or replace view public.recipe_cost_summary
with (security_invoker=true)
as
select
  r.organization_id,
  r.id as recipe_id,
  r.name,
  r.category,
  r.active,
  rv.id as recipe_version_id,
  rv.version_number,
  rv.status,
  rv.yield_quantity,
  rv.yield_unit_id,
  yu.symbol as yield_unit_symbol,
  rv.instructions,
  coalesce(sum(ic.item_cost),0)::numeric(18,6) as total_cost,
  case
    when rv.yield_quantity > 0
    then (coalesce(sum(ic.item_cost),0) / rv.yield_quantity)::numeric(18,6)
    else 0::numeric(18,6)
  end as cost_per_yield,
  count(ic.recipe_item_id)::integer as ingredient_count,
  rv.created_at
from public.recipes r
join public.recipe_versions rv
  on rv.recipe_id=r.id and rv.organization_id=r.organization_id
join public.units yu on yu.id=rv.yield_unit_id
left join public.recipe_version_item_costs ic
  on ic.recipe_version_id=rv.id and ic.organization_id=rv.organization_id
group by
  r.organization_id,r.id,r.name,r.category,r.active,
  rv.id,rv.version_number,rv.status,rv.yield_quantity,rv.yield_unit_id,yu.symbol,rv.instructions,rv.created_at;

create or replace function public.create_recipe_with_version(
  p_organization_id uuid,
  p_name text,
  p_category text,
  p_yield_quantity numeric,
  p_yield_unit_id uuid,
  p_instructions text,
  p_status text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_recipe_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_ingredient public.ingredient_bases;
  v_qty numeric(18,6);
  v_loss numeric(9,4);
  v_status text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.is_org_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Informe o nome da receita'; end if;
  if coalesce(p_yield_quantity,0) <= 0 then raise exception 'Rendimento inválido'; end if;
  if not exists(select 1 from public.units u where u.id=p_yield_unit_id and u.organization_id=p_organization_id and u.active=true) then
    raise exception 'Unidade de rendimento inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A receita precisa ter pelo menos um insumo';
  end if;

  v_status := case when p_status='ativa' then 'ativa' else 'rascunho' end;

  insert into public.recipes(organization_id,name,category)
  values(p_organization_id,trim(p_name),nullif(trim(p_category),''))
  returning id into v_recipe_id;

  insert into public.recipe_versions(
    organization_id,recipe_id,version_number,status,yield_quantity,yield_unit_id,instructions
  ) values(
    p_organization_id,v_recipe_id,1,v_status,p_yield_quantity,p_yield_unit_id,nullif(trim(p_instructions),'')
  ) returning id into v_version_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_ingredient
    from public.ingredient_bases ib
    where ib.id=(v_item->>'ingredient_base_id')::uuid
      and ib.organization_id=p_organization_id
      and ib.active=true;

    if v_ingredient.id is null then raise exception 'Insumo inválido na ficha técnica'; end if;

    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_loss := coalesce((v_item->>'loss_percent')::numeric,0);
    if v_qty <= 0 then raise exception 'Quantidade de insumo inválida'; end if;
    if v_loss < 0 or v_loss >= 100 then raise exception 'Percentual de perda inválido'; end if;

    insert into public.recipe_items(
      organization_id,recipe_version_id,item_type,ingredient_base_id,quantity,unit_id,loss_percent
    ) values(
      p_organization_id,v_version_id,'insumo',v_ingredient.id,v_qty,v_ingredient.base_unit_id,v_loss
    );
  end loop;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    p_organization_id,auth.uid(),'recipes',v_recipe_id,'criar_receita',
    jsonb_build_object('version_id',v_version_id,'version',1,'status',v_status,'items',jsonb_array_length(p_items))
  );

  return v_version_id;
end;
$$;

create or replace function public.create_recipe_version(
  p_recipe_id uuid,
  p_yield_quantity numeric,
  p_yield_unit_id uuid,
  p_instructions text,
  p_status text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_recipe public.recipes;
  v_version_id uuid;
  v_next integer;
  v_item jsonb;
  v_ingredient public.ingredient_bases;
  v_qty numeric(18,6);
  v_loss numeric(9,4);
  v_status text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  select * into v_recipe from public.recipes where id=p_recipe_id for update;
  if v_recipe.id is null then raise exception 'Receita não encontrada'; end if;
  if not public.is_org_member(v_recipe.organization_id) then raise exception 'Acesso negado'; end if;
  if coalesce(p_yield_quantity,0) <= 0 then raise exception 'Rendimento inválido'; end if;
  if not exists(select 1 from public.units u where u.id=p_yield_unit_id and u.organization_id=v_recipe.organization_id and u.active=true) then
    raise exception 'Unidade de rendimento inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A receita precisa ter pelo menos um insumo';
  end if;

  select coalesce(max(version_number),0)+1 into v_next
  from public.recipe_versions where recipe_id=v_recipe.id;
  v_status := case when p_status='ativa' then 'ativa' else 'rascunho' end;

  if v_status='ativa' then
    update public.recipe_versions
    set status='arquivada'
    where recipe_id=v_recipe.id and organization_id=v_recipe.organization_id and status='ativa';
  end if;

  insert into public.recipe_versions(
    organization_id,recipe_id,version_number,status,yield_quantity,yield_unit_id,instructions
  ) values(
    v_recipe.organization_id,v_recipe.id,v_next,v_status,p_yield_quantity,p_yield_unit_id,nullif(trim(p_instructions),'')
  ) returning id into v_version_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_ingredient
    from public.ingredient_bases ib
    where ib.id=(v_item->>'ingredient_base_id')::uuid
      and ib.organization_id=v_recipe.organization_id
      and ib.active=true;
    if v_ingredient.id is null then raise exception 'Insumo inválido na ficha técnica'; end if;

    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_loss := coalesce((v_item->>'loss_percent')::numeric,0);
    if v_qty <= 0 then raise exception 'Quantidade de insumo inválida'; end if;
    if v_loss < 0 or v_loss >= 100 then raise exception 'Percentual de perda inválido'; end if;

    insert into public.recipe_items(
      organization_id,recipe_version_id,item_type,ingredient_base_id,quantity,unit_id,loss_percent
    ) values(
      v_recipe.organization_id,v_version_id,'insumo',v_ingredient.id,v_qty,v_ingredient.base_unit_id,v_loss
    );
  end loop;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    v_recipe.organization_id,auth.uid(),'recipes',v_recipe.id,'nova_versao',
    jsonb_build_object('version_id',v_version_id,'version',v_next,'status',v_status,'items',jsonb_array_length(p_items))
  );

  return v_version_id;
end;
$$;
