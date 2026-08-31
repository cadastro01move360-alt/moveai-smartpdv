create extension if not exists pgcrypto;

create type public.app_role as enum ('administrador','financeiro','producao','atendimento_caixa');
create type public.purchase_status as enum ('rascunho','confirmada','cancelada');
create type public.stock_movement_type as enum ('entrada_compra','saida_producao','entrada_producao','transferencia_saida','transferencia_entrada','ajuste_entrada','ajuste_saida','estorno');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'atendimento_caixa',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  symbol text not null,
  dimension text not null check (dimension in ('massa','volume','unidade','comprimento','outro')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,symbol)
);

create table public.ingredient_bases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  category text,
  base_unit_id uuid not null references public.units(id),
  minimum_stock numeric(18,6) not null default 0,
  controls_expiry boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  document text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredient_presentations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  ingredient_base_id uuid not null references public.ingredient_bases(id),
  brand_id uuid references public.brands(id),
  preferred_supplier_id uuid references public.suppliers(id),
  purchase_unit_id uuid not null references public.units(id),
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null references public.suppliers(id),
  document_number text,
  purchase_date date not null default current_date,
  entry_date date not null default current_date,
  notes text,
  status public.purchase_status not null default 'rascunho',
  idempotency_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,idempotency_key)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  presentation_id uuid not null references public.ingredient_presentations(id),
  quantity numeric(18,6) not null check(quantity > 0),
  unit_price numeric(18,6) not null check(unit_price >= 0),
  discount numeric(18,6) not null default 0 check(discount >= 0),
  lot_code text,
  expires_at date,
  created_at timestamptz not null default now()
);

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,name)
);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  ingredient_base_id uuid references public.ingredient_bases(id),
  brand_id uuid references public.brands(id),
  stock_location_id uuid not null references public.stock_locations(id),
  origin_type text not null,
  origin_id uuid,
  lot_code text,
  expires_at date,
  quantity_received numeric(18,6) not null check(quantity_received >= 0),
  unit_cost_base numeric(18,6) not null check(unit_cost_base >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stock_lot_id uuid references public.stock_lots(id),
  stock_location_id uuid not null references public.stock_locations(id),
  movement_type public.stock_movement_type not null,
  quantity numeric(18,6) not null check(quantity <> 0),
  unit_cost numeric(18,6) not null default 0 check(unit_cost >= 0),
  reference_type text not null,
  reference_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements(organization_id,stock_lot_id,created_at);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  recipe_id uuid not null references public.recipes(id),
  version_number integer not null check(version_number > 0),
  status text not null check(status in ('rascunho','ativa','arquivada')),
  yield_quantity numeric(18,6) not null check(yield_quantity > 0),
  yield_unit_id uuid not null references public.units(id),
  instructions text,
  created_at timestamptz not null default now(),
  unique(recipe_id,version_number)
);
create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  recipe_version_id uuid not null references public.recipe_versions(id),
  item_type text not null check(item_type in ('insumo','sub_receita','intermediario','embalagem')),
  ingredient_base_id uuid references public.ingredient_bases(id),
  sub_recipe_version_id uuid references public.recipe_versions(id),
  quantity numeric(18,6) not null check(quantity > 0),
  unit_id uuid not null references public.units(id),
  loss_percent numeric(9,4) not null default 0 check(loss_percent >= 0 and loss_percent < 100),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  category text,
  internal_code text,
  recipe_version_id uuid references public.recipe_versions(id),
  sale_price numeric(18,6) not null default 0 check(sale_price >= 0),
  active boolean not null default true,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null,
  status text not null default 'livre' check(status in ('livre','ocupada','reservada')),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  channel text not null check(channel in ('mesa','balcao','retirada','encomenda')),
  dining_table_id uuid references public.dining_tables(id),
  status text not null default 'aberto' check(status in ('aberto','fechado','cancelado')),
  total numeric(18,6) not null default 0 check(total >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  quantity numeric(18,6) not null check(quantity > 0),
  unit_price_snapshot numeric(18,6) not null check(unit_price_snapshot >= 0),
  unit_cost_snapshot numeric(18,6) not null default 0 check(unit_cost_snapshot >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  order_id uuid not null references public.orders(id),
  method text not null,
  amount numeric(18,6) not null check(amount > 0),
  created_at timestamptz not null default now()
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  operator_id uuid not null references auth.users(id),
  opening_amount numeric(18,6) not null default 0,
  status text not null default 'aberta' check(status in ('aberta','fechada')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  account_type text not null check(account_type in ('caixa','banco','adquirente')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  account_id uuid not null references public.financial_accounts(id),
  direction text not null check(direction in ('entrada','saida')),
  category text not null,
  amount numeric(18,6) not null check(amount > 0),
  reference_type text,
  reference_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid references auth.users(id),
  entity text not null,
  record_id uuid,
  action text not null,
  reason text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.active=true)
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=auth.uid() and m.active=true and m.role='administrador')
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

create policy "org members can read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "users can read own profile" on public.profiles for select using (id=auth.uid());
create policy "members can read memberships" on public.organization_members for select using (public.is_org_member(organization_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units','ingredient_bases','brands','suppliers','ingredient_presentations','purchases','purchase_items','stock_locations','stock_lots','stock_movements','recipes','recipe_versions','recipe_items','products','dining_tables','orders','order_items','payments','cash_sessions','financial_accounts','financial_transactions','audit_logs']
  LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('create policy "org_read_%1$s" on public.%1$I for select using (public.is_org_member(organization_id))', t);
    EXECUTE format('create policy "org_insert_%1$s" on public.%1$I for insert with check (public.is_org_member(organization_id))', t);
    EXECUTE format('create policy "org_update_%1$s" on public.%1$I for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
  END LOOP;
END $$;

create or replace view public.stock_balances with (security_invoker=true) as
select organization_id, stock_lot_id, stock_location_id, sum(quantity) as available_quantity
from public.stock_movements
group by organization_id, stock_lot_id, stock_location_id;

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
begin
  select * into p from public.purchases where id=p_purchase_id for update;
  if p.id is null then raise exception 'Compra não encontrada'; end if;
  if not public.is_org_member(p.organization_id) then raise exception 'Acesso negado'; end if;
  if p.status='confirmada' then return; end if;
  if p.status<>'rascunho' then raise exception 'Compra não pode ser confirmada'; end if;

  for i in select * from public.purchase_items where purchase_id=p.id loop
    select * into pres from public.ingredient_presentations where id=i.presentation_id;
    total_base := i.quantity * pres.base_quantity;
    net_value := (i.quantity * i.unit_price) - i.discount;
    if total_base <= 0 then raise exception 'Conversão inválida'; end if;
    unit_cost := net_value / total_base;

    insert into public.stock_lots(organization_id,ingredient_base_id,brand_id,stock_location_id,origin_type,origin_id,lot_code,expires_at,quantity_received,unit_cost_base)
    values(p.organization_id,pres.ingredient_base_id,pres.brand_id,p_location_id,'purchase',p.id,i.lot_code,i.expires_at,total_base,unit_cost)
    returning id into lot_id;

    insert into public.stock_movements(organization_id,stock_lot_id,stock_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
    values(p.organization_id,lot_id,p_location_id,'entrada_compra',total_base,unit_cost,'purchase',p.id,auth.uid());
  end loop;

  update public.purchases set status='confirmada',updated_at=now() where id=p.id;
  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(p.organization_id,auth.uid(),'purchases',p.id,'confirmar',jsonb_build_object('status','confirmada'));
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.bootstrap_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  org_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if exists(select 1 from public.organization_members where user_id=auth.uid()) then
    raise exception 'Usuário já pertence a uma organização';
  end if;
  insert into public.organizations(name) values(trim(p_name)) returning id into org_id;
  insert into public.organization_members(organization_id,user_id,role) values(org_id,auth.uid(),'administrador');
  insert into public.units(organization_id,name,symbol,dimension) values
    (org_id,'grama','g','massa'),(org_id,'quilograma','kg','massa'),(org_id,'mililitro','ml','volume'),(org_id,'litro','l','volume'),(org_id,'unidade','un','unidade');
  insert into public.stock_locations(organization_id,name) values(org_id,'Estoque principal');
  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(org_id,auth.uid(),'organizations',org_id,'criar',jsonb_build_object('name',trim(p_name)));
  return org_id;
end;
$$;
