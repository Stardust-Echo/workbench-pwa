-- 清晨工作台 / 仔仔管家 · Supabase 建表脚本（合并单文件）
-- 在 Supabase SQL Editor → New query 中粘贴执行；可复用现有 workbench 项目。

-- 1) 前端云同步状态表
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

-- 2) 支付订单表（微信 / 支付宝）
create table if not exists pay_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         text,
  out_trade_no    text unique not null,
  channel         text not null check (channel in ('wechat','alipay')),
  amount          numeric(12,2) not null,
  currency        text default 'CNY',
  description     text,
  category        text,
  note            text,
  status          text not null default 'pending'
                  check (status in ('pending','paid','closed','failed')),
  transaction_id  text,
  pay_url         text,
  raw             jsonb,
  created_at      timestamptz default now(),
  paid_at         timestamptz,
  synced          boolean default false
);

create index if not exists idx_pay_orders_user   on pay_orders(user_id);
create index if not exists idx_pay_orders_out    on pay_orders(out_trade_no);
create index if not exists idx_pay_orders_status on pay_orders(status);

-- 行级安全：服务端使用 service_role key 写入，前端仅通过后端接口访问，
-- 因此这里不开放匿名直连；如需前端直读订单状态，可另开 policy。
alter table pay_orders enable row level security;
