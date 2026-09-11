-- MoveAI SmartPDV
-- 011_role_permissions.sql
-- Controle de acesso por perfil no banco + endurecimento das RPCs SECURITY DEFINER.
-- Gerado a partir da auditoria das migrations 001-009.
--
-- Perfis:
--   administrador      -> acesso total
--   financeiro         -> bancos, financeiro e leitura de vendas/caixa para relatórios
--   producao           -> insumos, compras, estoque, receitas, produção e produtos
--   atendimento_caixa  -> PDV, vendas, pagamentos e caixa
--
-- IMPORTANTE:
-- O script roda em uma única transação. Se qualquer comando falhar,
-- as alterações desta migration são revertidas.

begin;

-- =========================================================
-- 1. FUNÇÕES CENTRAIS DE AUTORIZAÇÃO
-- =========================================================

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = any(p_roles)
  );
$$;

create or replace function public.can_production(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organization_id,
    array['administrador','producao']::public.app_role[]
  );
$$;

create or replace function public.can_cash(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organization_id,
    array['administrador','atendimento_caixa']::public.app_role[]
  );
$$;

create or replace function public.can_finance(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organization_id,
    array['administrador','financeiro']::public.app_role[]
  );
$$;

create or replace function public.can_sales_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organization_id,
    array['administrador','financeiro','atendimento_caixa']::public.app_role[]
  );
$$;

revoke all on function public.has_org_role(uuid, public.app_role[]) from public;
revoke all on function public.can_production(uuid) from public;
revoke all on function public.can_cash(uuid) from public;
revoke all on function public.can_finance(uuid) from public;
revoke all on function public.can_sales_read(uuid) from public;

grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.can_production(uuid) to authenticated;
grant execute on function public.can_cash(uuid) to authenticated;
grant execute on function public.can_finance(uuid) to authenticated;
grant execute on function public.can_sales_read(uuid) to authenticated;

-- =========================================================
-- 2. ORGANIZAÇÃO, PERFIL E MEMBERSHIP
-- =========================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "org members can read organizations" on public.organizations;
drop policy if exists org_read_organizations on public.organizations;
drop policy if exists org_update_organizations on public.organizations;

create policy org_read_organizations
on public.organizations
for select
using (public.is_org_member(id));

create policy org_update_organizations
on public.organizations
for update
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists profile_self_select on public.profiles;
drop policy if exists profile_self_insert on public.profiles;
drop policy if exists profile_self_update on public.profiles;

create policy profile_self_select
on public.profiles
for select
using (id = auth.uid());

create policy profile_self_insert
on public.profiles
for insert
with check (id = auth.uid());

create policy profile_self_update
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members can read memberships" on public.organization_members;
drop policy if exists membership_self_or_admin_select on public.organization_members;

create policy membership_self_or_admin_select
on public.organization_members
for select
using (
  user_id = auth.uid()
  or public.is_org_admin(organization_id)
);

-- =========================================================
-- 3. TABELAS COMPARTILHADAS
-- Leitura para qualquer membro; escrita apenas Produção/Admin.
-- =========================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'units',
    'brands',
    'stock_locations',
    'products',
    'product_stock_movements'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% não existe; ignorando.', t;
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=t
        and column_name='organization_id'
    ) then
      raise notice 'Tabela public.% não possui organization_id; ignorando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id))',
      'role_read_' || t, t
    );

    execute format(
      'create policy %I on public.%I for insert with check (public.can_production(organization_id))',
      'role_insert_' || t, t
    );

    execute format(
      'create policy %I on public.%I for update using (public.can_production(organization_id)) with check (public.can_production(organization_id))',
      'role_update_' || t, t
    );
  end loop;
end $$;

-- =========================================================
-- 4. PRODUÇÃO / COMPRAS / INSUMOS / RECEITAS
-- Leitura e escrita apenas Produção/Admin.
-- =========================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'ingredient_bases',
    'suppliers',
    'ingredient_presentations',
    'purchases',
    'purchase_items',
    'stock_lots',
    'stock_movements',
    'recipes',
    'recipe_versions',
    'recipe_items',
    'production_orders',
    'production_consumptions'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% não existe; ignorando.', t;
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=t
        and column_name='organization_id'
    ) then
      raise notice 'Tabela public.% não possui organization_id; ignorando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.can_production(organization_id))',
      'role_read_' || t, t
    );

    execute format(
      'create policy %I on public.%I for insert with check (public.can_production(organization_id))',
      'role_insert_' || t, t
    );

    execute format(
      'create policy %I on public.%I for update using (public.can_production(organization_id)) with check (public.can_production(organization_id))',
      'role_update_' || t, t
    );
  end loop;
end $$;

-- =========================================================
-- 5. VENDAS / PDV
-- Leitura: Admin, Financeiro e Atendimento/Caixa.
-- Escrita: Admin e Atendimento/Caixa.
-- =========================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'dining_tables',
    'orders',
    'order_items',
    'payments'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% não existe; ignorando.', t;
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=t
        and column_name='organization_id'
    ) then
      raise notice 'Tabela public.% não possui organization_id; ignorando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.can_sales_read(organization_id))',
      'role_read_' || t, t
    );

    execute format(
      'create policy %I on public.%I for insert with check (public.can_cash(organization_id))',
      'role_insert_' || t, t
    );

    execute format(
      'create policy %I on public.%I for update using (public.can_cash(organization_id)) with check (public.can_cash(organization_id))',
      'role_update_' || t, t
    );
  end loop;
end $$;

-- =========================================================
-- 6. CAIXA
-- Leitura: Admin, Financeiro e Atendimento/Caixa.
-- Escrita: Admin e Atendimento/Caixa.
-- =========================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'cash_sessions',
    'cash_movements'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% não existe; ignorando.', t;
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=t
        and column_name='organization_id'
    ) then
      raise notice 'Tabela public.% não possui organization_id; ignorando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.can_sales_read(organization_id))',
      'role_read_' || t, t
    );

    execute format(
      'create policy %I on public.%I for insert with check (public.can_cash(organization_id))',
      'role_insert_' || t, t
    );

    execute format(
      'create policy %I on public.%I for update using (public.can_cash(organization_id)) with check (public.can_cash(organization_id))',
      'role_update_' || t, t
    );
  end loop;
end $$;

-- =========================================================
-- 7. FINANCEIRO / BANCOS
-- Somente Admin e Financeiro.
-- =========================================================

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'financial_accounts',
    'financial_transactions',
    'financial_titles',
    'financial_settlements'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% não existe; ignorando.', t;
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name=t
        and column_name='organization_id'
    ) then
      raise notice 'Tabela public.% não possui organization_id; ignorando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select using (public.can_finance(organization_id))',
      'role_read_' || t, t
    );

    execute format(
      'create policy %I on public.%I for insert with check (public.can_finance(organization_id))',
      'role_insert_' || t, t
    );

    execute format(
      'create policy %I on public.%I for update using (public.can_finance(organization_id)) with check (public.can_finance(organization_id))',
      'role_update_' || t, t
    );
  end loop;
end $$;

-- =========================================================
-- 8. VÍNCULO MÉTODO DE PAGAMENTO -> CONTA
-- Caixa pode consultar; somente Financeiro/Admin altera.
-- =========================================================

do $$
declare
  p record;
begin
  if to_regclass('public.payment_method_accounts') is not null then
    alter table public.payment_method_accounts enable row level security;

    for p in
      select policyname
      from pg_policies
      where schemaname='public'
        and tablename='payment_method_accounts'
    loop
      execute format(
        'drop policy %I on public.payment_method_accounts',
        p.policyname
      );
    end loop;

    create policy role_read_payment_method_accounts
    on public.payment_method_accounts
    for select
    using (public.can_sales_read(organization_id));

    create policy role_insert_payment_method_accounts
    on public.payment_method_accounts
    for insert
    with check (public.can_finance(organization_id));

    create policy role_update_payment_method_accounts
    on public.payment_method_accounts
    for update
    using (public.can_finance(organization_id))
    with check (public.can_finance(organization_id));

    create policy role_delete_payment_method_accounts
    on public.payment_method_accounts
    for delete
    using (public.can_finance(organization_id));
  end if;
end $$;

-- =========================================================
-- 9. AUDITORIA
-- Consulta apenas Administrador.
-- Gravações normais continuam sendo feitas pelas RPCs/rotinas
-- privilegiadas do sistema.
-- =========================================================

do $$
declare
  p record;
begin
  if to_regclass('public.audit_logs') is not null then
    alter table public.audit_logs enable row level security;

    for p in
      select policyname
      from pg_policies
      where schemaname='public'
        and tablename='audit_logs'
    loop
      execute format(
        'drop policy %I on public.audit_logs',
        p.policyname
      );
    end loop;

    create policy role_read_audit_logs
    on public.audit_logs
    for select
    using (public.is_org_admin(organization_id));
  end if;
end $$;

-- =========================================================
-- 10. ENDURECIMENTO DAS RPCs SECURITY DEFINER
--
-- Não recriamos manualmente centenas de linhas das funções.
-- A migration lê a definição instalada no PostgreSQL e troca
-- somente a checagem is_org_member pela checagem do módulo.
-- =========================================================

-- Produção, compras, estoque, receitas e catálogo.
do $$
declare
  r record;
  definition text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_purchase_draft',
        'confirm_purchase',
        'adjust_stock_lot',
        'create_recipe_with_version',
        'create_recipe_version',
        'create_production_order',
        'complete_production_order',
        'create_product_catalog_item',
        'update_product_catalog_item',
        'adjust_product_stock'
      ])
  loop
    definition := pg_get_functiondef(r.oid);

    if position('public.is_org_member(' in definition) > 0 then
      definition := replace(
        definition,
        'public.is_org_member(',
        'public.can_production('
      );

      execute definition;
      raise notice 'RPC % protegida para Produção/Admin.', r.proname;
    else
      raise notice 'RPC % não contém is_org_member; nenhuma troca necessária.', r.proname;
    end if;
  end loop;
end $$;

-- PDV e operações de caixa.
do $$
declare
  r record;
  definition text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'finalize_pdv_sale',
        'open_cash_session',
        'register_cash_movement',
        'close_cash_session'
      ])
  loop
    definition := pg_get_functiondef(r.oid);

    if position('public.is_org_member(' in definition) > 0 then
      definition := replace(
        definition,
        'public.is_org_member(',
        'public.can_cash('
      );

      execute definition;
      raise notice 'RPC % protegida para Atendimento/Caixa e Admin.', r.proname;
    else
      raise notice 'RPC % não contém is_org_member; nenhuma troca necessária.', r.proname;
    end if;
  end loop;
end $$;

-- Resumo do caixa pode ser consultado também pelo Financeiro.
do $$
declare
  r record;
  definition text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cash_session_summary'
  loop
    definition := pg_get_functiondef(r.oid);

    if position('public.is_org_member(' in definition) > 0 then
      definition := replace(
        definition,
        'public.is_org_member(',
        'public.can_sales_read('
      );

      execute definition;
      raise notice 'RPC % protegida para leitura de Caixa/Financeiro/Admin.', r.proname;
    end if;
  end loop;
end $$;

-- Bancos e financeiro.
do $$
declare
  r record;
  definition text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_financial_account',
        'register_financial_movement',
        'transfer_between_financial_accounts',
        'set_payment_method_account',
        'create_financial_title',
        'settle_financial_title',
        'update_financial_title',
        'cancel_financial_title'
      ])
  loop
    definition := pg_get_functiondef(r.oid);

    if position('public.is_org_member(' in definition) > 0 then
      definition := replace(
        definition,
        'public.is_org_member(',
        'public.can_finance('
      );

      execute definition;
      raise notice 'RPC % protegida para Financeiro/Admin.', r.proname;
    else
      raise notice 'RPC % não contém is_org_member; nenhuma troca necessária.', r.proname;
    end if;
  end loop;
end $$;

-- =========================================================
-- 11. EXECUTE SOMENTE PARA USUÁRIOS AUTENTICADOS
-- Trigger functions internas não são incluídas nesta lista.
-- =========================================================

do $$
declare
  r record;
begin
  for r in
    select
      p.oid,
      p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_purchase_draft',
        'confirm_purchase',
        'adjust_stock_lot',
        'create_recipe_with_version',
        'create_recipe_version',
        'create_production_order',
        'complete_production_order',
        'create_product_catalog_item',
        'update_product_catalog_item',
        'adjust_product_stock',
        'finalize_pdv_sale',
        'open_cash_session',
        'register_cash_movement',
        'cash_session_summary',
        'close_cash_session',
        'create_financial_account',
        'register_financial_movement',
        'transfer_between_financial_accounts',
        'set_payment_method_account',
        'create_financial_title',
        'settle_financial_title',
        'update_financial_title',
        'cancel_financial_title'
      ])
  loop
    execute format(
      'revoke all on function %s from public',
      r.signature
    );

    execute format(
      'revoke all on function %s from anon',
      r.signature
    );

    execute format(
      'grant execute on function %s to authenticated',
      r.signature
    );
  end loop;
end $$;

commit;

-- =========================================================
-- VERIFICAÇÃO FINAL
-- =========================================================

select
  '011_role_permissions aplicada com sucesso' as status,
  now() as applied_at;
