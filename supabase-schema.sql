-- 清晨工作台 · Supabase 建表脚本
-- 在 Supabase 后台 → SQL Editor → New query 中粘贴执行

create table if not exists workbench_state (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create unique index if not exists workbench_state_user_idx on workbench_state(user_id);

alter table workbench_state enable row level security;

drop policy if exists "own row" on workbench_state;
create policy "own row" on workbench_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
