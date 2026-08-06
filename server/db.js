// Supabase 客户端（服务端）。仅在配置齐全时使用，否则 operate 走内存兜底，保证无密钥也能跑通沙箱流程。
const cfg = require('./config');

let sb = null;
try {
  if (cfg.supabase.url && cfg.supabase.serviceRoleKey) {
    const { createClient } = require('@supabase/supabase-js');
    sb = createClient(cfg.supabase.url, cfg.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
} catch (e) {
  console.warn('[db] Supabase 未初始化（缺配置或依赖未安装）：', e.message);
}

const mem = new Map(); // 内存兜底：out_trade_no -> order

async function upsertOrder(order) {
  if (sb) {
    const { error } = await sb.from('pay_orders').upsert(order, { onConflict: 'out_trade_no' });
    if (error) throw error;
  } else {
    mem.set(order.out_trade_no, order);
  }
  return order;
}

async function getOrder(outTradeNo) {
  if (sb) {
    const { data, error } = await sb.from('pay_orders').select('*').eq('out_trade_no', outTradeNo).maybeSingle();
    if (error) throw error;
    return data;
  }
  return mem.get(outTradeNo) || null;
}

async function updateOrder(outTradeNo, patch) {
  if (sb) {
    const { error } = await sb.from('pay_orders').update(patch).eq('out_trade_no', outTradeNo);
    if (error) throw error;
    const { data } = await sb.from('pay_orders').select('*').eq('out_trade_no', outTradeNo).maybeSingle();
    return data;
  }
  const cur = mem.get(outTradeNo) || {};
  const next = { ...cur, ...patch };
  mem.set(outTradeNo, next);
  return next;
}

module.exports = { sb, upsertOrder, getOrder, updateOrder, hasDb: !!sb };
