-- MoveAI SmartPDV - V10 Financeiro
-- Migration incremental: contas a pagar/receber + baixas integradas ao livro financeiro.
-- Reaproveita public.financial_accounts e public.financial_transactions.

create table if not exists public.financial_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title_type text not null check (title_type in ('pagar','receber')),
  description text not null,
  category text not null default 'geral',
  counterparty_name text,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  document_number text,
  issue_date date not null default current_date,
  due_date date not null default current_date,
  original_amount numeric(18,6) not null check (original_amount > 0),
  status text not null default 'aberto' check (status in ('aberto','cancelado')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_titles_org_due
  on public.financial_titles(organization_id, due_date, created_at desc);

create index if not exists idx_financial_titles_org_type
  on public.financial_titles(organization_id, title_type, created_at desc);

create index if not exists idx_financial_titles_purchase
  on public.financial_titles(organization_id, purchase_id)
  where purchase_id is not null;

create table if not exists public.financial_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title_id uuid not null references public.financial_titles(id) on delete restrict,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  amount numeric(18,6) not null check (amount > 0),
  financial_transaction_id uuid not null unique references public.financial_transactions(id) on delete restrict,
  settled_at timestamptz not null default now(),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_settlements_title
  on public.financial_settlements(organization_id, title_id, settled_at desc);

alter table public.financial_titles enable row level security;
alter table public.financial_settlements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='financial_titles'
      and policyname='org_read_financial_titles'
  ) then
    create policy org_read_financial_titles
      on public.financial_titles
      for select using (public.is_org_member(organization_id));

    create policy org_insert_financial_titles
      on public.financial_titles
      for insert with check (public.is_org_member(organization_id));

    create policy org_update_financial_titles
      on public.financial_titles
      for update using (public.is_org_member(organization_id))
      with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='financial_settlements'
      and policyname='org_read_financial_settlements'
  ) then
    create policy org_read_financial_settlements
      on public.financial_settlements
      for select using (public.is_org_member(organization_id));

    create policy org_insert_financial_settlements
      on public.financial_settlements
      for insert with check (public.is_org_member(organization_id));
  end if;
end $$;

create or replace view public.financial_titles_summary
with (security_invoker=true)
as
select
  t.id,
  t.organization_id,
  t.title_type,
  t.description,
  t.category,
  t.counterparty_name,
  t.supplier_id,
  t.purchase_id,
  t.order_id,
  t.document_number,
  t.issue_date,
  t.due_date,
  t.original_amount,
  coalesce(sum(s.amount),0)::numeric(18,6) as settled_amount,
  greatest(t.original_amount-coalesce(sum(s.amount),0),0)::numeric(18,6) as open_amount,
  case
    when t.status='cancelado' then 'cancelado'
    when coalesce(sum(s.amount),0) >= t.original_amount then 'quitado'
    when coalesce(sum(s.amount),0) > 0 then 'parcial'
    when t.due_date < current_date then 'vencido'
    else 'aberto'
  end as display_status,
  t.status,
  t.notes,
  t.created_by,
  t.created_at,
  t.updated_at
from public.financial_titles t
left join public.financial_settlements s
  on s.title_id=t.id and s.organization_id=t.organization_id
group by t.id;

create or replace function public.create_financial_title(
  p_organization_id uuid,
  p_title_type text,
  p_description text,
  p_category text,
  p_counterparty_name text,
  p_document_number text,
  p_issue_date date,
  p_due_date date,
  p_original_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if not public.is_org_member(p_organization_id) then raise exception 'Acesso negado'; end if;
  if p_title_type not in ('pagar','receber') then raise exception 'Tipo de título inválido'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Descrição obrigatória'; end if;
  if p_original_amount is null or p_original_amount <= 0 then raise exception 'Valor inválido'; end if;

  insert into public.financial_titles(
    organization_id,title_type,description,category,counterparty_name,document_number,
    issue_date,due_date,original_amount,notes,created_by
  )
  values(
    p_organization_id,p_title_type,trim(p_description),
    coalesce(nullif(trim(p_category),''),'geral'),
    nullif(trim(p_counterparty_name),''),
    nullif(trim(p_document_number),''),
    coalesce(p_issue_date,current_date),
    coalesce(p_due_date,current_date),
    p_original_amount,
    nullif(trim(p_notes),''),
    auth.uid()
  )
  returning id into v_id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    p_organization_id,auth.uid(),'financial_titles',v_id,'criar_titulo',
    jsonb_build_object(
      'type',p_title_type,
      'amount',p_original_amount,
      'due_date',coalesce(p_due_date,current_date)
    )
  );

  return v_id;
end;
$$;

create or replace function public.settle_financial_title(
  p_title_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_title public.financial_titles;
  v_account public.financial_accounts;
  v_paid numeric(18,6);
  v_open numeric(18,6);
  v_direction text;
  v_transaction_id uuid;
  v_settlement_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Valor da baixa inválido'; end if;

  select * into v_title
  from public.financial_titles
  where id=p_title_id
  for update;

  if v_title.id is null then raise exception 'Título não encontrado'; end if;
  if not public.is_org_member(v_title.organization_id) then raise exception 'Acesso negado'; end if;
  if v_title.status='cancelado' then raise exception 'Título cancelado'; end if;

  select * into v_account
  from public.financial_accounts
  where id=p_account_id
    and organization_id=v_title.organization_id
    and active=true;

  if v_account.id is null then raise exception 'Conta financeira inválida'; end if;

  -- Nesta versão, baixas do Financeiro são bancárias/adquirentes.
  -- Caixa físico continua controlado pelo módulo Caixa para evitar divergência de sessão.
  if v_account.account_type='caixa' then
    raise exception 'Use uma conta bancária ou adquirente. Baixas em dinheiro devem passar pelo módulo Caixa.';
  end if;

  select coalesce(sum(amount),0)::numeric(18,6)
  into v_paid
  from public.financial_settlements
  where organization_id=v_title.organization_id
    and title_id=v_title.id;

  v_open := v_title.original_amount - v_paid;

  if v_open <= 0 then raise exception 'Título já quitado'; end if;
  if p_amount > v_open then raise exception 'Baixa maior que o saldo em aberto'; end if;

  v_direction := case when v_title.title_type='pagar' then 'saida' else 'entrada' end;

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by,description
  )
  values(
    v_title.organization_id,
    v_account.id,
    v_direction,
    coalesce(nullif(trim(v_title.category),''),case when v_title.title_type='pagar' then 'conta_pagar' else 'conta_receber' end),
    p_amount,
    'financial_title',
    v_title.id,
    now(),
    auth.uid(),
    case when v_title.title_type='pagar' then 'Pagamento - ' else 'Recebimento - ' end || v_title.description
  )
  returning id into v_transaction_id;

  insert into public.financial_settlements(
    organization_id,title_id,account_id,amount,financial_transaction_id,
    settled_at,notes,created_by
  )
  values(
    v_title.organization_id,v_title.id,v_account.id,p_amount,v_transaction_id,
    now(),nullif(trim(p_notes),''),auth.uid()
  )
  returning id into v_settlement_id;

  update public.financial_titles
  set updated_at=now()
  where id=v_title.id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    v_title.organization_id,auth.uid(),'financial_titles',v_title.id,'baixar_titulo',
    jsonb_build_object(
      'settlement_id',v_settlement_id,
      'transaction_id',v_transaction_id,
      'account_id',v_account.id,
      'amount',p_amount,
      'direction',v_direction
    )
  );

  return v_settlement_id;
end;
$$;


create or replace function public.update_financial_title(
  p_title_id uuid,
  p_description text,
  p_category text,
  p_counterparty_name text,
  p_document_number text,
  p_issue_date date,
  p_due_date date,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_title public.financial_titles;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

  select * into v_title
  from public.financial_titles
  where id=p_title_id
  for update;

  if v_title.id is null then raise exception 'Título não encontrado'; end if;
  if not public.is_org_member(v_title.organization_id) then raise exception 'Acesso negado'; end if;
  if v_title.status='cancelado' then raise exception 'Título cancelado'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Descrição obrigatória'; end if;

  update public.financial_titles
  set description=trim(p_description),
      category=coalesce(nullif(trim(p_category),''),'geral'),
      counterparty_name=nullif(trim(p_counterparty_name),''),
      document_number=nullif(trim(p_document_number),''),
      issue_date=coalesce(p_issue_date,issue_date),
      due_date=coalesce(p_due_date,due_date),
      notes=nullif(trim(p_notes),''),
      updated_at=now()
  where id=v_title.id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,new_data)
  values(
    v_title.organization_id,auth.uid(),'financial_titles',v_title.id,'editar_titulo',
    jsonb_build_object('due_date',coalesce(p_due_date,v_title.due_date))
  );
end;
$$;

create or replace function public.cancel_financial_title(
  p_title_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_title public.financial_titles;
  v_settled numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;

  select * into v_title
  from public.financial_titles
  where id=p_title_id
  for update;

  if v_title.id is null then raise exception 'Título não encontrado'; end if;
  if not public.is_org_member(v_title.organization_id) then raise exception 'Acesso negado'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Justificativa obrigatória'; end if;

  select coalesce(sum(amount),0)::numeric(18,6)
  into v_settled
  from public.financial_settlements
  where organization_id=v_title.organization_id and title_id=v_title.id;

  if v_settled > 0 then
    raise exception 'Título com baixa não pode ser cancelado. Faça um estorno financeiro antes.';
  end if;

  update public.financial_titles
  set status='cancelado',updated_at=now()
  where id=v_title.id;

  insert into public.audit_logs(organization_id,user_id,entity,record_id,action,reason,new_data)
  values(
    v_title.organization_id,auth.uid(),'financial_titles',v_title.id,'cancelar_titulo',
    trim(p_reason),jsonb_build_object('status','cancelado')
  );
end;
$$;

-- Integração com Compras:
-- toda NOVA confirmação de compra cria uma conta a pagar.
create or replace function public.create_payable_from_confirmed_purchase()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total numeric(18,6);
  v_description text;
begin
  if new.status='confirmada' and old.status is distinct from new.status then
    select coalesce(sum((pi.quantity*pi.unit_price)-pi.discount),0)::numeric(18,6)
    into v_total
    from public.purchase_items pi
    where pi.organization_id=new.organization_id
      and pi.purchase_id=new.id;

    if v_total > 0 and not exists (
      select 1
      from public.financial_titles ft
      where ft.organization_id=new.organization_id
        and ft.purchase_id=new.id
        and ft.title_type='pagar'
    ) then
      v_description := 'Compra ' || coalesce(nullif(trim(new.document_number),''), left(new.id::text,8));

      insert into public.financial_titles(
        organization_id,title_type,description,category,supplier_id,purchase_id,
        document_number,issue_date,due_date,original_amount,status,created_by
      )
      values(
        new.organization_id,'pagar',v_description,'compras',new.supplier_id,new.id,
        new.document_number,new.purchase_date,new.entry_date,v_total,'aberto',new.created_by
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_purchase_create_payable on public.purchases;
create trigger trg_purchase_create_payable
after update of status on public.purchases
for each row
execute function public.create_payable_from_confirmed_purchase();

grant select on public.financial_titles to authenticated;
grant select on public.financial_settlements to authenticated;
grant select on public.financial_titles_summary to authenticated;

revoke all on function public.create_financial_title(uuid,text,text,text,text,text,date,date,numeric,text) from public;
revoke all on function public.settle_financial_title(uuid,uuid,numeric,text) from public;
revoke all on function public.update_financial_title(uuid,text,text,text,text,date,date,text) from public;
revoke all on function public.cancel_financial_title(uuid,text) from public;

grant execute on function public.create_financial_title(uuid,text,text,text,text,text,date,date,numeric,text) to authenticated;
grant execute on function public.settle_financial_title(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.update_financial_title(uuid,text,text,text,text,date,date,text) to authenticated;
grant execute on function public.cancel_financial_title(uuid,text) to authenticated;
