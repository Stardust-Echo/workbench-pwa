// 支付宝（手机网站支付 wap）手写实现，零外部支付 SDK 依赖。
// 沙箱模式（默认）下不调用支付宝，返回本地模拟收银台地址，方便无密钥联调全链路。
const crypto = require('crypto');
const cfg = require('../config');

const GATEWAY_PROD = 'https://openapi.alipay.com/gateway.do';
const GATEWAY_SANDBOX = 'https://openapi.alipaydev.com/gateway.do';

function isReal() {
  const a = cfg.alipay;
  return a.enabled && !a.sandbox && a.appId && a.privateKey && a.publicKey;
}

function sandboxUrl(outTradeNo) {
  return `${cfg.publicBaseUrl || ''}/api/pay/simulator/${outTradeNo}`;
}

function gateway() {
  return cfg.alipay.sandbox ? GATEWAY_SANDBOX : GATEWAY_PROD;
}

// RSA2 签名：参数按 key 升序拼成 k=v&k=v，再做 SHA256withRSA，base64。
function sign(params) {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort();
  const qs = keys.map(k => `${k}=${params[k]}`).join('&');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(qs, 'utf8');
  return signer.sign(cfg.alipay.privateKey, 'base64');
}

// 下单：返回支付跳转 URL（浏览器打开即拉起支付宝）
async function createWap({ outTradeNo, amount, subject, description, notifyUrl, returnUrl }) {
  if (cfg.alipay.sandbox || !isReal()) {
    return { sandbox: true, pay_url: sandboxUrl(outTradeNo) };
  }
  const bizContent = JSON.stringify({
    out_trade_no: outTradeNo,
    total_amount: Number(amount).toFixed(2),
    subject: String(subject || 'Workbench 记账').slice(0, 256),
    body: String(description || '').slice(0, 600),
    product_code: 'QUICK_WAP_WAY',
    quit_url: returnUrl || cfg.publicBaseUrl,
  });
  const params = {
    app_id: cfg.alipay.appId,
    method: 'alipay.trade.wap.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: ts(),
    version: '1.0',
    notify_url: notifyUrl,
    return_url: returnUrl || cfg.publicBaseUrl,
    biz_content: bizContent,
  };
  params.sign = sign(params);
  const url = gateway() + '?' + Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  return { sandbox: false, pay_url: url };
}

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 校验异步通知签名
function verifyNotify(body) {
  if (!isReal()) return !!cfg.simulatorEnabled;
  const params = { ...body };
  const signVal = params.sign;
  const signType = params.sign_type;
  delete params.sign;
  delete params.sign_type;
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort();
  const qs = keys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createVerify('RSA-SHA256').update(qs, 'utf8')
    .verify(cfg.alipay.publicKey, Buffer.from(signVal, 'base64'));
}

module.exports = { isReal, createWap, verifyNotify, gateway };
