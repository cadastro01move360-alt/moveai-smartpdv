-- MoveAI SmartPDV - V8 Caixa
-- Migration incremental: reaproveita cash_sessions, payments e financial_transactions.

alter table public.cash_sessions
  add column if not exists closing_amount numeric(18,6),
  add column if not exists expected_amount numeric(18,6),
  add column if not exists difference_amount numeric(18,6),
  add column if not exists closing_notes text;

create index if not exists idx_cash_sessions_org_operator_status
  on public.cash_sessions(organization_id, operator_id, status, opened_at desc);

create index if not exists idx_financial_transactions_cash_ref
  on public.financial_transactions(organization_id, reference_type, reference_id, occurred_at desc);

create or replace function public.open_cash_session(
  p_organization_id uuid,
  p_opening_amount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'Acesso negado';
  end if;

  if coalesce(p_opening_amount,0) < 0 then
    raise exception 'Valor de abertura inválido';
  end if;

  if exists(
    select 1
    from public.cash_sessions
    where organization_id=p_organization_id
      and operator_id=auth.uid()
      and status='aberta'
  ) then
    raise exception 'Já existe um caixa aberto para este operador';
  end if;

  insert into public.cash_sessions(
    organization_id, operator_id, opening_amount, status, opened_at
  )
  values(
    p_organization_id, auth.uid(), coalesce(p_opening_amount,0), 'aberta', now()
  )
  returning id into v_id;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,new_data
  )
  values(
    p_organization_id,auth.uid(),'cash_sessions',v_id,'abrir_caixa',
    jsonb_build_object('opening_amount',coalesce(p_opening_amount,0))
  );

  return v_id;
end;
$$;

create or replace function public.register_cash_movement(
  p_cash_session_id uuid,
  p_direction text,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.cash_sessions;
  v_account_id uuid;
  v_transaction_id uuid;
  v_category text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id=p_cash_session_id
  for update;

  if v_session.id is null then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  if not public.is_org_member(v_session.organization_id) then
    raise exception 'Acesso negado';
  end if;

  if v_session.status <> 'aberta' then
    raise exception 'O caixa já está fechado';
  end if;

  if v_session.operator_id <> auth.uid() and not public.is_org_admin(v_session.organization_id) then
    raise exception 'Somente o operador do caixa ou um administrador pode movimentá-lo';
  end if;

  if p_direction not in ('entrada','saida') then
    raise exception 'Direção inválida';
  end if;

  if coalesce(p_amount,0) <= 0 then
    raise exception 'Informe um valor maior que zero';
  end if;

  if length(trim(coalesce(p_reason,''))) < 2 then
    raise exception 'Informe o motivo da movimentação';
  end if;

  select id into v_account_id
  from public.financial_accounts
  where organization_id=v_session.organization_id
    and account_type='caixa'
    and active=true
  order by created_at
  limit 1;

  if v_account_id is null then
    insert into public.financial_accounts(
      organization_id,name,account_type,active
    )
    values(
      v_session.organization_id,'Caixa físico','caixa',true
    )
    returning id into v_account_id;
  end if;

  v_category := case when p_direction='entrada' then 'suprimento' else 'sangria' end;

  insert into public.financial_transactions(
    organization_id,account_id,direction,category,amount,
    reference_type,reference_id,occurred_at,created_by
  )
  values(
    v_session.organization_id,v_account_id,p_direction,v_category,p_amount,
    'cash_session',v_session.id,now(),auth.uid()
  )
  returning id into v_transaction_id;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,reason,new_data
  )
  values(
    v_session.organization_id,auth.uid(),'cash_sessions',v_session.id,
    v_category,trim(p_reason),
    jsonb_build_object(
      'transaction_id',v_transaction_id,
      'direction',p_direction,
      'amount',p_amount
    )
  );

  return v_transaction_id;
end;
$$;

create or replace function public.cash_session_summary(
  p_cash_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.cash_sessions;
  v_cash numeric(18,6) := 0;
  v_pix numeric(18,6) := 0;
  v_debit numeric(18,6) := 0;
  v_credit numeric(18,6) := 0;
  v_other numeric(18,6) := 0;
  v_total_sales numeric(18,6) := 0;
  v_supplies numeric(18,6) := 0;
  v_withdrawals numeric(18,6) := 0;
  v_expected numeric(18,6) := 0;
begin
  select * into v_session
  from public.cash_sessions
  where id=p_cash_session_id;

  if v_session.id is null then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  if not public.is_org_member(v_session.organization_id) then
    raise exception 'Acesso negado';
  end if;

  select
    coalesce(sum(p.amount) filter (
      where lower(trim(p.method))='cash'
         or lower(trim(p.method)) like '%dinheiro%'
    ),0),
    coalesce(sum(p.amount) filter (
      where lower(trim(p.method)) like '%pix%'
    ),0),
    coalesce(sum(p.amount) filter (
      where lower(trim(p.method)) like '%debito%'
         or lower(trim(p.method)) like '%débito%'
         or lower(trim(p.method)) like '%debit%'
    ),0),
    coalesce(sum(p.amount) filter (
      where lower(trim(p.method)) like '%credito%'
         or lower(trim(p.method)) like '%crédito%'
         or lower(trim(p.method)) like '%credit%'
    ),0),
    coalesce(sum(p.amount),0)
  into v_cash,v_pix,v_debit,v_credit,v_total_sales
  from public.payments p
  join public.orders o on o.id=p.order_id
  where p.organization_id=v_session.organization_id
    and o.organization_id=v_session.organization_id
    and o.created_by=v_session.operator_id
    and p.created_at >= v_session.opened_at
    and p.created_at <= coalesce(v_session.closed_at,now());

  v_other := greatest(v_total_sales-v_cash-v_pix-v_debit-v_credit,0);

  select
    coalesce(sum(amount) filter (where direction='entrada'),0),
    coalesce(sum(amount) filter (where direction='saida'),0)
  into v_supplies,v_withdrawals
  from public.financial_transactions
  where organization_id=v_session.organization_id
    and reference_type='cash_session'
    and reference_id=v_session.id;

  v_expected := coalesce(v_session.opening_amount,0)
                + v_cash
                + v_supplies
                - v_withdrawals;

  return jsonb_build_object(
    'session_id',v_session.id,
    'status',v_session.status,
    'operator_id',v_session.operator_id,
    'opened_at',v_session.opened_at,
    'closed_at',v_session.closed_at,
    'opening_amount',coalesce(v_session.opening_amount,0),
    'cash_sales',v_cash,
    'pix_sales',v_pix,
    'debit_sales',v_debit,
    'credit_sales',v_credit,
    'other_sales',v_other,
    'total_sales',v_total_sales,
    'supplies',v_supplies,
    'withdrawals',v_withdrawals,
    'expected_cash',v_expected,
    'counted_amount',v_session.closing_amount,
    'difference_amount',v_session.difference_amount,
    'closing_notes',v_session.closing_notes
  );
end;
$$;

create or replace function public.close_cash_session(
  p_cash_session_id uuid,
  p_counted_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session public.cash_sessions;
  v_summary jsonb;
  v_expected numeric(18,6);
  v_difference numeric(18,6);
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_session
  from public.cash_sessions
  where id=p_cash_session_id
  for update;

  if v_session.id is null then
    raise exception 'Sessão de caixa não encontrada';
  end if;

  if not public.is_org_member(v_session.organization_id) then
    raise exception 'Acesso negado';
  end if;

  if v_session.status <> 'aberta' then
    raise exception 'O caixa já está fechado';
  end if;

  if v_session.operator_id <> auth.uid() and not public.is_org_admin(v_session.organization_id) then
    raise exception 'Somente o operador do caixa ou um administrador pode fechá-lo';
  end if;

  if coalesce(p_counted_amount,0) < 0 then
    raise exception 'Valor contado inválido';
  end if;

  v_summary := public.cash_session_summary(v_session.id);
  v_expected := coalesce((v_summary->>'expected_cash')::numeric,0);
  v_difference := coalesce(p_counted_amount,0)-v_expected;

  update public.cash_sessions
  set
    status='fechada',
    closed_at=now(),
    closing_amount=coalesce(p_counted_amount,0),
    expected_amount=v_expected,
    difference_amount=v_difference,
    closing_notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=v_session.id;

  insert into public.audit_logs(
    organization_id,user_id,entity,record_id,action,new_data
  )
  values(
    v_session.organization_id,auth.uid(),'cash_sessions',v_session.id,'fechar_caixa',
    jsonb_build_object(
      'expected_amount',v_expected,
      'counted_amount',coalesce(p_counted_amount,0),
      'difference_amount',v_difference
    )
  );

  return public.cash_session_summary(v_session.id);
end;
$$;

revoke all on function public.open_cash_session(uuid,numeric) from public;
revoke all on function public.register_cash_movement(uuid,text,numeric,text) from public;
revoke all on function public.cash_session_summary(uuid) from public;
revoke all on function public.close_cash_session(uuid,numeric,text) from public;

grant execute on function public.open_cash_session(uuid,numeric) to authenticated;
grant execute on function public.register_cash_movement(uuid,text,numeric,text) to authenticated;
grant execute on function public.cash_session_summary(uuid) to authenticated;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

notify pgrst, 'reload schema';
