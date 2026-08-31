-- MoveAI SmartPDV - núcleo operacional: insumos, fornecedores, compras e estoque
-- Migration incremental: não remove tabelas nem dados existentes.

alter table public.ingredient_presentations
  add column if not exists label text,
  add column if not exists sku text;

create index if not exists idx_ingredient_bases_org_active on public.ingredient_bases(organization_id, active);
create index if not exists idx_suppliers_org_active on public.suppliers(organization_id, active);
create index if not exists idx_presentations_org_ingredient on public.ingredient_presentations(organization_id, ingredient_base_id);
create index if not exists idx_purchases_org_date on public.purchases(organization_id, purchase_date desc);
create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_stock_lots_org_expiry on public.stock_lots(organization_id, expires_at);

create or replace view public.stock_lot_summary
with (security_invoker=true)
as
with balances as (
  select
    sm.organization_id,
    sm.stock_lot_id,
    sum(sm.quantity) as available_quantity
  from public.stock_movements sm
  where sm.stock_lot_id is not null
  group by sm.organization_id, sm.stock_lot_id
)
select
  l.organization_id,
  l.id as stock_lot_id,
  l.ingredient_base_id,
  ib.name as ingredient_name,
  ib.minimum_stock,
  u.symbol as unit_symbol,
  l.brand_id,
  b.name as brand_name,
  l.stock_location_id,
  sl.name as location_name,
  l.lot_code,
  l.expires_at,
  l.quantity_received,
  coalesce(bal.available_quantity,0)::numeric(18,6) as available_quantity,
  l.unit_cost_base,
  (coalesce(bal.available_quantity,0) * l.unit_cost_base)::numeric(18,6) as stock_value,
  l.origin_type,
  l.origin_id,
  l.created_at
from public.stock_lots l
left join balances bal on bal.organization_id=l.organization_id and bal.stock_lot_id=l.id
left join public.ingredient_bases ib on ib.id=l.ingredient_base_id
left join public.units u on u.id=ib.base_unit_id
left join public.brands b on b.id=l.brand_id
left join public.stock_locations sl on sl.id=l.stock_location_id;

create or replace view public.ingredient_stock_summary
with (security_invoker=true)
as
with lot_balances as (
  select
    l.organization_id,
    l.ingredient_base_id,
    l.id as stock_lot_id,
    l.unit_cost_base,
    coalesce(sum(sm.quantity),0) as available_quantity
  from public.stock_lots l
  left join public.stock_movements sm on sm.stock_lot_id=l.id and sm.organization_id=l.organization_id
  group by l.organization_id,l.ingredient_base_id,l.id,l.unit_cost_base
)
select
  ib.organization_id,
  ib.id as ingredient_base_id,
  ib.name,
  ib.category,
  ib.minimum_stock,
  ib.controls_expiry,
  ib.active,
  u.symbol as unit_symbol,
  coalesce(sum(greatest(lb.available_quantity,0)),0)::numeric(18,6) as available_quantity,
  coalesce(sum(greatest(lb.available_quantity,0) * lb.unit_cost_base),0)::numeric(18,6) as stock_value,
  case
    when coalesce(sum(greatest(lb.available_quantity,0)),0) > 0
    then (sum(greatest(lb.available_quantity,0) * lb.unit_cost_base) / sum(greatest(lb.available_quantity,0)))::numeric(18,6)
    else 0::numeric(18,6)
  end as average_cost
from public.ingredient_bases ib
left join public.units u on u.id=ib.base_unit_id
left join lot_balances lb on lb.organization_id=ib.organization_id and lb.ingredient_base_id=ib.id
where ib.active=true
group by ib.organization_id,ib.id,ib.name,ib.category,ib.minimum_stock,ib.controls_expiry,ib.active,u.symbol;

create or replace function public.create_purchase_draft(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_document_number text,
  p_purchase_date date,
  p_entry_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_purchase_id uuid;
  v_item jsonb;
  v_presentation public.ingredient_presentations;
  v_qty numeric(18,6);
  v_price numeric(18,6);
  v_discount numeric(18,6);
  v_idempotency text;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.is_org_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.organization_id=p_organization_id and s.active=true) then
    raise exception 'Fornecedor inválido';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A compra precisa ter pelo menos um item';
  end if;

  v_idempotency := gen_random_uuid()::text;
  insert into public.purchases(
    organization_id,supplier_id,document_number,purchase_date,entry_date,notes,status,idempotency_key,created_by
  ) values (
    p_organization_id,p_supplier_id,nullif(trim(p_document_number),''),coalesce(p_purchase_date,current_date),coalesce(p_entry_date,current_date),nullif(trim(p_notes),''),'rascunho',v_idempotency,auth.uid()
  ) returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_presentation
    from public.ingredient_presentations ip
    where ip.id=(v_item->>'presentation_id')::uuid
      and ip.organization_id=p_organization_id
      and ip.active=true;

    if v_presentation.id is null then raise exception 'Apresentação de insumo inválida'; end if;

    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_price := coalesce((v_item->>'unit_price')::numeric,0);
    v_discount := coalesce((v_item->>'discount')::numeric,0);

    if v_qty <= 0 then raise exception 'Quantidade inválida'; end if;
    if v_price < 0 or v_discount < 0 then raise exception 'Preço ou desconto inválido'; end if;
    if v_discount > (v_qty*v_price) then raise exception 'Desconto maior que o valor do item'; end if;

    insert into public.purchase_items(
      organization_id,purchase_id,presentation_id,quantity,unit_price,discount,lot_code,expires_at
    ) values (
      p_organization_id,
      v_purchase_id,
      v_presentation.id,
      v_qty,
      v_price,
      v_discount,
      nullif(trim(v_item->>'lot_code'),''),
      nullif(v_item->>'expires_at','')::date
    );
  end loop;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(p_organization_id,auth.uid(),'purchases',v_purchase_id,'criar_rascunho',jsonb_build_object('items',jsonb_array_length(p_items)));

  return v_purchase_id;
end;
$$;

create or replace function public.confirm_purchase(p_purchase_id uuid, p_location_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.purchases;
  i record;
  pres public.ingredient_presentations;
  lot_id uuid;
  total_base numeric(18,6);
  net_value numeric(18,6);
  unit_cost numeric(18,6);
  item_count integer;
begin
  select * into p from public.purchases where id=p_purchase_id for update;
  if p.id is null then raise exception 'Compra não encontrada'; end if;
  if not public.is_org_member(p.organization_id) then raise exception 'Acesso negado'; end if;
  if p.status='confirmada' then return; end if;
  if p.status<>'rascunho' then raise exception 'Compra não pode ser confirmada'; end if;
  if not exists(select 1 from public.stock_locations sl where sl.id=p_location_id and sl.organization_id=p.organization_id and sl.active=true) then
    raise exception 'Local de estoque inválido';
  end if;

  select count(*) into item_count from public.purchase_items where purchase_id=p.id and organization_id=p.organization_id;
  if item_count=0 then raise exception 'Compra sem itens'; end if;

  for i in select * from public.purchase_items where purchase_id=p.id and organization_id=p.organization_id loop
    select * into pres from public.ingredient_presentations
    where id=i.presentation_id and organization_id=p.organization_id and active=true;
    if pres.id is null then raise exception 'Apresentação inválida'; end if;

    total_base := i.quantity * pres.base_quantity;
    net_value := (i.quantity * i.unit_price) - i.discount;
    if total_base <= 0 then raise exception 'Conversão inválida'; end if;
    if net_value < 0 then raise exception 'Valor líquido inválido'; end if;
    unit_cost := net_value / total_base;

    insert into public.stock_lots(
      organization_id,ingredient_base_id,brand_id,stock_location_id,origin_type,origin_id,lot_code,expires_at,quantity_received,unit_cost_base
    ) values(
      p.organization_id,pres.ingredient_base_id,pres.brand_id,p_location_id,'purchase',p.id,i.lot_code,i.expires_at,total_base,unit_cost
    ) returning id into lot_id;

    insert into public.stock_movements(
      organization_id,stock_lot_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by
    ) values(
      p.organization_id,lot_id,p_location_id,'entrada_compra',total_base,unit_cost,'purchase',p.id,auth.uid()
    );
  end loop;

  update public.purchases set status='confirmada',updated_at=now() where id=p.id;
  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(p.organization_id,auth.uid(),'purchases',p.id,'confirmar',jsonb_build_object('status','confirmada','items',item_count));
end;
$$;

create or replace function public.adjust_stock_lot(
  p_stock_lot_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_lot public.stock_lots;
  v_balance numeric(18,6);
  v_movement_id uuid;
  v_type public.stock_movement_type;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_quantity=0 then raise exception 'Informe uma quantidade diferente de zero'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Justificativa obrigatória'; end if;

  select * into v_lot from public.stock_lots where id=p_stock_lot_id for update;
  if v_lot.id is null then raise exception 'Lote não encontrado'; end if;
  if not public.is_org_member(v_lot.organization_id) then raise exception 'Acesso negado'; end if;

  select coalesce(sum(quantity),0) into v_balance
  from public.stock_movements
  where organization_id=v_lot.organization_id and stock_lot_id=v_lot.id;

  if (v_balance + p_quantity) < 0 then raise exception 'Ajuste deixaria o estoque negativo'; end if;
  v_type := case when p_quantity > 0 then 'ajuste_entrada'::public.stock_movement_type else 'ajuste_saida'::public.stock_movement_type end;

  insert into public.stock_movements(
    organization_id,stock_lot_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by
  ) values(
    v_lot.organization_id,v_lot.id,v_lot.stock_location_id,v_type,p_quantity,v_lot.unit_cost_base,'manual_adjustment',v_lot.id,auth.uid()
  ) returning id into v_movement_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,reason,new_data)
  values(v_lot.organization_id,auth.uid(),'stock_lots',v_lot.id,'ajustar_estoque',trim(p_reason),jsonb_build_object('quantity',p_quantity,'movement_id',v_movement_id));

  return v_movement_id;
end;
$$;
