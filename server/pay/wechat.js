// 微信支付 v3（H5 / MWEB）手写实现，零外部支付 SDK 依赖。
// 沙箱模式（默认）下不调用微信，直接返回本地模拟收银台地址，方便无密钥联调全链路。
const crypto = require('crypto');
const cfg = require('../config');

function isReal() {
  const w = cfg.wechat;
  return w.enabled && !w.sandbox &&
    w.mchId && w.appId && w.apiV3Key && w.serialNo && w.privateKey && w.platformPublicKey;
}

function sandboxUrl(outTradeNo) {
  return `${cfg.publicBaseUrl || ''}/api/pay/simulator/${outTradeNo}`;
}

// 构造请求签名头 Authorization
function authHeader(canonicalUrl, bodyStr) {
  const w = cfg.wechat;
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = `POST\n${canonicalUrl}\n${timestamp}\n${nonce}\n${bodyStr}\n`;
  const signature = crypto.createSign('RSA-SHA256').update(message).sign(w.privateKey, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${w.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${w.serialNo}"`;
}

// 下单：返回 h5_url（浏览器打开即拉起微信支付）
async function createH5({ outTradeNo, amount, description, notifyUrl, clientIp = '127.0.0.1' }) {
  if (cfg.wechat.sandbox || !isReal()) {
    return { sandbox: true, h5_url: sandboxUrl(outTradeNo) };
  }
  const body = {
    mchid: cfg.wechat.mchId,
    appid: cfg.wechat.appId,
    description: String(description || 'Workbench 记账').slice(0, 127),
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: { total: Math.round(amount * 100), currency: 'CNY' },
    scene_info: {
      payer_client_ip: clientIp,
      h5_info: { type: 'Wap', wap_url: cfg.publicBaseUrl, wap_name: 'Workbench 记账' },
    },
  };
  const bodyStr = JSON.stringify(body);
  const res = await fetch('https://api.mch.weixin.qq.com/v3/pay/transactions/h5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader('/v3/pay/transactions/h5', bodyStr) },
    body: bodyStr,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('微信 H5 下单失败: ' + (json.message || res.status));
  return { sandbox: false, h5_url: json.h5_url };
}

// 校验回调签名（使用微信支付平台证书公钥）
function verifyCallback(headers, rawBody) {
  if (!isReal()) return !!cfg.simulatorEnabled; // 沙箱：仅当模拟开关开启才跳过验签，否则按未验签拒绝（防未授权标记已支付）
  const ts = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];
  const sig = headers['wechatpay-signature'];
  if (!ts || !nonce || !sig) return false;
  const message = `${ts}\n${nonce}\n${rawBody}\n`;
  try {
    return crypto.createVerify('RSA-SHA256').update(message)
      .verify(cfg.wechat.platformPublicKey, Buffer.from(sig, 'base64'));
  } catch (e) { return false; }
}

// 解密回调中的 resource（AES-256-GCM + APIv3 key）
function decryptResource(resource) {
  const key = Buffer.from(cfg.wechat.apiV3Key, 'utf8');
  const iv = Buffer.from(resource.nonce, 'utf8');
  const buf = Buffer.from(resource.ciphertext, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

module.exports = { isReal, createH5, verifyCallback, decryptResource, sandboxUrl };
