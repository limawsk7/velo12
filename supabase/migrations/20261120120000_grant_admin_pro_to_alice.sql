-- Concede acesso administrativo e plano Pro à conta proprietária do Velo.
-- A migration pode ser aplicada antes do cadastro: nesse caso, não altera nada.
do $$
declare
  target_user_id uuid;
  target_subscription_id uuid;
  now_ts timestamptz := now();
begin
  select id
    into target_user_id
  from auth.users
  where lower(email) = lower('alicegplima10@gmail.com')
  limit 1;

  if target_user_id is null then
    raise notice 'Conta alicegplima10@gmail.com ainda nao existe. Execute esta migration novamente apos o primeiro cadastro.';
    return;
  end if;

  update public.profiles
  set
    role = 'admin',
    plano = 'pro',
    updated_at = now_ts
  where user_id = target_user_id;

  insert into public.user_roles (user_id, role)
  select target_user_id, 'admin'::public.app_role
  where not exists (
    select 1
    from public.user_roles
    where user_id = target_user_id
      and role = 'admin'
  );

  select id
    into target_subscription_id
  from public.subscriptions
  where user_id = target_user_id
  order by created_at desc
  limit 1;

  if target_subscription_id is null then
    insert into public.subscriptions (
      user_id, plan, status, payment_method, amount,
      current_period_start, current_period_end, is_trial,
      trial_ends_at, next_charge_amount, next_charge_at,
      post_trial_plan, created_at, updated_at
    )
    values (
      target_user_id, 'pro', 'active', 'manual_admin_annual', 0,
      now_ts, now_ts + interval '100 years', false,
      null, 0, null, null, now_ts, now_ts
    );
  else
    update public.subscriptions
    set
      plan = 'pro',
      status = 'active',
      payment_method = 'manual_admin_annual',
      amount = 0,
      current_period_start = coalesce(current_period_start, now_ts),
      current_period_end = greatest(coalesce(current_period_end, now_ts), now_ts + interval '100 years'),
      is_trial = false,
      trial_ends_at = null,
      next_charge_amount = 0,
      next_charge_at = null,
      post_trial_plan = null,
      updated_at = now_ts
    where id = target_subscription_id;
  end if;
end $$;
