// ========== API CONFIG ==========
// 生产环境：通过后端代理 /api/chat 直连大模型 API，Key 存储在服务端环境变量中
const BOT_CONFIG = {
  // 代理端点（Vercel Serverless Function）
  proxyUrl: '/api/chat',
  // 模式：'demo' 使用本地模拟数据，'live' 调用真实大模型 API
  mode: 'live'
};

// 对话历史（前端维护，每次请求发送给后端）
let chatHistory = [];

function toggleMode() {
  if (BOT_CONFIG.mode === 'demo') {
    BOT_CONFIG.mode = 'live';
    document.getElementById('modeBtn').textContent = '🔥';
    document.getElementById('modeBtn').title = '实时模式（点击切回演示）';
  } else {
    BOT_CONFIG.mode = 'demo';
    document.getElementById('modeBtn').textContent = '📝';
    document.getElementById('modeBtn').title = '演示模式（点击切换实时）';
  }
  location.reload();
}

// ========== GAME STATE ==========
const GameState = {
  turn: 1,
  year: 1375,
  month: 1,
  pacing: '日常',
  character: {
    name: '',
    age: 22,
    baseAge: 22,   // 开局（1375年）年龄，年龄由前端按年份差硬算，不采信AI
    background: '',
    position: '未入流',
    rank: 0
  },
  attributes: { power: 20, people: 30, wisdom: 40, bond: 50, fame: 10 },
  factions: { huaixi: 0, zhedong: 0, donggong: 0, zhuwang: 0, jinchen: 0 },
  emperor_feeling: 0,
  seeds: [],
  seeds_triggered: [],
  // v3.8: 死亡/结局追踪
  consecutiveHighPowerTurns: 0,
  wroteControversialText: false,
  factionPurged: { huaixi: false, zhedong: false, donggong: false, zhuwang: false, jinchen: false },
  deathWarningCount: 0,
  // v3.8.2: 死亡倒计时（替代原deathBuffer，3回合窗口期）
  deathCountdown: 0,
  deathCountdownType: 0,
  // v3.8.5: 属性历史追踪（方案B：长期均衡约束）
  attributeHistory: { power: [], people: [], wisdom: [], bond: [], fame: [] },
  factionDecayThisTurn: null,
  // v3.8.5: 圣眷风险追踪
  consecutiveHighEfTurns: 0,
  favorCrashThisTurn: null
};

// ========== LABELS ==========
const ATTR_LABELS = {
  power:  '权势', people: '民心', wisdom: '智谋', bond: '情义', fame: '声望'
};

const FACTION_LABELS = {
  huaixi:  '淮西', zhedong: '浙东', donggong: '东宫', zhuwang: '诸王', jinchen: '近臣'
};

const FACTION_COLORS = {
  huaixi: 'var(--huaixi)', zhedong: 'var(--zhedong)',
  donggong: 'var(--donggong)', zhuwang: 'var(--zhuwang)', jinchen: 'var(--jinchen)'
};

const PACING_ICONS = {
  '紧迫': '🔥', '缓冲': '🍃', '反转': '⚡', '沉淀': '🌊', '日常': '📜'
};

const YEAR_MAP = {
  1368: '洪武元年', 1369: '洪武二年', 1370: '洪武三年',
  1371: '洪武四年', 1372: '洪武五年', 1373: '洪武六年',
  1374: '洪武七年', 1375: '洪武八年', 1376: '洪武九年',
  1377: '洪武十年', 1378: '洪武十一年', 1379: '洪武十二年',
  1380: '洪武十三年', 1381: '洪武十四年', 1382: '洪武十五年',
  1383: '洪武十六年', 1384: '洪武十七年', 1385: '洪武十八年',
  1386: '洪武十九年', 1387: '洪武二十年', 1388: '洪武二十一年',
  1389: '洪武二十二年', 1390: '洪武二十三年', 1391: '洪武二十四年',
  1392: '洪武二十五年', 1393: '洪武二十六年'
};

function getYearName(y) {
  return YEAR_MAP[y] || `洪武${y - 1367}年`;
}
