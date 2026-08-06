-- workbench-pay 订单表
-- 在 Supabase SQL Editor 中执行；可复用现有 workbench 项目，无需新建项目。

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

create index if not exists idx_pay_orders_user      on pay_orders(user_id);
create index if not exists idx_pay_orders_out       on pay_orders(out_trade_no);
create index if not exists idx_pay_orders_status    on pay_orders(status);

-- 行级安全：服务端使用 service_role key 写入，前端仅通过后端接口访问，
-- 因此这里不开放匿名直连；如需前端直读订单状态，可另开 policy。
alter table pay_orders enable row level security;
