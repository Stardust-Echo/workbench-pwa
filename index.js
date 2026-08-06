// workbench-pwa 服务端入口（真实支付后端）
const path = require('path');
const express = require('express');
const cors = require('cors');
const cfg = require('./config');
const db = require('./db');
const orders = require('./pay/orders');
const wechat = require('./pay/wechat');

const app = express();
app.use(express.json());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || cfg.allowedOrigins.length === 0) return cb(null, true);
    cb(null, cfg.allowedOrigins.includes(origin));
  },
}));

app.use(express.static(path.join(__dirname, '..', 'www')));

// 受保护接口鉴权：设置了 API_KEY 后，前端必须带 x-api-key 头或 ?key= 参数。
// 未设置 API_KEY 时不校验（沙箱/本地默认），方便快速联调。
function requireApiKey(req, res, next) {
  const k = cfg.apiKey;
  if (!k) return next();
  const provided = req.headers['x-api-key'] || req.query.key;
  if (provided && provided === k) return next();
  return res.status(401).json({ ok: false, msg: 'unauthorized: missing or invalid api key' });
}

// 创建支付订单：{ channel:'wechat'|'alipay', amount, description?, category?, note?, userId? }
app.post('/api/pay/create', requireApiKey, async (req, res) => {
  try {
    const { channel, amount, description, category, note, userId } = req.body || {};
    const r = await orders.createOrder({ channel, amount, description, category, note, userId });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

// 查询订单状态
app.get('/api/pay/query', requireApiKey, async (req, res) => {
  const { out_trade_no } = req.query;
  if (!out_trade_no) return res.status(400).json({ ok: false, msg: '缺少 out_trade_no' });
  const s = await orders.getStatus(out_trade_no);
  res.json({ ok: true, ...s });
});

// 微信支付异步回调（需原始 body 验签）
app.post('/api/pay/notify/wechat',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const raw = (req.body && req.body.toString && req.body.toString()) || '{}';
    const r = await orders.handleWechatNotify(req.headers, raw);
    res.status(r.ok ? 200 : 400).json({ code: r.code || 'FAIL', message: r.msg || '' });
  });

// 支付宝异步回调（form-urlencoded）
app.post('/api/pay/notify/alipay',
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const r = await orders.handleAlipayNotify(req.body || {});
    res.type('text/plain').send(r.ok ? 'success' : 'failure');
  });

// 沙箱模拟收银台页面（无密钥联调用）
app.get('/api/pay/simulator/:outTradeNo', async (req, res) => {
  const s = await orders.getStatus(req.params.outTradeNo);
  if (!s.found) return res.status(404).send('订单不存在');
  const amt = s.amount != null ? Number(s.amount).toFixed(2) : '0.00';
  const ch = s.channel === 'alipay' ? '支付宝' : '微信支付';
  const paid = s.status === 'paid';
  res.type('html').send(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>模拟收银台</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;border-radius:16px;padding:28px 24px;width:300px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.amt{font-size:34px;font-weight:700;margin:14px 0}
.ch{color:#888;font-size:14px}
button{margin-top:18px;width:100%;padding:13px;border:0;border-radius:10px;background:#07c160;color:#fff;font-size:16px;cursor:pointer}
button[disabled]{background:#ccc;cursor:not-allowed}
.note{color:#999;font-size:12px;margin-top:12px}</style></head>
<body><div class="box">
<h3>模拟${ch}收银台</h3>
<div class="amt">¥${amt}</div>
<div class="ch">订单 ${req.params.outTradeNo}</div>
<button id="payBtn" ${paid ? 'disabled' : ''} onclick="doPay()">${paid ? '已支付 ✓' : '确认支付（模拟）'}</button>
<div class="note">这是沙箱模式的本地模拟页面，不会真实扣款。<br>配置真实商户密钥后即变为正式收银台。</div>
</div>
<script>
const _key=new URLSearchParams(location.search).get('key')||'';
function doPay(){fetch('/api/pay/simulator/${req.params.outTradeNo}'+(_key?('?key='+encodeURIComponent(_key)):''),{method:'POST'}).then(r=>r.json()).then(d=>{
  if(d.ok){document.getElementById('payBtn').textContent='已支付 ✓';document.getElementById('payBtn').disabled=true;
    setTimeout(()=>{window.location.href='/';},800);}
});}
</script></body></html>`);
});

// 沙箱模拟：标记订单已支付（供模拟页面调用）
app.post('/api/pay/simulator/:outTradeNo', requireApiKey, async (req, res) => {
  if (!cfg.simulatorEnabled) return res.status(403).json({ ok: false, msg: 'simulator disabled' });
  try {
    await orders.markPaid(req.params.outTradeNo, 'SANDBOX_' + Date.now());
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, msg: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({
  ok: true, db: db.hasDb, wechat: wechat.isReal(), alipay: cfg.alipay.enabled && !cfg.alipay.sandbox,
}));

app.listen(cfg.port, () => {
  console.log(`workbench-pay listening on http://localhost:${cfg.port}`);
  console.log(`  db:${db.hasDb ? 'supabase' : '内存(沙箱)'}  wechat:${wechat.isReal() ? '真实' : '沙箱'}  alipay:${cfg.alipay.enabled && !cfg.alipay.sandbox ? '真实' : '沙箱'}`);
});
