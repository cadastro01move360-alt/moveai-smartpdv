-- MoveAI SmartPDV
-- 014_saas_white_label.sql
-- Camada SaaS, assinatura mensal e personalização white-label.

begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  )
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_platform_admin() from anon;
grant execute on function public.is_platform_admin() to authenticated;

insert into public.platform_admins(user_id)
select m.user_id
from public.organization_members m
where m.active = true
  and m.role = 'administrador'
order by m.created_at asc
limit 1
on conflict (user_id) do nothing;

create table if not exists public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price numeric(12,2) not null default 0 check (monthly_price >= 0),
  currency text not null default 'BRL',
  billing_interval text not null default 'month'
    check (billing_interval in ('month','year')),
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saas_plans enable row level security;

drop policy if exists saas_plans_authenticated_read
  on public.saas_plans;

create policy saas_plans_authenticated_read
on public.saas_plans
for select
to authenticated
using (
  active = true
  or public.is_platform_admin()
);

drop policy if exists saas_plans_platform_insert
  on public.saas_plans;

create policy saas_plans_platform_insert
on public.saas_plans
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists saas_plans_platform_update
  on public.saas_plans;

create policy saas_plans_platform_update
on public.saas_plans
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists saas_plans_platform_delete
  on public.saas_plans;

create policy saas_plans_platform_delete
on public.saas_plans
for delete
to authenticated
using (public.is_platform_admin());

insert into public.saas_plans(
  code,
  name,
  description,
  monthly_price,
  currency,
  billing_interval,
  features,
  active
)
values(
  'smartpdv-mensal',
  'MoveAI SmartPDV',
  'Plano mensal completo para operação, PDV, estoque, produção, financeiro, usuários e personalização visual.',
  249.90,
  'BRL',
  'month',
  jsonb_build_object(
    'white_label', true,
    'branding', true,
    'users', true,
    'role_permissions', true,
    'pdv', true,
    'stock', true,
    'production', true,
    'financial', true,
    'orders', true
  ),
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  currency = excluded.currency,
  billing_interval = excluded.billing_interval,
  features = excluded.features,
  active = true,
  updated_at = now();

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique
    references public.organizations(id) on delete cascade,
  plan_id uuid not null
    references public.saas_plans(id),
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'trialing',
        'active',
        'past_due',
        'suspended',
        'canceled'
      )
    ),
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  billing_provider text,
  external_customer_id text,
  external_subscription_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_subscriptions_status
  on public.organization_subscriptions(status);

create index if not exists idx_org_subscriptions_plan
  on public.organization_subscriptions(plan_id);

alter table public.organization_subscriptions
  enable row level security;

drop policy if exists org_subscription_read
  on public.organization_subscriptions;

create policy org_subscription_read
on public.organization_subscriptions
for select
to authenticated
using (
  public.is_org_member(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_subscription_platform_insert
  on public.organization_subscriptions;

create policy org_subscription_platform_insert
on public.organization_subscriptions
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists org_subscription_platform_update
  on public.organization_subscriptions;

create policy org_subscription_platform_update
on public.organization_subscriptions
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists org_subscription_platform_delete
  on public.organization_subscriptions;

create policy org_subscription_platform_delete
on public.organization_subscriptions
for delete
to authenticated
using (public.is_platform_admin());

create table if not exists public.organization_branding (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  display_name text,
  logo_url text,
  banner_url text,
  primary_color text not null default '#C90D23',
  secondary_color text not null default '#17181D',
  accent_color text not null default '#E21B36',
  sidebar_color text not null default '#15161A',
  show_powered_by boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  check (sidebar_color ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.organization_branding
  enable row level security;

drop policy if exists org_branding_read
  on public.organization_branding;

create policy org_branding_read
on public.organization_branding
for select
to authenticated
using (
  public.is_org_member(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_branding_admin_insert
  on public.organization_branding;

create policy org_branding_admin_insert
on public.organization_branding
for insert
to authenticated
with check (
  public.is_org_admin(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_branding_admin_update
  on public.organization_branding;

create policy org_branding_admin_update
on public.organization_branding
for update
to authenticated
using (
  public.is_org_admin(organization_id)
  or public.is_platform_admin()
)
with check (
  public.is_org_admin(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_branding_platform_delete
  on public.organization_branding;

create policy org_branding_platform_delete
on public.organization_branding
for delete
to authenticated
using (public.is_platform_admin());

insert into public.organization_branding(
  organization_id,
  display_name
)
select
  o.id,
  o.name
from public.organizations o
on conflict (organization_id) do nothing;

insert into public.organization_subscriptions(
  organization_id,
  plan_id,
  status,
  started_at,
  current_period_start,
  current_period_end
)
select
  o.id,
  p.id,
  'active',
  now(),
  now(),
  now() + interval '1 month'
from public.organizations o
join public.saas_plans p
  on p.code = 'smartpdv-mensal'
on conflict (organization_id) do nothing;

create or replace function public.initialize_saas_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  select id
  into v_plan_id
  from public.saas_plans
  where code = 'smartpdv-mensal'
  limit 1;

  insert into public.organization_branding(
    organization_id,
    display_name
  )
  values(
    new.id,
    new.name
  )
  on conflict (organization_id) do nothing;

  if v_plan_id is not null then
    insert into public.organization_subscriptions(
      organization_id,
      plan_id,
      status
    )
    values(
      new.id,
      v_plan_id,
      'pending'
    )
    on conflict (organization_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_initialize_saas_organization
  on public.organizations;

create trigger trg_initialize_saas_organization
after insert on public.organizations
for each row
execute function public.initialize_saas_organization();

drop policy if exists platform_admin_read_organizations
  on public.organizations;

create policy platform_admin_read_organizations
on public.organizations
for select
to authenticated
using (public.is_platform_admin());

insert into storage.buckets(
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values(
  'branding',
  'branding',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_public_read
  on storage.objects;

create policy branding_public_read
on storage.objects
for select
to public
using (bucket_id = 'branding');

drop policy if exists branding_org_admin_insert
  on storage.objects;

create policy branding_org_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'branding'
  and (
    public.is_platform_admin()
    or exists(
      select 1
      from public.organization_members m
      where m.user_id = auth.uid()
        and m.active = true
        and m.role = 'administrador'
        and m.organization_id::text =
          coalesce((storage.foldername(name))[1], '')
    )
  )
);

drop policy if exists branding_org_admin_update
  on storage.objects;

create policy branding_org_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'branding'
  and (
    public.is_platform_admin()
    or exists(
      select 1
      from public.organization_members m
      where m.user_id = auth.uid()
        and m.active = true
        and m.role = 'administrador'
        and m.organization_id::text =
          coalesce((storage.foldername(name))[1], '')
    )
  )
)
with check (
  bucket_id = 'branding'
  and (
    public.is_platform_admin()
    or exists(
      select 1
      from public.organization_members m
      where m.user_id = auth.uid()
        and m.active = true
        and m.role = 'administrador'
        and m.organization_id::text =
          coalesce((storage.foldername(name))[1], '')
    )
  )
);

drop policy if exists branding_org_admin_delete
  on storage.objects;

create policy branding_org_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'branding'
  and (
    public.is_platform_admin()
    or exists(
      select 1
      from public.organization_members m
      where m.user_id = auth.uid()
        and m.active = true
        and m.role = 'administrador'
        and m.organization_id::text =
          coalesce((storage.foldername(name))[1], '')
    )
  )
);

commit;

select
  '014_saas_white_label aplicada com sucesso' as status,
  now() as applied_at;
