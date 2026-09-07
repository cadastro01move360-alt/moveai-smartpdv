-- MoveAI SmartPDV - V9 Bancos
-- Contas financeiras, saldos, transferencias e integracao automatica dos pagamentos do PDV.

alter table public.financial_accounts
  add column if not exists institution_name text,
  add column if not exists branch text,
  add column if not exists account_number text,
  add column if not exists pix_key text,
  add column if not exists opening_balance numeric(18,6) not null default 0,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.financial_transactions
  add column if not exists description text,
  add column if not exists transfer_group_id uuid;

create index if not exists idx_financial_transactions_org_account_date
  on public.financial_transactions(organization_id, account_id, occurred_at desc);

create index if not exists idx_financial_transactions_transfer_group
  on public.financial_transactions(organization_id, transfer_group_id)
  where transfer_group_id is not null;

create unique index if not exists uq_financial_transaction_payment_posting
  on public.financial_transactions(organization_id, account_id, reference_type, reference_id, category)
  where reference_type='payment';

create table if not exists public.payment_method_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  method text not null check(method in ('pix','debito','credito')),
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, method)
);

alter table public.payment_method_accounts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='payment_method_accounts'
      and policyname='org_read_payment_method_accounts'
  ) then
    create policy org_read_payment_method_accounts
      on public.payment_method_accounts
      for select
      using (public.is_org_member(organization_id));

    create policy org_insert_payment_method_accounts
      on public.payment_method_accounts
      for insert
      with check (public.is_org_member(organization_id));

    create policy org_update_payment_method_accounts
      on public.payment_method_accounts
      for update
      using (public.is_org_member(organization_id))
      with check (public.is_org_member(organization_id));

    create policy org_delete_payment_method_accounts
      on public.payment_method_accounts
      for delete
      using (public.is_org_member(organization_id));
  end if;
end $$;

create or replace view public.financial_account_balances
with (security_invoker=true)
as
select
  fa.id as account_id,
  fa.organization_id,
  fa.name,
  fa.account_type,
  fa.institution_name,
  fa.branch,
  fa.account_number,
  fa.pix_key,
  fa.opening_balance,
  fa.active,
  fa.notes,
  fa.created_at,
  fa.updated_at,
  (
    fa.opening_balance
    + coalesce((
        select sum(
          case
            when ft.direction='entrada' then ft.amount
            else -ft.amount
          end
        )
        from public.financial_transactions ft
        where ft.organization_id=fa.organization_id
          and ft.account_id=fa.id
      ),0)
  )::numeric(18,6) as current_balance
from public.financial_accounts fa;

grant select on public.financial_account_balances to authenticated;
grant select on public.payment_method_accounts to authenticated;

create or replace function public.create_financial_account(
  p_organization_id uuid,
  p_name text,
  p_account_type text,
  p_institution_name text default null,
  p_branch text default null,
  p_account_number text default null,
  p_pix_key text default null,
  p_opening_balance numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Acesso negado';
  end if;

  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'Informe o nome da conta';
  end if;

  v_type := lower(trim(coalesce(p_account_type,'')));

  if v_type not in ('banco','adquirente') then
    raise exception 'Tipo de conta inválido';
  end if;

  insert into public.financial_accounts(
    organization_id,name,account_type,institution_name,branch,account_number,
    pix_key,opening_balance,notes,active,created_at,updated_at
  )
  values(
    p_organization_id,trim(p_name),v_type,nullif(trim(coalesce(p_institution_name,'')),''),
    nullif(trim(coalesce(p_branch,'')),''),
    nullif(trim(coalesce(p_account_number,'')),''),
    nullif(trim(coalesce(p_pix_key,'')),''),
    coalesce(p_opening_balance,0),
    nullif(trim(coalesce(p_notes,'')),''),
    true,now(),now()
  )
  returning id into v_id;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,new_data
  )
  values(
    p_organization_id,auth.uid(),'financial_accounts',v_id,'criar_conta_financeira',
    jsonb_build_object(
      'name',trim(p_name),
      'account_type',v_type,
      'opening_balance',coalesce(p_opening_balance,0)
    )
  );

  return v_id;
end;
$$;

create or replace function public.register_financial_movement(
  p_account_id uuid,
  p_direction text,
  p_amount numeric,
  p_category text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_account public.financial_accounts;
  v_id uuid;
  v_direction text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_account
  from public.financial_accounts
  where id=p_account_id;

  if v_account.id is null then
    raise exception 'Conta financeira não encontrada';
  end if;

  if not public.is_org_member(v_account.organization_id) then
    raise exception 'Acesso negado';
  end if;

  if not v_account.active then
    raise exception 'Conta financeira inativa';
  end if;

  v_direction := lower(trim(coalesce(p_direction,'')));

  if v_direction not in ('entrada','saida') then
    raise exception 'Direção inválida';
  end if;

  if coalesce(p_amount,0) <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;

  if length(trim(coalesce(p_category,''))) < 2 then
    raise exception 'Informe a categoria';
  end if;

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by,description
  )
  values(
    v_account.organization_id,v_account.id,v_direction,trim(p_category),p_amount,
    'manual',null,now(),auth.uid(),nullif(trim(coalesce(p_description,'')),'')
  )
  returning id into v_id;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,reason,new_data
  )
  values(
    v_account.organization_id,auth.uid(),'financial_transactions',v_id,
    'movimento_financeiro_manual',nullif(trim(coalesce(p_description,'')),''),
    jsonb_build_object(
      'account_id',v_account.id,
      'direction',v_direction,
      'amount',p_amount,
      'category',trim(p_category)
    )
  );

  return v_id;
end;
$$;

create or replace function public.transfer_between_financial_accounts(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_source public.financial_accounts;
  v_destination public.financial_accounts;
  v_group uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_source_account_id=p_destination_account_id then
    raise exception 'Origem e destino devem ser diferentes';
  end if;

  if coalesce(p_amount,0) <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;

  select * into v_source
  from public.financial_accounts
  where id=p_source_account_id;

  select * into v_destination
  from public.financial_accounts
  where id=p_destination_account_id;

  if v_source.id is null or v_destination.id is null then
    raise exception 'Conta financeira não encontrada';
  end if;

  if v_source.organization_id<>v_destination.organization_id then
    raise exception 'As contas devem pertencer à mesma organização';
  end if;

  if not public.is_org_member(v_source.organization_id) then
    raise exception 'Acesso negado';
  end if;

  if not v_source.active or not v_destination.active then
    raise exception 'As duas contas precisam estar ativas';
  end if;

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by,description,transfer_group_id
  )
  values(
    v_source.organization_id,v_source.id,'saida','transferencia',p_amount,
    'financial_transfer',v_group,now(),auth.uid(),
    coalesce(nullif(trim(coalesce(p_description,'')),''),'Transferência entre contas'),
    v_group
  );

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by,description,transfer_group_id
  )
  values(
    v_source.organization_id,v_destination.id,'entrada','transferencia',p_amount,
    'financial_transfer',v_group,now(),auth.uid(),
    coalesce(nullif(trim(coalesce(p_description,'')),''),'Transferência entre contas'),
    v_group
  );

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,new_data
  )
  values(
    v_source.organization_id,auth.uid(),'financial_accounts',v_group,
    'transferir_entre_contas',
    jsonb_build_object(
      'source_account_id',v_source.id,
      'destination_account_id',v_destination.id,
      'amount',p_amount
    )
  );

  return v_group;
end;
$$;

create or replace function public.post_payment_to_financial_account()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_method text;
  v_account_id uuid;
  v_created_by uuid;
begin
  v_method := lower(trim(coalesce(new.method,'')));

  if v_method not in ('pix','debito','credito') then
    return new;
  end if;

  select pma.account_id into v_account_id
  from public.payment_method_accounts pma
  join public.financial_accounts fa
    on fa.id=pma.account_id
   and fa.organization_id=pma.organization_id
  where pma.organization_id=new.organization_id
    and pma.method=v_method
    and fa.active=true
  limit 1;

  if v_account_id is null then
    return new;
  end if;

  select o.created_by into v_created_by
  from public.orders o
  where o.id=new.order_id
    and o.organization_id=new.organization_id;

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by,description
  )
  values(
    new.organization_id,v_account_id,'entrada','venda_pdv',new.amount,
    'payment',new.id,new.created_at,v_created_by,
    'Recebimento PDV - '||upper(v_method)
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_post_payment_to_financial_account on public.payments;

create trigger trg_post_payment_to_financial_account
after insert on public.payments
for each row
execute function public.post_payment_to_financial_account();

create or replace function public.set_payment_method_account(
  p_organization_id uuid,
  p_method text,
  p_account_id uuid,
  p_backfill boolean default true
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_method text;
  v_account public.financial_accounts;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Acesso negado';
  end if;

  v_method := lower(trim(coalesce(p_method,'')));

  if v_method not in ('pix','debito','credito') then
    raise exception 'Forma de pagamento inválida';
  end if;

  select * into v_account
  from public.financial_accounts
  where id=p_account_id
    and organization_id=p_organization_id;

  if v_account.id is null then
    raise exception 'Conta financeira não encontrada';
  end if;

  if not v_account.active then
    raise exception 'Conta financeira inativa';
  end if;

  insert into public.payment_method_accounts(
    organization_id,method,account_id,created_by,created_at,updated_at
  )
  values(
    p_organization_id,v_method,p_account_id,auth.uid(),now(),now()
  )
  on conflict(organization_id,method)
  do update set
    account_id=excluded.account_id,
    updated_at=now();

  if p_backfill then
    insert into public.financial_transactions(
      organization_id,account_id,direction,category,amount,
      reference_type,reference_id,occurred_at,created_by,description
    )
    select
      p.organization_id,p_account_id,'entrada','venda_pdv',p.amount,
      'payment',p.id,p.created_at,o.created_by,
      'Recebimento PDV - '||upper(v_method)
    from public.payments p
    join public.orders o
      on o.id=p.order_id
     and o.organization_id=p.organization_id
    where p.organization_id=p_organization_id
      and lower(trim(p.method))=v_method
      and not exists(
        select 1
        from public.financial_transactions ft
        where ft.organization_id=p.organization_id
          and ft.account_id=p_account_id
          and ft.reference_type='payment'
          and ft.reference_id=p.id
          and ft.category='venda_pdv'
      );
  end if;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,new_data
  )
  values(
    p_organization_id,auth.uid(),'payment_method_accounts',p_account_id,
    'vincular_forma_pagamento',
    jsonb_build_object(
      'method',v_method,
      'account_id',p_account_id,
      'backfill',coalesce(p_backfill,true)
    )
  );
end;
$$;

revoke all on function public.create_financial_account(uuid,text,text,text,text,text,text,numeric,text) from public;
revoke all on function public.register_financial_movement(uuid,text,numeric,text,text) from public;
revoke all on function public.transfer_between_financial_accounts(uuid,uuid,numeric,text) from public;
revoke all on function public.set_payment_method_account(uuid,text,uuid,boolean) from public;

grant execute on function public.create_financial_account(uuid,text,text,text,text,text,text,numeric,text) to authenticated;
grant execute on function public.register_financial_movement(uuid,text,numeric,text,text) to authenticated;
grant execute on function public.transfer_between_financial_accounts(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.set_payment_method_account(uuid,text,uuid,boolean) to authenticated;

notify pgrst, 'reload schema';
