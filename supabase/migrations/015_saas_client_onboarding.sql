-- MoveAI SmartPDV
-- 015_saas_client_onboarding.sql
-- Dados comerciais dos clientes SaaS.

begin;

create table if not exists public.organization_business_profiles (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  tax_id text,
  phone text,
  commercial_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_business_tax_id
  on public.organization_business_profiles(tax_id);

alter table public.organization_business_profiles
  enable row level security;

drop policy if exists org_business_profile_read
  on public.organization_business_profiles;

create policy org_business_profile_read
on public.organization_business_profiles
for select
to authenticated
using (
  public.is_org_admin(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_business_profile_admin_insert
  on public.organization_business_profiles;

create policy org_business_profile_admin_insert
on public.organization_business_profiles
for insert
to authenticated
with check (
  public.is_org_admin(organization_id)
  or public.is_platform_admin()
);

drop policy if exists org_business_profile_admin_update
  on public.organization_business_profiles;

create policy org_business_profile_admin_update
on public.organization_business_profiles
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

drop policy if exists org_business_profile_platform_delete
  on public.organization_business_profiles;

create policy org_business_profile_platform_delete
on public.organization_business_profiles
for delete
to authenticated
using (public.is_platform_admin());

insert into public.organization_business_profiles(
  organization_id
)
select o.id
from public.organizations o
on conflict (organization_id) do nothing;

commit;

select
  '015_saas_client_onboarding aplicada com sucesso' as status,
  now() as applied_at;
