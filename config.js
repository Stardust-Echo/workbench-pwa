// 服务端配置：统一从环境变量读取，全部带默认值以便「无密钥也可启动（沙箱模式）」。
try { require('dotenv').config(); } catch (e) {}

function bool(v, d) { if (v === undefined) return d; return v === 'true' || v === '1'; }
function str(v, d) { return v && String(v).trim() ? String(v).trim() : d; }

const cfg = {
  port: parseInt(str(process.env.PORT, '3000'), 10),
  publicBaseUrl: str(process.env.PUBLIC_BASE_URL, '').replace(/\/$/, ''),

  supabase: {
    url: str(process.env.SUPABASE_URL, ''),
    anonKey: str(process.env.SUPABASE_ANON_KEY, ''),
    serviceRoleKey: str(process.env.SUPABASE_SERVICE_ROLE_KEY, ''),
  },

  wechat: {
    enabled: bool(process.env.WECHAT_ENABLED, false),
    sandbox: bool(process.env.WECHAT_SANDBOX, true),
    mchId: str(process.env.WECHAT_MCH_ID, ''),
    appId: str(process.env.WECHAT_APP_ID, ''),
    apiV3Key: str(process.env.WECHAT_API_V3_KEY, ''),
    serialNo: str(process.env.WECHAT_SERIAL_NO, ''),
    privateKey: str(process.env.WECHAT_PRIVATE_KEY, '').replace(/\\n/g, '\n'),
    platformPublicKey: str(process.env.WECHAT_PLATFORM_PUBLIC_KEY, '').replace(/\\n/g, '\n'),
  },

  alipay: {
    enabled: bool(process.env.ALIPAY_ENABLED, false),
    sandbox: bool(process.env.ALIPAY_SANDBOX, true),
    appId: str(process.env.ALIPAY_APP_ID, ''),
    privateKey: str(process.env.WALIPAY_PRIVATE_KEY, '').replace(/\\n/g, '\n'),
    publicKey: str(process.env.ALIPAY_PUBLIC_KEY, '').replace(/\\n/g, '\n'),
  },

  // 后端 API 密钥：设置了之后，前端↔后端的所有受保护接口都需带 x-api-key 头（或 ?key= 参数）。
  // 不设置则不校验（沙箱/本地默认），便于快速联调；公网部署请务必设置。
  apiKey: str(process.env.API_KEY, ''),

  // 沙箱模拟收银台开关：正式环境设为 false 关闭仿真支付。
  simulatorEnabled: bool(process.env.SIMULATOR_ENABLED, true),

  allowedOrigins: str(process.env.ALLOWED_ORIGINS, '')
    .split(',').map(s => s.trim()).filter(Boolean),
};

module.exports = cfg;
