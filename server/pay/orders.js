// 订单编排：创建订单、处理回调、查询状态。微信/支付宝共用一张 pay_orders 表。
const crypto = require('crypto');
const db = require('../db');
const cfg = require('../config');
const wechat = require('./wechat');
const alipay = require('./alipay');

function genOutTradeNo(prefix) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix || 'WB'}${ymd}${rand}`; // 微信要求 6-32 位且含时间防重
}

async function createOrder({ channel, amount, description, category, note, userId }) {
  channel = channel === 'alipay' ? 'alipay' : 'wechat';
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!amt || amt <= 0) throw new Error('金额无效');

  const outTradeNo = genOutTradeNo(channel === 'alipay' ? 'AL' : 'WX');
  const notifyUrl = `${cfg.publicBaseUrl}/api/pay/notify/${channel}`;
  const returnUrl = `${cfg.publicBaseUrl}/`;

  const order = {
    user_id: userId || null,
    out_trade_no: outTradeNo,
    channel,
    amount: amt,
    currency: 'CNY',
    description: description || '',
    category: category || '',
    note: note || '',
    status: 'pending',
  };

  let payUrl, sandbox;
  if (channel === 'wechat') {
    const r = await wechat.createH5({ outTradeNo, amount: amt, description, notifyUrl });
    payUrl = r.h5_url; sandbox = r.sandbox;
  } else {
    const r = await alipay.createWap({ outTradeNo, amount: amt, subject: description, description, notifyUrl, returnUrl });
    payUrl = r.pay_url; sandbox = r.sandbox;
  }

  order.pay_url = payUrl;
  await db.upsertOrder(order);
  return { outTradeNo, payUrl, channel, sandbox, amount: amt };
}

// 标记订单已支付（回调或沙箱模拟触发）
async function markPaid(outTradeNo, transactionId, raw) {
  const patch = {
    status: 'paid',
    transaction_id: transactionId || null,
    paid_at: new Date().toISOString(),
    synced: false,
    raw: raw || null,
  };
  return db.updateOrder(outTradeNo, patch);
}

async function getStatus(outTradeNo) {
  const o = await db.getOrder(outTradeNo);
  if (!o) return { found: false };
  return { found: true, status: o.status, channel: o.channel, amount: o.amount, paid_at: o.paid_at };
}

/* ---------- 微信回调 ---------- */
async function handleWechatNotify(headers, rawBody) {
  if (!wechat.verifyCallback(headers, rawBody)) return { ok: false, code: 'FAIL', msg: '签名校验失败' };
  let data;
  try {
    const resource = JSON.parse(rawBody).resource;
    data = wechat.decryptResource(resource);
  } catch (e) {
    return { ok: false, code: 'FAIL', msg: '解密失败' };
  }
  const outTradeNo = data.out_trade_no;
  const state = data.trade_state;
  if (state === 'SUCCESS') {
    await markPaid(outTradeNo, data.transaction_id, data);
  } else if (state === 'CLOSED' || state === 'PAYERROR') {
    await db.updateOrder(outTradeNo, { status: 'failed' });
  }
  // 微信要求返回 200 + {code:'SUCCESS'} 才认为通知成功
  return { ok: true, code: 'SUCCESS', msg: '成功' };
}

/* ---------- 支付宝回调 ---------- */
async function handleAlipayNotify(body) {
  if (!alipay.verifyNotify(body)) return { ok: false, msg: '签名校验失败' };
  const outTradeNo = body.out_trade_no;
  const tradeStatus = body.trade_status;
  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    await markPaid(outTradeNo, body.trade_no, body);
  } else if (tradeStatus === 'TRADE_CLOSED') {
    await db.updateOrder(outTradeNo, { status: 'closed' });
  }
  // 支付宝要求返回纯文本 "success" 才认为通知成功
  return { ok: true, msg: 'success' };
}

module.exports = { createOrder, markPaid, getStatus, handleWechatNotify, handleAlipayNotify, genOutTradeNo };
