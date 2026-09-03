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
  // v3.8.5: 出征次数追踪（P2-E：封狼居胥需要出征≥2次）
  expeditionCount: 0,
  // v3.8.15: 生活事件系统——家庭数据（Phase 1）
  family: null,          // { spouse: {...}, children: [...], parents: {...}, siblings: [...] }
  lifeEventLastTurn: 0,  // 上次生活事件触发的回合号（冷却用）
  lifeEventsTriggered: [], // 已触发的生活事件ID列表
  // v3.8.16: Phase 2-3 婚姻选择 + 家庭牵连危机
  pendingMarriageChoice: null,  // 待处理的联姻选择 { proposals: [...], turn: n }
  currentFamilyCrisis: null,    // 当前家庭牵连危机 { id, title, desc, choices, turn, anchorId }
  familyCrisisTriggeredThisAnchor: false, // 当前锚点期间是否已触发家庭危机
  lastFamilyCrisisAnchor: 0,    // 上次触发家庭危机的锚点ID
  familyCrisisOutcome: {},      // 家庭危机选择结果记录 { crisisId: outcome }
  // v3.8.5: 圣眷风险追踪
  consecutiveHighEfTurns: 0,
  favorCrashThisTurn: null,
  favorCrashRecentTurns: 0,
  // v3.8.10: 锚点顺序强制控制——已完成的锚点ID列表
  completedAnchors: [],
  // v3.8.11: 结局终止标记 + 待处理选项存档
  gameOver: false,
  pendingChoices: null,
  // P0-1: 近臣事件追踪
  jinchenEvents: {},    // 已触发的近臣事件 { 'jc_1': 'A', 'jc_2': 'C', ... }
  jinchenFlags: {},     // 近臣特殊标记 { jinchenCap: 30 /* 事件8选A后锁死上限 */ }
  jinchenWatchCount: 0, // v3.8.18: 近臣监控种子计数（效果递减用）
  // P0-2: 死亡容错机制
  deathWarning: 0,              // 必死/概率直接死型预警倒计时（1回合）
  deathWarningType: 0,          // 预警类型（对应CRISIS_EVENTS key）
  deathCooldown: {},            // 死法冷却期 { deathType: remainingTurns }
  anchorTriggerCount: { 2: 0, 7: 0 }, // 锚点触发计数（胡案/蓝案各最多2次）
  rescueAttempted: false,       // 当前危机是否已尝试自救
  degradationActive: false,     // 降级过渡回合标记
  degradationType: 0,           // 降级类型（对应死法type）
  crisisBufferActive: false,    // 缓冲属性本回合是否生效
  // v3.8.17: 上下文优化 Phase 2 — 前情提要滚动摘要
  plotSummary: '',
  // v3.8.19: 阶段性成就系统 — 上次触发成就的锚点ID（防重复）
  lastAnchorAchieved: 0
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

// ========== P0-1: 展示层属性定义（UI精简） ==========
// 复合公式：将5个原始属性映射为2个可见指标
// 后端不变：AI输出仍然产出5个原始属性的delta，只在展示层做加权转换
const DISPLAY_ATTRS = [
  { 
    key: 'career',       // 官运
    label: '官运', 
    formula: (attrs) => Math.round(attrs.power * 0.6 + attrs.fame * 0.4) 
  },
  { 
    key: 'hearts',       // 人心
    label: '人心', 
    formula: (attrs) => Math.round(attrs.people * 0.5 + attrs.bond * 0.5) 
  }
  // wisdom 不显示（通过AI叙事视角体现）
];

// ========== P0-1: 展示层阵营定义（跷跷板） ==========
// 将5个阵营映射为2条跷跷板 + 1条近臣独立展示
const DISPLAY_FACTIONS = [
  {
    key: 'court',        // 朝堂格局
    label: '朝堂格局',
    leftLabel: '淮西',
    rightLabel: '浙东',
    leftKey: 'huaixi',
    rightKey: 'zhedong',
    leftColor: 'var(--huaixi)',
    rightColor: 'var(--zhedong)'
  },
  {
    key: 'succession',   // 储位之争
    label: '储位之争',
    leftLabel: '东宫',
    rightLabel: '诸王',
    leftKey: 'donggong',
    rightKey: 'zhuwang',
    leftColor: 'var(--donggong)',
    rightColor: 'var(--zhuwang)'
  }
];

// v3.8.5: P2-A 出身偏向阵营映射（方案C：前5回合变化减半，可通过"决裂"选项突破）
const ORIGIN_FACTION_MAP = {
  '淮西武将之后': 'huaixi',
  '浙东寒门书生': 'zhedong',
  '应天府商贾之子': 'jinchen',
  '落魄前元官员之后': 'jinchen'
};

// v3.8.5: P2-B 种子类型模板（代码化引爆效果）
// v3.8.18: 负面种子效果下调~15%（配合到期必爆100%引爆率），出身修正补全
const SEED_TEMPLATES = {
  '政治炸弹': {
    latency: [4, 5],
    triggerRate: 0.8,
    effect: {
      attributes: { power: [-17, -8] },
      factions: null
    },
    originMod: { '淮西武将之后': -0.1 }
  },
  '人情债': {
    latency: [3, 4],
    triggerRate: 0.6,
    effect: {
      attributes: { people: [5, 15] },
      emperor_feeling: [0, 5]
    },
    originMod: { '应天府商贾之子': 0.15 }
  },
  '把柄暴露': {
    latency: [3, 5],
    triggerRate: 0.7,
    effect: {
      attributes: { power: [-12, -4], wisdom: [-4, 0] },
      emperor_feeling: [-20, -12]
    },
    originMod: { '落魄前元官员之后': 0.20 }
  },
  '谣言传播': {
    latency: [3, 4],
    triggerRate: 0.5,
    effect: {
      attributes: { fame: [-12, -4], people: [-8, -3] },
      factions: null
    },
    originMod: { '浙东寒门书生': 0.1 }
  },
  '盟友反水': {
    latency: [4, 5],
    triggerRate: 0.4,
    effect: {
      attributes: { people: [-17, -8], bond: [-8, -4] },
      factions: null
    },
    originMod: {}
  }
};

// 种子类型列表（供 AI 参考）
const SEED_TYPES = Object.keys(SEED_TEMPLATES);

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
