-- MoveAI SmartPDV
-- 012_encomendas.sql
-- Encomendas reaproveitando orders + order_items.

begin;

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists fulfillment_type text
    not null default 'retirada'
    check (fulfillment_type in ('retirada','entrega')),
  add column if not exists scheduled_for timestamptz,
  add column if not exists delivery_address text,
  add column if not exists notes text,
  add column if not exists deposit_amount numeric(18,6)
    not null default 0
    check (deposit_amount >= 0),
  add column if not exists fulfillment_status text
    not null default 'pendente'
    check (
      fulfillment_status in (
        'pendente',
        'confirmado',
        'em_producao',
        'pronto',
        'entregue',
        'cancelado'
      )
    ),
  add column if not exists updated_at timestamptz
    not null default now();

create index if not exists idx_orders_encomendas_agenda
  on public.orders(organization_id, scheduled_for)
  where channel = 'encomenda';

create index if not exists idx_orders_encomendas_status
  on public.orders(organization_id, fulfillment_status)
  where channel = 'encomenda';

create or replace function public.create_encomenda(
  p_organization_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type text,
  p_scheduled_for timestamptz,
  p_delivery_address text,
  p_notes text,
  p_deposit_amount numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_quantity numeric(18,6);
  v_line_total numeric(18,6);
  v_total numeric(18,6) := 0;
  v_deposit numeric(18,6) := coalesce(p_deposit_amount, 0);
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  if not public.can_cash(p_organization_id) then
    raise exception 'Usuário sem permissão para criar encomendas';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'Informe o nome do cliente';
  end if;

  if p_fulfillment_type not in ('retirada','entrega') then
    raise exception 'Tipo de entrega inválido';
  end if;

  if p_scheduled_for is null then
    raise exception 'Informe a data e hora da encomenda';
  end if;

  if p_fulfillment_type = 'entrega'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'Informe o endereço de entrega';
  end if;

  if v_deposit < 0 then
    raise exception 'O sinal não pode ser negativo';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um item';
  end if;

  insert into public.orders(
    organization_id,
    channel,
    status,
    total,
    customer_name,
    customer_phone,
    fulfillment_type,
    scheduled_for,
    delivery_address,
    notes,
    deposit_amount,
    fulfillment_status,
    created_by
  )
  values(
    p_organization_id,
    'encomenda',
    'aberto',
    0,
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    p_fulfillment_type,
    p_scheduled_for,
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    0,
    'pendente',
    auth.uid()
  )
  returning id into v_order_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce(
      nullif(v_item->>'quantity', '')::numeric,
      0
    );

    if v_quantity <= 0 then
      raise exception 'Quantidade inválida em um dos itens';
    end if;

    select
      p.id,
      p.name,
      p.sale_price
    into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.organization_id = p_organization_id
      and p.active = true
    limit 1;

    if v_product.id is null then
      raise exception 'Produto inválido ou inativo';
    end if;

    v_line_total :=
      round((v_quantity * v_product.sale_price)::numeric, 6);

    insert into public.order_items(
      organization_id,
      order_id,
      product_id,
      product_name_snapshot,
      quantity,
      unit_price_snapshot,
      unit_cost_snapshot,
      notes
    )
    values(
      p_organization_id,
      v_order_id,
      v_product.id,
      v_product.name,
      v_quantity,
      v_product.sale_price,
      0,
      nullif(trim(coalesce(v_item->>'notes', '')), '')
    );

    v_total := v_total + v_line_total;
  end loop;

  if v_total <= 0 then
    raise exception 'Total da encomenda inválido';
  end if;

  if v_deposit > v_total then
    raise exception 'O sinal não pode ser maior que o total';
  end if;

  update public.orders
  set
    total = v_total,
    deposit_amount = v_deposit,
    updated_at = now()
  where id = v_order_id;

  insert into public.audit_logs(
    organization_id,
    user_id,
    entity,
    record_id,
    action,
    new_data
  )
  values(
    p_organization_id,
    auth.uid(),
    'order',
    v_order_id,
    'create_encomenda',
    jsonb_build_object(
      'channel', 'encomenda',
      'customer_name', trim(p_customer_name),
      'total', v_total,
      'deposit_amount', v_deposit,
      'scheduled_for', p_scheduled_for
    )
  );

  return v_order_id;
end;
$$;

revoke all on function public.create_encomenda(
  uuid,text,text,text,timestamptz,text,text,numeric,jsonb
) from public;

revoke all on function public.create_encomenda(
  uuid,text,text,text,timestamptz,text,text,numeric,jsonb
) from anon;

grant execute on function public.create_encomenda(
  uuid,text,text,text,timestamptz,text,text,numeric,jsonb
) to authenticated;

commit;

select
  '012_encomendas aplicada com sucesso' as status,
  now() as applied_at;
