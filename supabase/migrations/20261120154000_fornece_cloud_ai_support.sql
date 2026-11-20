create table if not exists public.support_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','admin')),
  content text not null,
  tool_calls jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_ai_messages_user_created_idx
  on public.support_ai_messages(user_id, created_at);

alter table public.support_ai_messages enable row level security;

drop policy if exists "Users can read own AI support messages" on public.support_ai_messages;
create policy "Users can read own AI support messages"
  on public.support_ai_messages for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can archive own AI support messages" on public.support_ai_messages;
create policy "Users can archive own AI support messages"
  on public.support_ai_messages for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.support_ai_messages from anon;
grant select, update on public.support_ai_messages to authenticated;
grant all on public.support_ai_messages to service_role;

create table if not exists public.support_escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  summary text not null,
  ml_diagnostic jsonb,
  status text not null default 'aberto' check (status in ('aberto','em_atendimento','resolvido')),
  assigned_admin uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_escalations_user_status_idx
  on public.support_escalations(user_id, status, updated_at desc);

alter table public.support_escalations enable row level security;
revoke all on public.support_escalations from anon, authenticated;
grant all on public.support_escalations to service_role;
