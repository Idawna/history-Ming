// ========== 墨史·大明 v3.15.0（出身线EA扩展：40→74，前元线亲明/亲北分支） ==========
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
// ========== v3.14.0（P0-6）: 默认状态模板与运行时状态分离 ==========
// DEFAULT_GAME_STATE 是 GameState 的默认值模板（唯一事实来源）：
//   - 新游戏初始化：GameState = 模板的深拷贝
//   - 读档恢复：applySnapshot 用 Object.assign(GameState, 模板, 存档) 自动合并，
//     新增字段自动获得默认值，不再需要逐字段手动维护恢复逻辑
// 注意：DEFAULT_GAME_STATE 必须保持纯数据（可 JSON 序列化），禁止函数/undefined 值
const DEFAULT_GAME_STATE = {
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
  // v3.11.0d: 家庭信任度（家庭叙事回响系统）
  familyTrust: 50,              // 家庭信任度：0-100，50为中性起点
  // ========== v3.12.0 生死危机事件层 ==========
  health: '健康',                 // '健康' | '受伤' | '重伤' | '濒死'
  mentalState: '稳定',            // '稳定' | '焦虑' | '崩溃边缘' | '崩溃'
  fatePoints: 0,                  // 天命值（全游戏上限5）
  fatePointsEarned: [],           // 获取记录 [{turn, reason}]
  fatePointsSpent: [],            // 消耗记录 [{turn, eventId, reason}]
  crisisEventsTriggered: [],      // 已触发的危机事件ID列表
  crisisEventsCompleted: [],      // 已完成的危机事件ID列表
  lastCrisisTurn: 0,              // 上次危机触发回合号（冷却判定用）
  lastAnchorTurn: 0,              // 上次锚点结束回合（冲突检测用）
  activeCrisisEvent: null,        // 当前正在进行的危机事件
  crisisJudgmentPending: false,   // 是否有待判定的危机结果
  crisisTags: {},                 // 危机标签 { 'tag': {turn, expiresAt, permanent} }
  permanentBodyDamage: 0,         // 永久身体伤害累积
  permanentMentalDamage: 0,       // 永久心理创伤累积
  npcCrisisState: {},             // NPC危机命运变更 { '蓝玉': 'escaped'|'dead'|... }
  originNPCState: {},
  // ========== v3.13.0 生死危机 Phase 2 ==========
  crisisTimers: {},               // 限时事件计时器 { eventId: { remaining, total, startTurn, lastDecrementTurn, states } }
  crisisFinalePhase: 0,           // 终局危机当前阶段（0=未开始，1-4=国丧/站队/暗涌/天命落）
  crisisFinaleChoices: [],        // 终局危机各阶段选择记录 [{ phase, choiceId, choiceLabel, turn }]
  // v3.8.5: 圣眷风险追踪
  consecutiveHighEfTurns: 0,
  favorCrashThisTurn: null,
  favorCrashRecentTurns: 0,
  // v3.8.10: 锚点顺序强制控制——已完成的锚点ID列表
  completedAnchors: [],
  // v3.8.11: 结局终止标记 + 待处理选项存档
  gameOver: false,
  pendingChoices: null,
  // v3.9.2: 成就系统持久化
  achievements: [],  // 本局成就 [{ anchorId, anchorName, tier, score, text, bonus, bonusLabel, earnedTurn }]
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

// 运行时状态：默认模板的深拷贝（保证嵌套对象独立，不共享 DEFAULT_GAME_STATE 内部引用）
const GameState = JSON.parse(JSON.stringify(DEFAULT_GAME_STATE));

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
    formula: (attrs) => Math.round(attrs.power * 0.4 + attrs.fame * 0.3 + attrs.wisdom * 0.3) 
  },
  { 
    key: 'hearts',       // 人心
    label: '人心', 
    formula: (attrs) => Math.round(attrs.people * 0.5 + attrs.bond * 0.5) 
  }
  // v3.8.20: wisdom 融入官运公式（占比30%），玩家可感知智谋的影响
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

// v3.10.0: P1-1 出身策略选项——每回合至少1个出身特色选项（代码强制注入保底）
// 每条出身线定义3类策略方向 + 模板库，代码在AI选项均不匹配时自动注入1个
var ORIGIN_STRATEGIES = {
  '淮西武将之后': {
    types: ['军功路线', '义气路线', '武力展示'],
    templates: [
      { label: '军功路线', text: '去校场点兵操练，边军近日有逃兵现象，需整顿军纪', keywords: ['军中', '操练', '军纪', '校场', '卫所', '边军'] },
      { label: '军功路线', text: '查看军中屯田账目，核实今年粮食产量与拨付', keywords: ['屯田', '军粮', '粮饷', '卫所'] },
      { label: '义气路线', text: '去老兄弟家中探望——听说有人被锦衣卫约谈过', keywords: ['旧部', '兄弟', '袍泽', '旧交', '探望'] },
      { label: '义气路线', text: '带一坛酒去找舅舅叙旧，军中旧事最是挂怀', keywords: ['舅舅', '蓝玉', '酒', '叙旧'] },
      { label: '武力展示', text: '在校场比武中露一手，让新人知道淮西老将的斤两', keywords: ['比武', '校场', '武', '功夫', '弓马'] },
      { label: '武力展示', text: '亲自带队巡查城防，武将本分不可废', keywords: ['巡查', '城防', '巡逻', '守备'] }
    ]
  },
  '浙东寒门书生': {
    types: ['学问路线', '师门人脉', '文采展示'],
    templates: [
      { label: '学问路线', text: '编缉文集，整理近来所思所感，笔耕不辍', keywords: ['文集', '编缉', '著述', '文章', '读书'] },
      { label: '学问路线', text: '上书议论朝政得失，文人本分在于以笔谏世', keywords: ['上书', '奏疏', '论政', '谏'] },
      { label: '师门人脉', text: '去同门处坐坐，近来风声紧，师兄弟需互通消息', keywords: ['同门', '师兄弟', '浙东', '文人', '书院'] },
      { label: '师门人脉', text: '参与文人雅集，诗酒唱和中打探朝堂风向', keywords: ['雅集', '诗会', '文人', '聚会'] },
      { label: '文采展示', text: '写一首感怀诗，抒发胸中块垒', keywords: ['诗', '赋', '吟', '文采', '笔墨'] },
      { label: '文采展示', text: '教授生徒，以学问传人，延续师门薪火', keywords: ['教授', '生徒', '讲学', '授业'] }
    ]
  },
  '应天府商贾之子': {
    types: ['财力路线', '人脉网络', '算计展示'],
    templates: [
      { label: '财力路线', text: '盘点商铺账目，近期物价波动，需及时调整囤货', keywords: ['商铺', '账目', '囤货', '货物', '买卖'] },
      { label: '财力路线', text: '打探税赋新策，户部近日有动作，商路安全要紧', keywords: ['税赋', '商路', '户部', '宝钞'] },
      { label: '人脉网络', text: '去茶楼坐坐，各路消息在杯盏间流通', keywords: ['茶楼', '酒肆', '消息', '人脉', '应酬'] },
      { label: '人脉网络', text: '宴请同乡商贾，互通有无，维系商帮关系', keywords: ['宴请', '同乡', '商帮', '商会'] },
      { label: '算计展示', text: '仔细核算本季收支，每一笔银子都要花在刀刃上', keywords: ['核算', '收支', '银子', '算'] },
      { label: '算计展示', text: '分析近期朝局变动对商路的影响，提前布局', keywords: ['分析', '布局', '影响', '策略'] }
    ]
  },
  '落魄前元官员之后': {
    types: ['隐忍路线', '元人知识', '谨慎展示'],
    templates: [
      { label: '隐忍路线', text: '低调处理手头公务，不引人注目是当前第一要务', keywords: ['低调', '谨慎', '不引人', '隐忍', '沉默'] },
      { label: '隐忍路线', text: '安分守己做好本职，用实绩说话，少参与党派之争', keywords: ['安分', '本职', '实绩', '务实'] },
      { label: '元人知识', text: '翻检旧日笔记，前元治理经验或可借鉴于当下', keywords: ['前元', '旧日', '笔记', '经验', '借鉴'] },
      { label: '元人知识', text: '暗中联络旧识，前朝人脉虽险却有用', keywords: ['旧识', '前朝', '联络', '旧交'] },
      { label: '谨慎展示', text: '主动承办棘手差事，用苦劳换取信任', keywords: ['承办', '差事', '苦劳', '信任', '务实'] },
      { label: '谨慎展示', text: '赈济灾民或审理积案，以民心洗刷身份嫌疑', keywords: ['赈济', '灾民', '审案', '民心', '洗白'] }
    ]
  }
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

// ═══════════════════════════════════════════════════════════════════
// v3.9.0: 情感锚点系统 (Emotional Anchors)
// 每条出身线在关键回合触发情感事件，建立玩家与NPC的情感连接
// 数据驱动AI叙事：AI根据此数据生成场景、对话和选项
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// v3.10.2: 情感锚点系统 (Emotional Anchors) — 41个锚点
// 设计理念：EA的本质是"逼你在你爱的人之间做取舍"
// 第一幕(T1-15)建立情感依附 → 第二幕(T16-45)亲手伤害 → 第三幕(T46-60)余震与救赎
// ═══════════════════════════════════════════════════════════════════

const EMOTIONAL_ANCHORS = {

  // ──── 淮西线：义气的代价（11个） ────
  '淮西武将之后': [
{
  id: 'EA-HW-1',
  title: '新家',
  triggerTurn: 3,
  year: 1375,
  coreEvent: '张蕴真搬入新宅，挂弓挂辣椒，用一句「家不在大小，在于回不回来」定义了这段婚姻。',
  emotionalArc: '温暖·新鲜→归属',
  keyBeats: [
    '张蕴真第一件事把书房画摘了换弓——「读书读傻了怎么办」',
    '灶房墙上钉钉子挂干辣椒——老家带来的，「你尝了就知道了」',
    '她看了一眼院子里的老槐树，目光停了一瞬',
    '「家不在大小，在于回不回来。你以后每天回来吃饭吗？」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '弓',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「家/回来/吃饭」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '应天府小宅——院子不大，有棵老槐树',
    time: '白天，刚搬入',
    atmosphere: '阳光正好，两箱嫁妆还没拆，空气里有新鲜的味道',
    requiredElements: ['弓', '干辣椒串', '老槐树', '嫁妆箱子'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '从此过上了幸福的生活']
  },
  characterDirective: {
    '张蕴真': {
      state: '刚嫁过来，明艳利落，手脚麻利，像个刚得了新玩具的孩子',
      speechStyle: '直来直去，带军营里养出来的爽利。说话时眼睛亮亮的，偶尔会突然安静一瞬',
      physicalDetails: ['两箱嫁妆', '手上动作不停', '看了一眼老槐树目光停了一瞬']
    }
  },
  toneDirective: {
    overall: '明亮、轻快——这是一个新家庭的开始，温暖但不腻',
    technique: '用物件（弓、辣椒、槐树）代替形容词写感情。蕴真的动作>她的表白',
    pacing: '中速。轻快的节拍，但老槐树那一瞬要慢下来'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '温暖回应——承诺每天回来吃饭',
      emotionalNote: '这是一个新郎对新娘的安全感，也是一种淮西武人的坦荡',
      effect: { bond: 8 },
      rippleHint: '蕴真以后真的每天做饭，偶尔会在饭桌上讲她小时候军营里的事',
      condition: null
    },
    {
      label: 'B',
      direction: '现实回应——朝堂说不准，忙起来可能十天半月',
      emotionalNote: '不是敷衍，是军人的诚实。蕴真听得懂',
      effect: { bond: 3 },
      rippleHint: '蕴真没说话，第二天自己去集市买了只鸡回来炖了。「忙完了就吃。」',
      condition: null
    },
    {
      label: 'C',
      direction: '文官化回应——把弓取下来挂角落，书房是读书的地方',
      emotionalNote: '不是错误，但蕴真会感到一层薄薄的距离——你在推开她的世界',
      effect: { bond: -3 },
      rippleHint: '蕴真没说什么，但那串干辣椒她也没摘。你们之间多了一层薄薄的客气',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '让妻子变成一个具体的人，而不是「家」属性的载体。弓和干辣椒是记忆锚点，贯穿全线。'
},

// ────────────────────────────────────────────────────────
// EA-HW-2 把酒言欢 (T6, 1376)
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-2',
  title: '把酒言欢',
  triggerTurn: 6,
  year: 1376,
  coreEvent: '蓝玉带周大哥来喝酒，三个淮西子弟喝到半夜，蓝玉忽然说起军中旧部的不公处境。',
  emotionalArc: '豪迈→低沉→义气抉择',
  keyBeats: [
    '蓝玉踢靴进门，周大哥拍肩喊「好眼光」——三人的热闹',
    '周大哥拍桌「咱兄弟这辈子不散」——义气高潮',
    '蓝玉忽然不说话了，盯着酒碗——老陈调云南没发饷，老周儿子犯事没人保',
    '「咱在战场上拼了命，回来连个公道都没有。你说这是什么道理？」'
  ],
  requiredNPCs: ['蓝玉', '周大哥'],
  memoryItem: '酒碗',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蓝玉或周大哥的对话中，提取关于「义气/不散/公道」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋，桌上有菜有酒',
    time: '深夜，三人喝到半夜',
    atmosphere: '酒气弥漫，桌上碗筷凌乱。前段热闹喧嚣，后段蓝玉沉默时空气骤然变重',
    requiredElements: ['酒碗', '菜', '蓝玉踢掉的靴子', '周大哥'],
    forbiddenPatterns: ['心中涌起暖流', '热血沸腾', '不禁感慨万千']
  },
  characterDirective: {
    '蓝玉': {
      state: '刚打了胜仗回来，浑身酒气。前半段豪爽张扬，后半段忽然沉默——想起旧部的处境',
      speechStyle: '粗犷直白，骂骂咧咧。沉默时比说话时更有压迫感',
      physicalDetails: ['踢掉靴子', '盯着碗里的酒', '半天才开口']
    },
    '周大哥': {
      state: '蓝玉旧部，比主角大几岁，笑起来声音洪亮',
      speechStyle: '嗓门大，热情到近乎粗鲁。拍肩拍桌是他的语言',
      physicalDetails: ['红着脸举着碗', '拍着桌子说「不散」']
    },
    '张蕴真': {
      state: '端菜上来后被蓝玉调侃，白了他一眼没理',
      speechStyle: '不多话，但该出现时出现',
      physicalDetails: ['端菜上桌', '白了蓝玉一眼']
    }
  },
  toneDirective: {
    overall: '前半段热热闹闹的兄弟情，后半段突然降温——一个武将的委屈比文人的更沉重',
    technique: '先扬后抑。用周大哥的热闹反衬蓝玉的沉默。用酒碗的意象承载情绪转折',
    pacing: '前快后慢。热闹段落快速推进，蓝玉沉默后节奏骤然放慢'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '义气回应——「舅舅说得对。咱淮西子弟不能这么被人踩」',
      emotionalNote: '这是淮西子弟的本能反应。蓝玉会记住你，朱元璋也会记住你',
      effect: { bond: 5, huaixi: 8 },
      rippleHint: '蓝玉拍着你的肩说「好小子」，周大哥在旁边笑得合不拢嘴：「我就知道这小子有种！」从此他在朝堂上为你说话。但这笔账，朱元璋记着呢',
      condition: null
    },
    {
      label: 'B',
      direction: '回避转移——「喝酒就喝酒，别想那些有的没的」',
      emotionalNote: '不是怯懦，是年轻人还不想面对。蓝玉不会怪你，但会失望',
      effect: { bond: 3 },
      rippleHint: '蓝玉看了你一眼，没再说什么。周大哥打圆场：「喝酒喝酒！」但蓝玉走的时候，脚步比来时慢了些',
      condition: null
    },
    {
      label: 'C',
      direction: '理性劝阻——「现在不比在战场上了。忍一忍」',
      emotionalNote: '正确但不合时宜。蓝玉听到的是「你不懂我们的痛」',
      effect: { wisdom: 5, bond: -2 },
      rippleHint: '蓝玉冷笑：「忍？那些死在战场上的弟兄，谁替他们忍了？」周大哥拉了拉蓝玉的袖子，没拉住。他走了。蕴真出来说：「蓝将军脸色不太好。你说了什么？」',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: 'v2微调：增加周大哥同席。三个淮西子弟喝酒，建立周大哥存在感。为T20旧部凋零和T40定罪文书建立情感基础。'
},
    {
      id: 'EA-HW-3',
      title: '初为人父',
      triggerTurn: 10,
      year: 1380,
      coreEvent: '张蕴真难产，母子平安。主角第一次成为父亲。',
      emotionalArc: '紧张→释然→温柔→隐忧',
      keyBeats: [
        '产房外等待——听到产婆说"大人保住了"时手还在抖',
        '进入产房看到蕴真——头发散开贴在脸上，孩子皱巴巴像个小老头',
        '蕴真拉着主角的手摸茧子——"还在"——然后闭眼提到她父亲',
        '蕴真低声请求：别让孩子当兵当官，就平平安安的'
      ],
      requiredNPCs: ['张蕴真'],
      optionalNPCs: ['产婆'],
      memoryItem: '手上的茧',
      sceneDirective: {
        location: '家中卧房（临时改为产房）',
        time: '深夜，烛火将尽',
        atmosphere: '血腥味混着艾草烟，产婆在收拾，婴儿的哭声刚停',
        requiredElements: ['产婆', '血迹', '烛光', '窗外月光或更夫声'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '你知道吗其实我']
      },
      characterDirective: {
        '张蕴真': {
          state: '刚经历难产，鬼门关走了一遭，虚弱但异常清醒',
          speechStyle: '声音很轻。不哭。用最日常的语气说最沉重的话。会突然转移话题',
          physicalDetails: ['头发散乱', '脸色苍白', '手指攥着主角的手不放']
        }
      },
      toneDirective: {
        overall: '克制到近乎冷淡——但正是这种克制让情感更重',
        technique: '动作>语言。沉默>表白。物件>形容词',
        pacing: '极慢。每个节拍之间可以有一整段只写环境'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '温柔承诺——答应让孩子平安，给出明确承诺',
          emotionalNote: '这是一个丈夫对妻子的安慰，也是一个父亲对孩子的祝福',
          effect: { bond: 10 },
          rippleHint: '蕴真笑了但眼角有泪。从此每次上朝前她都给你整衣领',
          condition: null
        },
        {
          label: 'B',
          direction: '现实回应——承认身不由己但会尽力保护',
          emotionalNote: '不轻易许诺，但说到做到。这是军人的方式',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '她看了你很久说"你比你爹实在"。蓝玉听说后送了长命锁',
          condition: null
        },
        {
          label: 'C',
          direction: '宿命回应——家族命运不由自己选择',
          emotionalNote: '不是错误答案。是一个淮西武将对命运的真实认知',
          effect: { huaixi: 5, bond: -3 },
          rippleHint: '她没说话。那晚抱孩子坐院子里到天亮。你从窗户看到了但没出去',
          condition: null
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-HW-2选A',
          beat: '蓝玉前天派人送来上等药材——说是"给侄媳妇的"',
          implication: '把酒言欢的义气选择让蓝玉记住了你'
        },
        {
          condition: 'EA-HW-2选C',
          beat: '没有任何人送礼。好像没人知道你要当爹了',
          implication: '上次的"忍一忍"让蓝玉觉得你不够义气，关系冷了'
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了"{keyQuote}"——{protagonist}记住了{memoryItem}',
        extractionRule: '从蕴真的对话中，提取关于"平安/命运/父亲"主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '选C不是"错误答案"，但蓝玉案后（T47）蕴真会带孩子跑回娘家——因为她太了解你，你说的是对的，她选择自己来选。'
    },
{
  id: 'EA-HW-4',
  title: '山雨欲来',
  triggerTurn: 11,
  year: 1380,
  coreEvent: '胡惟庸案爆发前夜，张蕴真回来说哥哥被叫去问话，请求主角帮忙。',
  emotionalArc: '恐惧→逼迫→抉择',
  keyBeats: [
    '蕴真把包袱往桌上一放，没看他——「我哥被叫去问话了」',
    '她的手在搓衣角——嘴上说平静，身体在抖',
    '「我娘让我别多问。可我做不到」——她终于看他',
    '「我就是不想跟我爹家一样。全家等一个消息，等到最后等来一块牌位」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '搓衣角的手',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「牌位/等待/父亲」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋，窗外夜色沉沉',
    time: '深夜，三更将近',
    atmosphere: '压抑。更夫的梆子声从窗外传来，每一声都像倒计时',
    requiredElements: ['包袱', '搓衣角的手', '更夫梆子声', '窗外夜色'],
    forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千']
  },
  characterDirective: {
    '张蕴真': {
      state: '从娘家赶回来，脸色不好看。知道事态严重，但拼命维持镇定',
      speechStyle: '声音平静但带着微微颤抖。会在关键处断句。不用恳求的语气——用陈述',
      physicalDetails: ['脸色不好看', '手在搓衣角', '终于看你时目光直视']
    }
  },
  toneDirective: {
    overall: '紧绷。像暴风雨前的低气压——不是嚎啕，是屏住呼吸',
    technique: '用细节暗示恐惧（搓衣角、更夫声）而不是直接写「她很害怕」。对话中的沉默比语言更有力',
    pacing: '慢。每一句对话之间都要有足够的停顿，让恐惧渗透'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '仗义承诺——「我帮。你哥就是我哥」',
      emotionalNote: '丈夫对妻子的保护，但也把自己推进了漩涡',
      effect: { bond: 8, power: -8 },
      rippleHint: '你连夜走了几道关系。大舅哥最后没事了，但你花出去的银子够买半条街。更重要的是——锦衣卫的册子上多了你的名字',
      condition: null
    },
    {
      label: 'B',
      direction: '谨慎观望——「现在形势不明朗。我先看看」',
      emotionalNote: '理性但不合时宜。蕴真听到的是「你哥没有你重要」',
      effect: { bond: -5, wisdom: 3 },
      rippleHint: '蕴真没说话。第二天她把自己嫁妆里的首饰全拿去当铺了。「我自己救我哥。用不着你。」',
      condition: null
    },
    {
      label: 'C',
      direction: '借力打力——「你别急。我去找蓝玉打听打听」',
      emotionalNote: '聪明的做法，但也暴露了军中关系。蕴真松了口气，但看你的眼神变了',
      effect: { wisdom: 5, huaixi: 3 },
      rippleHint: '蓝玉告诉你「这事很大，别碰」。但你至少知道了大舅哥只是被问话。你带回消息时蕴真松了口气，但她看你的眼神变了——你去找蓝玉，说明你在军中有人。这不一定好事',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: '胡惟庸案',
  designNote: '比胡惟庸案早1回合。玩家不知道「胡惟庸案」这个词，但选择直接决定后续家庭危机走向。'
},
// --------------------------------------------------------
// EA-HW-NEW-A 同乡会 (T15, 1381)
// --------------------------------------------------------
{
      id: 'EA-HW-NEW-A',
      title: '同乡会',
      triggerTurn: 15,
      year: 1381,
      coreEvent: '一次普通的淮西老乡聚会——喝酒、聊旧事、骂几句朝堂。三天后检校找上门：「昨晚聚了哪些人？」你什么都没做错，但你的「没错」就是罪。',
      emotionalArc: '轻松→愉快→不安→恐惧',
      keyBeats: [
        '七八个淮西子弟聚会，喝酒吃肉，有人喝多了骂朝堂：「咱打仗的时候他们在哪？现在倒来管咱了」——大家叫好',
        '散场时有人开玩笑：「不会被谁报了吧？」——大家笑了',
        '三天后检校的人来了：「昨晚在哪？哪些人？聊了什么？」——他手里有名册',
        '你发现自己每回答一句，就多提供一份证据'
      ],
      requiredNPCs: ['检校'],
      memoryItem: '聚会名册',
      memoryTemplate: {
        format: '{npc}在{location}问了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从检校上门问话中，提取关于「昨晚聚了哪些人/聊了什么」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '淮西同乡的酒馆/某人家中',
        time: '白天聚会，三天后的清晨检校上门',
        atmosphere: '聚会时的热闹滚烫与检校上门时的安静形成落差——越安静越可怕',
        requiredElements: ['酒碗「, 」七八个同乡「, 」检校手里的名册「, 」大家散场后的空桌'],
        forbiddenPatterns: ['心中涌起暖流「, 」不禁感慨万千「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '检校': {
          state: '便装上门，平静、职业化，像在问路一样问话，不急不躁',
          speechStyle: '问句简短、具体，从不威胁。每句都是「核实」的口气——越平静越可怕',
          physicalDetails: ['手里拿着名册「, 」说「好。你记住你说的」时合上名册「, 」走时脚步很轻']
        }
      },
      toneDirective: {
        overall: '从热闹到安静的急转——一次正常聚会，在洪武体制下就是「结党营私」的证据',
        technique: '用检校的平静反衬恐怖。他不怒喝、不威胁，只是「问一问」',
        pacing: '前半段轻快热闹，检校进门后骤然放慢，每一句问答都像在走钢丝'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '如实回答——「就是老乡喝了顿酒」',
          emotionalNote: '武人的坦荡。但「如实回答」变成了「提供证据」',
          effect: { bond: -3, wisdom: 3 },
          rippleHint: '检校笑了：「老乡？哪个老乡？做什么的？聊了什么？」——你发现每回答一句，名册上就多一行。T18之后聚会少了',
          condition: null
        },
        {
          label: 'B',
          direction: '否认聚会——「没聚，就是路过」',
          emotionalNote: '情急之下的否认，但你已经暴露了紧张',
          effect: { power: -3, wisdom: 3 },
          rippleHint: '检校拿出名册：「这个人在吗？这个人呢？」——你发现他们已经知道了。你说了谎，但他们比你先到',
          condition: null
        },
        {
          label: 'C',
          direction: '把责任揽到自己身上——「是我组织的」',
          emotionalNote: '淮西人的义气。但你的「义气」变成了「认罪」',
          effect: { bond: 8, power: -5 },
          rippleHint: '检校：「好。你记住你说的。」——你替同乡扛了。同乡们感激你，但名册上你的名字被画了个圈。T41清算时这个圈被翻出来',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '制度陷阱的入门课：一次正常的老乡聚会就是「结党营私」的证据。检校的平静比锦衣卫的拷打更可怕——因为你连反抗的对象都没有，他只是「问一问」。与浙东线T15「检校问字」形成平行：同一年，同一套检校系统，武将喝顿酒是「结党」，文人写封信是「讽刺」。'
    },
// --------------------------------------------------------
// EA-HW-NEW-B 蓝玉的礼物 (T18, 1382)
// --------------------------------------------------------
{
      id: 'EA-HW-NEW-B',
      title: '蓝玉的礼物',
      triggerTurn: 18,
      year: 1382,
      coreEvent: '蓝玉来探望刚出生的孩子，送了一把小弓——「将门虎子」。蕴真笑着收了，但蓝玉走后她把弓藏进了箱子底。同一天，锦衣卫正式设立。',
      emotionalArc: '温暖→不安→沉默',
      keyBeats: [
        '蓝玉抱着孩子哈哈大笑：「好小子！将门虎子！」——他送了一把小弓',
        '蕴真笑着接过，给蓝玉倒酒——一切看起来正常',
        '蓝玉走后，蕴真把小弓从婴儿床边拿开，放进箱子最底层',
        '「将门虎子——这四个字，现在不是好话。」',
        '同一天，街上传来消息：锦衣卫正式设立了——从此所有人的头上多了一双眼睛'
      ],
      requiredNPCs: ['蓝玉「, 」张蕴真'],
      memoryItem: '小弓',
      memoryTemplate: {
        format: '{npc}在{location}送了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蓝玉送弓与蕴真藏弓的对话中，提取关于「将门虎子/藏起来」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中，婴儿床边',
        time: '白天，蓝玉来访',
        atmosphere: '表面热闹温馨，底层却有一层说不清的凉意——像冬日的太阳',
        requiredElements: ['小弓「, 」婴儿床「, 」蓝玉的大笑「, 」箱子最底层'],
        forbiddenPatterns: ['心中涌起暖流「, 」天伦之乐「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '蓝玉': {
          state: '高兴得像个孩子，抱着新生儿舍不得放手，对自己的好意浑然不觉',
          speechStyle: '嗓门大，笑声更响。说「将门虎子」时满脸骄傲——完全不知道这四个字的分量',
          physicalDetails: ['抱着孩子哈哈大笑「, 」送小弓时眼睛发亮「, 」临走拍主角肩膀']
        },
        '张蕴真': {
          state: '笑着应对一切，但心里已经看到了危险——她是淮西线最先看清制度的人',
          speechStyle: '不当面反驳蓝玉。等人走了才说真话',
          physicalDetails: ['笑着接弓「, 」给蓝玉倒酒「, 」蓝玉走后把小弓放进箱子最底层']
        }
      },
      toneDirective: {
        overall: '温暖底下的不安——「将门虎子」在任何时代是祝福，在洪武体制下是「世代掌兵」的暗示',
        technique: '用「藏弓」的动作代替议论。蕴真不说话，但弓确实被藏起来了',
        pacing: '前段热闹，蓝玉走后骤然安静。藏弓的动作要慢下来，像在做一件见不得光的事'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「蕴真你想多了。舅舅是好意」',
          emotionalNote: '对舅舅的信任，但你没看见蕴真眼里的担忧',
          effect: { bond: 3 },
          rippleHint: '蕴真不说话。但弓确实被藏起来了——她的沉默比任何话都重。T33凯旋宴上你想起这把弓，想起她当时的沉默',
          condition: null
        },
        {
          label: 'B',
          direction: '「你说得对。以后别让孩子碰这些」',
          emotionalNote: '你听懂了蕴真的担忧——但你真的能做到吗',
          effect: { bond: 8, wisdom: 3 },
          rippleHint: '蕴真看了你一眼：「你能保证吗？」——你没法保证。这句话像一根刺，扎了你很多年',
          condition: null
        },
        {
          label: 'C',
          direction: '把小弓挂到大弓旁边',
          emotionalNote: '不当回事的轻率——你没看到蕴真眼里的暗',
          effect: { bond: -5 },
          rippleHint: '蕴真没阻拦。但从那天起她不怎么让蓝玉单独抱孩子了。蓝玉没察觉，但你察觉了——家里多了一层薄薄的客气',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '蓝玉没有恶意，但他的善意本身就变成了危险信号。蕴真藏弓的动作是淮西线「最先看清制度」的标志性细节。同一天锦衣卫设立——监控从此制度化。小弓是贯穿全线的记忆锚点。'
    },


// ────────────────────────────────────────────────────────
// EA-HW-6 旧部凋零 (T20, 1383) [喘息-美好]
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-6',
  title: '旧部凋零',
  triggerTurn: 20,
  year: 1383,
  coreEvent: '淮西旧部被贬散各处，周大哥来辞行要去云南，蓝玉送了一把旧弓。',
  emotionalArc: '孤独·不安→珍惜→离愁',
  keyBeats: [
    '蓝玉在后院转酒碗不喝——「圈子越来越小了」',
    '周大哥穿旧军装来辞行——瘦了一圈，被调去云南边防线',
    '「小子，以后没人陪你喝酒了」——拍肩的力气比以前小了',
    '蓝玉从怀里掏出旧弓——「拿着。比刀值钱。」'
  ],
  requiredNPCs: ['蓝玉', '周大哥'],
  memoryItem: '蓝玉送的弓',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蓝玉或周大哥的对话中，提取关于「散了/活着/念想」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中后院，院子里有树',
    time: '下午，秋天',
    atmosphere: '阳光温暖但人已经不齐了。院子里的树叶子在落，但阳光还是好的——温暖中带着凋零感',
    requiredElements: ['酒碗（没喝）', '周大哥的旧军装', '蓝玉的旧弓', '院子里的树'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '热泪盈眶']
  },
  characterDirective: {
    '蓝玉': {
      state: '老了。不是体力上的老，是心里开始空了。旧部一个一个被调走',
      speechStyle: '话少了。说出来的每句都沉。不骂人了',
      physicalDetails: ['手里转着酒碗但没喝', '摸了摸腰间——曾经挂短刀的位置今天没带']
    },
    '周大哥': {
      state: '被调去云南，来辞行。比以前瘦了一圈',
      speechStyle: '还是笑着说话，但力气不如从前。拍肩都轻了',
      physicalDetails: ['穿着旧军装', '瘦了一圈', '拍肩的力气比以前小了']
    }
  },
  toneDirective: {
    overall: '温暖但哀伤——像一个秋天的好天气，你知道冬天要来了',
    technique: '用物件（弓、酒碗、旧军装）承载离愁。动作变轻（拍肩力气小了、转碗不喝）暗示衰老',
    pacing: '慢。这是喘息节点，要让读者感受到这段时光的珍贵'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '珍重收下——把弓挂到书房墙上，每天看到',
      emotionalNote: '接受舅舅的心意。弓从此刻开始成为情感载体',
      effect: { bond: 5, huaixi: 5 },
      rippleHint: '弓挂在墙上了。张蕴真看到后没说什么，只是每天擦一遍弓身上的灰',
      condition: null
    },
    {
      label: 'B',
      direction: '送别周大哥——送到城门口',
      emotionalNote: '对周大哥的情义。但他不让你送——「又不是死了」',
      effect: { bond: 5, people: 3 },
      rippleHint: '周大哥没让你送。「又不是死了。」他笑了笑，但你看到他转过身去的时候抹了下眼角',
      condition: null
    },
    {
      label: 'C',
      direction: '直问蓝玉——「舅舅，你怕不怕？」',
      emotionalNote: '一个打破默契的问题。蓝玉不会承认，但这个问题他记住了',
      effect: { wisdom: 5, bond: 3 },
      rippleHint: '蓝玉愣了一下。「怕？我蓝玉什么时候怕过？」但他的声音不如从前响了',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '喘息-美好节点。建立弓的情感意义——T32它见证温暖，T40它变成背叛的证据，T55它被挂回原位。'
},

// ────────────────────────────────────────────────────────
// EA-HW-7 权印之重 (T25, 1384)
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-7',
  title: '权印之重',
  triggerTurn: 25,
  year: 1384,
  coreEvent: '主角第一次签了不公正的军功裁定。回家沉默，蕴真做了一顿特别咸的饭。',
  emotionalArc: '麻木→沉默→隐痛',
  keyBeats: [
    '面无表情坐在桌前——「没事」',
    '蕴真做的饭特别咸——她的焦虑用味道说话',
    '「今天盐放多了」——放下筷子看着你',
    '「你爹当年就是因为签了一个不该签的字，才被人抓住了把柄」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '特别咸的饭',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「变化/父亲/签字」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中饭桌、堂屋',
    time: '晚饭时间',
    atmosphere: '沉闷。一个沉默的男人和一个不敢问的妻子。饭桌上的菜很咸',
    requiredElements: ['饭桌', '特别咸的菜', '墙上的弓', '灶房的干辣椒'],
    forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '义正言辞地训斥']
  },
  characterDirective: {
    '张蕴真': {
      state: '察觉到了丈夫的变化，但不敢直接问。用做饭放多盐来表达焦虑',
      speechStyle: '试探性的。先用日常话题开场（盐放多了），再慢慢切入正题。提到公公时声音会变低',
      physicalDetails: ['夹了口菜', '放下筷子看着你', '沉默']
    }
  },
  toneDirective: {
    overall: '压抑的家庭戏——不是争吵，是两个人之间越来越厚的墙',
    technique: '用「咸」这个味觉细节替代一切心理描写。沉默>对话。物件（墙上的弓、灶房的辣椒）暗示曾经的温暖还在',
    pacing: '极慢。饭桌上每一口饭之间都要有停顿'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '无奈辩护——「我知道。但有些事，不做不行」',
      emotionalNote: '不是狡辩，是身不由己。但蕴真听到的是「你知道你还做」',
      effect: { power: 3, bond: -3 },
      rippleHint: '蕴真没再说什么。但从那天起，她做饭不再放那么多盐了——像是某种无声的妥协',
      condition: null
    },
    {
      label: 'B',
      direction: '部分认错——「你说得对。我回去再看看」',
      emotionalNote: '不是彻底回头，但至少还在挣扎。这个挣扎让蕴真看到 hope',
      effect: { wisdom: 5, bond: 5 },
      rippleHint: '你重新看了那份裁定。改不了——但至少在呈文里加了一句「此人战功有据」。上司不太高兴，但也没说什么',
      condition: null
    },
    {
      label: 'C',
      direction: '粗暴拒绝——「你不懂朝堂的事」',
      emotionalNote: '把蕴真推开。这是朝堂逻辑入侵家庭的第一步',
      effect: { bond: -8, power: 3 },
      rippleHint: '蕴真把碗收了。那天晚上她没再跟你说话。你在书房坐了很久——墙上的弓还挂着，辣椒还挂在灶房',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '沉默的腐化节点。不是大恶，是第一次妥协。蕴真的饭咸是她的焦虑——她感觉到了变化。'
},

// ────────────────────────────────────────────────────────
// EA-HW-8 军中旧歌 (T32, 1387) [喘息-美好]
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-8',
  title: '军中旧歌',
  triggerTurn: 32,
  year: 1387,
  coreEvent: '蓝玉酒后念亡者名字，周大哥唱军歌唱哭了，蕴真默默温酒。全淮西线最温暖的时刻。',
  emotionalArc: '温暖·脆弱→珍惜→隐痛',
  keyBeats: [
    '蓝玉微醺念名字——一个一个念，念到第七个停了',
    '周大哥唱军歌——唱着唱着眼眶红了',
    '蓝玉拍着周大哥的肩——「老周，咱还活着，这就够了」',
    '蕴真默默多温了一壶酒端进来，在你旁边坐下靠着肩膀',
    '蓝玉拉着周大哥的手说「你也老了」'
  ],
  requiredNPCs: ['蓝玉', '周大哥', '张蕴真'],
  memoryItem: '军歌',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蓝玉或周大哥的对话中，提取关于「活着/弟兄/老了」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋，隔壁厨房',
    time: '夜晚，酒过三巡',
    atmosphere: '温暖如炉火——但炉火是残的。几个老兵坐在一起，用酒和歌对抗外面的寒冬。要有「最后的温暖」的感觉',
    requiredElements: ['酒壶（至少两壶）', '周大哥的歌声', '蓝玉的酒碗', '蕴真端酒进来的身影'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '热泪盈眶']
  },
  characterDirective: {
    '蓝玉': {
      state: '微醺。比平时柔软，比平时脆弱。他在念死去弟兄的名字',
      speechStyle: '声音低沉。不骂人了。说出来的话像叹息',
      physicalDetails: ['微醺', '念名字时一个一个念', '拍着周大哥的肩', '拉着周大哥的手']
    },
    '周大哥': {
      state: '从边境回来探亲。唱军歌时眼眶红了',
      speechStyle: '用歌声代替说话。开口时声音是稳的，唱着唱着就颤了',
      physicalDetails: ['唱着唱着眼眶红了', '抹了把眼睛']
    },
    '张蕴真': {
      state: '在隔壁听到了一切。不说一句话，用行动表达',
      speechStyle: '全程几乎不说话。端酒进来，坐下，靠着——动作就是台词',
      physicalDetails: ['默默温酒', '端着酒壶进来', '在你旁边坐下', '靠着你肩膀']
    }
  },
  toneDirective: {
    overall: '全淮西线最温暖的时刻。温暖到让人心痛——因为你知道这一切会被摧毁',
    technique: '用声音层次构建氛围：歌声、低语、沉默。蕴真不说话但她的存在就是温度。蓝玉念名字是安魂曲',
    pacing: '极慢。这是喘息节点，要让读者想永远停在这一刻'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '共饮致敬——给两人各倒一碗，「活着就好」',
      emotionalNote: '加入这个温暖。此刻你们是真正的兄弟',
      effect: { bond: 8, huaixi: 5 },
      rippleHint: '三个人喝到深夜。蓝玉走的时候在门口回头说了句「小子，谢谢你」。这是你第一次听他说谢谢',
      condition: null
    },
    {
      label: 'B',
      direction: '握住蕴真的手——什么都没说',
      emotionalNote: '在兄弟和妻子之间，你选择了握妻子的手。蓝玉看到了，他理解了',
      effect: { bond: 10 },
      rippleHint: '蕴真把头靠在你肩上更紧了些。蓝玉看到了，笑了笑：「你小子，比我当年强。」',
      condition: null
    },
    {
      label: 'C',
      direction: '劝蓝玉收手——「你有没有想过……收手？」',
      emotionalNote: '理性的关怀，但在这个场合不合时宜。蓝玉知道你是对的，但他不能接受',
      effect: { wisdom: 5, bond: 3 },
      rippleHint: '蓝玉看了你一眼。「收手？收什么手？」他笑了笑，但笑意没到眼底。「小子，你比我聪明。但有些事，不是聪明能解决的。」',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '喘息-美好节点。这是全淮西线最温暖的时刻——三个人、一壶酒、一首军歌。T40签字后这一切都会变成刀。'
},
// --------------------------------------------------------
// EA-HW-NEW-C 蓝玉交兵 (T33, 1388)
// --------------------------------------------------------
{
      id: 'EA-HW-NEW-C',
      title: '蓝玉交兵',
      triggerTurn: 33,
      year: 1388,
      coreEvent: '蓝玉北伐凯旋（捕鱼儿海大捷），必须立刻交还兵权。凯旋宴上他骄傲地介绍收降的蒙古将领；回到家喝酒，交出兵符，沉默了。',
      emotionalArc: '凯旋的荣光→骄傲的展示→交兵的沉默→无力',
      keyBeats: [
        '凯旋宴上蓝玉拉着两个蒙古降将走过来——高个子的俺木帖木儿，满脸刀疤的另一个。「这是咱收的。以后就是咱的弟兄了！」',
        '那两个蒙古将领站姿笔直、表情恭敬，但眼神里有种说不清的东西——他们在大明军中找到了新位置，而这个位置是蓝玉给的',
        '蕴真看到了。晚上她小声说了一句：「他收那么多人干什么？」',
        '蓝玉来你家喝酒，把兵符放在桌上，像放下一块石头：「你说，咱把兵权交出去，他们是不是就放心了？」',
        '「那些蒙古弟兄……也不知道以后怎么办。我交了兵，他们归谁？」——他替弟兄们不安，却还不知道这些人会变成他自己的罪证'
      ],
      requiredNPCs: ['蓝玉「, 」张蕴真'],
      memoryItem: '兵符',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蓝玉交兵时的对话中，提取关于「交出兵权/蒙古弟兄怎么办」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '凯旋宴 → 家中酒桌',
        time: '白天凯旋宴，夜晚家中对饮',
        atmosphere: '上半场是凯旋的荣光与骄傲，下半场是交兵的沉默——同一场大捷的两种温度',
        requiredElements: ['兵符「, 」蒙古降将的脸（高个子与刀疤脸）「, 」蓝玉放在桌上的手「, 」空酒碗'],
        forbiddenPatterns: ['心中涌起暖流「, 」豪情万丈「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '蓝玉': {
          state: '上半场满脸红光、意气风发；下半场劲头过去，露出卸下重担后的虚弱',
          speechStyle: '凯旋时嗓门大，介绍蒙古降将时像在炫耀自家孩子；回家后声音低下来，每句话都带着试探',
          physicalDetails: ['拍着高个子的肩介绍「, 」把兵符放在桌上像放一块石头「, 」说「他们归谁」时看着兵符']
        },
        '张蕴真': {
          state: '在凯旋宴上沉默旁观，回家后只说了一句轻话——她看到了蓝玉看不到的',
          speechStyle: '话少，点到为止。用问句代替判断',
          physicalDetails: ['宴席上没说话「, 」晚上小声说「他收那么多人干什么」']
        }
      },
      toneDirective: {
        overall: '荣光与沉默的双重奏——凯旋是真，交兵是真，不安也是真',
        technique: '用「兵符像石头」做核心意象。蓝玉对蒙古弟兄的担心，正是他自己未来的罪证',
        pacing: '上半场快而热闹，下半场慢而沉重。交出兵符的那一瞬要停顿'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「交了就好。以后安安稳稳」',
          emotionalNote: '天真的安慰——你以为交出兵权就安全了',
          effect: { bond: 3 },
          rippleHint: '蓝玉苦笑：「安稳？你以为交了他们就信了？」——他知道答案。你不知道',
          condition: null
        },
        {
          label: 'B',
          direction: '「舅舅，你该学学汤和」',
          emotionalNote: '你真心为他好，但踩到了他的痛处',
          effect: { bond: -5, wisdom: 3 },
          rippleHint: '蓝玉脸色变了：「汤和？汤和是把骨头都抽掉了。我蓝玉做不到」——他宁可死也不愿自污。T38李善长案时你想起这句话',
          condition: null
        },
        {
          label: 'C',
          direction: '沉默——给他倒酒',
          emotionalNote: '你什么都知道，但什么都说不出来',
          effect: { bond: 8 },
          rippleHint: '蓝玉看了你一眼：「你不说话，说明你知道。你知道也帮不了。」他端起酒喝了。那晚他喝得比平时多',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '临时派将制度+防范降人网络的双重运作。蓝玉的骄傲展示蒙古降人，是他的军事才能；几年后这些人全变成他的「蓝党名单」。与T41蓝玉案形成因果链——那些笑脸从骄傲变成罪证。'
    },
// --------------------------------------------------------
// EA-HW-NEW-F 蓝玉的新兄弟 (T35, 1390)
// --------------------------------------------------------
{
      id: 'EA-HW-NEW-F',
      title: '蓝玉的新兄弟',
      triggerTurn: 35,
      year: 1390,
      coreEvent: '蓝玉北伐凯旋后，收降的蒙古将领开始在南京活动。蓝玉府上宴席间，他拍着蒙古降将的肩介绍：「蒙古人能替咱打仗——这叫什么？化敌为用！」蕴真却看到了另一面。',
      emotionalArc: '骄傲→不安→预见',
      keyBeats: [
        '蓝玉府上酒过三巡，蓝玉炫耀他的蒙古降将——也速迭尔、买的里八剌、一个叫阿速台的百户。他们穿着明军号衣，行蒙古礼',
        '你认出阿速台——之前在蒙古左右卫见过他，他原来是蒙古左卫的旧部，被调入蓝玉麾下北伐',
        '蕴真听你说了宴会的事，她说：「他收了不该收的人。」',
        '「也速迭尔、阿速台——这些人是蓝玉「自己的人」。在战时这叫「化敌为用」。在现在——这叫「私蓄异族部曲」。」',
        '你想到蒙古左右卫：阿速台从蒙古左右卫调到蓝玉麾下——两条线在这里焊接'
      ],
      requiredNPCs: ['蓝玉「, 」张蕴真'],
      memoryItem: '阿速台的笑脸',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蓝玉炫耀蒙古降将与蕴真预警的对话中，提取关于「化敌为用/私蓄异族部曲」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '蓝玉府上宴席 → 回家后',
        time: '夜晚，酒过三巡',
        atmosphere: '宴席上热闹喧嚣，蒙古降将们的笑脸在灯火下明暗不定；回家后蕴真的话让热闹褪色',
        requiredElements: ['蒙古降将（也速迭尔/阿速台）「, 」明军号衣「, 」蒙古礼「, 」蕴真放下筷子的动作'],
        forbiddenPatterns: ['心中涌起暖流「, 」豪情万丈「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '蓝玉': {
          state: '得意洋洋，觉得自己收降蒙古人是天大的功劳，完全看不到风险',
          speechStyle: '嗓门大，反复强调「化敌为用」四个字，拍着降将的肩哈哈大笑',
          physicalDetails: ['拍着也速迭尔的肩介绍「, 」举起酒碗向蒙古降将示意「, 」满脸红光']
        },
        '张蕴真': {
          state: '冷静到近乎无情——她是全家唯一看到陷阱的人',
          speechStyle: '不用形容词，只用名词。把「自己的人」「私蓄异族部曲」说得像账目一样清楚',
          physicalDetails: ['听你说完宴会的事没笑「, 」放下筷子「, 」看着你说了那句话']
        }
      },
      toneDirective: {
        overall: '蓝玉的骄傲与蕴真的冷静的碰撞——同一个动作，制度翻转前后定性完全相反',
        technique: '用「化敌为用」vs「私蓄异族部曲」的对仗做核心。蕴真的一句话比蓝玉的十句都重',
        pacing: '宴席部分热闹快节奏，回家后骤然安静。蕴真的话要一个字一个字地说'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '为蓝玉高兴——「舅舅收了多少能人！」',
          emotionalNote: '你真心为舅舅高兴，没看见蕴真的沉默',
          effect: { bond: 5 },
          rippleHint: '蓝玉拍你肩膀：「你小子有眼光！也速迭尔一个人能打三个！」蕴真在旁边没说话——她的沉默比反对更重',
          condition: null
        },
        {
          label: 'B',
          direction: '想起蕴真的话——「这些人以后都是他的「党」」',
          emotionalNote: '你被蕴真的话击中，开始看到蓝玉看不到的',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '你回家后反复想这句话。你看向窗外——蓝玉府的灯还亮着。那些蒙古降将还没走。T41蓝玉案爆发时，你想起那晚的灯',
          condition: null
        },
        {
          label: 'C',
          direction: '问阿速台——「你怎么从蒙古左卫调到舅舅这的？」',
          emotionalNote: '你隐约感到两张网在交织，想确认',
          effect: { wisdom: 3 },
          rippleHint: '阿速台：「军令。上头调的。」他笑了笑。「蓝将军对我们好——比蒙古左卫强。」你不知道这句话日后会变成「蓝党」的证据',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '淮西线与前元线的焊接点：阿速台从蒙古左右卫调入蓝玉麾下——前元线主角的表兄也可能在这张人员流动网中。蓝玉案爆发（T41）时，这些蒙古降将变成「蓝党」，前元线表兄也会因「曾在蒙古左右卫服役」被追算。'
    },
// --------------------------------------------------------
// EA-HW-NEW-D 李善长案 (T38, 1390)
// --------------------------------------------------------
{
      id: 'EA-HW-NEW-D',
      title: '李善长案',
      triggerTurn: 38,
      year: 1390,
      coreEvent: '李善长（77岁，「勋臣第一」）被赐死，满门七十余口被杀。消息传来时，蓝玉正在你家喝酒。他放下酒杯，很久没说话。然后说了一句：「连他都不行。」',
      emotionalArc: '震惊→恐惧→绝望→沉默',
      keyBeats: [
        '消息传来：李善长被赐死，七十七岁，满门七十余口',
        '蓝玉在你家喝酒——听到消息后放下酒杯，沉默了很久',
        '「连他都不行。」——蓝玉的声音很轻，但比任何怒吼都重',
        '蕴真听到了。晚上她说：「连「勋臣第一」都保不住自己。我们算什么？」',
        '你想起李善长——淮西文臣之首。他在，淮西文武还有个呼应。他不在，武将就是孤的了'
      ],
      requiredNPCs: ['蓝玉「, 」张蕴真'],
      memoryItem: '蓝玉的酒杯',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蓝玉听到李善长案消息后的对话中，提取关于「连他都不行」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中酒桌',
        time: '消息传来的当日',
        atmosphere: '酒桌上的热气还没散，消息像一盆冷水浇下来——整个屋子瞬间安静',
        requiredElements: ['酒杯（蓝玉放下的那一杯）「, 」满门七十余口的消息「, 」蓝玉沉默的背影「, 」蕴真收碗的手'],
        forbiddenPatterns: ['心中涌起暖流「, 」愤慨激昂「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '蓝玉': {
          state: '被消息击中，露出少见的虚弱——「勋臣第一」都保不住自己，他看到了自己的结局',
          speechStyle: '话极少。只有一句「连他都不行」——声音很轻，像自言自语',
          physicalDetails: ['放下酒杯「, 」很久没说话「, 」说完后把酒杯转了一圈']
        },
        '张蕴真': {
          state: '在旁边听到了，晚上才说话——她的恐惧比蓝玉更清醒',
          speechStyle: '用问句说话。她的问题没有答案，也不需要答案',
          physicalDetails: ['在旁边听到「, 」晚上说「我们算什么」「, 」收碗时手指在碗沿上停了一下']
        }
      },
      toneDirective: {
        overall: '从热闹到死寂的急转——李善长案是四线交汇的大事件，淮西线看到的是「连他都不行」',
        technique: '用蓝玉的「沉默」和「连他都不行」一句做全部。话越少越重',
        pacing: '消息传来前是日常酒桌的热闹，消息后骤然放慢。每一秒沉默都在放大'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '蓝玉说「该去吊个唁」——你去了',
          emotionalNote: '淮西人的义气，但你没想过灵堂里有什么',
          effect: { bond: 8, power: -5 },
          rippleHint: '你去了——但锦衣卫在灵堂记录了所有来客名单。「来吊唁的人，都是李善长一党。」T41清算时你的名字在名单上',
          condition: null
        },
        {
          label: 'B',
          direction: '「不去。谁都不去」',
          emotionalNote: '你选择自保，但心里过不去',
          effect: { power: -3 },
          rippleHint: '蓝玉看了你一眼：「不去？人家为大明打了一辈子。」你沉默了。那晚蓝玉喝了很多酒，走的时候脚步不稳',
          condition: null
        },
        {
          label: 'C',
          direction: '问蓝玉：「舅舅，我们怎么办？」',
          emotionalNote: '你第一次向舅舅承认害怕',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '蓝玉苦笑：「怎么办？等死呗。」——他第一次说出「等死」两个字。T41蓝玉案爆发时，这两个字是你们最后的对话之一',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '淮西集团从「文武双核心」崩塌成「只剩武将」。李善长的死让淮西武将彻底失去文官保护伞——从此武将只能面对皇帝，没有任何缓冲。T38四线交汇：淮西「连他都不行」、浙东「道断了」、商贾「一匹绢」、前元「果然通虏/该走了」。'
    },


// ────────────────────────────────────────────────────────
// EA-HW-9 唇亡齿寒 (T38, 1389) [被摧毁的美好]
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-9',
  title: '唇亡齿寒',
  triggerTurn: 39,
  year: 1390,
  coreEvent: '李善长案后人人自危。蕴真回来说「下一个是谁」，蓝玉传来一句话像遗言。',
  emotionalArc: '恐惧升级·温暖变质→绝望',
  keyBeats: [
    '蕴真回来把门关上，背靠门板站了一会儿——恐惧写在动作里',
    '「李太师……满门抄斩了」「下一个是谁？」',
    '蓝玉派人传话——「小子，你舅舅还活着」——这话本身就像遗言',
    '主角答不上来「下一个是谁」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '门板',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「下一个/舅舅/活着」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中，门边',
    time: '白天，但屋内阴暗',
    atmosphere: 'T32温暖的全部变质。同样是家，但空气里只有恐惧。门被关上的声音要重',
    requiredElements: ['门板', '苍白的脸色', '蓝玉的口信'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '义愤填膺地反抗']
  },
  characterDirective: {
    '张蕴真': {
      state: '极度恐惧但还在撑着。从娘家回来，脸色苍白。她不是吓大的——她是军营里长大的，所以她比谁都清楚这意味着什么',
      speechStyle: '声音很轻但很直白。不说废话。每个问句都是短句',
      physicalDetails: ['脸色苍白', '背靠着门板站了一会儿', '把门关上']
    }
  },
  toneDirective: {
    overall: '被摧毁的美好——T32的温暖在此全部变成恐惧。同样的家，不同的气氛',
    technique: '用T32的回响反衬此刻的恐惧。蕴真的问句像钉子一样一个个钉进来。主角的沉默就是回答',
    pacing: '快。对话紧凑，不给喘息空间。但主角的沉默处要停'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '去看蓝玉——「我去看舅舅」',
      emotionalNote: '义气驱动，但可能是最危险的选择',
      effect: { bond: 5, huaixi: 5, power: -5 },
      rippleHint: '蓝玉不在家。下人说「将军出去了，没说要回」。你在书房等了一夜。第二天他回来了，什么都没说，只是拍了拍你的肩',
      condition: null
    },
    {
      label: 'B',
      direction: '按兵不动——「现在不能动。动了全家都完了」',
      emotionalNote: '理性的选择。但蕴真看你的眼神和T11一模一样——她理解你，但失望也一模一样',
      effect: { wisdom: 5, bond: -5 },
      rippleHint: '蕴真看了你一眼。那个眼神和T11一模一样——她理解你，但她的失望也一模一样',
      condition: null
    },
    {
      label: 'C',
      direction: '让蕴真带孩子走——「你带孩子回娘家住几天」',
      emotionalNote: '保护家人的本能。但蕴真不是会走的人——她是军营里长大的',
      effect: { bond: 3, wisdom: 3 },
      rippleHint: '蕴真没动。「我不走。你要死一起死。」她的声音很平，但你知道她不是吓大的——她是军营里长大的',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '被摧毁的美好节点。恐惧升级——T32的温暖在此开始变质。「你舅舅还活着」这句话本身就是倒计时。'
},

// ────────────────────────────────────────────────────────
// EA-HW-10 定罪文书 (T41, 1391) [亲手伤害] ★★★
// ────────────────────────────────────────────────────────
// v3.15.0增强：融入原EA-HW-NEW-E「蒙古弟兄」内容——蓝玉收降的蒙古将领名字出现在"蓝党"名单上，
// 淮西线与前元线在此焊接（T33蓝玉骄傲介绍蒙古降将 → T41这些名字变成罪证）
{
  id: 'EA-HW-10',
  title: '定罪文书',
  triggerTurn: 41,
  year: 1391,
  coreEvent: '主角签下周大哥的「通敌」指证文书。翻到下一页——蓝玉收降的蒙古将领名字也列在「蓝党」名单上。蕴真看到签字，从墙上取下蓝玉送的弓放在桌上。',
  emotionalArc: '撕裂·背叛→沉默的悲恸',
  keyBeats: [
    '拿到文书时手在抖——周大哥的名字在名单上',
    '笔尖悬在纸上方很久。然后签了',
    '翻到下一页——俺木帖木儿、阿速台……T33凯旋宴上蓝玉拍着肩膀骄傲介绍的那几个蒙古降将，全列在上面。那个笑脸现在变成了纸上的名字',
    '想起T33凯旋宴——蓝玉拍着高个子的肩：「这是俺木帖木儿，元朝宗室后裔！打北元的时候他第一个投降——现在替咱大明打仗了！」',
    '回家时蕴真看到文书上的签字——「你签了。」不是质问，是陈述',
    '蕴真走到墙边取下弓放在桌上——弓弦嗡地响了一声',
    '蕴真：「他收的那些弟兄，现在全变成他的罪了。」——她早就看出来了。T33那天晚上她就说过「他收那么多人干什么」',
    '「他以前每次来喝酒，都要摸这把弓。说『这是将军的弓，比我的命还值钱。』」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '弓（从墙上取下）',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「弓/周大哥/蒙古弟兄/念想」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋，桌上放着弓',
    time: '夜晚，签字后回家',
    atmosphere: '死寂。不是争吵后的安静——是某种东西彻底碎了的安静。弓弦那一声嗡响是全屋唯一的声音',
    requiredElements: ['文书（签字）', '「蓝党」名单上的蒙古降将名字（俺木帖木儿/阿速台）', '弓（从墙上取下放在桌上）', '弓弦的嗡响'],
    forbiddenPatterns: ['美化签字行为', '为主角开脱说「这是为了家人」', '心中涌起暖流', '义正言辞的自我辩解', '英雄式的痛苦独白']
  },
  characterDirective: {
    '张蕴真': {
      state: '没有哭。没有闹。比任何歇斯底里都可怕——她已经接受了事实',
      speechStyle: '声音很轻。不是质问的语气，是陈述事实的语气。用周大哥说过的话来让你记住你做了什么',
      physicalDetails: ['声音很轻', '走到墙边取下弓', '放在桌上', '弓弦嗡地响了一声']
    }
  },
  toneDirective: {
    overall: '全淮西线情感最高潮。不美化、不辩解——签字就是签字。痛要直接给读者',
    technique: '物件叙事：弓从T3挂上→T20蓝玉送出→T32见证温暖→此刻被取下。蕴真的沉默比任何台词都重。T6「不散」和T32「活着就够了」在此变成两把刀',
    pacing: '极慢。每个动作之间留大段空白。弓弦那一声嗡响之后要有一整段只写寂静'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '自我辩护——「我没有选择」',
      emotionalNote: '说的是事实。但蕴真听到的是「你在找借口」',
      effect: { power: 5, bond: -10 },
      rippleHint: '蕴真没回答。她把孩子抱到里屋去了。你一个人坐在桌前，弓放在你面前。你不敢看它',
      condition: null
    },
    {
      label: 'B',
      direction: '想碰弓——走过去想把弓拿起来',
      emotionalNote: '想触碰那段被自己毁掉的记忆。但蕴真不让你碰',
      effect: { bond: -5 },
      rippleHint: '蕴真挡在你面前。「别碰。」她的声音很轻，但你的手停住了。这是你第一次在她面前感到害怕',
      condition: null
    },
    {
      label: 'C',
      direction: '沉默承受——什么都没说，坐在弓旁边坐到天亮',
      emotionalNote: '不辩解、不逃避。这是唯一接近承担的方式。但承担不等于赎罪',
      effect: { bond: -3, wisdom: 3 },
      rippleHint: '蕴真在里屋一夜没睡。天快亮的时候你听到她在哭——但声音压得很低，不让你听到',
      condition: null
    }
  ],
  conditionalBeats: [
    {
      condition: 'EA-HW-2选A',
      beat: '弓身上有一道周大哥当年刻的痕迹——「不散」。现在那两个字还在',
      implication: 'T6拍桌说「不散」的义气，此刻变成了最锋利的嘲讽'
    },
    {
      condition: 'EA-HW-8选A',
      beat: '弓身上沾着那晚酒渍的痕迹——怎么擦都擦不掉',
      implication: 'T32最温暖的夜晚留在了弓上，现在这温暖变成了证据'
    },
    // v3.15.2-P2方案A：引用EA-HW-NEW-F选C（阿速台笑脸→名单上的名字）
    {
      condition: 'EA-HW-NEW-F选C',
      beat: '名单上阿速台的名字旁边，有一行小字——「原蒙古左卫百户，洪武二十二年调入蓝玉麾下」。你想起了T35宴席上阿速台的笑——「蓝将军对我们好——比蒙古左卫强。」那个笑现在变成了纸上的字',
      implication: 'T35阿速台说「比蒙古左卫强」时你不知道这句话会变成罪证。选C的玩家亲口问过他的来历——此刻看到他的来历被写在罪名旁边'
    },
    // v3.15.2-P2方案D：引用EA-HW-NEW-D选A（T38去灵堂被记录→T41红圈兑现）
    {
      condition: 'EA-HW-NEW-D选A',
      beat: '名单的最后一页有几个名字被红笔圈了——你认出其中一个：是T38李善长案时被牵连的蒙古降人。你想起那晚你去了灵堂——锦衣卫在灵堂门口记下了每一个来客的名字。当时你以为只是吊唁。现在你看到了——红圈就是死的标记',
      implication: 'T38选A去灵堂被锦衣卫记录来客名单——T41的「红圈」是这份名单的兑现。当时你觉得是礼节，现在它变成了罪名'
    }
  ],
  linksTo: null,
  designNote: '亲手伤害节点。全淮西线情感最高潮。「亲手」意味着——这是你签的字。T6的「不散」和T32的「活着就够了」在此变成了两把刀。'
},

// ────────────────────────────────────────────────────────
// EA-HW-5 最后之夜 (T46, 1393)
// ────────────────────────────────────────────────────────
// v3.15.0增强：蓝玉反思收降蒙古人——"打仗时是我的人，现在成了我的罪？"
{
  id: 'EA-HW-5',
  title: '最后之夜',
  triggerTurn: 46,
  year: 1393,
  coreEvent: '蓝玉案前夜，蓝玉来访。没有踢靴子，安静坐着。问了一句「咱这辈子值不值」。又问起那些收降的蒙古弟兄——他们成了他的罪。',
  emotionalArc: '告别·无法挽回→沉默的送别',
  keyBeats: [
    '蓝玉来了——没有踢靴子。他坐在你面前，很安静',
    '蕴真端了酒来，他接过碗没喝。沉默了很久',
    '「小子，你说咱这辈子值不值？」',
    '说起蒙古降将——声音低了下去：「俺木帖木儿……阿速台……打仗的时候是我的人。现在成了我的罪？」',
    '「我收他们的时候，想的是咱大明多了几个能打的弟兄。谁知道——他们全上了那张名单。我连累他们了。」',
    '「我收的那些弟兄，好歹还在一块儿。」',
    '「蒙古左卫——散了？」',
    '「我知道你要说什么。『忍一忍』。我记着呢。」——对T6选C的回响'
  ],
  requiredNPCs: ['蓝玉'],
  memoryItem: '背影',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蓝玉的对话中，提取关于「值不值/忍/这辈子」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋',
    time: '深夜，月光从窗外照进来',
    atmosphere: '异常的安静。蓝玉以前来都是踢靴大嗓门，今天像换了一个人。这是告别的夜晚',
    requiredElements: ['酒碗（接过没喝）', '窗外的月亮', '蓝玉安静的坐姿'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '慷慨激昂的遗言']
  },
  characterDirective: {
    '蓝玉': {
      state: '知道一切要结束了。不再愤怒，不再豪爽。他来这里不是为了告别——是为了问一个问题',
      speechStyle: '声音很轻。比以前任何时候都轻。像在自言自语',
      physicalDetails: ['没有踢靴子', '接过碗没喝', '看了看窗外的月亮', '又看回你']
    },
    '张蕴真': {
      state: '端酒进来。什么都懂，什么都不说',
      speechStyle: '沉默',
      physicalDetails: ['端了酒来', '从里屋出来，眼眶红了']
    }
  },
  toneDirective: {
    overall: '淮西线终局。不是壮烈的告别——是一个老兵来问一个他永远得不到答案的问题',
    technique: '沉默>台词。蓝玉的反常（不踢靴、不喝酒）比任何台词都更有重量。用T6的回响制造因果感',
    pacing: '极慢。每个节拍之间的空白要长。这是最后一次了'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '劝他逃跑——「舅舅，你走吧。现在就走。我替你备马」',
      emotionalNote: '最后的义气。但蓝玉不会走——他是蓝玉',
      effect: { bond: 15, power: -20 },
      rippleHint: '蓝玉摇头。「走？走到哪去？」他拍了拍你的肩，走了。第二天他被抓。你因为「不知情」没被牵连——但你一辈子记得你没追上他',
      condition: null
    },
    {
      label: 'B',
      direction: '抱住他——站起来，什么都不说',
      emotionalNote: '不需要语言的告别。蓝玉推开了你——但他记住了',
      effect: { bond: 10 },
      rippleHint: '蓝玉愣了一下。然后他推开你，笑了笑：「行了，又不是没见过死人。」他走了。蕴真从里屋出来，眼眶红了。她什么都没问',
      condition: null
    },
    {
      label: 'C',
      direction: '只说保重——「舅舅……保重」',
      emotionalNote: '最轻的告别。也是最重的。蓝玉的那个眼神比任何话都沉',
      effect: { bond: -5, power: 5 },
      rippleHint: '蓝玉看了你一眼。那个眼神比任何话都重。他走了。你站在门口看着他的背影消失在巷子里。张蕴真在后面说：「你不去送送？」你说：「送了就是死。」她沉默了很久',
      condition: null
    }
  ],
  conditionalBeats: [
    {
      condition: 'EA-HW-2选A',
      beat: '蓝玉临走说了句「你放心，我不会连累你。我蓝玉一个人做事一个人当」',
      implication: 'T6选A建立的深厚义气，让蓝玉在最后时刻还在保护你'
    },
    {
      condition: 'EA-HW-2选C',
      beat: '蓝玉临走说了句「当年你说得对。可现在说什么都晚了」',
      implication: 'T6选C的「忍一忍」在此回响——蓝玉记住了，但已经太迟'
    }
  ],
  linksTo: '蓝玉案',
  designNote: '淮西线终局。回合6的选择在此刻回响。蓝玉案后进入结算。'
},

// ────────────────────────────────────────────────────────
// EA-HW-11 老弓犹在 (T55, 1394)
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-11',
  title: '老弓犹在',
  triggerTurn: 55,
  year: 1394,
  coreEvent: '蓝玉案多年后，蕴真擦干净那把弓，说「用不着了」，把它挂回了T3搬家时挂弓的位置。',
  emotionalArc: '余痛·接受→温柔的收尾',
  keyBeats: [
    '蕴真从柜子里取出弓——从T40签字那天就一直放在桌上',
    '擦了擦弓弦，灰尘已经落了很厚',
    '「用不着了」「周大哥的事……我不怪你」「但我也不想再看到它了」',
    '走到墙边——那个T3搬家时挂弓的位置——把弓挂了回去',
    '「就放这吧。」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '弓（挂回墙上）',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「弓/不怪/放下/挂回去」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中书房，墙边那个挂了二十二年弓的位置',
    time: '白天，平静的一天',
    atmosphere: '尘埃落定。不是悲伤——是一种比悲伤更复杂的东西。阳光照在墙上那个空了很久的钉子位置',
    requiredElements: ['弓（漆已裂）', '墙上的钉子位置', '灰尘', '蕴真擦弓的动作'],
    forbiddenPatterns: ['心中涌起暖流', '不禁感慨万千', '大团圆的和解', '痛哭流涕的释然']
  },
  characterDirective: {
    '张蕴真': {
      state: '多年以后，已经能平静地面对这一切。不怪你——但也不想再看到了',
      speechStyle: '声音平静。每句话都很短。不看你，看着弓说话。最后一句「就放这吧」是看着墙说的',
      physicalDetails: ['擦着弓弦', '弓身上的漆已经裂了', '走到墙边把弓挂回去']
    }
  },
  toneDirective: {
    overall: '温柔的收尾。不是大团圆——是一种「活下来了」的疲惫平静',
    technique: '物件叙事收尾：弓从T3挂上→T40取下→T55挂回。一个物件串联全线悲欢。「用不着了」是最温柔的收尾',
    pacing: '慢。但不沉重。是放下之后的慢——不是压迫，是轻盈'
  },
  choiceDirections: [
    {
      label: 'A',
      direction: '沉默站在她身后——什么都没说',
      emotionalNote: '此刻任何语言都是多余的。你的沉默是尊重',
      effect: { bond: 5 },
      rippleHint: '她挂好弓，拍了拍手上的灰。回头看了你一眼，嘴角动了一下——不是笑，是一种比笑更复杂的东西。然后她进厨房了',
      condition: null
    },
    {
      label: 'B',
      direction: '道谢——「蕴真。谢谢你」',
      emotionalNote: '谢谢你没怪我，谢谢你还在。但蕴真不需要感谢——她只是累了',
      effect: { bond: 8 },
      rippleHint: '蕴真没回头。「谢什么？」她的声音有点哑。「我只是……累了。」',
      condition: null
    },
    {
      label: 'C',
      direction: '把弓挂正——走过去，把弓重新挂正',
      emotionalNote: '用行动代替语言。弓在这个位置待了二十二年——从T3到T55',
      effect: { bond: 5, wisdom: 3 },
      rippleHint: '你把弓挂正了。它在那个位置上待了二十二年——从T3到T55。蕴真看着你把弓挂好，轻声说了句「以后不用再取了」',
      condition: null
    }
  ],
  conditionalBeats: [],
  linksTo: null,
  designNote: '被摧毁的美好→余震。弓从T3挂上去→T40被取下→T55挂回去。一个物件串联全线的悲欢。「用不着了」是最温柔的收尾。'
}
  ],

  // ──── 书生线：师道的重量（10个） ────
  '浙东寒门书生': [
// ════════════════════════════════════════════════════════
// 书生线（浙东寒门书生）—— 10个EA · 导演指令模式
// ════════════════════════════════════════════════════════

    {
      id: 'EA-ZD-1',
      title: '启蒙',
      triggerTurn: 3,
      year: 1375,
      coreEvent: '经筵结束后宋濂叫住主角，在宫墙老柏树下识破他读《春秋》时停顿的真实原因——在想亡父。',
      emotionalArc: '拘谨→意外→触动→归属感',
      keyBeats: [
        '宋濂带主角走过长长宫墙，夕阳把红墙染得更深，他走得很慢——六十七岁了',
        '在老柏树下停住，回头问「你父亲叫什么？」',
        '宋濂沉默片刻：「……我跟他同门。他走的那年，我没能赶上。」',
        '点破停顿的真相：「你读《春秋》的时候停了一下。你停的那一下，是在想你父亲。对不对？」'
      ],
      requiredNPCs: ['宋濂'],
      memoryItem: '老柏树',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从宋濂关于父亲与同门关系的对话中，提取一句涉及「同门」「赶上」或「你父亲」主题的原话作为keyQuote'
      },
      sceneDirective: {
        location: '宫墙内侧，一棵老柏树下',
        time: '经筵结束后的黄昏，夕阳西斜',
        atmosphere: '宫墙投下长影，柏树有松脂气味，远处有值事太监走过的脚步声',
        requiredElements: ['红墙夕照', '老柏树', '宋濂缓慢的步伐', '远处宫人走动声'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '一股莫名的感动']
      },
      characterDirective: {
        '宋濂': {
          state: '六十七岁的大儒，步伐缓慢但目光锐利，对亡友之子有克制的温情',
          speechStyle: '声音不高，语速慢，善于用沉默制造压力。问句比陈述句多。偶尔引用经典但不掉书袋',
          physicalDetails: ['步履缓慢', '在柏树下驻足回头', '目光停在主角脸上不动']
        }
      },
      toneDirective: {
        overall: '温厚中带着审视——宋濂在试探这个年轻人的骨头',
        technique: '动作>语言。沉默>表白。物件>形容词',
        pacing: '慢。宫墙行走的段落可以写得很长，用环境拉开对话前的张力'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '坦诚承认——说出父亲与《春秋》的故事',
          emotionalNote: '一个寒门书生对亡父的追忆，也是向恩师敞开自己',
          effect: { jinchen: 8, zhedong: 5 },
          rippleHint: '宋濂点了点头。从此他每月初一、十五在书房给你单独讲课。你成了他最后一个弟子',
          condition: null
        },
        {
          label: 'B',
          direction: '谦虚回避——「先生过奖了，只是想多认几个字」',
          emotionalNote: '寒门子弟的本能防御，不敢在权威面前敞开',
          effect: { jinchen: 3 },
          rippleHint: '宋濂笑了笑没再说什么。但此后经筵上他偶尔会多看你一眼',
          condition: null
        },
        {
          label: 'C',
          direction: '反向挑战——「停那一下是觉得孔子写得不太对」',
          emotionalNote: '少年意气与独立思考的锋芒，让宋濂看到了亡友的影子',
          effect: { wisdom: 8, jinchen: 5 },
          rippleHint: '宋濂愣了一下然后大笑——「好！好！你父亲也是这个脾气。」从此你们不只是师徒，还是论学的对手',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '让宋濂变成一个具体的人。老柏树是记忆锚点——后面所有书生线的回忆都可以回到这棵树下。'
    },

    {
      id: 'EA-ZD-2',
      title: '春风化雨',
      triggerTurn: 6,
      year: 1376,
      coreEvent: '宋濂在自家书房开小灶，林彦首次登场——大笑、纠正读音、争经义。宋濂讲起洪武元年面圣写诏书的往事，感叹「那是我跟皇上最亲近的时候」。',
      emotionalArc: '轻松→热烈→感伤→余韵',
      keyBeats: [
        '林彦出场：笑起来很大声，纠正你的读音，跟你为一句经义争得面红耳赤',
        '宋濂笑着看你们俩不插嘴——然后讲起洪武元年面圣写诏书，改了四遍的故事',
        '宋濂声音轻下来：「那是我跟皇上最亲近的时候。后来……他越来越不想看了。」',
        '林彦小声问「那现在的文章该写成什么样？」宋濂笑答「写成你们这样就行了。有劲。」'
      ],
      requiredNPCs: ['宋濂', '林彦'],
      memoryItem: '家乡茶',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从宋濂讲述面圣写诏书的段落中，提取关于「变了」「百姓」或「最亲近」主题的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '宋濂家中书房，书桌上摊着经卷',
        time: '午后，阳光从窗格斜照进来',
        atmosphere: '墨香混着茶香，书房里有旧纸和旧木头的气味，窗外偶尔有鸟叫',
        requiredElements: ['书房内景', '经卷与茶', '林彦的大笑声', '宋濂的苦笑'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '一股温热的暖流涌上心头']
      },
      characterDirective: {
        '宋濂': {
          state: '六十八岁，讲起往事时声音会变轻。不刻意伤感，但藏不住暮年的疲惫',
          speechStyle: '叙述往事时语调平稳，讲到关键处会停顿。苦笑多于真笑。对两个弟子的争论保持旁观者的笑意',
          physicalDetails: ['坐在椅子上微微前倾', '苦笑时嘴角的纹路', '倒茶时手略抖']
        },
        '林彦': {
          state: '比主角小两岁，精力充沛，刚入宋门不久，毫无防备心的率真',
          speechStyle: '声音大，语速快，敢直接反驳先生。小声嘀咕的时候反而比大声时更有分量。倒茶冒失洒一桌子',
          physicalDetails: ['笑起来很大声', '抢着倒茶洒了一桌子', '瞪眼争辩时脖子发红']
        }
      },
      toneDirective: {
        overall: '活力与暮色交织——林彦的明亮反衬宋濂的苍凉，但两者都是温暖的',
        technique: '用林彦的「动」对比宋濂的「静」。对话密度高但节奏不急',
        pacing: '前半段轻快（争经义），后半段放慢（宋濂的回忆），结尾收在林彦的「有劲」上'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '追问宋濂——「皇上变在哪？」',
          emotionalNote: '学生对先生往事的真诚好奇，触碰了一个危险的话题',
          effect: { wisdom: 5, jinchen: 5 },
          rippleHint: '宋濂沉默很久：「变在——他开始觉得，读书人没用了。」林彦小声说：「那我就写到他觉得有用为止。」',
          condition: null
        },
        {
          label: 'B',
          direction: '默记在心不作声',
          emotionalNote: '寒门书生的克制——听懂了但不敢接话',
          effect: { wisdom: 3 },
          rippleHint: '宋濂看了你一眼，给你倒了杯茶。林彦抢着倒的——洒了一桌子',
          condition: null
        },
        {
          label: 'C',
          direction: '转向林彦——「你那句经义说得不全对，改天再辩」',
          emotionalNote: '把注意力从沉重的话题拉到友谊上，是少年人特有的轻盈',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '林彦瞪了你一眼：「怎么不全对了？你说！」宋濂在旁边笑了——「好。你们俩以后有的是时间辩。」',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: 'v2微调：林彦出场的关键场景。大笑、纠正读音、争经义、倒茶洒桌——用行为而非描写让玩家喜欢上他。那杯茶在T12「师难」时会成为回响。'
    },

    {
      id: 'EA-ZD-3',
      title: '送别',
      triggerTurn: 9,
      year: 1379,
      coreEvent: '宋濂告老还乡，同僚设宴送行。有人讥讽宋濂失势，林彦当场拍桌出头。主角面临站队选择——是公开致敬还是明哲保身。',
      emotionalArc: '尴尬→愤怒→郑重→代价感',
      keyBeats: [
        '有人悄悄拉袖子警告：「宋学士圣眷正衰，你跟他走得太近怕是不妥」',
        '二十多人的宴席，一半人来看热闹蹭饭，有人小声说「宋学士完了」',
        '林彦拍桌而起：「先生的学问轮得到你来评？」你拉住他，他甩开你的手',
        '宋濂举杯：「我看的不是文章。我看的是——骨头。」目光停在你身上'
      ],
      requiredNPCs: ['宋濂', '林彦'],
      memoryItem: '骨头',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从宋濂的送别致辞中，提取「骨头」相关的原话作为keyQuote'
      },
      sceneDirective: {
        location: '城外别业，宴席大厅',
        time: '傍晚，宴席将散',
        atmosphere: '杯盘狼藉的前兆，酒气与菜味混杂，人声嘈杂但暗流涌动',
        requiredElements: ['宴席场景', '窃窃私语的旁观者', '林彦拍桌的声响', '宋濂举杯的姿态'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '义愤填膺']
      },
      characterDirective: {
        '宋濂': {
          state: '七十一岁，告老之际已看透人情冷暖。不怨不怒，只在看骨头',
          speechStyle: '对全场说话时语调平稳，不看那些来看热闹的人。只看着值得看的人说话',
          physicalDetails: ['举杯时手很稳', '目光越过人群停在主角身上', '笑容不是客气的笑']
        },
        '林彦': {
          state: '听到有人讥讽先生，怒火直冲，少年人的义气不加掩饰',
          speechStyle: '大声、直接、不留余地。被拉住时甩开对方的手，「拉什么？你不去我去！」',
          physicalDetails: ['拍桌子震得碗碟响', '甩开主角的手', '脖子发红']
        }
      },
      toneDirective: {
        overall: '热闹中的冷清——宴席是热的，人心是凉的，但几个人的骨头是硬的',
        technique: '群像与特写交替。用旁观者的冷漠反衬林彦的烈和宋濂的静',
        pacing: '前半段嘈杂快切（群像），拍桌后节奏放慢聚焦到宋濂的致辞'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '公开站队——走到宋濂面前举杯致敬',
          emotionalNote: '在所有人面前表明立场，代价是从此被某些人划了线',
          effect: { jinchen: 10, fame: 5, zhedong: 5 },
          rippleHint: '宋濂笑了——「果然没看错人」的笑。林彦在旁边使劲鼓掌。但从明天起，有些人会跟你保持距离',
          condition: null
        },
        {
          label: 'B',
          direction: '不去宴席，私下送茶',
          emotionalNote: '不是不敬，是寒门子弟在政治风险前的本能退缩',
          effect: { jinchen: 5 },
          rippleHint: '宋濂回字条：「好茶。但下次别这么客气。来就好。」林彦后来说：「你真怂。但茶送得好。」',
          condition: null
        },
        {
          label: 'C',
          direction: '不去不送——明哲保身',
          emotionalNote: '理性的选择，但代价是宋濂的失望——比愤怒更冷的东西',
          effect: { jinchen: -5, power: 3 },
          rippleHint: '宋濂没有怪你。但林彦冲到面前：「你连送都不去？枉先生教你一场！」此后经筵上宋濂不再看你',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: '胡惟庸案',
      designNote: 'v2微调：林彦替你拍桌出头的义气在此建立——T9他为你拍桌，T18你出卖了他。宋濂的「我看的是骨头」是全书生线的审判词。'
    },

    {
      id: 'EA-ZD-4',
      title: '师难',
      triggerTurn: 12,
      year: 1380,
      coreEvent: '胡惟庸案爆发，宋濂长孙宋慎被查出是「胡党」。主角赶到宋府时锦衣卫将至，宋濂枯坐书房自问「是我教错了吗」。林彦在混乱中与主角失散，留下一张字条「先走了，后会」。',
      emotionalArc: '震惊→心痛→慌乱→失散',
      keyBeats: [
        '赶到宋府——老管家眼睛肿得像核桃，锦衣卫脚步声已近',
        '宋濂坐在书房一动不动，桌上砚台还是湿的。他抬头问：「是我教错了吗？」',
        '林彦的位子空了。桌上留了字条：「先走了，后会。等我消息。」',
        '主角面临抉择——上书保宋濂意味着政治自杀'
      ],
      requiredNPCs: ['宋濂'],
      memoryItem: '纸条或春秋',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从宋濂自问「教错了」的段落或林彦字条中，提取最能体现师徒情/同窗情的原话作为keyQuote'
      },
      sceneDirective: {
        location: '宋府书房，门外有急促的脚步声',
        time: '白天，胡惟庸案爆发后的紧急时刻',
        atmosphere: '墨汁未干的砚台，散落的文书，远处传来甲胄碰撞声',
        requiredElements: ['湿砚台', '老管家', '门外锦衣卫脚步', '林彦空位上的字条'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '心如刀绞']
      },
      characterDirective: {
        '宋濂': {
          state: '七十三岁，长孙涉案，知道自己大限将至。不是恐惧，是困惑——他一辈子教「大义」，大义教错了？',
          speechStyle: '声音沙哑，句子变短。「是我教错了吗」不是问主角，是问自己。沉默比话多',
          physicalDetails: ['坐在椅子上一动不动', '像老了十岁', '目光散焦']
        },
        '林彦': {
          state: '不在场。只通过字条存在——「先走了，后会。等我消息。」字迹潦草但稳',
          speechStyle: '字条上的语气：急促但不慌张，有交代感',
          physicalDetails: ['字条笔画潦草', '坐过的位子上墨迹未干']
        }
      },
      toneDirective: {
        overall: '紧迫中的凝滞——一切在加速崩塌，但书房里时间像停了',
        technique: '用声音设计层次：门外的脚步声 vs 书房内的死寂',
        pacing: '快。场景切换要利落——从赶到宋府到做出选择，不给读者喘息'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '上书保宋濂——以仕途为代价',
          emotionalNote: '明知不可为而为之，是宋濂教的大义',
          effect: { fame: 10, jinchen: 12, favor: -12 },
          rippleHint: '被降三级，宋濂仍被流放。他走时从车上递给你一本亲手批注的《春秋》：「留着。以后教你的孩子读。」',
          condition: null
        },
        {
          label: 'B',
          direction: '联合同门私下说情——折中方案',
          emotionalNote: '想帮忙但不敢赌上一切，是大多数人的选择',
          effect: { jinchen: 5, wisdom: 3 },
          rippleHint: '说情让宋濂的流放从「充军」变成「回乡」。林彦的字条你折好放进袖子——「后会」两个字你看了很久',
          condition: null
        },
        {
          label: 'C',
          direction: '不去宋府，不来往——保全自身',
          emotionalNote: '最安全的选择，也是最重的代价',
          effect: { jinchen: -12, bond: -10 },
          rippleHint: '宋濂被流放，死在路上。后来翻到他送你的《春秋》，书页间夹着纸条：「你做了你最害怕做的事。我不怪你。但我替你觉得可惜。」',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: '胡惟庸案',
      designNote: 'v2微调：林彦字条「先走了，后会」不是消失，是暂时不在。这为T18背叛埋更深的伏笔——他还在，只是你找不到他了。'
    },
// --------------------------------------------------------
// EA-ZD-NEW-1 检校问字 (T15, 1381)
// --------------------------------------------------------
{
      id: 'EA-ZD-NEW-1',
      title: '检校问字',
      triggerTurn: 15,
      year: 1381,
      coreEvent: '你写给同窗的私信被检校截获——信中一句「先生之风，山高水长」被解读为「讽刺皇上不敬贤才」。检校上门问话。',
      emotionalArc: '学术自信→震惊→恐惧→被迫删改',
      keyBeats: [
        '晚间油灯下写信，林彦推门进来，脸色发白：「你的信——被截了。」',
        '「先生之风——我说的是宋先生！「山高水长」是赞他德行长存！」',
        '检校上门，穿皂色直裰，拱了拱手：「「先生之风，山高水长」——请问「先生」指的是哪位？」他转身走了，脚步声轻到几乎听不见',
        '林彦用指甲在「山高水长」四个字上划了两道白印：「以后这几个字不能再写了。」',
        '墨滴洇透纸背，像一只眼睛。笔杆上沾的墨在指尖留了一道黑痕，很久没擦'
      ],
      requiredNPCs: ['林彦「, 」检校'],
      memoryItem: '洇透纸背的墨滴',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从检校问字与林彦警告的对话中，提取关于「先生之风/以后不能再写」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '主角寓所书房，杭州',
        time: '晚间，油灯刚点上',
        atmosphere: '压抑、紧张，「文字即罪」的恐怖——检校的平静比任何拷打都可怕',
        requiredElements: ['那封被截获的信的抄本「, 」「先生之风」四个字「, 」墨滴洇透纸背的画面「, 」检校便装（非官服）'],
        forbiddenPatterns: ['心中涌起暖流「, 」不禁感慨万千「, 」文字狱的恐怖']
      },
      characterDirective: {
        '林彦': {
          state: '紧张但强撑镇定，像在替朋友害怕',
          speechStyle: '声音压得很低，不时回头看门。说话简短、急促',
          physicalDetails: ['攥着一张纸进门「, 」压低声音说话「, 」用指甲在纸上划白印']
        },
        '检校': {
          state: '平静、职业化，像在问路一样问话——越平静越可怕',
          speechStyle: '不急不躁，拱手行礼，问句简洁，「我回去核实」说得像买菜',
          physicalDetails: ['穿皂色直裰而非官服「, 」拱手行礼「, 」转身走时脚步很轻']
        }
      },
      toneDirective: {
        overall: '文字本身成了罪证——你最擅长的东西正在杀死你',
        technique: '用「检校的平静」反衬恐怖——他不威胁、不怒喝，只是「问一问」',
        pacing: '慢——停顿在墨滴洇纸的画面。每一处沉默都在放大恐惧'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '写辩白书，解释「先生之风」出自韩愈《进学解》，本意是赞颂宋先生之德',
          emotionalNote: '用学问自辩——士人的本能反应',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '辩白书被检校留档：「他自己承认写了「先生之风」」——T18文字获罪时，此辩白书成为「知错不改为辩」的证据',
          condition: null
        },
        {
          label: 'B',
          direction: '沉默。不解释、不辩白、不改口',
          emotionalNote: '用沉默对抗——但沉默被解读为「默认有讽刺之意」',
          effect: { bond: 3, wisdom: 3 },
          rippleHint: '检校在档案上写「不辩——视为默认」——此事成为T18林彦案的关联线索。你的沉默救不了你，也救不了他',
          condition: null
        },
        {
          label: 'C',
          direction: '写信给检校「认错」，声称用词不当',
          emotionalNote: '主动服软——士人最大的屈辱',
          effect: { bond: -5, wisdom: -3 },
          rippleHint: '「认错信」被存档，日后成为「降臣之后知错能改」的正面记录——但每次被翻出来都是一次羞辱。T30故人之刃时，这封信让你被同窗看轻',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: 'T6理想高峰「道统高于政统」后的第一次正面碾压。让玩家亲眼看见「你写的每个字都可以被解读为威胁」。检校的平静比锦衣卫的拷打更恐怖——因为你连反抗的对象都没有。与淮西线T15「同乡会」平行：同一年，同一套检校系统，武将喝顿酒是「结党」，文人写封信是「讽刺」。'
    },


    {
      id: 'EA-ZD-6',
      title: '文字获罪',
      triggerTurn: 18,
      year: 1382,
      coreEvent: '林彦因讽刺诗被指「谤讪朝政」，锦衣卫逼主角交出林彦托付保管的诗稿作为「证据」。主角交出了。三天后林彦托人带了三个字：「我理解。」',
      emotionalArc: '恐惧→挣扎→屈从→空虚',
      keyBeats: [
        '锦衣卫偏厅，桌上摊着从林彦住处搜到的信件——他们知道你和林彦是至交',
        '你从怀里掏出林彦被贬前托付你的诗稿：「这些是我最好的诗，你替我留着」',
        '锦衣卫翻了翻笑了：「好。这些东西足够证明你跟他不是一路人了。」',
        '三天后有人带来林彦的三个字：「我理解。」——比任何诅咒都重'
      ],
      requiredNPCs: ['林彦'],
      optionalNPCs: ['锦衣卫'],
      memoryItem: '诗稿',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从林彦的三个字回话或其被托付诗稿时的原话中，提取最能体现「信任与背叛」主题的一句作为keyQuote'
      },
      sceneDirective: {
        location: '锦衣卫偏厅 → 厅外阳光刺眼',
        time: '白天，审讯室内',
        atmosphere: '偏厅阴暗潮湿，桌上油灯将尽，锦衣卫的语气比刀还冷。走出门后阳光刺眼，形成强烈反差',
        requiredElements: ['偏厅内的审讯桌', '林彦的诗稿', '锦衣卫的笑', '走出门后的阳光'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '心如刀绞', '背叛的痛楚如潮水般涌来']
      },
      characterDirective: {
        '林彦': {
          state: '不在场，但通过诗稿和三个字存在。他的信任（托付诗稿）和你的背叛（交出诗稿）构成了全部张力',
          speechStyle: '只有三个字：「我理解。」——语气不明，可以是原谅，可以是绝望，可以都比',
          physicalDetails: ['诗稿上有他的字迹', '三个字的纸条笔迹平稳']
        },
        '锦衣卫': {
          state: '职业化的冷漠，不是恶人，只是在做本职工作',
          speechStyle: '语气平淡甚至带笑，不威逼不恐吓——越平淡越可怕',
          physicalDetails: ['翻看诗稿时笑了', '语气随意得像在聊天']
        }
      },
      toneDirective: {
        overall: '审讯的压迫感不是通过大声呵斥实现的，而是通过锦衣卫的「平淡」——他们不需要用力，因为你已经自己做了决定',
        technique: '内心挣扎用动作而非独白表现。手指攥紧诗稿的动作>「我很痛苦」的描写',
        pacing: '前半段审讯极慢（每一秒都在拉长抉择），走出偏厅后突然加速——三个字砸下来就结束'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '试图见林彦最后一面',
          emotionalNote: '赎罪的冲动，但已经来不及了',
          effect: { bond: -5, fame: -3 },
          rippleHint: '没见到。牢房门口找到一张纸条——上面什么都没写。也许他写过又擦掉了。也许他根本没想写',
          condition: null
        },
        {
          label: 'B',
          direction: '从此不再提林彦的名字，烧掉所有备份',
          emotionalNote: '试图用遗忘来逃避，但「我理解」三个字烧不掉',
          effect: { power: 5, bond: -8 },
          rippleHint: '烧的不是证据，是记忆。此后每次提笔写字都会想起那三个字',
          condition: null
        },
        {
          label: 'C',
          direction: '暗中托人给林彦家人送银子',
          emotionalNote: '微弱的补偿，无法抵消背叛的重量',
          effect: { wisdom: 3, bond: 3, power: -3 },
          rippleHint: '银子送到了。林彦的母亲接过银子什么都没说。但她看了你一眼——那个眼神和「我理解」一样重',
          condition: null
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-ZD-3选A',
          beat: '锦衣卫提到「你当日在送别宴上公然为宋濂敬酒——你跟他们的关系，我们都清楚」',
          implication: 'T9的公开站队让锦衣卫早就盯上了你，这次谈话不是偶然'
        },
        {
          condition: 'EA-ZD-4选A',
          beat: '锦衣卫说「你上过书保宋濂——你以为你还是清白的？」',
          implication: 'T12上书保宋濂的代价在此追加——你的政治信用早已透支'
        }
      ],
      linksTo: null,
      designNote: '亲手伤害节点。全书生线最痛的一刀。林彦在T6替你争经义、T9替你拍桌——你交出了他托付你的诗。「我理解」三个字比任何诅咒都重。'
    },

    {
      id: 'EA-ZD-5',
      title: '余音',
      triggerTurn: 21,
      year: 1382,
      coreEvent: '空印案爆发后，宋濂同窗聚于小酒馆。有人提议联名上书为宋濂平反，但无人敢应。宋濂的椅子空着，林彦的位置也空着。',
      emotionalArc: '沉闷→试探→沉默→余响',
      keyBeats: [
        '小酒馆里几个同窗围坐，酒杯满着但没人喝',
        '有人提议联名上书为宋濂平反——「有用没用是另一回事。你敢不敢？」',
        '沉默之后「……我不敢」',
        '有人问「林彦有消息吗？」没人回答'
      ],
      requiredNPCs: ['同窗甲', '同窗乙'],
      memoryItem: '空椅子',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从同窗的对话中，提取关于「敢不敢」「先生」或「林彦」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '应天府一间小酒馆，角落位置',
        time: '傍晚，酒馆光线昏暗',
        atmosphere: '酒气混着烟气，邻桌有人在说笑，但你们这桌安静得刺眼',
        requiredElements: ['两把空椅子（宋濂+林彦）', '满杯未饮的酒', '昏暗灯光'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '悲从中来']
      },
      characterDirective: {
        '同窗甲': {
          state: '犹豫不决，想为先生做点什么但害怕',
          speechStyle: '声音压得很低，说话时看门口，怕被人听到',
          physicalDetails: ['手指绕着酒杯', '目光不时扫向门口']
        },
        '同窗乙': {
          state: '比同窗甲更直白，把恐惧说出来了反而轻松',
          speechStyle: '语气平，不激动。用问句代替回答',
          physicalDetails: ['端酒碗的手很稳', '说完沉默后低头看桌面']
        }
      },
      toneDirective: {
        overall: '压抑中的微光——所有人都怕，但有人还在问「敢不敢」',
        technique: '用沉默作为节奏工具。空椅子不用描写，放在那里就够了',
        pacing: '慢到停滞。对话之间留大段空白，让沉默本身说话'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '牵头联名上书——为先生争一个公道',
          emotionalNote: '宋濂教的大义在此刻变成了行动，代价是政治风险',
          effect: { fame: 10, power: -8, zhedong: 8 },
          rippleHint: '联名上书送到御前。朱元璋没说话。宋濂没被平反——但你的名字被记住了。后来有人叫你「宋门余烈」',
          condition: null
        },
        {
          label: 'B',
          direction: '沉默。端起酒碗喝了一口',
          emotionalNote: '大多数人的选择。不是冷漠，是无力',
          effect: { wisdom: 3 },
          rippleHint: '那天晚上回家后你把父亲留下的《春秋》从箱底翻出来放在桌上。看了很久',
          condition: null
        },
        {
          label: 'C',
          direction: '劝阻——「先生如果活着，也不希望你们冒险」',
          emotionalNote: '理性的判断，但同窗的反问戳穿了理性的外壳',
          effect: { wisdom: 5 },
          rippleHint: '同窗甲看了你一眼：「你说的对。可你信吗？你信先生不希望？」你答不上来',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: '空印案',
      designNote: 'v2微调：两把空椅子（宋濂+林彦）比一把更痛。林彦缺席的提及让T6的友谊在此变成空洞。'
    },

    {
      id: 'EA-ZD-7',
      title: '空椅子的重量',
      triggerTurn: 25,
      year: 1384,
      coreEvent: '主角在宋濂旧书房独坐。一切如旧但人已散尽。翻书时掉出林彦夹的纸条：「下次喝酒你请。」窗外有风，书架上的书没人翻过。',
      emotionalArc: '静谧→触动→追忆→空寂',
      keyBeats: [
        '老管家放你进来——书架上的书还在，桌上还有墨迹',
        '林彦的砚台放在桌上，墨已干透',
        '翻书时一张纸条掉出来——林彦的字迹：「下次喝酒你请。」',
        '想起T6那个下午——林彦笑着很大声，跟你争经义。宋濂在旁边笑着看'
      ],
      requiredNPCs: ['宋濂（不在场）', '林彦（不在场）'],
      memoryItem: '纸条「下次喝酒你请」',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从林彦纸条或回忆片段中，提取「喝酒」「你请」或关于友谊的原话作为keyQuote'
      },
      sceneDirective: {
        location: '宋濂旧书房，已被他人居住但老管家允许进入',
        time: '午后，阳光从窗格照入',
        atmosphere: '极度的安静——能听到灰尘落下的声音。书房的空寂不是荒废的空寂，是「人刚走不久但不会再回来」的空寂',
        requiredElements: ['书架上无人翻动的书', '干透的砚台', '窗外的风声', '阳光照在空椅子上'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '一股强烈的悲伤袭来', '往事历历在目']
      },
      characterDirective: {
        '林彦（不在场）': {
          state: '通过砚台和纸条存在。他曾经坐在这里争经义、大笑、倒茶洒一桌子',
          speechStyle: '只有一行字：「下次喝酒你请。」——语气随意、亲昵，像昨天写的',
          physicalDetails: ['干透的砚台', '纸条上随意的字迹']
        }
      },
      toneDirective: {
        overall: '空寂——不是悲伤的空寂，是「美好还在但人已不在」的空寂',
        technique: '全靠物件叙事。砚台、纸条、空椅子——每一件物品都在说话，人不需要说话',
        pacing: '极慢。每个物件都值得用一个段落来写。时间几乎静止'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '把纸条收好——和T18的字条放在一起',
          emotionalNote: '把朋友的痕迹带在身上，是一种无声的承诺',
          effect: { bond: 3, wisdom: 3 },
          rippleHint: '从此你身上多了两样东西——林彦的字条「后会」和这张「下次喝酒你请」。它们比任何官印都重',
          condition: null
        },
        {
          label: 'B',
          direction: '在砚台上磨几圈墨，写下林彦的名字',
          emotionalNote: '用最古老的方式纪念一个人——用他的砚台写他的名字',
          effect: { bond: 5 },
          rippleHint: '墨磨出来了。黑色的。你在桌上写了林彦的名字。然后把墨擦干净了',
          condition: null
        },
        {
          label: 'C',
          direction: '什么都不做。坐一会儿就走',
          emotionalNote: '不带走任何东西，也不留下任何东西——但空椅子本身已经刻在记忆里',
          effect: { power: 3 },
          rippleHint: '起身要走时回头看了一眼。阳光照在空椅子上。那把椅子在等一个人回来——但你知道他不会回来了',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '被摧毁的美好节点。T6的温暖在此变成痛。砚台墨干了，人散了，但纸条还在。「下次喝酒你请」是全书生线最轻也最重的六个字。'
    },
// --------------------------------------------------------
// EA-ZD-NEW-2 大字数字 (T27, 1385)
// --------------------------------------------------------
{
      id: 'EA-ZD-NEW-2',
      title: '大字数字',
      triggerTurn: 27,
      year: 1385,
      coreEvent: '郭桓案爆发，文牍系统崩溃。杭州官署公房里，「务实派」同窗老周在填新表格——填到第三遍时说了那句话：「以前我们说「以道事君」。现在——只有听话才能活。」',
      emotionalArc: '疲惫→幻灭→沉默→妥协的悲哀',
      keyBeats: [
        '案上堆满新表格——「郭桓案追赃核查表」。三个同窗挤在一张长案前，油灯快干了',
        '老周填到第三遍，把笔往砚台上一搁：「你看，张家的铺子——去年和李家有过一笔两百两的买卖。李家跟郭桓案有关——所以张家也要查。」',
        '「以前我们说「以道事君」。现在——只有听话才能活。」他说完，又拿起笔继续填',
        '窗外传来隔壁公房同样的声音——算盘声、翻纸声——整个官署都在填表',
        '老周的算盘上，一颗算珠滑落了，「嗒」地弹到桌面上，转了两圈，停住了'
      ],
      requiredNPCs: ['老周'],
      memoryItem: '弹落的算珠',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从老周填表时的对话中，提取关于「只有听话才能活」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '杭州官署公房（多人合用）',
        time: '深夜，油灯快干了',
        atmosphere: '疲惫+恐惧+机械化的绝望——不是一个人的绝望，是所有人的',
        requiredElements: ['郭桓案追赃核查表「, 」算盘「, 」快要耗尽的油灯「, 」老周手指上的茧'],
        forbiddenPatterns: ['英雄主义宣言「, 」慷慨激昂的反抗「, 」以道事君的正面表述']
      },
      characterDirective: {
        '老周': {
          state: '已经麻木——他不是在填政见，是在填数字。每一个数字背后是一家人',
          speechStyle: '说话没有语气起伏，像在念报表。话里有疲惫和自嘲',
          physicalDetails: ['填到第三遍把笔往砚台上一搁「, 」手指机械拨算盘「, 」捡起滑落的算珠，用拇指擦了擦，按回去']
        }
      },
      toneDirective: {
        overall: '用老周的「认命」展现理想的死亡——他不是在填表，他是在填自己的墓志铭',
        technique: '用「声音」传达压迫——算盘声、翻纸声、窗外整个官署都在填表的声音',
        pacing: '慢、沉闷——像深夜加班的节奏。每一处停顿都在放大疲惫'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '老周问：「你觉得我们填的这些——有用吗？」你如实回答「不知道」',
          emotionalNote: '诚实地面对虚无',
          effect: { wisdom: 3 },
          rippleHint: '老周苦笑：「不知道——那就继续填。」他把表格推到面前。T30「故人之刃」时，老周的「务实」使他成为最容易出卖他人的人',
          condition: null
        },
        {
          label: 'B',
          direction: '老周填完后问你借墨。你把墨推过去，什么都没说',
          emotionalNote: '沉默中的默契——两个曾经说「道统高于政统」的人，现在只在借墨时还交流',
          effect: { bond: 5 },
          rippleHint: 'T30被出卖时，老周出卖你的理由正是「你当时什么都没说——沉默的人最容易被怀疑」',
          condition: null
        },
        {
          label: 'C',
          direction: '你起身去添油。灯油壶空了。你站在空壶前很久',
          emotionalNote: '用「空灯油壶」象征——连照亮这张桌子的油都没了',
          effect: { bond: 3, wisdom: 3 },
          rippleHint: '这个画面在T42「太子的书」中被回忆——「那晚灯油空了，我们的灯也灭了」',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '理想在日常中的死亡——不是被杀、不是被流放，是被数字淹没。老周说的「只有听话才能活」与T6他说的「道统高于政统」形成精确对照。与商贾线T28「账本二」呼应——都在讲「数字碾碎人」的故事。'
    },


    {
      id: 'EA-ZD-8',
      title: '故人之刃',
      triggerTurn: 30,
      year: 1386,
      coreEvent: '林彦旧友为自保向锦衣卫告密，供出主角当年交出诗稿之事。锦衣卫传唤问话。主角第一次尝到被出卖的滋味——正是当年自己对林彦做的事。',
      emotionalArc: '紧张→自嘲→沉默→自省',
      keyBeats: [
        '锦衣卫叫你去问话——「有人供出你当年提供了林彦的诗稿作为证据」',
        '锦衣卫语气随意：「不过你放心，我们不是要翻旧账。但以后注意点。」',
        '走出锦衣卫衙门，街上人来人往——想起林彦的「我理解」',
        '现在你理解了：被出卖是什么感觉'
      ],
      requiredNPCs: ['锦衣卫'],
      memoryItem: '被告密',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从锦衣卫的对话或主角的自省中，提取关于「被出卖」「证据」或「我理解」回响的一句作为keyQuote'
      },
      sceneDirective: {
        location: '锦衣卫问话室 → 街上',
        time: '白天',
        atmosphere: '问话室阴冷但不恐怖——这次不是来审讯你的，是来「提醒」你的。街上阳光很好但你觉得冷',
        requiredElements: ['锦衣卫的随意态度', '街上的行人', '林彦「我理解」的回响'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '因果报应的快感']
      },
      characterDirective: {
        '锦衣卫': {
          state: '不是来办你的，是来敲打你的。语气比T18还随意——你已经不值得他们认真对待了',
          speechStyle: '像跟老熟人聊天。提到林彦的名字时没有任何情绪波动',
          physicalDetails: ['翻着卷宗语气平淡', '说完就让你走了']
        }
      },
      toneDirective: {
        overall: '自嘲——命运把T18的镜子转了个方向照向你',
        technique: '不需要写告密者的脸。他只是一个符号。重点在主角走出衙门后的内心',
        pacing: '问话段落快（不值得停留），走出衙门后放慢——让自省有时间展开'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '去找告密者当面对质',
          emotionalNote: '想看看背叛者的脸——然后发现那张脸和自己T18时一模一样',
          effect: { bond: 3, power: -5 },
          rippleHint: '他看到你就躲。追上了他说「对不起。我没有选择。」你看着他——他的眼睛和你当年交出诗稿时一样。你没打他。转身走了',
          condition: null
        },
        {
          label: 'B',
          direction: '认了——「是我该受的」',
          emotionalNote: '不是认命，是接受了因果。这一秒的沉默是对林彦迟到六年的回应',
          effect: { wisdom: 8 },
          rippleHint: '从此每次做选择前都会多想一秒——这一秒里想起的是林彦的脸',
          condition: null
        },
        {
          label: 'C',
          direction: '暗中记下那个人的名字',
          emotionalNote: '不是报复——是提醒自己「你也曾是那个人」',
          effect: { power: 5, bond: -5 },
          rippleHint: '你记住了。不是为了报复——是为了提醒自己',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '报应·自省节点。因果循环——你对林彦做的事，别人对你做了。这不是惩罚，是镜子。'
    },
// --------------------------------------------------------
// EA-ZD-NEW-3 方孝孺来了 (T35, 1389)
// --------------------------------------------------------
{
      id: 'EA-ZD-NEW-3',
      title: '方孝孺来了',
      triggerTurn: 35,
      year: 1389,
      coreEvent: '方孝孺从蜀地来到杭州，带着宋濂的遗稿和一篇新写的策论。他年轻、炽热、满口「以道事君」——像极了年轻时的林彦。你在他身上看到了理想的传承，也看到了悲剧的重演。',
      emotionalArc: '惊讶→温暖→恐惧→无力阻止',
      keyBeats: [
        '方孝孺坐在对面的矮凳上，膝上摊着一卷文稿：「宋先生临终前把遗稿交给我——「道不可废，文不可绝。」我带到了。」',
        '「先生，宋先生的道，我来继续。」——他叫你「先生」，你想起了宋先生叫你「后生」的时候',
        '阳光照在文稿上，方孝孺的指尖在「以道事君」四个字上点了点——指节因长期抄写磨出了薄茧',
        '文稿最后一行写着：「道之所在，虽千万人吾往矣。」墨迹很新，像是刚写上去的',
        '你把宋先生用过的缺口茶杯转了个方向，缺口朝着自己——像是在看一个旧伤疤'
      ],
      requiredNPCs: ['方孝孺'],
      memoryItem: '缺口茶杯',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从方孝孺携稿来访的对话中，提取关于「宋先生的道，我来继续」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '主角书房，杭州',
        time: '午后，有阳光',
        atmosphere: '表面温暖、底层忧虑——像秋天的阳光，暖但不持久',
        requiredElements: ['方孝孺的文稿（写着「以道事君」）「, 」宋先生用过的缺口茶杯「, 」方孝孺指尖的薄茧'],
        forbiddenPatterns: ['对朱元璋的直接批评「, 」慷慨激昂「, 」心中涌起暖流']
      },
      characterDirective: {
        '方孝孺': {
          state: '年轻炽热，语速快，像护着宝贝一样护着宋濂的遗稿——理想还在燃烧',
          speechStyle: '频繁引用宋濂的话——「宋先生说过……」；语速快，句子长，眼睛发亮',
          physicalDetails: ['膝上摊着文稿「, 」指尖在「以道事君」上点了点「, 」穿一件洗得发白的青衫']
        }
      },
      toneDirective: {
        overall: '方孝孺是「过去的镜像」——温暖是因为理想还在传承；恐惧是因为你知道传承的终点',
        technique: '用「缺口茶杯」做情感载体——不说「我怕」，用转杯子、看缺口来传达',
        pacing: '前期快（方孝孺的热情）→ 后期慢（主角的沉默和忧虑）'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '支持方孝孺：「宋先生的道，有人继承了。」',
          emotionalNote: '温暖——理想的火种还在',
          effect: { bond: 8, wisdom: 3 },
          rippleHint: '方孝孺更加坚定。T38李善长案·浙东余波中，方孝孺的激进使他成为重点监控对象；T42太子之死时，方孝孺是唯一还相信「以仁治国」的人',
          condition: null
        },
        {
          label: 'B',
          direction: '劝他谨慎：「宋先生的下场——你也看到了。」',
          emotionalNote: '恐惧——不想看他重蹈覆辙',
          effect: { wisdom: 5, bond: -3 },
          rippleHint: '方孝孺正色：「宋先生说，「谏而不听则去」——但不谏，连「去」的资格都没有。」你想起当年林彦也这么说过——劝不住。T38方孝孺因激进被牵连',
          condition: null
        },
        {
          label: 'C',
          direction: '沉默。把缺口茶杯推给他：「用宋先生的杯子喝茶吧。」',
          emotionalNote: '传承——不说支持也不说反对，让杯子说话',
          effect: { bond: 5 },
          rippleHint: '方孝孺接过杯子，注意到缺口，用手指摸了摸。「先生的东西，都有痕迹。」他不懂你在说什么——但他记住了这个杯子。T50焚书时，方孝孺还带着这个杯子',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '「理想的代际传承」。方孝孺身上叠印着宋濂（T3）、林彦（T6）的影子——玩家看到的不是一个新的角色，而是「理想的第三次出现」。前两次的结局分别是流放而死和被捕入狱。方孝孺是第三次——玩家知道结局，方孝孺不知道。与T38李善长案·浙东余波形成直接衔接。'
    },
// --------------------------------------------------------
// EA-ZD-NEW-B 李善长案·浙东余波 (T38, 1390)
// --------------------------------------------------------
{
      id: 'EA-ZD-NEW-B',
      title: '李善长案·浙东余波',
      triggerTurn: 38,
      year: 1390,
      coreEvent: '李善长案牵连宋濂之孙宋慎，被杀。消息传到流放地，宋濂病情急剧恶化，不久病逝。浙东学派被彻底连根拔起。你开始烧自己的信——不是因为害怕，是因为「道」的传承断了。',
      emotionalArc: '震惊→悲恸→决绝的烧信→空虚',
      keyBeats: [
        '方孝孺脸色苍白地闯进来：「宋慎——被牵连进李善长案了。杀了。」',
        '「消息送到茂州了。宋先生……知道了。」——你知道宋濂在流放地，身体已经不行了',
        '案上那叠信——和宋濂、林彦、同窗的往来书信。方孝孺看着信：「这些信——你打算怎么办？」',
        '你开始烧。第一封是宋濂教你「以道事君」那年的。烧到林彦的信时你停了一下——林彦还在狱里。但你还是烧了',
        '火盆里的灰越来越多。方孝孺看着，没有拦。他走的时候说：「遗稿我留着。道——不能全断。」'
      ],
      requiredNPCs: ['方孝孺'],
      memoryItem: '火盆里的灰',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从宋慎被杀消息传来后，方孝孺与主角的对话中，提取关于「遗稿/道不能全断」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '主角书房，杭州',
        time: '夜晚，火盆烧着',
        atmosphere: '决绝的悲恸——不是嚎哭，是一封一封烧信的安静。火苗跳动，纸灰翻飞',
        requiredElements: ['一叠信（与宋濂/林彦/同窗的往来）「, 」火盆「, 」烧到林彦的信时停住的手「, 」方孝孺苍白的脸'],
        forbiddenPatterns: ['嚎啕大哭「, 」慷慨激昂「, 」心中涌起暖流']
      },
      characterDirective: {
        '方孝孺': {
          state: '刚得知宋慎被杀，脸色苍白，但还是强撑着——他是理想的下一代，此刻正在目睹理想的终点',
          speechStyle: '话少，句子断。说到宋先生时声音会哑',
          physicalDetails: ['脸色苍白地闯进来「, 」看着火盆「, 」走时带着宋濂的遗稿']
        }
      },
      toneDirective: {
        overall: '用「烧信」的安静传达传承断裂——道不是被皇帝杀死的，是在每个人的火盆里烧掉的',
        technique: '用「火盆里的灰」做核心意象。烧到林彦的信时停一下——留白，不解释',
        pacing: '极慢。每一封信的燃烧都是一个小节拍，节奏像悼亡。灰烬落下时留出长沉默'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '烧完所有信——「道断了。留着只会害人。」',
          emotionalNote: '决绝的自保，也是彻底的绝望',
          effect: { bond: -5, wisdom: 3 },
          rippleHint: '方孝孺沉默。他走时带走了宋濂的遗稿——「这个我留着。」T50焚书时，锦衣卫烧的是书；你早就自己烧过一遍了',
          condition: null
        },
        {
          label: 'B',
          direction: '留下一封——宋濂写给你的第一封信，「这封我留着。」',
          emotionalNote: '你可以在制度面前低头，但不想对先生也低头',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '方孝孺看了你一眼，没说什么。T42「太子的书」时这封信被翻出来——太子看到它，说「宋先生教过朕，也教过你。」',
          condition: null
        },
        {
          label: 'C',
          direction: '不烧，把信锁进箱子——「我写了什么，就认什么。」',
          emotionalNote: '士人的骨气——但骨气在火盆面前往往最脆',
          effect: { power: -5, wisdom: 5 },
          rippleHint: '方孝孺看着你，很久：「先生当年也是这么说的。」T50焚书时，锦衣卫搜出这箱子信——它们成了「私藏禁书」的证据',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: 'T38四线交汇的浙东视角——「道断了」。宋慎被杀、宋濂病逝、浙东学派连根拔起。烧信不是害怕，是「道」的传承断了。与T35方孝孺形成衔接：T35你看着理想第三次出现，T38你亲手烧掉它的痕迹。与T50焚书形成对照：那一天火是别人烧的，今天火是你自己点的。'
    },


    {
      id: 'EA-ZD-9',
      title: '太子的书',
      triggerTurn: 42,
      year: 1392,
      coreEvent: '太子朱标薨逝后，主角在整理东宫遗物时发现太子批注的奏疏：「以仁治国，以礼待臣」——正是宋濂当年教的话。太子死了，宋濂死了，这些话成了遗物。',
      emotionalArc: '沉重→发现→震颤→幻灭',
      keyBeats: [
        '奉命整理东宫遗物——太子刚薨逝，宫殿还留着他的温度',
        '发现一篇奏疏上的批注：「以仁治国，以礼待臣」——太子的笔迹，宋濂的教诲',
        '回忆T6：林彦问「如果皇上不听呢？」宋濂答「写下来，总会有人看到」',
        '太子看到了，写在了奏疏上。但他死了'
      ],
      requiredNPCs: ['朱标（回忆）'],
      memoryItem: '太子批注',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从太子批注或宋濂的教学回忆中，提取「以仁治国」或「写下来」相关的原话作为keyQuote'
      },
      sceneDirective: {
        location: '东宫偏殿，堆满遗物的房间',
        time: '太子薨逝后数日',
        atmosphere: '宫殿空旷而冷清，遗物箱摞得很高，灰尘在阳光中浮动',
        requiredElements: ['奏疏上的批注', '太子的笔迹', '空荡的宫殿', '手在抖'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '理想崩塌的痛楚']
      },
      characterDirective: {
        '朱标（回忆）': {
          state: '不在场。通过批注存在——一个相信了宋濂教诲的太子，死了',
          speechStyle: '批注字迹端正，「以仁治国，以礼待臣」六个字写得一丝不苟',
          physicalDetails: ['奏疏上的端正笔迹']
        }
      },
      toneDirective: {
        overall: '理想变成遗物——不是愤怒，是一种比愤怒更深的无力',
        technique: '用回忆闪回打断当下的叙事。T6的温暖片段在此成为刀子',
        pacing: '极慢。发现批注后可以用一整段只写手在抖和宫殿的空旷'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '把那六个字抄在袖中',
          emotionalNote: '把宋濂的教诲贴身携带——是继承也是执念',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '从此每次穿官服都能感觉到袖中的那行字。这是宋濂留给这个世界的最后一句话',
          condition: null
        },
        {
          label: 'B',
          direction: '默默合上奏疏放回原处',
          emotionalNote: '不带走任何东西，但那六个字已经扎了根',
          effect: { wisdom: 3 },
          rippleHint: '从此每次在朝堂上看到不公道的事，都会想起那六个字',
          condition: null
        },
        {
          label: 'C',
          direction: '说出声：「太子也信这个……但他还是死了」',
          emotionalNote: '最危险也最诚实的反应——理想的幻灭',
          effect: { power: 3, bond: -3 },
          rippleHint: '旁边的人看了你一眼。你知道这话多危险——但不在乎了。宋濂、林彦、太子……信了那些话的人，都没了',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '喘息-美好→理想破灭。宋濂的学问通过太子传下来了——但太子死了。美好的东西总是短暂的。'
    },

    {
      id: 'EA-ZD-10',
      title: '最后一卷',
      triggerTurn: 50,
      year: 1396,
      coreEvent: '锦衣卫搜书焚书，应天府到处在烧书。主角连夜从墙缝中取出林彦的手稿（当年偷偷抄下的副本），险些被搜到，最终重新封回墙缝。这是对T18交出诗稿的补偿与救赎。',
      emotionalArc: '紧迫→颤抖→坚定→微光',
      keyBeats: [
        '锦衣卫搜书焚书——整个应天府在烧书，纸灰飘满天空',
        '连夜赶回家，从墙缝取出布包——林彦的手稿，你偷偷抄下的副本',
        '想起T25那张纸条：「下次喝酒你请」',
        '低声说了句：「林彦。我还留着。」——也许他死了，也许他在某个角落活着，但手稿还在'
      ],
      requiredNPCs: ['林彦（不在场）'],
      memoryItem: '林彦手稿',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从林彦手稿的封存行为或主角的低语中，提取关于「留着」「存在」或「喝酒你请」的一句作为keyQuote'
      },
      sceneDirective: {
        location: '主角家中，墙缝藏匿处',
        time: '深夜，窗外远处有火光和哭喊声',
        atmosphere: '纸灰的气味从窗缝渗进来，远处有火光映照。屋内只有一盏油灯',
        requiredElements: ['墙缝中的布包', '林彦的字迹', '窗外的火光', '砖块封回的声音'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '不禁感慨万千', '救赎的光辉']
      },
      characterDirective: {
        '林彦（不在场）': {
          state: '不在场但无处不在。手稿是他的字迹、他的诗、他存在过的证据',
          speechStyle: '通过手稿中的文字存在。手稿边缘有他的批注，字迹潦草而有力',
          physicalDetails: ['手稿上他的字迹', '边缘的批注', 'T25纸条的记忆']
        }
      },
      toneDirective: {
        overall: '在焚书的火光中守护一个人的文字——是对T18的补偿，也是整条书生线的救赎',
        technique: '全程内心独白为主，但用动作节制——手在抖、封砖、低声说话',
        pacing: '前半段紧迫（搜书的威胁），后半段放慢（封砖时的低语和回忆）'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '封好墙缝，等风头过后再取出',
          emotionalNote: '守护者的承诺——只要手稿在，他就没有完全消失',
          effect: { wisdom: 5, bond: 5 },
          rippleHint: '那面墙成了你家里最重要的地方。不是因为有财宝，是因为有一个人的手稿在里面',
          condition: null
        },
        {
          label: 'B',
          direction: '抄一份副本藏在别处，原件继续留着',
          emotionalNote: '用最笨的方式确保他不会消失——抄三天三夜，一个字不漏',
          effect: { wisdom: 8 },
          rippleHint: '抄了三天三夜。连林彦写在边上的批注都抄了。「下次喝酒你请」这句话，抄的时候停了很久',
          condition: null
        },
        {
          label: 'C',
          direction: '差点烧了——但最终没有',
          emotionalNote: '在火盆前的犹豫是T18的回响——这次你选择了留下',
          effect: { bond: 3, power: -3 },
          rippleHint: '站在火盆前犹豫了很久。最终把布包塞回墙缝。「不。这不是我能烧的。这是他的。」',
          condition: null
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-ZD-6选A',
          beat: '你在牢房门口找到的那张空白纸条——现在手稿里夹着它。也许他当时想写什么但没写。也许他已经写完了——就是你手里的这些',
          implication: 'T18的空白纸条在此获得了意义——他不需要写，手稿本身就是他想说的话'
        },
        {
          condition: 'EA-ZD-7选A',
          beat: '你身上已经有了两张纸条——「后会」和「下次喝酒你请」。现在又多了手稿。三样东西加在一起，比一条命重',
          implication: 'T25收好纸条的选择在此追加——你一直在收集他存在的证据'
        }
      ],
      linksTo: null,
      designNote: '被摧毁的美好→救赎。T18你交出他的诗稿——T54你冒死藏了他的手稿。这是对T18的补偿，也是对整条书生线的救赎。'
    }
  ],

  // ──── 商贾线：利义的撕裂（10个） ────
  '应天府商贾之子': [
{
      id: 'EA-SG-1',
      title: '旧账本',
      triggerTurn: 3,
      year: 1375,
      coreEvent: '主角即将入仕，父亲在书房传授旧账本，「账是干净的」——一句嘱托，一本账本，串联商贾线全线。',
      emotionalArc: '好奇→倾听→理解→承载嘱托',
      keyBeats: [
        '父亲书房——没有书，满墙账本按年份排好，每本包了牛皮纸',
        '从最底下抽出最旧的一本——已经发黄，是父亲十四岁学徒时记的',
        '父亲提到老陈：「铺子里老陈帮我看了二十年账，连一文钱的差错都记了」——陈三首次被提及',
        '父亲正色：「做官比做生意更要紧——你得把账算清楚。不是算别人的账，是算自己的」',
        '递出账本：「你爹这辈子虽然铜臭，但账是干净的」'
      ],
      requiredNPCs: ['父亲'],
      memoryItem: '发黄的账本',
      sceneDirective: {
        location: '李家书房——没有书，只有账本。满墙按年份排列，每本包了牛皮纸',
        time: '傍晚，油灯点着，书房闷热心安',
        atmosphere: '账本纸页的气味混着油灯烟，安静的书房，外面铺子打烊的声响',
        requiredElements: ['发黄的旧账本', '满墙账本', '油灯', '牛皮纸包角'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '你知道吗其实我', '父爱如山']
      },
      characterDirective: {
        '父亲': {
          state: '中年商人，儿子即将入仕，骄傲但克制。厚道了一辈子，最在意的是「账干净」',
          speechStyle: '厚道平稳。不煽情。用数字和故事代替感情。笑着说最重的话',
          physicalDetails: ['手上有老茧', '衣服洗得发白但干净', '翻账本的动作极熟练']
        }
      },
      toneDirective: {
        overall: '日常中的郑重——不是临终嘱托的沉重，是一个厚道父亲把一辈子总结递给你',
        technique: '物件承载代际。账本>拥抱。「账是干净的」>「我爱你」',
        pacing: '中等。像翻账本一样，一页一页，不急不慢'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '郑重接过——放进书箱，当作父亲的信物',
          emotionalNote: '儿子接住了父亲一辈子最在乎的东西',
          effect: { bond: 8, wisdom: 3 },
          rippleHint: '这本账本会在T28再次出现——届时它不再是旧账本，而是保护全家的钥匙',
          condition: null
        },
        {
          label: 'B',
          direction: '嫌弃拒绝——做了官不需要这些铜臭东西',
          emotionalNote: '不是坏答案，是年轻人的傲慢。但父亲会沉默',
          effect: { bond: -5, power: 3 },
          rippleHint: '父亲没说什么，把账本收了回去。那晚他一个人在书房坐了很久。婉清来传话：「公公让你明天去吃饭。别拒绝。」',
          condition: null
        },
        {
          label: 'C',
          direction: '追问——「爹，这里面有没有……不那么干净的账？」',
          emotionalNote: '尖锐但真实。父子之间第一次说真话',
          effect: { wisdom: 5 },
          rippleHint: '父亲脸色变了。「有。但我都改了。改了就干净了。」——这句话在T28翻账本时会被记起',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从父亲的对话中，提取关于「账/干净/做官」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: 'v2微调：增加陈三提及——「铺子里老陈帮我看了二十年账」。为T26陈三被出卖建立基础。账本是商贾线核心道具，从此处贯穿至T55。'
    },
    {
      id: 'EA-SG-2',
      title: '内助',
      triggerTurn: 7,
      year: 1377,
      coreEvent: '沈婉清嫁入两年后展现精明能干的本质——清查贪墨、整顿铺子，说出「我会守这个家」。',
      emotionalArc: '惊艳→信任→默契→心动',
      keyBeats: [
        '婉清把家里账本全翻了一遍——发现旧账房贪墨三百两，证据整理成清单',
        '她先查完再告诉你——不声张、不邀功，做完才说',
        '提到陈三：「陈三管理的铺子查过了，没出问题——陈三是干净的」——再次确认陈三',
        '指出两间铺子亏在管事吃回扣——她看人比主角准',
        '最后的承诺：「我不会说漂亮话。但我会守这个家。你安心做你的官。」'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '账目清单',
      sceneDirective: {
        location: '家中厅堂，桌上摊着整理好的账册和清单',
        time: '傍晚，主角从衙门回来',
        atmosphere: '烛光下账册整齐叠放，婉清坐在桌旁等你——像汇报军务一样冷静',
        requiredElements: ['账册清单', '烛光', '算盘', '茶已凉（等很久了）'],
        forbiddenPatterns: ['温柔地笑了', '心中暗想', '她真能干啊']
      },
      characterDirective: {
        '沈婉清': {
          state: '嫁入两年，从新媳妇变成当家人。精明但不张扬，用数据说话',
          speechStyle: '直接，不兜圈子。先说结果再说过程。语气平静但坚定',
          physicalDetails: ['袖口沾着墨迹', '账册翻过很多页', '目光清澈不移']
        }
      },
      toneDirective: {
        overall: '以事见人——不说爱不爱，用账目说话。数字本身就是情话',
        technique: '能力展示>语言表白。清单>承诺。做事>表态',
        pacing: '利落。像婉清本人——不拖泥带水'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '全权委托——「以后家里的事，你拿主意。」',
          emotionalNote: '丈夫对妻子的最高认可：信任她的判断',
          effect: { bond: 10 },
          rippleHint: '从这天起婉清开始参与决策。她看人比主角准——「这个人靠不靠得住」成了她最常说的话',
          condition: null
        },
        {
          label: 'B',
          direction: '质问——「你怎么不跟我说？自己就处理了？」',
          emotionalNote: '不是生气，是关切。但婉清会理解为「你觉得我多事」',
          effect: { bond: 3 },
          rippleHint: '婉清低下头。「我怕你忙。」她不是怕你忙——她是怕你觉得她多事。从此她做事会先问你',
          condition: null
        },
        {
          label: 'C',
          direction: '训斥越界——「这些事让爹去管。你是媳妇，别越界。」',
          emotionalNote: '用礼教压制能力。婉清会听话——但热情被浇灭',
          effect: { bond: -8 },
          rippleHint: '婉清不再主动管事。铺子继续亏。账本上的数字越来越难看——但你不知道该怎么开口让她帮忙了',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清的汇报中，提取关于「守家/看人/干净」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '让沈婉清从「联姻工具」变成「最清醒的人」。陈三通过婉清之口再次被确认「干净的」，为T26被出卖做铺垫。婉清说「我会守这个家」——到T26你亲手把她推入危险。'
    },
// --------------------------------------------------------
// EA-SG-NEW-A 荐举之重 (T8, 1378)
// --------------------------------------------------------
{
      id: 'EA-SG-NEW-A',
      title: '荐举之重',
      triggerTurn: 8,
      year: 1378,
      coreEvent: '荐举恩师来访——暗示主角「该回报了」。恩师需要你帮忙打通一道商业渠道给他的亲戚——这不是请求，是「你欠我的」。',
      emotionalArc: '感恩→不安→被迫→沉默',
      keyBeats: [
        '恩师来了——穿着官服，但袖口磨破了。他也是个穷官',
        '「你爹的铺子在城南吧？我有个亲戚想做个小买卖——你帮忙照应照应」',
        '你知道这不是「照应」——这是让商铺成为官员的利益输送渠道',
        '婉清在隔壁听到了。她没说话——但你知道她在算这笔账的代价',
        '「你开了这个口子，以后关不上。」——婉清的声音从隔壁传来'
      ],
      requiredNPCs: ['恩师「, 」婉清'],
      memoryItem: '恩师磨破的袖口',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从恩师提出「照应亲戚」的对话中，提取关于「帮忙照应/你欠我的」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中正堂',
        time: '白天，恩师来访',
        atmosphere: '表面是叙旧的情面，底下是交易的算计——恩师的官服和磨破的袖口并置',
        requiredElements: ['恩师的官服（袖口磨破）「, 」茶盏「, 」婉清在隔壁的身影「, 」商铺的契书'],
        forbiddenPatterns: ['心中涌起暖流「, 」感恩戴德「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '恩师': {
          state: '穷官，靠荐举之恩来「收账」——他自己也知道这是交易，但官场逼他这么做',
          speechStyle: '先叙旧再提正事，语气温和但不容拒绝。把「帮忙照应」说得像最平常的事',
          physicalDetails: ['穿着磨破袖口的官服「, 」端起茶盏又放下「, 」说「当初是谁推荐你的」时笑容不变']
        },
        '婉清': {
          state: '在隔壁听着，不动声色地算这笔账的代价——她是商贾线最清醒的算盘',
          speechStyle: '不在恩师面前说话。等人走了才说真话',
          physicalDetails: ['在隔壁没出来「, 」等人走了才说话「, 」说「口子关不上」时看着账本']
        }
      },
      toneDirective: {
        overall: '荐举制的代价——你通过荐举入仕，就欠了恩师的人情；你用商业网络回报，就是「富民干政」',
        technique: '用「磨破的袖口」做核心意象——穷官也需要商人的钱，制度把两边的体面都磨破了',
        pacing: '叙旧部分温和缓慢，提到「照应亲戚」时骤然收紧，婉清的话在最后像一记闷钟'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '帮忙——「恩师开口了，不能不帮」',
          emotionalNote: '感恩压倒了对风险的判断',
          effect: { bond: 8, jinchen: -5 },
          rippleHint: '商铺成了官员的利益渠道。婉清说：「你开了这个口子，以后关不上。」——后来这句话成了真的。T38追赃时，这条渠道被翻出来',
          condition: null
        },
        {
          label: 'B',
          direction: '婉拒——「这件事不太方便」',
          emotionalNote: '你选择守住商人的本分，但代价是得罪恩师',
          effect: { jinchen: 5, bond: -8 },
          rippleHint: '恩师笑了：「不方便？当初是谁推荐你的？」——你的仕途悬了。T10考评时，你的荐举人不再替你说话',
          condition: null
        },
        {
          label: 'C',
          direction: '让父亲出面——「让我爹去处理」',
          emotionalNote: '你把风险推给了父亲——他也接下了',
          effect: { bond: -3, jinchen: -3 },
          rippleHint: '把父亲推进了火坑。父亲去了——但他从此跟官员绑在一起了。T15迁富令时，这份「官员关系」成了双刃剑',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '荐举制的代价具象化。你通过荐举入仕，恩师的人情就是悬在头上的剑。用，就是「富民干政」；不用，就是「忘恩负义」。婉清的「口子关不上」是全线的预言。'
    },

    {
      id: 'EA-SG-3',
      title: '传灯',
      triggerTurn: 10,
      year: 1380,
      coreEvent: '父亲被举报「囤粮抬价」，临危留下二十年积蓄和嘱托：「别走歪了。」',
      emotionalArc: '震惊→沉重→承诺→离别',
      keyBeats: [
        '父亲书房比以前冷清了——账本少了半墙，举报风暴正在逼近',
        '陈三跑了一整天找关系——回来与父亲密谈到深夜（陈三第三次被提及）',
        '父亲老了很多：「我做了三十五年生意。你读书做官，我花了多少银子你不想知道」',
        '拿出二十年积蓄的包袱和信：「每一两都来得不容易……在该花的时候花」',
        '最后的嘱托：「你走了我走不了的路。别走歪了。」'
      ],
      requiredNPCs: ['父亲'],
      memoryItem: '包袱里的银子',
      sceneDirective: {
        location: '李家书房——账本少了半墙，气氛冷清',
        time: '深夜，陈三刚走，父子独处',
        atmosphere: '压抑，像暴风雨前的闷热，书房里只剩油灯和两个人的影子',
        requiredElements: ['半墙空了的书架', '包袱和信', '油灯', '陈三留下的茶碗'],
        forbiddenPatterns: ['抱头痛哭', '天塌了', '你知道吗其实我', '父亲的眼泪']
      },
      characterDirective: {
        '父亲': {
          state: '被举报囤粮抬价，可能倾家荡产甚至入罪。老了很多，但依然沉稳',
          speechStyle: '用最朴实的话做最重的嘱托。不流泪，不诉苦。交代数字和嘱咐',
          physicalDetails: ['手抖得比上次厉害', '衣服没换——说明一整天没离开书房', '鬓角白了许多']
        }
      },
      toneDirective: {
        overall: '临危托孤的沉重——不是生离死别，是一个父亲把后路给你铺好',
        technique: '数字>形容词。积蓄>拥抱。「别走歪了」>「注意身体」',
        pacing: '沉重。慢。像秤砣，一句话压一句话'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '全力救父——动用关系，花光积蓄打点',
          emotionalNote: '孝道与孤注一掷。父亲没事，但你欠下多年人情',
          effect: { power: -10, bond: 12 },
          rippleHint: '你花光了积蓄的一半去打点。父亲没事了，但欠下的人情要用好几年还',
          condition: null
        },
        {
          label: 'B',
          direction: '明哲保身——父亲是商人，你有理由「不知道」他的生意',
          emotionalNote: '不是冷血，是官场生存本能。但父亲会记住',
          effect: { power: 5, bond: -15 },
          rippleHint: '父亲被判罚没家产一半。出来后看着你说：「我花了一辈子让你走出去。你走出去了，就不回来了。」',
          condition: null
        },
        {
          label: 'C',
          direction: '暗保根基——暗中转移部分家产，表面配合调查',
          emotionalNote: '聪明但灰色。婉清会看穿，父亲不会知道',
          effect: { wisdom: 8, power: -3 },
          rippleHint: '家产保住了大半。婉清知道了：「你做得对。但你爹不会这么想。」',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从父亲的嘱托中，提取关于「路/干净/别走歪」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: 'v2微调：增加陈三「跑了一整天找关系」的提及。陈三通过T1/T2/T3三次出现，逐步建立存在感。父亲的「别走歪了」与T26主角交出名单形成最痛对照。'
    },
    {
      id: 'EA-SG-4',
      title: '利义抉择',
      triggerTurn: 12,
      year: 1380,
      coreEvent: '胡惟庸案爆发，商铺被查出曾给胡党幕僚供粮。婉清翻出父亲旧账本最后一页——父亲早就准备了打点的银子。主角终于理解父亲沉默而深远的爱。',
      emotionalArc: '恐慌→震惊→理解→感动',
      keyBeats: [
        '胡案爆发——商铺被查出曾给胡惟庸幕僚供粮，灭顶之灾将至',
        '婉清连夜转移现银到娘家——回来后平静得吓人',
        '婉清拿出父亲给的旧账本：「你爹给我的。他说如果有一天出事，翻到最后一页。」',
        '最后一页——一个日期和一笔银子，数目正好够打点掉「供粮」这件事',
        '婉清：「你爹早就知道了。他不是不知道有人会找麻烦——他只是不知道什么时候会来。」'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '最后一页',
      sceneDirective: {
        location: '家中书房/内室，柜子和账本',
        time: '深夜，胡案刚爆发，消息传来后的紧急时刻',
        atmosphere: '紧张如弓弦——但婉清的平静让气氛从恐慌转为肃穆',
        requiredElements: ['旧账本', '烛光', '柜子', '窗外夜色（远处的火把或犬吠暗示抄家）'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '夫妻情深', '太好了有救了']
      },
      characterDirective: {
        '沈婉清': {
          state: '刚经历危机处理——连夜转移银两。平静得吓人，因为她知道公公早有准备',
          speechStyle: '先报结果再说过程。不渲染情绪。把账本递过来时手不抖',
          physicalDetails: ['刚跑完一趟回来', '衣角沾了泥', '眼神定']
        }
      },
      toneDirective: {
        overall: '山雨欲来中的定心丸——父亲虽然不在场，但他的智慧罩住了全家',
        technique: '用物件传递情感——账本最后一页比任何台词都重',
        pacing: '先紧后慢——紧张地翻出账本，然后沉默地读最后一页'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '用父亲留下的银子打点——接受这份跨越时间的保护',
          emotionalNote: '不是认怂，是理解了父亲的深远',
          effect: { power: -5 },
          rippleHint: '事情平了。这是父亲用一辈子换来的「保险金」。他算到了这一步——他比你想象得更远',
          condition: null
        },
        {
          label: 'B',
          direction: '不用银子——主动上报，把供粮来龙去脉说清楚',
          emotionalNote: '正直但冒险。朱元璋说「还老实」——铺子关了三间',
          effect: { fame: 8, power: -8 },
          rippleHint: '朱元璋看了奏报说「还老实」。你没事，但铺子关了三间。婉清说：「你爹如果把他的钱留着没用，不知道会怎么想。」',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清或父亲的遗策中，提取关于「早知道/准备/账」主题的一句原话作为keyQuote'
      },
      conditionalBeats: [
        {
          condition: 'EA-SG-3选A',
          beat: '你刚花光了积蓄打点父亲的事——现在父亲又用最后一笔银子救了你。银子已经不够了',
          implication: 'T3的倾力消耗了资源，T12的保险不够用'
        },
        {
          condition: 'EA-SG-3选B',
          beat: '父亲被罚后对你的冷淡还在——但账本依然交给了婉清。他没有怪你，但他也不再期待了',
          implication: 'T3的疏远让T12的理解打了折扣'
        }
      ],
      linksTo: '胡惟庸案',
      designNote: '商贾线情感高潮之一——你终于理解了父亲。不是因为他做了多大的事，而是因为他一直在用他的方式爱你。账本从T3递出→T4婉清翻出最后一页→T28翻出后半部分→T55写下「账清了」——核心道具贯穿全线。'
    },
// --------------------------------------------------------
// EA-SG-NEW-B 迁富令 (T15, 1381)
// --------------------------------------------------------
{
      id: 'EA-SG-NEW-B',
      title: '迁富令',
      triggerTurn: 15,
      year: 1381,
      coreEvent: '朝廷下旨：江南富民强制迁徙凤阳。邻居王家被列在名单上——因为「家资过万」。婉清连夜盘点家产——「我们家有多少？」主角算完沉默了。',
      emotionalArc: '恐惧→计算→无力→沉默',
      keyBeats: [
        '消息传来：邻居王家被迁——「家资过万」是标准',
        '婉清连夜盘点家产，算到最后：「我们的家产折算下来……够了。」',
        '「够了」两个字比什么都重——够了被迁的标准',
        '「散了也没用。他查的是你「曾经」有多少。你去年赚的每一笔，账上都写着。」',
        '账本摊在桌上，像一份判决书'
      ],
      requiredNPCs: ['婉清'],
      memoryItem: '账本上的数字',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清盘点家产的对话中，提取关于「够了/散了也没用」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中内堂，账桌前',
        time: '深夜，烛火摇曳',
        atmosphere: '算盘声在夜里格外清晰——每一个数字都是命运的天平',
        requiredElements: ['账本「, 」算盘「, 」「家资过万」的告示「, 」王家被迁的消息'],
        forbiddenPatterns: ['心中涌起暖流「, 」慷慨激昂「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '婉清': {
          state: '冷静到可怕——她不是慌，是在算。算的不是家产，是全家人的命',
          speechStyle: '报数字。用最平静的语气说最重的话。说完「够了」后不再开口',
          physicalDetails: ['连夜盘点家产「, 」手指停在某个数字上「, 」把账本合上，压着封面']
        }
      },
      toneDirective: {
        overall: '迁富政策的恐怖——你不花钱=家资过万=被迁；你花钱=账上有记录=也可能被迁。你没法在制度面前「变穷」',
        technique: '用「够了」两个字做全部——两个字的重量胜过千言',
        pacing: '算盘声的节奏贯穿，越算越慢，最后停在「够了」上'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '紧急散财——把银子分给穷亲戚',
          emotionalNote: '想用最快的速度「变穷」',
          effect: { jinchen: -8, bond: 5 },
          rippleHint: '银子散出去了——但账本上的记录还在。「你上个月还赚了三千两。」T38追赃时，散出去的每一笔都被查到了',
          condition: null
        },
        {
          label: 'B',
          direction: '托人找关系——「能不能把名字撤下来」',
          emotionalNote: '用钱买平安——但平安也有价',
          effect: { jinchen: -10, bond: 3 },
          rippleHint: '关系找到了——要价极高。「你知道这事的价码。」你付了——但下次呢？T22丝绸禁令时，这份「关系」又被想起',
          condition: null
        },
        {
          label: 'C',
          direction: '不动——「我们没到那个标准」',
          emotionalNote: '心存侥幸——标准会不会变？',
          effect: { jinchen: 3, wisdom: 3 },
          rippleHint: '婉清看了你一眼：「你觉得标准是他们定的还是你定的？」——后来标准果然变了。T22时你庆幸躲过，T38时你发现躲不过',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '迁富政策的恐怖：财富在洪武体制下是罪。你没法在制度面前「变穷」——因为你穷过的证据和你富过的证据都在账本上。婉清的「够了」是商贾线「数字碾碎人」主题的第一次正式亮相。'
    },

    {
      id: 'EA-SG-6',
      title: '共犯',
      triggerTurn: 19,
      year: 1383,
      coreEvent: '婉清提议投资淮盐新引岸，夫妻同心赚了一笔——但这笔生意挤垮了三家小盐商，其中一家掌柜投河自尽。婉清当晚没吃饭，第一次问「我们是不是做错了」。',
      emotionalArc: '自信→默契→沉默→裂痕',
      keyBeats: [
        '婉清分析淮盐投资——利润、风险、打点的人选，头头是道',
        '你信了她——夫妻共同决策，投资成功',
        '消息传来：这笔投资挤垮了三家小盐商，其中一家掌柜投河自尽',
        '婉清当晚没吃饭——独自在账房翻着投资账目到天亮',
        '她问：「我不知道会出人命……我们是不是做错了？」'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '投河的掌柜',
      sceneDirective: {
        location: '家中账房，桌上摊着投资账目',
        time: '深夜，掌柜投河的消息传来的当晚',
        atmosphere: '烛火将尽，账房安静得可怕——白天讨论投资时的热烈荡然无存',
        requiredElements: ['投资账目', '没动的饭菜', '烛火', '窗外月色'],
        forbiddenPatterns: ['心中涌起暖流', '她真善良', '这不是他们的错', '理性分析']
      },
      characterDirective: {
        '沈婉清': {
          state: '从自信跌入自我怀疑。她第一次判断失误——只看到利润没看到人',
          speechStyle: '还在用算账的方式说话，但声音不稳了。用数字掩饰慌乱',
          physicalDetails: ['没吃饭', '头发微乱', '手指不停翻账页', '眼眶红了但没哭']
        }
      },
      toneDirective: {
        overall: '共犯的美好与裂痕——夫妻同心做了一件错事。温暖在于「一起」，裂痕在于「错了」',
        technique: '前半段回忆夫妻默契，后半段死寂。沉默是最重的控诉',
        pacing: '前半快（讨论投资），后半慢（投河消息后定格）'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '冷漠回应——「生意就是生意。我们不能替别人负责。」',
          emotionalNote: '用商人逻辑压制愧疚。婉清会接受——但那晚她没回房',
          effect: { power: 5, bond: -5 },
          rippleHint: '婉清看了你一眼。「你说得对。」但她那天晚上没回房——一个人在账房坐到天亮',
          condition: null
        },
        {
          label: 'B',
          direction: '善后补偿——「把那个掌柜家里安顿一下。给些银子。」',
          emotionalNote: '试图弥补但无力回天。人已经死了，银子买不回来',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '你托人送了银子。掌柜的妻子收了，看了很久，问了句「人回来吗？」你答不上来',
          condition: null
        },
        {
          label: 'C',
          direction: '认错反思——「是我想得不够周全。以后这种事，先问你爹的意见。」',
          emotionalNote: '把责任揽到自己身上。婉清会第一次否定自己',
          effect: { bond: 5, wisdom: 5 },
          rippleHint: '婉清摇头。「你爹不会做这种生意。」她停了一下，「我也不会。但我太急了。」',
          condition: null
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-SG-4选A',
          beat: '婉清分析淮盐时提到：「你爹那笔银子要是没用完，可以拿来周转。」她开始用父亲的方式思考',
          implication: 'T12的理解让她继承了父亲的商业直觉'
        },
        {
          condition: 'EA-SG-4选B',
          beat: '婉清在分析时更谨慎：「上次的事……我不想再冒那种险了。」她变得保守',
          implication: 'T12的正直让她对灰色地带更敏感'
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清的反应中，提取关于「人命/错/利润」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '喘息-美好节点。夫妻共同犯错的美好——「一起」本身是温暖的，但「错了」是裂痕。婉清不是完美的，她自信到自负。但这笔生意的代价让她第一次意识到利润背后是人。T19的美好到T26会被彻底摧毁。'
    },
// --------------------------------------------------------
// EA-SG-NEW-C 丝绸禁令 (T22, 1383)
// --------------------------------------------------------
{
      id: 'EA-SG-NEW-C',
      title: '丝绸禁令',
      triggerTurn: 22,
      year: 1383,
      coreEvent: '婉清过生日。主角想买一匹丝绸给她——但商人不能穿丝绸。他在铺子前站了很久。最后买了一匹——但婉清不敢穿。',
      emotionalArc: '温柔→刺痛→无奈→苦涩',
      keyBeats: [
        '主角路过丝绸铺——想起她前几天翻出嫁衣看——料子发黄了。丝绸放久了也会老',
        '买了一匹上好的丝绸——「给她过生日」',
        '回到家才想起来——商人不能穿丝绸。「我买了……你不能穿。」',
        '婉清摸了摸丝绸：「料子真好。」然后折好放进柜子最底层',
        '「留着吧。等哪天……」她没说完。你们都知道没有「等哪天」'
      ],
      requiredNPCs: ['婉清'],
      memoryItem: '柜底的丝绸',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从送丝绸与婉清收丝绸的对话中，提取关于「料子真好/留着吧」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中，婉清面前',
        time: '白日买绸，夜晚相赠',
        atmosphere: '温柔的底色上有一层说不出的苦涩——最好的东西，你买得起却用不起',
        requiredElements: ['上好的丝绸「, 」柜子最底层「, 」婉清摸丝绸的手「, 」嫁衣（料子发黄）'],
        forbiddenPatterns: ['心中涌起暖流「, 」感人肺腑「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '婉清': {
          state: '惊喜之后是懂得——她太清楚这条禁令了，清楚到连失望都省了',
          speechStyle: '话少。用「料子真好」代替「我多想要」；用「留着吧」代替「我穿不了」',
          physicalDetails: ['摸了摸丝绸「, 」折好放进柜子最底层「, 」说「等哪天」时没说完']
        }
      },
      toneDirective: {
        overall: '服饰禁令的荒谬——你有钱买最好的丝绸，但你不能穿。制度让财富失去了最基本的功能：让你过得好一点',
        technique: '用「摸」和「收」代替对话——婉清的动作就是全部台词',
        pacing: '缓慢、克制。每一个动作之间都有停顿——像在给苦涩留出空间'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「我找人改一下，外面套个布衫」',
          emotionalNote: '你想了个折中的办法——但折中本身也是罪',
          effect: { bond: 3, jinchen: -3 },
          rippleHint: '婉清穿了一次——被邻居看到了。「商人家媳妇穿丝绸？」消息传出去了。T38追赃时，这件事被当成「逾制」记了一笔',
          condition: null
        },
        {
          label: 'B',
          direction: '「算了。以后再说」',
          emotionalNote: '你把苦涩咽了回去——但你知道没有「以后」',
          effect: { bond: -3 },
          rippleHint: '婉清笑了笑：「我不在乎。」但你知道她在乎——每个女人在乎。那匹丝绸在柜底躺了很多年，直到T45商道末路时才被翻出来',
          condition: null
        },
        {
          label: 'C',
          direction: '把丝绸送给当官的朋友',
          emotionalNote: '你选择让礼物发挥「用处」——但人情也是债',
          effect: { jinchen: 5, bond: -5 },
          rippleHint: '朋友收了——笑你「有钱不会花」。但这笔人情记住了。T38李善长案时，这位朋友成了你「结交官员」的证据之一',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '「卖丝绸的人穿不得丝绸」——服饰禁令的荒谬具象化。商贾线的「三层绝望」第二层：财富不能带来体面。婉清的「等哪天」是全线最温柔的绝望。'
    },

    {
      id: 'EA-SG-7',
      title: '账册之祸',
      triggerTurn: 26,
      year: 1385,
      coreEvent: '为自保和保护婉清，主角交出客户名单。陈三——帮父亲看了二十年账的老伙计——在名单上被抄家。陈三上门质问，婉清在隔壁全听到了。商贾线最痛的一刀。',
      emotionalArc: '压迫→抉择→质问→崩塌',
      keyBeats: [
        '有人要借用商业网络为政治派系筹款——拒绝=得罪权贵；接受=害人被勒索',
        '主角做出决定——交出客户名单。锦衣卫拿着名单去抄家',
        '陈三的铺子被抄——他找上门来，手在抖：「你爹在世的时候，我帮他看了二十年账」',
        '陈三的质问：「你爹要是活着，看到你今天做的事……」没说完，转身走了。回头一句：「你爹的账，是干净的。你的呢？」',
        '婉清在隔壁——什么都听到了。但她没有出来'
      ],
      requiredNPCs: ['沈婉清', '陈三'],
      memoryItem: '客户名单',
      sceneDirective: {
        location: '家中厅堂，门口——陈三站在面前，隔壁就是账房',
        time: '傍晚，抄家刚发生。陈三从被抄的铺子直接赶来',
        atmosphere: '压迫感极强。厅堂里空气凝滞。隔壁账房的灯火还亮着——婉清在里面',
        requiredElements: ['陈三', '被抄后残破的账本碎片（陈三带来的）', '门外的夜色', '隔壁账房亮着的灯'],
        forbiddenPatterns: ['痛哭流涕', '解释一大堆', '你怎么能这样', '我不是故意的']
      },
      characterDirective: {
        '陈三': {
          state: '被出卖的忠仆。一辈子帮老东家看账，如今被老东家的儿子出卖。积攒了二十年的信任在一夜之间崩塌',
          speechStyle: '最朴实的话。不动手不哭。只是站着质问。每句话都是事实——事实比控诉更重',
          physicalDetails: ['手在抖', '衣服上有灰——刚被抄完', '眼睛红了但没有泪']
        },
        '沈婉清': {
          state: '在隔壁听到了一切。T7她说「我会守这个家」——现在你亲手把她推入了危险。她没有出来——但沉默本身就是控诉',
          speechStyle: '不说话。她的沉默比任何台词都重',
          physicalDetails: ['在隔壁账房', '灯火亮着——她没吹灯', '门虚掩着']
        }
      },
      toneDirective: {
        overall: '全商贾线最沉重的一场——压迫感和背叛的重量。不是吵架，是审判',
        technique: '用「隔壁全听到」制造空间压迫——婉清在场但不出场，沉默比争吵更有杀伤力',
        pacing: '陈三的台词密而重——像鼓点。然后大段沉默——留给隔壁的婉清'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '试图暗中补偿陈三——托人送银子',
          emotionalNote: '愧疚驱动，但银子买不回信任',
          effect: { bond: 3, power: -5 },
          rippleHint: '陈三不收。「你爹的银子我不要。嫌脏。」——愧疚被拒绝，无法弥补',
          condition: null
        },
        {
          label: 'B',
          direction: '什么都不做——「这是唯一的路。」',
          emotionalNote: '自我说服，但内心知道这不是答案',
          effect: { power: 5, bond: -8 },
          rippleHint: '婉清那晚没跟你说话。第二天她偷偷出了门——用嫁妆钱给陈三家送了一包银子',
          condition: null
        },
        {
          label: 'C',
          direction: '去找婉清——在账房找到她',
          emotionalNote: '试图面对，但婉清用父亲的话审判了你',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '她在翻陈三以前管的账本。没看你。「陈三说的对。你爹的账是干净的。」',
          condition: null
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-SG-1选C',
          beat: '陈三走时回头说了句：「你爹改了的账——我帮你爹改的。你连改都没改。」',
          implication: 'T1你追问的「不干净的账」在此变成回旋镖——父亲的「改了」和你的「没改」形成对照'
        },
        {
          condition: 'EA-SG-6选A',
          beat: '婉清在隔壁听到陈三的话后，终于出来了。她只说了一句：「生意就是生意，对吧？」',
          implication: 'T19你的冷漠回应在此回旋——婉清用你的话来审判你'
        },
        {
          condition: 'EA-SG-6选C',
          beat: '婉清在隔壁沉默。她想起T19你说「是我想得不够周全」——那次你认了错，这次你交了人',
          implication: 'T19的认错在此被反讽——承认错误和改正错误是两回事'
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈三的质问中，提取关于「干净/二十年/你爹」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '亲手伤害节点。全商贾线最痛的一刀。陈三通过T1/T2/T3三次提及被玩家认识——T26他被出卖了。婉清在T7说「我会守这个家」——你亲手把她推入了危险。账本是贯穿全线的核心道具：T3父亲递出→T12婉清翻出最后一页→T26你交出了名单（账本上的人）。'
    },
    {
      id: 'EA-SG-5',
      title: '账本二',
      triggerTurn: 28,
      year: 1385,
      coreEvent: '郭桓案爆发，婉清翻出父亲旧账本后半部分——父亲把一辈子所有灰色交易全记了下来，最后一行「为儿入仕，散尽家财」。「把账做清」的智慧在此完成传承。',
      emotionalArc: '紧张→震惊→沉默→领悟',
      keyBeats: [
        '郭桓案爆发——户部系统大清洗，人人自危',
        '婉清从柜子里拿出旧账本——好几年没见了',
        '翻开后半部分：父亲把一辈子所有灰色交易全记在这里——每一笔，日期、金额、对象',
        '最后一行：「洪武十三年，为儿入仕，散尽家财——此为最后一笔。」',
        '婉清：「他知道会有人来查。所以他提前把账做清了。不是为了自己——是为了你。」'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '烧/锁账本',
      sceneDirective: {
        location: '家中账房，深夜，柜子前',
        time: '郭桓案风暴中，深夜紧急翻找',
        atmosphere: '紧张但有序——婉清像公公一样冷静地翻账本，窗外是风声',
        requiredElements: ['旧账本', '烛光', '柜子', '窗外风声（暗示搜查的可能）'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '父亲真伟大', '太好了有救了']
      },
      characterDirective: {
        '沈婉清': {
          state: '经历了T26的崩塌后重新撑起家。她此刻像公公一样——用数据保护家人',
          speechStyle: '平静、有条理。翻账本的动作像公公翻账本——一脉相承',
          physicalDetails: ['手指翻着发黄的账页', '灯光映在脸上', '声音很稳']
        }
      },
      toneDirective: {
        overall: '风暴中的传承——父亲不在了，但他的智慧在账本里保护着全家',
        technique: '物件>语言。账本>拥抱。「为儿入仕」>「父爱如山」',
        pacing: '翻账本→沉默→翻到最后一行→一击即中'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '收好账本——「爹的账，一笔都不能错。」',
          emotionalNote: '接过了父亲最重要的技能：把账算清楚',
          effect: { wisdom: 5, bond: 5 },
          rippleHint: '你学会了父亲最重要的一课——把账算清楚。这个技能在后面的政治风暴中救了你好几次',
          condition: null
        },
        {
          label: 'B',
          direction: '烧掉——「过去了就过去了。」',
          emotionalNote: '洒脱但有隐患——婉清的眼神说明她不同意',
          effect: { bond: 3, power: 3 },
          rippleHint: '婉清看着你把账本烧了。她没拦。但火光里你看到她的眼睛——她在想，如果有一天你也出了事，谁来替你「把账做清」？',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从父亲的账本记录或婉清的解读中，提取关于「做清/最后一笔/为儿」主题的一句原话作为keyQuote'
      },
      linksTo: '郭桓案',
      designNote: '商贾线传承节点。不是银子，是「把账算清楚」的能力。账本从T3递出→T12翻出最后一页→T28翻出后半部分——核心道具第三次出现。选B烧账本在T55会有回响。'
    },
// --------------------------------------------------------
// EA-SG-NEW-E 空街 (T30, 1387) [余波] 填补T28-T35空白
// --------------------------------------------------------
    {
      id: 'EA-SG-NEW-E',
      title: '空街',
      triggerTurn: 30,
      year: 1387,
      coreEvent: '隔壁的陈记布庄被封了——不是因为陈三犯了什么事，是因为「家资过万」的新册子重新造了。陈三站在门口，看着差役贴封条。街上一眼望过去——左边三间关了，右边两间贴着「迁」字。你站在自家铺子门口，看着这条走了十几年的街——它突然变得很安静。婉清在身后说了一句：「陈三家的——去年还跟我们借过石磨。」',
      emotionalArc: '日常的平静→看见封条的震动→数空铺时的沉默→婉清那句话击穿防线',
      keyBeats: [
        '铺子门前。上午，阳光照在街上——和平常一样的阳光，但街上的人少了。陈三站在他的铺子门前——不是在做生意，是站着看差役贴封条。封条是红色的，「官封」两个字盖了户部的大印，浆糊刷得很厚——差役贴的时候特意在门框上多刷了一遍，贴得死死的。陈三没有拦，两手垂在身体两侧，看着封条从左贴到右。他的伙计站在身后，搬了两个包袱——能带走的都带走了，带不走的就是铺子本身',
        '「封了。」他说。你：「因为——」陈三摇头：「没因为什么。造了新册子——家资过万的都迁。」他的声音很平，像在报账。「我的铺子——三间。存货——二十匹布。账上的钱——加起来——差不多过万。」他做了三十年生意。他摆手：「算了。别算。算了自己吓自己。」他转身往巷子里走——今天就要搬去凤阳。走了两步他回头看了一眼铺子——封条在风里角翘了一下。他没停。走了',
        '你顺着街看过去——左边：张记粮铺门关了，门板上用炭笔写了个「迁」字，字迹潦草；赵记南货，封条已经贴了，封条下面的门缝里夹着一张纸——是账页，搬东西时掉出来的，风把账页吹得一翻一翻。右边：王记药铺搬了一半，柜台还露在外面，柜台上放着一杆秤——秤砣没了，只剩秤杆和空盘子。一共七间铺子，三间封了，两间要迁，一间搬了一半。只剩你的铺子和巷子口的豆腐坊还开着。整条街——你走了十几年的街——安静得像散了场的集市',
        '你回到家。婉清在账房里——她听到消息了，没有问你，因为她从窗口已经看到了。她手里拿着算盘——但没有拨，算珠一动不动。你坐下来。婉清把算盘推到一边：「算过了。」你：「什么？」婉清：「咱们家——要是也算上铺面的话——」她没说完，把账本翻到最近一页，指给你看一个数字。你没说话。婉清把算盘拿回来，开始拨——不是为了算，是因为手需要动。算珠响了几声，然后她停了。她说了那句话：「陈三家的——去年还跟我们借过石磨。」石磨——去年陈三媳妇来借石磨磨豆子，还的时候沾着豆渣，婉清洗了半天。一个借石磨的人，今天被迁了'
      ],
      requiredNPCs: ['陈三', '沈婉清'],
      memoryItem: '封条下面门缝里夹着的账页',
      sceneDirective: {
        location: '铺子门前的街上+家中账房',
        time: '上午，阳光照在空街上',
        atmosphere: '日常中的崩塌——阳光和平常一样，但街空了',
        requiredElements: ['封条（「官封」红纸+户部大印）', '街上的空铺数量（从左数到右）', '陈三报账时的声音', '婉清手里的算盘没有拨', '「借石磨」这句话'],
        forbiddenPatterns: ['锦衣卫直接出场', '煽情音乐式的心理描写', '过度戏剧化的告别']
      },
      characterDirective: {
        '陈三': {
          state: '做了三十年生意的布商，今天被「家资过万」的新册子封了铺子——用报账的方式描述自己被碾碎',
          speechStyle: '说话像在报账——「三间铺子、二十匹布、加起来过万」——用数字描述自己的毁灭；笑是「你也来了」的笑，不是告别的笑',
          physicalDetails: ['两手垂在身体两侧看封条', '转身往巷子里走，回头看了一眼铺子但没停']
        },
        '沈婉清': {
          state: '已经算过了——她比你知道得早。用生活细节表达恐惧',
          speechStyle: '「算过了」的意思是「算完了，不想算了」；「陈三家的借过石磨」——用生活细节表达恐惧，不是「下一个就是我们」，而是「去年她还在借石磨」',
          physicalDetails: ['手里拿着算盘但没有拨，算珠一动不动', '把算盘推到一边', '拨了几下算珠又停了']
        }
      },
      toneDirective: {
        overall: '用「空街」传达制度碾压的规模——不是一个人的悲剧，是一整条街的消失',
        technique: '用「陈三报账」做叙事——他不说「我完了」，他说「三间铺子、二十匹布、加起来过万」——用商人的语言描述自己的毁灭。与T28父亲的「散尽家财」呼应：父亲用数字安排后事，陈三用数字描述被碾',
        pacing: '中慢。前半段街上是中速——走动、观察、对话；后半段回到家变慢——婉清放下算盘，「借石磨」三个字之后的空白是全篇最慢的点'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '回家让婉清算——「咱们的账——到底过没过万。」',
          emotionalNote: '想搞清楚自己的处境——数字是商人唯一能抓住的东西',
          effect: { wisdom: 5 },
          rippleHint: '婉清拨了一下午的算盘。最后报了一个数。你听了没说话。她看着你：「没到。但——不远了。」T35月下算账时你想起今天下午——那次婉清报的数比今天又近了一步。T38追赃时「不远了」变成了「够了」',
          condition: null
        },
        {
          label: 'B',
          direction: '去帮陈三搬东西——「走之前，帮你收拾。」',
          emotionalNote: '用劳动代替告别——帮同行搬最后一次',
          effect: { bond: 8 },
          rippleHint: '陈三的铺子里还剩几匹布——带不走的。你帮他搬到一个箱子里。箱子里还有陈三父亲的旧账本——「这个你带走。」陈三把账本塞给你。你翻开最后一页——「洪武二十年，铺面三间，存货足用」。T35你翻出这本账——陈三「足用」的铺子，七回合前封了',
          condition: null
        },
        {
          label: 'C',
          direction: '关上门，不看了。在账房里坐了一下午',
          emotionalNote: '不敢看——关上眼就是封条的红',
          effect: { bond: 3 },
          rippleHint: '婉清端了茶进来。你接过茶碗——碗在手里抖了一下。婉清看见了，没说。她坐在你对面，两个人喝了一下午的茶。茶凉了三遍，谁也没续热水。T35月下她崩溃时说「陈三——二十年——只值这个数」——你想起今天下午关着门的账房，凉了三遍的茶',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈三报账或婉清「借石磨」的对话中，提取关于「过万/封/借石磨」主题的一句原话作为keyQuote'
      },
      linksTo: '月下的账',
      designNote: '此EA填补T28-T35的7回合空白，让商贾线「数字碾压」主题从「纸上的数字」变成「街上的人」。T28父亲用数字安排后事（纸上的数字），T30陈三用数字描述自己被碾（嘴上的数字），T35婉清在月下算了一辈子的数字（心里的数字）——三个数字场景层层递进。与T15迁富令形成对照：T15「家资过万是标准」是消息；T30你自己站在那条街上，陈三站在你面前报数——消息变成了眼前的脸。与T38追赃衔接：T30「过万」是门槛——你还没到；T38「一匹绢也算」——门槛取消了'
    },
    {
      id: 'EA-SG-8',
      title: '月下的账',
      triggerTurn: 35,
      year: 1389,
      coreEvent: '月下夫妻二人算一辈子总账。婉清突然崩溃：「陈三……二十年……只值这个数吗？」她哭了——第一次在你面前承认自己做错了。',
      emotionalArc: '温暖→平静→崩溃→相互依偎',
      keyBeats: [
        '婉清把家中总账铺开在院子——月下算账，像过日子一样',
        '算着算着婉清突然停了——她提起陈三',
        '「你爹的老伙计……只值这个数吗？」——账本上的补偿数字刺痛了她',
        '「二十年……就值这个数？」她哭了——第一次在你面前承认错误',
        '擦完眼泪继续算账——「算完。不能糊涂。」——这是婉清的方式'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '月下的账本',
      sceneDirective: {
        location: '家中院子，石桌',
        time: '月夜，秋凉。账本铺满石桌',
        atmosphere: '月光如水，虫鸣阵阵。温暖但有一道裂痕——像玉上的裂纹，看得见摸得到',
        requiredElements: ['总账本铺在石桌上', '月光', '笔和砚台', '虫鸣', '两杯凉了的茶'],
        forbiddenPatterns: ['心中涌起暖流', '岁月静好', '她哭得好美', '一切都会好的']
      },
      characterDirective: {
        '沈婉清': {
          state: '最脆弱的时刻。从T19的自负到T26的愧疚到T35的崩溃——积累到了极限',
          speechStyle: '用算账掩饰情感，但数字本身击穿了她。「二十年」和「这个数」的对比让她崩了',
          physicalDetails: ['握着笔停了', '眼泪在眼眶里打转但没掉', '月光照在脸上']
        }
      },
      toneDirective: {
        overall: '温暖但带裂痕——不是完美的美好，是碎了又粘起来的美好',
        technique: '月光>烛光。数字>眼泪。「二十年」对比「这个数」——数字是最锋利的情感载体',
        pacing: '前半轻松（算账），突然停顿（留三行空白），后半缓慢蔓延'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '抱住她——不说话，让她哭完',
          emotionalNote: '陪伴是最重的回答。不是解决问题，是共同承受',
          effect: { bond: 10 },
          rippleHint: '她靠在你肩上哭了一会儿。然后擦了擦眼泪，继续算账。「算完。不能糊涂。」——这是婉清的方式',
          condition: null
        },
        {
          label: 'B',
          direction: '承诺继续补偿——「不够。我再想办法。」',
          emotionalNote: '担当。婉清会停下来看你——「你也觉得不够」',
          effect: { bond: 8, power: -3 },
          rippleHint: '你第二天又托人去了陈三家。这次陈三没收银子，但收了米。「你媳妇……比你有良心。」',
          condition: null
        },
        {
          label: 'C',
          direction: '揽下责任——「这不是你的错。是我的决定。」',
          emotionalNote: '不推卸。婉清会回应「是我们」',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '婉清看了你一眼。「是我们。」她的声音哑了。「夫妻。一起算。一起还。」',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清的崩溃中，提取关于「二十年/值/数」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '喘息-美好节点。婉清不是完美的——她犯错、她自负。但她会哭着认错，会偷偷补偿。T26她偷偷给陈三家送银子→T35月下终于崩溃承认。「只值这个数吗」是全线最痛的数学题——不是算账，是算良心。这是她最脆弱的时刻，也是你们最接近的时刻。'
    },
// --------------------------------------------------------
// EA-SG-NEW-D 李善长案·追赃 (T38, 1390)
// --------------------------------------------------------
{
      id: 'EA-SG-NEW-D',
      title: '李善长案·追赃',
      triggerTurn: 38,
      year: 1390,
      coreEvent: '李善长案追赃波及江南富户。邻居张家昨天被抄——「跟李家有过生意往来的都得查」。婉清翻着账本，一笔一笔算下去——每一笔都对应着一家人的命运。算到自家那一笔时，她停了。',
      emotionalArc: '震惊→恐惧→精密计算中的绝望→放弃的预兆',
      keyBeats: [
        '清晨，婉清坐在桌前，桌上摊着三本账本——自家的、邻里的、往年的。窗外巷口有人在搬东西，隔壁张家的门被贴了封条',
        '婉清头也不抬：「张家——去年十月有一笔二百两的丝绸生意，买主是韩国公府上的管事。查了。」',
        '「我们家——洪武十八年，你托人给韩国公府上送过一匹绢。」她把账本推到面前。「一匹绢。他们查不查？」',
        '账本上密密麻麻的数字。婉清用毛笔在某些数字旁画了圈——每一个圈对应一个被查的邻居。圈越画越多，像墓碑一样排列在账本上',
        '婉清合上账本，指甲掐进了封面的皮里。「查到这里了——就到这里了。」'
      ],
      requiredNPCs: ['婉清'],
      memoryItem: '账本上的圈',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清盘算追赃风险的对话中，提取关于「一匹绢/他们查不查」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '沈家内堂（卧室兼理账处）',
        time: '清晨，天刚亮',
        atmosphere: '恐怖的平静——婉清越冷静越恐怖。巷口的嘈杂声、封条被贴上的声音从窗口传入',
        requiredElements: ['三本账本「, 」账本上画的圈（每圈=一家被查）「, 」张家门上的封条（从窗口可见）「, 」婉清掐进封面的指甲'],
        forbiddenPatterns: ['抄家很惨「, 」心中涌起暖流「, 」嚎啕大哭']
      },
      characterDirective: {
        '婉清': {
          state: '极度冷静，冷静到反常——她不是在算账，她是在算自己的死期',
          speechStyle: '报数字——每个数字对应一家人。不用形容词，不用感叹',
          physicalDetails: ['翻到账本第三十七页「, 」用毛笔在数字旁画圈「, 」指甲掐进封面皮里']
        }
      },
      toneDirective: {
        overall: '用「数字」传达恐怖——不是抄家场面恐怖，是婉清在账本上画的圈恐怖',
        technique: '用婉清的「精密计算」反衬绝望——她算得出来，但她算不过制度',
        pacing: '慢——每个数字之间有停顿，像倒计时'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「我们先把……处理一些。」——暗示转移资产',
          emotionalNote: '恐惧驱动的行动——但你能逃过账本吗',
          effect: { jinchen: -5, wisdom: 3 },
          rippleHint: '婉清：「追赃不查你现在有多少——查你曾经有过多少。账上都写着。」你想起T15迁富令时的教训——散了也没用。T45「商道末路」时你发现转移的痕迹也被查到了',
          condition: null
        },
        {
          label: 'B',
          direction: '「一匹绢……他们不会查这么小的吧？」——心存侥幸',
          emotionalNote: '侥幸心理——标准是他们定的还是你定的？',
          effect: { wisdom: -3 },
          rippleHint: '婉清看了你一眼——这个眼神和T15迁富令时一模一样。「你觉得标准是他们定的还是你定的？」T45时你知道那匹绢确实被查了',
          condition: null
        },
        {
          label: 'C',
          direction: '「爹散尽家财——我们还有多少散？」——问一个没有答案的问题',
          emotionalNote: '面对现实——但现实没有答案',
          effect: { bond: 3, jinchen: -3 },
          rippleHint: '婉清沉默了。她把账本合上，码整齐。「够了。散到和爹一样——就够了。」但你知道不够。T55「最后的账」时你写下「账清了」——散尽了，也清了',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: 'T38四线交汇的商贾视角——「一匹绢」。让玩家通过婉清的「数字」体验追赃制度的恐怖。婉清从T7「我会守这个家」到此处的精密计算——她的弧线达到第三层绝望的顶峰：她算得出来，但她算不过制度。'
    },

    {
      id: 'EA-SG-9',
      title: '商道末路',
      triggerTurn: 45,
      year: 1393,
      coreEvent: '蓝玉案后商业环境急剧恶化，铺子从五间关到两间。婉清说「要不我们走吧。我累了。」——T35月下算账的温暖在此被摧毁，连账都算不下去了。',
      emotionalArc: '疲惫→退意→试探→沉重',
      keyBeats: [
        '蓝玉案余波——商业环境急剧恶化，铺子一间间关',
        '从五间变三间，又变两间——桌上是一摞关铺子的告示',
        '婉清放下最后一张告示：「要不……我们走吧。」',
        '「离开应天。去杭州。或者更远的地方。」',
        '「我累了。」——全线最疲惫的三个字'
      ],
      requiredNPCs: ['沈婉清'],
      memoryItem: '关铺子的告示',
      sceneDirective: {
        location: '家中账房——空了大半，只剩两张桌子和残存的账本',
        time: '傍晚，又一张关铺告示贴回来',
        atmosphere: '空荡。账房曾经堆满账册，现在只剩一摞告示。冷',
        requiredElements: ['关铺告示一摞', '空了的账房', '残存的几本账', '窗外冷风'],
        forbiddenPatterns: ['心中涌起暖流', '天无绝人之路', '振作起来', '一切都会好的']
      },
      characterDirective: {
        '沈婉清': {
          state: '不是T7的精明能干了。T35哭过后异常平静——不是认命，是真的累了',
          speechStyle: '很轻。很短。像算盘上最后几颗珠子——拨不动了',
          physicalDetails: ['头发比T35白了许多', '坐着没动', '手放在告示上没拿开']
        }
      },
      toneDirective: {
        overall: '末路感——不是戏剧性的崩溃，是缓慢的熄灭。像账房里的灯，油快尽了',
        technique: '用数字（铺子数量递减）替代形容词。「我累了」三个字>一千字描写',
        pacing: '极慢。每个节拍之间留大段空白——只写空荡的账房和窗外的冷风'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '同意离开——「好。走。」',
          emotionalNote: '放弃一切换自由——最真的回应',
          effect: { bond: 10, power: -10 },
          rippleHint: '婉清笑了——这些年你见过的最真的笑。「那就走。什么都别带了。带上账本就行。」',
          condition: null
        },
        {
          label: 'B',
          direction: '拒绝——「走不了。走了就是逃。」',
          emotionalNote: '不是勇气，是困在局中出不来',
          effect: { power: 5, bond: -5 },
          rippleHint: '婉清没说话。继续算账。但她不是在算数字——她是在和命运较劲',
          condition: null
        },
        {
          label: 'C',
          direction: '拖延——「再撑撑。也许会有转机。」',
          emotionalNote: '虚假希望比绝望更疲惫',
          effect: { wisdom: 3 },
          rippleHint: '婉清看了你一眼。「你也信这个了？」她没嘲笑你——她只是……很疲倦',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从婉清的话中，提取关于「累/走/撑」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '被摧毁的美好节点。T35月下算账的温暖在此被摧毁——连算账都算不下去了。「我累了」三个字是全线最疲惫的时刻。婉清从T7「我会守这个家」到T45「要不走吧」——守不住了。'
    },
    {
      id: 'EA-SG-10',
      title: '最后的账',
      triggerTurn: 55,
      year: 1394,
      coreEvent: '主角最后一次翻开父亲旧账本，在「此为最后一笔」旁写下「账清了」——一本账本从T3传到这里，全线完成闭环。',
      emotionalArc: '沉重→释然→安静→圆满',
      keyBeats: [
        '最后一次翻开父亲旧账本——账本发黄得快要碎了',
        '翻到最后一页——「此为最后一笔」——父亲的字',
        '拿起笔，在旁边加了一行：「账清了。」',
        '合上账本。低声说：「爹。账清了。」'
      ],
      requiredNPCs: ['父亲（回忆）'],
      memoryItem: '账本最后一页',
      sceneDirective: {
        location: '家中书房，桌上只有一本账本和一盏油灯',
        time: '深夜，新朝到来前最后的安静',
        atmosphere: '极安静。账本快碎了，但字还在。油灯将尽，但还亮着',
        requiredElements: ['发黄的旧账本', '油灯', '笔', '父亲牌位或窗户（对着外面的天）'],
        forbiddenPatterns: ['热泪盈眶', '回忆杀式的闪回描写', '爹啊你在天之灵', '感慨万千']
      },
      characterDirective: {
        '父亲（回忆）': {
          state: '已故。但他的字在账本上——「此为最后一笔」。他在回忆中出现，不是幻觉，是记忆',
          speechStyle: '只通过账本上的字出现。厚道、干净、一笔一划',
          physicalDetails: ['发黄的字迹', '一笔一划很工整', '墨迹已淡但还看得清']
        }
      },
      toneDirective: {
        overall: '安静到近乎无声——一个人、一本账、一盏灯。不需要任何戏剧性',
        technique: '让账本自己说话。不解释不抒情。只写字、合账本、一句话',
        pacing: '极慢。极轻。像放下一件瓷器'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '锁进柜子——把钥匙交给婉清',
          emotionalNote: '传承。账本是家训，留给下一代',
          effect: { bond: 8, wisdom: 5 },
          rippleHint: '钥匙放在婉清手里。「这是我们家的账。以后给孩子看。」',
          condition: null
        },
        {
          label: 'B',
          direction: '放在父亲牌位前——让账本陪他',
          emotionalNote: '完成。传承的闭环，父子在账本上重逢',
          effect: { bond: 10 },
          rippleHint: '你在牌位前站了很久。「爹。你教我的，我学会了。账是干净的。」',
          condition: null
        },
        {
          label: 'C',
          direction: '烧了——和T28一样',
          emotionalNote: '终结。呼应T28烧账本的选择',
          effect: { bond: -3, power: 3 },
          rippleHint: '火烧起来时，你想起了父亲的手——翻账本的手。你闭上了眼睛',
          condition: null
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}写了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从账本最后一页的父子笔迹中，提取关于「账清/干净/最后一笔」主题的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '终局·传承节点。从T3父亲递出账本到T55你写下「账清了」——一本账本串联全线。父亲在T3说「账是干净的」，你在T55写下「账清了」——两句话完成全线闭环。'
    }
  ],

  // ──── 前元线：身份的枷锁（10个） ────
  '落魄前元官员之后': [
{
      id: 'EA-QY-1',
      title: '旧木箱',
      triggerTurn: 3,
      year: 1375,
      coreEvent: '除夕夜，主角发现母亲深夜在院中对旧木箱中的前元锦袍低语——那是父亲做翰林待制时穿的官服，是他来南方后唯一一次穿上又脱下的衣裳。',
      emotionalArc: '疑惑→心疼→震动',
      keyBeats: [
        '半夜醒来发现母亲不在房中，院子里传来细微声响',
        '母亲蹲在地上，面前是旧木箱，手在摸着袍子上的补子，嘴唇在动',
        '发现主角后手一抖——「这是你父亲的。他做御史的时候穿的。」',
        '「那是他来南方后，唯一一次重新穿上这身衣裳——去翰林院赴任那天。回来的时候，他把袍子脱了下来，锁进了箱子。他说——让过去留在这里吧。从此再也没穿过。」'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '旧锦袍',
      sceneDirective: {
        location: '家中院子，旧木箱前',
        time: '除夕深夜，天寒',
        atmosphere: '冷寂的除夕夜，院中只有微弱的烛光，旧木箱打开，前元锦袍的补子在光下若隐若现',
        requiredElements: ['旧木箱', '前元锦袍（带补子的官服）', '微弱烛光', '夜寒气息'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '你知道这意味着什么']
      },
      characterDirective: {
        '陈秀英': {
          state: '被儿子撞见深夜对着亡夫旧袍低语，惊恐与倾诉欲并存。话到深处会说起丈夫来南方后唯一一次穿上官服去翰林院赴任、回来后便锁起再没穿过的事',
          speechStyle: '声音轻，语句不完整。提到丈夫时语速更慢，像在回忆一个不敢回忆的画面',
          physicalDetails: ['手在抖', '嘴唇在动（像在跟袍子说话）', '蹲在地上']
        }
      },
      toneDirective: {
        overall: '克制、沉默中有重量——旧物比语言更能说话',
        technique: '物件>独白。木箱和锦袍是主角，母亲的颤抖是注脚',
        pacing: '慢。除夕夜的安静托底，每个动作之间留足沉默'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '沉默行动——蹲下来帮她把袍子叠好放进箱子，什么都不问',
          emotionalNote: '用行动告诉她：我理解，我不追问，我陪你',
          effect: { bond: 8 },
          rippleHint: '母亲看了你一眼。「你比你父亲心细。」她把箱子锁好。你注意到钥匙她一直挂在脖子上',
          condition: null
        },
        {
          label: 'B',
          direction: '温情追问——请母亲讲父亲的故事',
          emotionalNote: '儿子想了解父亲，这是信任也是一种触碰禁忌',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '母亲沉默了很久。「你父亲是个好人。但好人……在那个朝代活不长。」她没有多说。但从此她看你的眼神变了——多了一层信任',
          condition: null
        },
        {
          label: 'C',
          direction: '现实警告——这袍子被看到是死罪，不能留了',
          emotionalNote: '说的是事实，但事实有时候比刀子更伤人',
          effect: { bond: -5, wisdom: 3 },
          rippleHint: '母亲的手缩回去了。她把箱子锁上，站起来。「我知道。」她的声音很平，但你看到她的眼眶红了。她不是因为你说得对而哭——她是因为连儿子都在叫她忘掉',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈秀英的对话中，提取关于「父亲/翰林院/穿上又脱下/让过去留在这里」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '旧木箱是前元线的核心叙事道具。锁着的不是衣服，是一个被抹去的身份。'
    },
    {
      id: 'EA-QY-2',
      title: '月夜',
      triggerTurn: 8,
      year: 1379,
      coreEvent: '中秋夜，母亲做月饼时透露她隐忍了二十四年的秘密——为了儿子，她一直假扮杭州汉人。',
      emotionalArc: '安宁→震动→沉重的信任',
      keyBeats: [
        '母亲在院子里做月饼，手法熟练——中秋的温暖日常',
        '突然问：「在外面，有没有人问你——你母亲是不是元人？」',
        '坦白：散开头发，换汉人衣裳，说杭州来的——「我这样活了二十四年了。」',
        '看着月亮问：「你知道我为什么告诉你这些吗？」'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '月亮',
      sceneDirective: {
        location: '家中院子',
        time: '中秋夜，月光皎洁',
        atmosphere: '月饼的甜香混着秋夜凉意，月光铺满院子，母子相对而坐',
        requiredElements: ['月饼材料（面团、馅料）', '皎洁月光', '院中石桌或矮凳'],
        forbiddenPatterns: ['心中涌起暖流', '热泪盈眶', '你知道吗其实我']
      },
      characterDirective: {
        '陈秀英': {
          state: '借中秋的安心感半吐露隐藏二十四年的身份秘密，紧张中带着想信任儿子的渴望',
          speechStyle: '用日常口吻讲沉重的事。先试探再坦白。说到「二十四年」时声音会轻下去',
          physicalDetails: ['手法熟练地做月饼', '说话时会停下手里的活', '看着月亮']
        }
      },
      toneDirective: {
        overall: '温暖底色上的沉重——月光越美，秘密越重',
        technique: '用做月饼的动作串联对话。面团在手里，秘密在嘴边',
        pacing: '缓慢温馨，像月光倾泻。坦白后留出长段沉默让月光填满'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '温暖回应——因为在这个家里，你可以做自己',
          emotionalNote: '给母亲一个她等了二十四年的答案：这个家是安全的',
          effect: { bond: 10 },
          // v3.15.0: 前元线分支选择——认同母亲、接纳现状 → 亲明分支
          branchChoice: '亲明',
          rippleHint: '母亲看了你很久。「你跟你父亲一样聪明。」她转身继续做月饼。但她的手在抖',
          condition: null
        },
        {
          label: 'B',
          direction: '震惊追问——「妈……你是元人？」',
          emotionalNote: '虽然一直知道些蛛丝马迹，但亲耳听到还是不同',
          effect: { wisdom: 5, bond: 5 },
          // v3.15.0: 前元线分支选择——追问身世、心向旧族 → 亲北分支
          branchChoice: '亲北',
          rippleHint: '母亲的手停了。她没有回答。但沉默本身就是答案。「有些话，你知道了就装不知道。在外面——永远不要提。」',
          condition: null
        },
        {
          label: 'C',
          direction: '轻描淡写——「这些事过去了，现在是新朝」',
          emotionalNote: '新朝人的轻率，戳在旧朝遗孀的痛处',
          effect: { bond: -3 },
          rippleHint: '母亲笑了。「对。过去了。」她低头继续做月饼。但你知道，对她来说，什么都没过去',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈秀英关于身份隐瞒的对话中，提取关于「二十四年/月亮/为什么告诉你」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '身份的秘密。母亲的沉默不是因为懦弱，是因为爱。'
    },
// --------------------------------------------------------
// EA-QY-QM-1 危安 (T11, 1379)
// --------------------------------------------------------
{
      id: 'EA-QY-QM-1',
      title: '危安',
      triggerTurn: 11,
      year: 1379,
      branch: '亲明',
      coreEvent: '同是降臣后裔的同僚危安在值房里铺开第十篇「效忠文」——每篇都在说「臣心实向大明」，每篇都没人看。他还在写。',
      emotionalArc: '好奇→苦涩→自嘲→不安的预感',
      keyBeats: [
        '危安坐在角落，面前铺着一张新纸，写的是「臣祖虽仕元室，臣心实向大明」——这不是第一次了。上周写一篇，上上周也写一篇',
        '「你也是降臣之后。你写了没有？」他把笔往砚台上一搁，墨汁溅了一点在袖口上',
        '「效忠文啊。表忠心嘛。你看我这个——第十篇了。前九篇没人看。」',
        '案角摞着九篇旧稿——最上面那篇的纸已经发黄了。每一篇的开头都是同一句话：「臣伏惟圣朝以孝治天下——」',
        '窗外有个书吏走过，往危安的方向看了一眼——那一眼里带着笑意。危安假装没看见'
      ],
      requiredNPCs: ['危安'],
      memoryItem: '十篇效忠文',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从危安写效忠文的对话中，提取关于「写到第几篇他们才会信」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '吏部值房',
        time: '午后',
        atmosphere: '荒诞+心酸——一个在用文字自证清白的人，比任何受刑者都可怜',
        requiredElements: ['十篇效忠文的摞放「, 」袖口的墨渍「, 」「臣心实向大明」几个字「, 」窗外书吏带笑的一眼'],
        forbiddenPatterns: ['心中涌起暖流「, 」慷慨激昂「, 」美化妆点「贰臣」形象']
      },
      characterDirective: {
        '危安': {
          state: '三十多岁，面容憔悴，用自嘲的笑掩盖苦涩——他明知没有用，但还是写',
          speechStyle: '说话时带自嘲的笑，引用文章中的句子时声音越来越小',
          physicalDetails: ['把笔往砚台上一搁「, 」把十篇文章从左到右排开像摆牌「, 」手指在第十篇的边角摩挲']
        }
      },
      toneDirective: {
        overall: '危安是「亲明线」的微缩模型——他的荒诞就是整条线的荒诞',
        technique: '用「十篇文章」做具象化——九篇旧稿的纸黄和第十篇的新墨，就是「证明的徒劳」',
        pacing: '中等——危安的自嘲加快节奏，他在旧稿间比较时的停顿又慢下来'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「危安，别写了。写再多也没人看。」',
          emotionalNote: '直接——戳破他的幻想',
          effect: { bond: 3 },
          rippleHint: '危安不笑也不恼：「没人看？那我不写——他们就更不信了。」这句话在T12被验证：你不写效忠文，确实更被怀疑',
          condition: null
        },
        {
          label: 'B',
          direction: '坐下来，和他一起写一篇',
          emotionalNote: '同情——用自己的行动陪他',
          effect: { bond: 8 },
          rippleHint: '你写了一篇。措辞和危安的差不多。T12被要求写效忠声明时——你已经有「经验」了，但这份「经验」本身成了「早有预谋」的证据',
          condition: null
        },
        {
          label: 'C',
          direction: '什么都没说，走了。路过门口时听到窗外那个书吏在笑',
          emotionalNote: '沉默——用旁观者的角度记录',
          effect: { wisdom: 3 },
          rippleHint: '那个笑声在T12写效忠声明时回响——你听到「降臣之后写效忠书」的讥讽声，和这个笑声一模一样',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲明线的「预演」——危安是主角的「可能的未来」。用危安的十篇效忠文让亲明线玩家提前看到「越证明越被羞辱」的循环。危安在T11的荒诞在T12变成主角自己的经历。'
    },
// --------------------------------------------------------
// EA-QY-QB-1 蒙哥帖木儿 (T11, 1379)
// --------------------------------------------------------
{
      id: 'EA-QY-QB-1',
      title: '蒙哥帖木儿',
      triggerTurn: 11,
      year: 1379,
      branch: '亲北',
      coreEvent: '母亲娘家的侄子蒙哥帖木儿来访——年轻、气盛、被封了百户。他说「我们已经是明朝人了」——但你注意到他腰间别着一把蒙古弯刀，说话时偶尔夹带蒙古语。他说完「明朝人」后，压低声音问了一句：「北边——有消息。你听说了吗？」',
      emotionalArc: '亲切→不安→警惕→被拉入的犹豫',
      keyBeats: [
        '蒙哥帖木儿骑马来——马是军马。他进门时步子很大，笑声很响。给母亲行蒙古礼——半跪、右手抚胸',
        '饭桌上他喝马奶酒——自己带来的，汉人的米酒他「喝不惯」。然后压低声音：「姑姑——北边有消息。阿里不哥的后人在和林聚兵——」',
        '母亲放下筷子：「别说了。」蒙哥帖木儿看了主角一眼：「你呢？你听说了吗？」',
        '他坐着的时候手搭在刀柄上——刀鞘上刻着蒙古花纹，和明军的制式完全不同。桌上银碗（马奶酒）和瓷杯（米酒）并排',
        '饭后他在院子里背对正堂，望着北方。从怀里掏出一张叠得很小的纸，看了一眼，又塞回去了',
        '转身回来，脸上的表情已经变了——从「北望」的肃穆变成了「明朝百户」的笑。「姑父——我明天要去南京报到。蒙古左卫在招新兵。」'
      ],
      requiredNPCs: ['蒙哥帖木儿「, 」陈秀英'],
      memoryItem: '怀里的纸',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蒙哥帖木儿来访的对话中，提取关于「北边有消息/我们已经是明朝人了」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家里正堂+院子',
        time: '傍晚，饭桌上',
        atmosphere: '亲切中的裂痕——一家人坐在一起，但心里各有一块不在桌上的东西',
        requiredElements: ['蒙古弯刀（刀鞘上的花纹）「, 」银碗和瓷杯的对比「, 」蒙哥帖木儿从怀里掏出的纸「, 」他望北的背影'],
        forbiddenPatterns: ['锦衣卫/检校出场「, 」北元势力直接出场「, 」心中涌起暖流']
      },
      characterDirective: {
        '蒙哥帖木儿': {
          state: '二十出头，壮实，笑声大——他的身份在两种文化间滑动而不自知',
          speechStyle: '蒙古礼和汉话混着用。说「明朝人」时声音大，说北方消息时声音低。提到北方时眼神变了',
          physicalDetails: ['给母亲行蒙古礼「, 」手搭在弯刀上「, 」从怀里掏出一张叠得很小的纸']
        },
        '陈秀英': {
          state: '克制——听到「北边」时放下筷子，这个动作就是她的态度',
          speechStyle: '话少。「别说了」「吃饭。不提那边的事」——每句都是禁令',
          physicalDetails: ['听到「北边」时放下筷子「, 」看着弯刀时目光暗了「, 」没有接蒙哥帖木儿的酒']
        }
      },
      toneDirective: {
        overall: '蒙哥帖木儿是「亲北线」的引爆点——他的出现把「过去」带进了「现在」',
        technique: '用「两种酒」「两种杯子」做视觉对比——马奶酒vs米酒、银碗vs瓷杯——两种文化在同一张桌上',
        pacing: '中速——饭桌上的对话有快有慢，提到北方时节奏骤然加快又骤然停下'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '饭后单独问他：「那张纸——是什么？」',
          emotionalNote: '好奇+警惕',
          effect: { wisdom: 3 },
          rippleHint: '蒙哥帖木儿笑了一下：「北方来的信。你不想看？」你没看。但「北方来的信」这五个字在T15被检校发现联络记录时回响',
          condition: null
        },
        {
          label: 'B',
          direction: '母亲送你出门时说：「以后少来。」蒙哥帖木儿笑着答应了——但你知道他不会听',
          emotionalNote: '母亲的预警——你隐约感到不安',
          effect: { bond: 5 },
          rippleHint: '蒙哥帖木儿上马时回头看了一眼那把弯刀——「姑姑，这把刀留给表哥。」他把刀解下来递给你。你接了。T27他被牵连时，这把刀差点成了「通虏」的证据',
          condition: null
        },
        {
          label: 'C',
          direction: '什么都没说。看着他的背影消失——你想起母亲说过的话：「封侯就是买命」',
          emotionalNote: '沉默的观察——你还没做出选择，但蒙哥帖木儿的出现让你开始想',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: 'T15北方联络人被发现时，你想起蒙哥帖木儿望北的背影——「他到底是明朝的百户，还是蒙古的百户？」',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲北线的「种子」——蒙哥帖木儿带来的是「过去」的消息，但这个「过去」在明朝就是「罪」。建立玩家对蒙哥帖木儿的情感认同——他年轻、有活力、笑起来很大声——所以T27他被牵连、T33他被杀时，玩家才会真的心痛。与T11亲明线「危安」形成对照：一个在写效忠文，一个在怀里揣着北方的信。'
    },
// --------------------------------------------------------
// EA-QY-QM-2 效忠声明 (T12, 1379)
// --------------------------------------------------------
{
      id: 'EA-QY-QM-2',
      title: '效忠声明',
      triggerTurn: 12,
      year: 1379,
      branch: '亲明',
      coreEvent: '胡惟庸案前夕，朝中已风声鹤唳。降臣后裔被提前要求写「效忠声明」以示清白——你还没被定罪，但已经被要求自证。一个汉族同僚在隔壁工位上嗤笑了一声：「降臣之后写效忠书——跟元朝那些贰臣一样。」',
      emotionalArc: '屈辱→压抑的愤怒→麻木→自我质疑',
      keyBeats: [
        '户部公房，十二个工位，你是唯一的降臣后裔。案上铺好了一张白纸——标题「效忠声明」四个字已经用楷体写好',
        '隔壁工位的张书吏探过头来看了一眼——然后「嗤」了一声。声音刚好够你听到：「降臣之后写效忠书——跟元朝那些贰臣一个样。」',
        '你的手停在半空——笔尖的墨在纸上点了一个点。你没有抬头。继续写。「臣伏惟——」写不下去了',
        '你写了三行，划掉两行。废纸团了一个又一个。张书吏慢悠悠地喝了一口茶，眼睛从茶壶边缘看你',
        '你把写好的效忠声明折起来——手在发抖，纸角折歪了。第二次手不抖了——因为已经麻了'
      ],
      requiredNPCs: ['张书吏'],
      memoryItem: '桌布上的墨印',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从张书吏嗤笑与写效忠声明的场景中，提取关于「降臣之后写效忠书」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '户部公房（开放式办公场所，多人共用）',
        time: '上午，有阳光',
        atmosphere: '屈辱感——在众目睽睽下的羞辱比暗处的监控更刺痛',
        requiredElements: ['统一格式的「效忠声明」标题「, 」废纸团「, 」张书吏的茶壶「, 」桌布上的墨印'],
        forbiddenPatterns: ['心中涌起暖流「, 」当场爆发「, 」慷慨陈词']
      },
      characterDirective: {
        '张书吏': {
          state: '轻蔑但不恶意——他只是觉得好笑。但他每一声笑都在割你的尊严',
          speechStyle: '不对你说话，对同僚说话——声音刚好够你听到。把「嗤」字说得像茶余饭后的谈资',
          physicalDetails: ['探过头来看了一眼「, 」慢悠悠喝茶「, 」推过来一块干净的布——不是好意，是嫌你弄脏了桌布']
        }
      },
      toneDirective: {
        overall: '用「嗤笑」传达羞辱——不是酷刑、不是威胁，是一声笑。一声笑比一刀更疼',
        technique: '用「手抖→手麻」做情感递进——不说「屈辱」，用折纸时手的变化来传达',
        pacing: '慢到窒息——每一秒的停顿都是屈辱的延长'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '写完后当面交给主事官——「臣之忠心，天地可鉴」',
          emotionalNote: '屈辱中的尊严——你在众人面前完成了这件事',
          effect: { bond: 3, power: 3 },
          rippleHint: '主事官接过看了一眼：「嗯。」就一个字。张书吏又「嗤」了一声。T18被嘲笑时你想起这个「嗯」字——交上去也没人当回事',
          condition: null
        },
        {
          label: 'B',
          direction: '写完后把声明放在案上，走了。没交',
          emotionalNote: '无声的反抗——代价是「不配合」的记录',
          effect: { power: -3, wisdom: 5 },
          rippleHint: '第二天主事官把你叫去：「你的声明呢？」你交了。但「迟交」被记在档案里。T27被审查时这个记录被翻出来',
          condition: null
        },
        {
          label: 'C',
          direction: '回家后把写废的纸团摊开，一个字一个字重看',
          emotionalNote: '自我确认——你的真心和你的处境之间的矛盾',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '母亲看到你手上的墨印，没问。晚饭时她多做了一个菜——她用菜说话。T15故人密信被截获时，你想起这顿沉默的晚饭',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲明线「越证明越被羞辱」的核心场景。让玩家亲身经历一声「嗤笑」的重量——不是酷刑的恐怖，是日常羞辱的刺痛。与T11危安的十篇效忠文形成精确对照：危安已经习惯了被笑，你还是第一次。'
    },

    {
      id: 'EA-QY-3',
      title: '故人',
      triggerTurn: 15,
      year: 1382,
      coreEvent: '自称「从北方来的故人」送来密信，信上用元人文字写着母亲的名字。母亲看后烧信，追问儿子是否信她——她的秘密可能比想象的更深。',
      emotionalArc: '警觉→恐惧→信任的考验',
      keyBeats: [
        '陌生人送来密信——信封上的元人文字写着母亲的名字',
        '母亲看第一行脸色就变，当即烧信——「不要再提这件事。」',
        '坦白：那人是父亲在大都时的同僚，「他不该来的」',
        '隔壁传来声响——妻子站在门口，脸色苍白。她显然也看到了信封上的文字',
        '最后的信任之问——「儿子。你信不信我？」'
      ],
      requiredNPCs: ['陈秀英', '妻子'],
      memoryItem: '烧掉的信',
      sceneDirective: {
        location: '家中',
        time: '日间，突然有客',
        atmosphere: '不安的平静被一封信打破，空气骤然紧绷',
        requiredElements: ['用元人文字写的信', '火盆或蜡烛（烧信用）', '母亲脸色骤变'],
        forbiddenPatterns: ['谍战片式的情节铺陈', '夸张的悬疑描写', '母亲变成情报头子']
      },
      characterDirective: {
        '陈秀英': {
          state: '极度恐慌——密信触碰了她隐藏最深的秘密网络，涉及亡夫的前元同僚',
          speechStyle: '急促但压低声音，话说到一半会停，看门外',
          physicalDetails: ['脸色苍白', '手在抖', '迅速烧信']
        },
        '妻子': {
          state: '震惊中带着一丝不甘——又是这种事，又是这种恐惧。她攥紧了门框',
          speechStyle: '比母亲更直接。可能会说一句让母亲脸色更难看的话',
          physicalDetails: ['站在门口', '脸色苍白', '手攥门框']
        }
      },
      toneDirective: {
        overall: '温暖被第一次撕裂——T8的信任在此遭到考验',
        technique: '信的内容只露一角，其余全靠母亲的反应来传递恐惧',
        pacing: '信的突然→烧信的急促→对话时的紧绷→「你信不信我」的悬停'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '信母亲，但追问真相——她到底在怕什么',
          emotionalNote: '信任但不再盲从。儿子长大了，需要知道全貌',
          effect: { wisdom: 8, bond: -3 },
          rippleHint: '母亲告诉你：前元旧臣在暗中联络，如果被锦衣卫发现和这些人有来往，全家都完了。「我怕的不是他们。我怕的是——你。你还年轻，你还有路要走。我不能让你因为我，走不下去了。」妻子在隔壁听到，低声说了一句：「怕有什么用？怕了一辈子，他们放过我们了吗？」',
          condition: null
        },
        {
          label: 'B',
          direction: '无条件信任母亲——你说不提就不提',
          emotionalNote: '回到孩子的角色，让母亲安心',
          effect: { bond: 8 },
          rippleHint: '母亲松了口气。「你是个好孩子。」她摸了摸你的头——像摸一个十岁的孩子。妻子站在门口看了你们一眼，没说话，转身回了屋。但你知道她听见了',
          condition: null
        },
        {
          label: 'C',
          direction: '暗中调查故人的真实身份',
          emotionalNote: '不信任表面的答案，要自己挖到底',
          effect: { wisdom: 10, bond: -5 },
          rippleHint: '你查到了——故人是前元残余势力的联络人。母亲可能不只是「前朝遗孀」，她可能一直在替前元旧臣传递消息。你的血凉了。但你没有证据——母亲把信烧了。妻子那天晚上对你说：「你查到了什么？告诉我。我不想被蒙在鼓里。」',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从母亲烧信后的对话中，提取关于「父亲同僚/不要再提/你信不信我」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '母亲的秘密——她可能不只是「害怕被发现」，她可能一直在参与某种秘密活动。选C在回合47会变得极其关键。'
    },
// --------------------------------------------------------
// EA-QY-QM-3 被嘲笑 (T18, 1382)
// --------------------------------------------------------
{
      id: 'EA-QY-QM-3',
      title: '被嘲笑',
      triggerTurn: 18,
      year: 1382,
      branch: '亲明',
      coreEvent: '锦衣卫刚刚设立。你在朝中做的每一件事都被解读为「不忠的证据」——你低调，他们说你在「密谋」；你积极，他们说你在「伪装」。',
      emotionalArc: '困惑→愤怒→无力→麻木的适应',
      keyBeats: [
        '走廊上迎面走来两个同僚——看到你，一个拉了拉另一个的袖子：「降臣之后——走路都低着头。是在算什么东西吧？」另一个笑了一声',
        '主事官把你叫到一旁：「你最近——很安静啊。安静——是在想什么？」',
        '「做事？降臣之后「只是做事」？危安「只是做事」的时候写了十篇效忠文——你呢？你什么都没写。什么都没做——这就是最大的问题。」',
        '案上被人放了一杯茶，杯旁压着一张纸条，写着「锦衣卫新设，诸事当心」——不知道是谁留的。你把纸条揉成团塞进袖子',
        '窗外传来锦衣卫走过时的佩刀声——「嚓、嚓、嚓」——金属碰撞的规律声响，像计时器一样'
      ],
      requiredNPCs: ['主事官'],
      memoryItem: '诸事当心的碎纸条',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从主事官问话与纸条事件中，提取关于「什么都没做才是问题/诸事当心」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '官署走廊+工位',
        time: '午后散值时分',
        atmosphere: '偏执的恐怖——你不知道做什么是对的，因为做什么都是错的',
        requiredElements: ['主事官的问话「, 」「诸事当心」的纸条「, 」锦衣卫的佩刀声「, 」两个同僚的窃窃私语'],
        forbiddenPatterns: ['心中涌起暖流「, 」愤慨激昂「, 」正式审问场面']
      },
      characterDirective: {
        '主事官': {
          state: '世故、不怀好意但不恶意——他只是「按规定问一问」',
          speechStyle: '用手指点桌面，眼神从上往下看你。用反问句，不给答案',
          physicalDetails: ['用手指点桌面「, 」说「什么都没做就是最大的问题」「, 」说完转身走了']
        }
      },
      toneDirective: {
        overall: '用「双重陷阱」传达绝望——低调是「密谋」，积极是「伪装」——你怎么做都不对',
        technique: '用「声音」做叙事——走廊上的窃窃私语、锦衣卫的佩刀声——你听到的每一声都是审判',
        pacing: '中等偏快——偏执的焦虑感'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '开始学危安写效忠文——「也许写多了他们就不怀疑了」',
          emotionalNote: '被逼向危安的路——你终于成了他',
          effect: { bond: -3, power: 3 },
          rippleHint: '你写了第一篇。主事官看了，笑了一下——和T12张书吏那声「嗤」一样。T27被审查时，你的效忠文被当作「刻意表演」的证据',
          condition: null
        },
        {
          label: 'B',
          direction: '更加沉默——不说话、不做事、不表态',
          emotionalNote: '把自己缩到最小——但缩到最小也是罪',
          effect: { power: -5, wisdom: 3 },
          rippleHint: '主事官在档案上写「沉默寡言、行迹可疑」。T27被审查时这六个字被翻出来——「你看，他心虚」',
          condition: null
        },
        {
          label: 'C',
          direction: '回家后问母亲：「我是不是怎么做都不对？」',
          emotionalNote: '向母亲寻求答案——但母亲也没有答案',
          effect: { bond: 8 },
          rippleHint: '母亲放下针线，看了你很久。「你外祖父当年也是这样——怎么做都不对。后来他选了替大明打仗。你猜——对了没有？」沉默。「没用。」',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲明线「双重陷阱」的具象化。从T11被笑一次，到T12被要求写，再到T18每一次都被笑——羞辱在升级。锦衣卫的佩刀声是背景音——它不直接威胁你，但它的存在让你每一个动作都变成了「证据」。'
    },
// --------------------------------------------------------
// EA-QY-NEW-GW1 蒙古左右卫 (T18, 1382)
// --------------------------------------------------------
{
      id: 'EA-QY-NEW-GW1',
      title: '蒙古左右卫',
      triggerTurn: 18,
      year: 1382,
      branch: '亲北',
      coreEvent: '你去南京探访在蒙古左右卫服役的表兄。正值操练日——一群蒙古降人穿着明军甲胄，在队列里用蒙古语喊口令。表兄操练完过来，满脸是汗，笑得很开心：「看，我们有自己的卫了。」',
      emotionalArc: '好奇→希望→隐忧',
      keyBeats: [
        '南京城外军营，远远看到一面旗——上面写着「蒙古左卫」。旗下面是清一色的蒙古面孔，穿着明军的号衣，但口令是蒙古语',
        '表兄跑过来，拍你肩膀。他穿着明军甲胄，但腰间别着一把蒙古弯刀：「看到没？蒙古左右卫！朝廷给我们单独立卫了。」他眼睛亮亮的',
        '晚上说给母亲听。母亲沉默了很久：「让他们有自己的卫……是信我们，还是看住我们？」',
        '「你表兄喊口令喊得开心——可他没想过，旗上写了「蒙古」两个字，就是让所有人都看得见他们。」',
        '路上遇到老巴图。他冷笑了一声：「立卫？先让你有自己人，等有一天收走——你连散兵都不如。等着看吧。」'
      ],
      requiredNPCs: ['表兄「, 」陈秀英「, 」老巴图'],
      memoryItem: '蒙古左右卫的旗',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从表兄介绍蒙古左右卫与母亲、老巴图的评价中，提取关于「我们有自己的卫了/信我们还是看住我们」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '南京城外军营 → 家中',
        time: '白天操练日，晚上回家说给母亲听',
        atmosphere: '表兄的希望、母亲的沉默、老巴图的冷笑——同一个事件，三种解读',
        requiredElements: ['蒙古左卫的旗「, 」蒙古语口令声「, 」表兄腰间的蒙古弯刀「, 」母亲停下的手'],
        forbiddenPatterns: ['心中涌起暖流「, 」豪情万丈「, 」从此过上了幸福的生活']
      },
      characterDirective: {
        '表兄': {
          state: '满脸是汗，笑得很开心——他真的相信「我们已经是明朝人了」',
          speechStyle: '嗓门大，语速快，反复说「我们有自己的卫了」',
          physicalDetails: ['跑过来拍你肩膀「, 」穿着明军甲胄「, 」腰间别着家里带来的蒙古弯刀']
        },
        '陈秀英': {
          state: '沉默很久才说话——她看到的是「看得见的蒙古」',
          speechStyle: '用问句代替判断。声音平，没有起伏',
          physicalDetails: ['沉默了很久「, 」放下手里的活「, 」看着窗外']
        },
        '老巴图': {
          state: '冷笑——他早就看透了这套「先用后弃」',
          speechStyle: '话短、直、冷。「等着看吧」三个字就是全部预言',
          physicalDetails: ['冷笑了一声「, 」摆摆手「, 」转身走了']
        }
      },
      toneDirective: {
        overall: '蒙古左右卫的存在是「先用你」的策略——先给你独立编制，再把「身份」收走',
        technique: '用同一事件的三重解读（表兄/母亲/老巴图）做对位',
        pacing: '操练日部分快而热闹，母亲的话让节奏沉下来，老巴图的冷笑收尾'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '为表兄高兴——「有自己人的部队，总比散着强」',
          emotionalNote: '你认同了「被管理」的方式',
          effect: { bond: 5 },
          rippleHint: '母亲没说话——她的沉默比反对更重。T35裁卫时你想起今天的笑脸，想起母亲的沉默',
          condition: null
        },
        {
          label: 'B',
          direction: '想起母亲的话——「旗上写了蒙古两个字……」',
          emotionalNote: '你开始不安。但表兄的笑脸让你不敢多想',
          effect: { wisdom: 5 },
          rippleHint: '你反复想母亲那句话。T35裁卫时，那句话成了现实——旗收了，烧了。你终于懂了「让所有人都看得见他们」是什么意思',
          condition: null
        },
        {
          label: 'C',
          direction: '问老巴图——「为什么你说立卫不好？」',
          emotionalNote: '你想理解他的悲观',
          effect: { wisdom: 5, bond: -3 },
          rippleHint: '老巴图：「让你有编制，是让你有退路吗？是让你没有退路——因为跑的时候知道你都在哪。」T35裁卫时你想起了这句话',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '蒙古左右卫叙事弧线的起点——从「被接受」到「被拆散」的第一步。与淮西线焊接：此时蓝玉正在北伐，蒙古左右卫中已有部分老兵被调入蓝玉麾下。两条线通过蒙古左右卫的人员流动产生隐秘关联。'
    },

    {
      id: 'EA-QY-5',
      title: '替罪羊',
      triggerTurn: 20,
      year: 1383,
      coreEvent: '空印案余波中，同僚赵大哥因前元背景被带走处斩。他最后的眼神不是求救而是「理解」，嘱托照顾遗孀。他的坦荡让主角的沉默变得可耻。',
      emotionalArc: '震动→愧疚→无声的自我厌恶',
      keyBeats: [
        '空印案余波——锦衣卫盯上有前元背景的人',
        '赵大哥被带走时回头看你——那个眼神不是求救，是「我理解你不能站出来」',
        '经过你身边时轻声说：「帮我照顾我家大嫂和小安。」',
        '你站在衙门门口，阳光照在你身上，但你觉得很冷',
        '想起他上次说的话：「我儿子以后不用藏了，对吧？」'
      ],
      requiredNPCs: ['赵大哥'],
      memoryItem: '赵大哥的眼神',
      sceneDirective: {
        location: '衙门门口',
        time: '日间，空印案清洗期间',
        atmosphere: '肃杀中带着日常的荒诞——阳光明媚，有人在被带走',
        requiredElements: ['衙门门口', '锦衣卫', '阳光（反衬残酷）'],
        forbiddenPatterns: ['英雄主义式的送别', '赵大哥哭天抢地', '主角当场站出来']
      },
      characterDirective: {
        '赵大哥': {
          state: '坦然赴死——明知有前元背景，选择坦荡生活，从不掩饰',
          speechStyle: '平静，像交代日常事。最后的话不是遗言，是嘱托',
          physicalDetails: ['被押走但步伐稳', '回头看你时眼神平静', '经过时轻轻侧头说话']
        }
      },
      toneDirective: {
        overall: '压抑——用日常的坦荡反衬死亡的不公',
        technique: '赵大哥带饼分着吃、说媳妇做的好——这些日常细节是他的墓志铭',
        pacing: '短促有力。被带走的一刻拉长，回忆穿插其中。阳光和沉默是最重的控诉'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '暗中接济赵大嫂和小安——用行动延续赵大哥的嘱托',
          emotionalNote: '义气的延续，用沉默的方式照顾',
          effect: { bond: 5, power: -5 },
          rippleHint: '你每个月托人送些银米过去。赵大嫂接过东西，说了句「你赵大哥说过你靠得住」。你听完转身走了——因为你的眼眶红了',
          condition: null
        },
        {
          label: 'B',
          direction: '不敢来往，但心里记着',
          emotionalNote: '恐惧压过了义气，但良知未灭',
          effect: { wisdom: 3, bond: -3 },
          rippleHint: '你没有去赵家。但每次路过那扇门，你都会慢下脚步。门里偶尔传来小安的笑声——赵大哥的儿子还不知道父亲不会回来了',
          condition: null
        },
        {
          label: 'C',
          direction: '彻底断绝来往——「我不认识他」',
          emotionalNote: '自保的选择，但从此内心多了一道疤',
          effect: { power: 5, bond: -8 },
          rippleHint: '你再也没有提过赵大哥。但深夜的时候你偶尔会想起他回头看你时的眼神——不是求救，是理解。那种理解比任何责备都让你难受',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从赵大哥被带走时的最后嘱托中，提取一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '建立情感节点。赵大哥通过日常叙事被玩家认识——他的坦荡反衬主角的沉默。他的死是T39举报赵大嫂的情感基础。'
    },
// --------------------------------------------------------
// EA-QY-QB-2 老巴图的警告 (T25, 1384)
// --------------------------------------------------------
{
      id: 'EA-QY-QB-2',
      title: '老巴图的警告',
      triggerTurn: 25,
      year: 1384,
      branch: '亲北',
      coreEvent: '老巴图在你家后院找到你——他喝了不少酒，话比平时多。他说了一句你看透了朱元璋策略的话：「先让你胖，再让你死。」然后他用树枝在地上画了一幅画——一个圈，里面有一头羊，圈外有一把刀。',
      emotionalArc: '平静→震惊→深入骨髓的恐惧→无法反驳的清醒',
      keyBeats: [
        '黄昏，老巴图从角门进来——没走正门，像是怕被人看到。走到院子中间的枣树下坐下，先喝了三口酒',
        '他指着院子里拴着的那匹马——蒙哥帖木儿上次来骑的那匹。「那匹马——肥了。」',
        '「你看，它肥了——是因为主人给它吃得多。主人为什么给它吃？因为要杀的时候，肥的比瘦的值钱。」他喝了一口酒。「咱们就是那匹马。」',
        '他捡起一根树枝在地上画——画一个圈「这是朝廷」，圈里画一个点「这是咱们」，圈外画一条线「这是刀」。「刀什么时候落？等咱们胖到最肥的时候。」',
        '他把那个点擦掉了。泥土上留下一道浅浅的痕——像一个被抹去的名字。他又画了一个点，再擦掉。再画，再擦。最后地上全是痕迹',
        '他站起来，酒壶已经空了。「记住——不是他们让咱们胖。是咱们在替他们养肥自己。等他们要杀的时候——你连跑都跑不了。」'
      ],
      requiredNPCs: ['老巴图'],
      memoryItem: '地上的圈和刀',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从老巴图的警告中，提取关于「先让你胖，再让你死」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家里后院，枣树下',
        time: '黄昏，太阳快落',
        atmosphere: '清醒的恐惧——老巴图的话不是威胁，是事实。事实比威胁更可怕',
        requiredElements: ['那匹肥了的马「, 」地上画的圈和点「, 」插在土里的树枝（像刀）「, 」空酒壶'],
        forbiddenPatterns: ['锦衣卫/检校出场「, 」心中涌起暖流「, 」慷慨激昂']
      },
      characterDirective: {
        '老巴图': {
          state: '五十多岁，蒙古降将中的老人——看透了但改变不了的悲凉',
          speechStyle: '喝酒后话多，但每句话都有分量。用最朴素的比喻说最残酷的道理',
          physicalDetails: ['从角门进来「, 」画圈时慢，擦点时快「, 」把树枝插在土里像插一把刀']
        }
      },
      toneDirective: {
        overall: '老巴图是「看透一切但无能为力」的人——他的话是亲北线的「主题句」',
        technique: '用「肥马」做比喻——不说「先安抚后清洗」，用马的肥瘦来说。越朴素越有力',
        pacing: '慢——黄昏的光线、喝酒的动作、画地的过程——都是慢的，但每一秒都在往恐惧里沉'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '「那我们——怎么办？」',
          emotionalNote: '向老巴图求策',
          effect: { bond: 3, wisdom: 3 },
          rippleHint: '老巴图站起来走了。没回答。他走的时候脚步比来时慢——像是故意让你看他的背影。「连老巴图都没办法了。」T33蒙哥帖木儿被杀时你想起他画的圈——「刀在圈外。跑不掉的」',
          condition: null
        },
        {
          label: 'B',
          direction: '「蒙哥帖木儿不听——他会怎样？」',
          emotionalNote: '担心蒙哥帖木儿',
          effect: { wisdom: 5, bond: -3 },
          rippleHint: '老巴图看了那匹马一眼：「肥马先杀。」你知道他在说蒙哥帖木儿。T27蒙哥帖木儿被牵连时你想起了这四个字',
          condition: null
        },
        {
          label: 'C',
          direction: '看着地上的痕迹发呆。然后用脚把那些痕迹全部踩平了',
          emotionalNote: '试图「抹掉」老巴图的警告——但踩得掉痕迹，踩不掉事实',
          effect: { power: -3, wisdom: 3 },
          rippleHint: '你把土踩平后，那匹马嘶了一声。你看了看它——它确实肥了。T38老巴图说「该走了」时，你想起你踩平的这片土——「该走了」和「跑不了」是同一句话',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲北线的「主题揭示」——「先让你胖，再让你死」。用朴素的比喻传达复杂的制度逻辑。与T18蒙古左右卫（表兄的笑脸）形成对照：表兄看到的是「被接受了」，老巴图看到的是「被养肥了」。T27蒙哥帖木儿被牵连时验证老巴图的话。'
    },

    {
      id: 'EA-QY-6',
      title: '面具',
      triggerTurn: 26,
      year: 1385,
      // v3.15.0: 亲明分支专属（亲北分支T26无EA，避免分支外错误触发）
      branch: '亲明',
      coreEvent: '主角发现自己已习惯了假扮汉人。母亲做月饼时突然问：「你还是你吗？」——T8的温暖在此回响，但被面具的主题扭曲。',
      emotionalArc: '恍惚→被击中→温柔的痛',
      keyBeats: [
        '你意识到自己的口音、习惯、走路姿态都在模仿汉人——不知从何时开始',
        '母亲做月饼——和T8一样的场景，但两人都笑不出来',
        '母亲放下揉面的手：「你说话的声音变了。走路的步子变了。你以前不是这样笑的。」',
        '「在外面要活下来，得装。但回到家——你不用装了。」'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '月饼',
      sceneDirective: {
        location: '家中厨房/院子',
        time: '日间，母亲做月饼时',
        atmosphere: '月饼的香气和T8一样，但空气里多了一层说不清的隔阂',
        requiredElements: ['月饼材料', '和T8一样的院子', '母子两人'],
        forbiddenPatterns: ['廉价的怀旧', '抱头痛哭', '长篇大论谈身份认同']
      },
      characterDirective: {
        '陈秀英': {
          state: '做月饼时突然察觉到儿子已经「变了」，心疼但不责备',
          speechStyle: '直接但不尖锐。用最日常的语气问最深的问题',
          physicalDetails: ['揉面时突然停手', '转身面对儿子', '放下手看你']
        }
      },
      toneDirective: {
        overall: '温暖中的刺痛——喘息美好节点，T8的回响被面具扭曲',
        technique: '用月饼做纽带连接T8和现在。同样的动作，不同的两个人',
        pacing: '揉面的均匀节奏突然停顿，对话在停顿中进行。沉默比话重'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '坚定回应——「妈。我还是我。」',
          emotionalNote: '自我确认，也给母亲一个安心',
          effect: { bond: 8 },
          rippleHint: '母亲看了你很久。然后她笑了——是真的笑。「那就好。」她继续做月饼。但你知道，这个问题你会被反复问——被母亲、被自己、被命运',
          condition: null
        },
        {
          label: 'B',
          direction: '坦诚迷茫——「我不知道了。」',
          emotionalNote: '承认迷失，是最勇敢的诚实',
          effect: { bond: 5, wisdom: 5 },
          rippleHint: '母亲放下手，走到你面前。她摸了摸你的脸——像小时候一样。「你忘了也没关系。妈记得就行。」',
          condition: null
        },
        {
          label: 'C',
          direction: '回避——「妈，别问了。」',
          emotionalNote: '不是不想回答，是不敢面对答案',
          effect: { bond: -5 },
          rippleHint: '母亲没再问。她继续做月饼。月饼做好了，你吃了一个。味道和T8一模一样。但你吃不出甜味了',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈秀英关于身份追问的对话中，提取「你还是你吗」或「回到家不用装了」相关的原话作为keyQuote'
      },
      linksTo: null,
      designNote: '喘息-美好节点。T8的温暖在此回响——但被「面具」的主题扭曲。母亲的「你还是你吗」是全线最温柔的拷问。'
    },
// --------------------------------------------------------
// EA-QY-QM-4 被审查 (T27, 1385)
// --------------------------------------------------------
{
      id: 'EA-QY-QM-4',
      title: '被审查',
      triggerTurn: 27,
      year: 1385,
      branch: '亲明',
      coreEvent: '郭桓案期间，你被点名审查三个月。审查室在户部后院，一张桌子、一盏灯、两个审查官。他们翻了你所有的档案、账目、书信——三个月后告诉你「没问题」。但你的档案上多了三个字：「已审查」。',
      emotionalArc: '紧张→疲惫→羞辱→发现「已审查」三个字的绝望',
      keyBeats: [
        '审查室。第一天。桌上堆着你的档案——入仕荐书、历年考评、家产清单、来往书信的抄本。「你是降臣之后？」「家里有没有蒙古亲戚？」你犹豫了一瞬——「有。」',
        '第三十七天——审查官把一沓纸推到你面前：「这是你洪武十二年的考评——「勤慎」。洪武十四年——「忠谨」。年年「忠谨」——一个降臣之后年年被评为「忠谨」。你觉得——正常吗？」',
        '「太正常了——才不正常。」',
        '三个月里你看着墙上那幅歪了的旧画——每次来都歪着，从没人正它',
        '审查结束后，审查官在档案封面上盖了一个章——「已审查」。红色的印泥还没干透。他把档案放回架子上',
        '出门后你低头看自己的手——三个月没干过重活，手变白了。这不是「干净」的白——是「被翻了三个月」的白。你的手在发抖，抖了三个月'
      ],
      requiredNPCs: ['审查官'],
      memoryItem: '档案上的已审查红章',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从审查官的提问与结论中，提取关于「太正常了才不正常/已审查」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '户部后院审查室（小房间，一张桌子一盏灯）',
        time: '跨度三个月（关键场景用「第一天」「第三十七天」「最后一天」标注）',
        atmosphere: '疲惫的羞辱——不是暴力的恐怖，是「被翻来覆去看」的恶心',
        requiredElements: ['档案封面上的「已审查」红章「, 」墙上歪了的旧画「, 」架子上几十个类似的档案「, 」审查官沾口水翻页的手指'],
        forbiddenPatterns: ['动用酷刑「, 」主角反抗的场面「, 」心中涌起暖流']
      },
      characterDirective: {
        '审查官': {
          state: '公事公办，不带个人恶意——问题精确、有预谋。他只是执行，但他的执行就是羞辱',
          speechStyle: '问题简短、具体，不问你的辩解。翻档案时手指沾口水翻页',
          physicalDetails: ['翻开第一页抬头看你「, 」沾口水翻页「, 」盖「已审查」章时没有表情']
        }
      },
      toneDirective: {
        overall: '用「已审查」三个字传达制度性羞辱——你被翻了三个月，结论是「没问题」，但那三个字永远在档案上了',
        technique: '用「歪了的画」做时间标记——三个月里它从不被正过来，就像你的嫌疑从不被消除',
        pacing: '慢——三个月被压缩成三个场景，每个场景之间有时间跳跃'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '审查结束后问审查官：「「已审查」——以后会不会消掉？」',
          emotionalNote: '想知道这个标记会不会跟一辈子',
          effect: { wisdom: 3 },
          rippleHint: '审查官笑了：「消掉？档案上的字——消不掉的。」你走出审查室时，阳光特别刺眼——三个月没见太阳了',
          condition: null
        },
        {
          label: 'B',
          direction: '回家后母亲问你：「他们说了什么？」你说「没问题」',
          emotionalNote: '用最简单的三个字回应三个月的审查',
          effect: { bond: 8 },
          rippleHint: '母亲沉默了。然后说了一句：「你外祖父当年被审查了六个月——结论也是「没问题」。后来呢？」——后来他被杀了。「没问题」三个字比「有问题」更残忍',
          condition: null
        },
        {
          label: 'C',
          direction: '在审查室的桌上偷偷看了一眼旁边那个档案——也盖了「已审查」——上面写着另一个降臣后裔的名字',
          emotionalNote: '发现自己不是一个人在被审查——但这也意味着不是只有你被审查',
          effect: { wisdom: 5, bond: -3 },
          rippleHint: '那个名字你认识——是危安。你们两个降臣后裔，在同一天被审查，在同一天被告知「没问题」，档案上盖着同样的红章。T38你再次想起这个红章',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲明线「审查制度」的具象化。让玩家体验「被翻了三个月然后被告知没问题」的荒诞——审查本身就是一种惩罚，不需要结论。「已审查」三个字永远在档案上——就像「降臣之后」永远在你的身份上。'
    },
// --------------------------------------------------------
// EA-QY-QB-3 蒙哥帖木儿被牵连 (T27, 1385)
// --------------------------------------------------------
{
      id: 'EA-QY-QB-3',
      title: '蒙哥帖木儿被牵连',
      triggerTurn: 27,
      year: 1385,
      branch: '亲北',
      coreEvent: '郭桓案期间，蒙哥帖木儿管理的军饷「出了问题」——账目对不上。你知道他是被设计的：有人把亏空的数目记在了他的名下。他被带走审查。',
      emotionalArc: '震惊→愤怒→无力→恐惧的蔓延',
      keyBeats: [
        '百户所门口站着两个差役，在贴告示「奉旨清查军饷亏空」。你问旁边的人：「蒙哥帖木儿呢？」「被带去户部了。军饷的账对不上——他的名下少了三百石。」',
        '蒙哥帖木儿从审查室出来——「暂时放你回去，随传随到。」他脸色发白。「三百石。我没拿过三百石。」',
        '「有人把数目写在我名下了。我查了——那三百石的签收人不是我。但签名——是我的名字。」他伸手摸了摸腰间的弯刀——刀不在。审查时没收了。他的手在腰间摸了一下空——那个动作比任何台词都重',
        '他把百户印戒转了个方向，印面朝里。「免得他们看。」军服上有一道墨渍，他用手搓了搓——搓不掉',
        '走到那匹拴在路边的马旁边——那匹马来时很肥，现在好像瘦了一点。他摸了摸马的脖子。「老巴图说得对——先让你胖，再让你死。我现在——是被「查」的阶段。还没到「死」。」',
        '他翻身上马——没有弯刀，印戒印面朝里。他骑着马走了。你看着他弯着的背，和来时笔直的样子判若两人'
      ],
      requiredNPCs: ['蒙哥帖木儿'],
      memoryItem: '空了的腰间',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从蒙哥帖木儿被牵连后的对话中，提取关于「三百石/签名是我的名字」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '百户所门外 → 户部审查室门口 → 回去的路上',
        time: '上午，天阴',
        atmosphere: '被设计的无力感——你知道他是冤枉的，但「知道」没有用',
        requiredElements: ['空了的腰间（弯刀被没收）「, 」印面朝里的印戒「, 」军服上的墨渍「, 」那匹好像瘦了的马'],
        forbiddenPatterns: ['审查室内部的酷刑场面「, 」心中涌起暖流「, 」慷慨激昂']
      },
      characterDirective: {
        '蒙哥帖木儿': {
          state: '脸色发白但强撑——和T11话多的他判若两人',
          speechStyle: '话少。句子里有停顿。说「签名——是我的名字」时声音低下去',
          physicalDetails: ['摸腰间空位「, 」把印戒转了个方向「, 」摸马的脖子']
        }
      },
      toneDirective: {
        overall: '用「空了的腰间」传达被剥夺感——弯刀是蒙古身份的象征，被没收了等于被剥了一层皮',
        technique: '用「马好像瘦了」做投射——不是马真的瘦了，是蒙哥帖木儿觉得自己在变瘦',
        pacing: '中等——从消息传来的急切到看着他走远的缓慢，节奏在放慢'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '回家告诉母亲：「蒙哥帖木儿被栽了三百石。」',
          emotionalNote: '向母亲传递消息',
          effect: { bond: 8 },
          rippleHint: '母亲的手停了——她正在缝的衣服上多了一个针眼。「我说了——封侯就是买命。现在是「查账」的阶段。」她把衣服放下来。「你去看看老巴图——他那边怎么样。」',
          condition: null
        },
        {
          label: 'B',
          direction: '去找老巴图商量怎么帮蒙哥帖木儿',
          emotionalNote: '试图营救——但你能做什么',
          effect: { wisdom: 3, bond: 3 },
          rippleHint: '老巴图摇头：「帮？你怎么帮？你也是降臣之后。你帮他——就是「同党」。」他看着你。「你现在能做的——是离他远一点。」T33蒙哥帖木儿被杀时你想起了这句话——「离他远一点」，你没做到',
          condition: null
        },
        {
          label: 'C',
          direction: '什么都不做。看着他的背影消失',
          emotionalNote: '无力——你知道做什么都没用',
          effect: { power: -3, wisdom: 5 },
          rippleHint: '你站了很久。那匹马走了之后，路边留下了一泡马粪和一个马蹄印。你看着那个蹄印——它慢慢被风吹来的沙土填平。和老巴图在T25画的那些痕迹一样——都会被填平的',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲北线「制度设计」的具象化——蒙哥帖木儿不是犯了错，是被「设计」了。弯刀被没收、印戒翻转、军服沾墨——每一个被剥夺的细节都是制度在运作。与T11的意气风发形成对照，T33他被杀时这些东西都不会回来了。'
    },

    {
      id: 'EA-QY-7',
      title: '旧人的信',
      triggerTurn: 33,
      year: 1388,
      // v3.15.0: 亲明分支专属（亲北分支T33为EA-QY-QB-4蒙哥帖木儿被杀）
      branch: '亲明',
      coreEvent: '收到北方前元残余势力的最终试探——要求提供官员名单。T26的温暖在此被摧毁：旧身份不是遗产，是诅咒。',
      emotionalArc: '惊惧→撕裂→无处可逃',
      keyBeats: [
        '信深夜塞到门缝里——元人文字写的：「同族之人，当以名为证。」',
        '烧信时手在抖——拒绝等于被怀疑身份，配合等于叛国',
        '走到院子——母亲不在，阴天没有月亮',
        'T26月饼的温暖在此被彻底摧毁——旧身份是追命符'
      ],
      requiredNPCs: [],
      memoryItem: '烧掉的第二封信',
      sceneDirective: {
        location: '家中门口→院子',
        time: '深夜',
        atmosphere: '阴沉压迫，信是无声的威胁，没有月亮（与T8/T26的月光形成对比）',
        requiredElements: ['门缝里的信', '元人文字', '火（烧信）', '阴天无月'],
        forbiddenPatterns: ['谍战片式的紧张', '主角变成特工', '冗长的心理分析']
      },
      characterDirective: {},
      toneDirective: {
        overall: '诅咒降临——温暖被摧毁，退无可退',
        technique: '信只有一句话，其余全靠主角的恐惧和环境的阴沉来传递',
        pacing: '信的突然→烧信的颤抖→院子的空寂。节奏从紧到滞'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '烧信假装无事发生——鸵鸟策略',
          emotionalNote: '逃避，但知道逃不掉',
          effect: { wisdom: 5, power: -3 },
          rippleHint: '你把信烧得干干净净。但你知道——他们还会来。这次是信，下次可能就是人。而你无法解释你没有「配合」',
          condition: null
        },
        {
          label: 'B',
          direction: '告诉母亲——母子共同面对',
          emotionalNote: '回到T8的信任，但这次是坏消息',
          effect: { bond: 5, wisdom: 3 },
          rippleHint: '母亲听了，脸色煞白。「他们来找你了。」她坐了很久。「儿子。不管他们说什么——不要交名单。交了，你就回不了头了。」',
          condition: null
        },
        {
          label: 'C',
          direction: '暗中调查送信的人',
          emotionalNote: '延续EA-QY-3选C的行为模式——不信任表面，要自己挖',
          effect: { wisdom: 8, bond: -3 },
          rippleHint: '你查了三天。什么也没查到。但你注意到——母亲这两天一直在烧东西。不是信，是一些更旧的东西。你假装没看到',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从信的内容或主角烧信后的内心独白中，提取关于「同族/名为证/回不了头」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '被摧毁的美好节点。T26母亲做月饼的温暖在此被摧毁——「旧身份」不是遗产，是诅咒。你无法选择你是谁——但你必须选择你怎么活。'
    },
// --------------------------------------------------------
// EA-QY-QB-4 蒙哥帖木儿被杀 (T33, 1388)
// --------------------------------------------------------
{
      id: 'EA-QY-QB-4',
      title: '蒙哥帖木儿被杀',
      triggerTurn: 33,
      year: 1388,
      branch: '亲北',
      coreEvent: '捕鱼儿海大捷后的清算中，蒙哥帖木儿被以「通虏」罪名处死。你去收他的遗物——百户印戒上沾着干了的血。侯爵印信被朝廷收回。母亲接过印信时，手没有抖。',
      emotionalArc: '震惊→悲愤→窒息的无力→沉默的哀悼',
      keyBeats: [
        '一个百户所的小吏把蒙哥帖木儿的遗物装在一个木匣里——「通虏」的罪名已经定了，东西没人要了。「你是他亲戚？来拿走。」木匣不重——一个百户的遗物，就这么多',
        '木匣里三样东西：百户印戒（沾着干血）、那把蒙古弯刀（刀鞘上的花纹被刀痕覆盖了——有人在刀上刻了一道新痕）、一张纸（叠得很小——是T11他从怀里掏出的那张，北方的信）',
        '母亲坐在正堂——她好像早就知道了。她看到百户印戒时，伸手拿起来。印戒上的干血是暗红色的——她用拇指擦了擦——血擦掉了，但银上留下了一个浅浅的印子',
        '母亲拿起侯爵印信——外祖父的。「通虏」——朝廷的公文上说。母亲把侯爵印信翻过来——背面刻着「洪武三年颁」。她看了看那四个字。然后把印信放回木匣里',
        '母亲走进里屋，打开旧木箱——那个从T3就藏着的箱子。她拿出一件旧袍子，蒙古式的，很旧了。她把袍子叠好，放进木匣里，盖在印信上面。然后合上匣盖。「这些东西——不能再放在明处了。」',
        '你看着那个木匣——T11蒙哥帖木儿骑着马来、笑声很大、腰间别着弯刀。现在他的一切——弯刀、印戒、北方的信——都装在一个木匣里。匣子不大。一个人的一生，原来就这么大'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '木匣里的三样东西',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从母亲收遗物的对话与动作中，提取关于「不能再放在明处了」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '百户所 → 家中正堂',
        time: '上午，消息刚传来',
        atmosphere: '克制的悲恸——母亲不哭、你不哭——但每一个细节都在哭',
        requiredElements: ['木匣里的三样东西（印戒、弯刀、北方的信）「, 」侯爵印信背面的「洪武三年颁」「, 」母亲叠好的旧袍子「, 」刀鞘上的新痕'],
        forbiddenPatterns: ['行刑场面的直接描写「, 」锦衣卫的出场「, 」嚎啕大哭']
      },
      characterDirective: {
        '陈秀英': {
          state: '不哭。手不抖。但擦印戒上的血时用了很久——不是因为血难擦，是因为她不想放手',
          speechStyle: '话极少。「不能再放在明处了」——声音平，但每个字都有重量',
          physicalDetails: ['擦印戒上的血时用了很久「, 」把旧袍子叠好放进木匣「, 」合上匣盖']
        }
      },
      toneDirective: {
        overall: '用「木匣的大小」传达丧失——一个人的一辈子装在一个匣子里，这就是制度的重量',
        technique: '用「刀上的新痕」做留白——不解释这道痕是怎么来的，让玩家自己想象',
        pacing: '极慢——每一个动作都被放大：擦血、叠袍、合匣'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '打开那张北方的信看了——是蒙哥帖木儿的回信，他拒绝了北方的请求',
          emotionalNote: '发现他是无辜的——他没有通虏',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '你把信烧了。不是害怕——是「他拒绝了，但没人信」。灰烬落在木匣里。T38老巴图说「该走了」时你想起这堆灰烬——「他拒绝了都没用。我们怎么做都没用」',
          condition: null
        },
        {
          label: 'B',
          direction: '把弯刀和印戒埋在后院枣树下——和T25老巴图坐的地方一样',
          emotionalNote: '用「埋葬」代替「哀悼」',
          effect: { bond: 8 },
          rippleHint: '母亲看着你埋。没说话。第二天她在枣树下放了一碗马奶酒——她从不公开祭奠，但碗在那里。T38老巴图说「该走了」时，你看了看枣树下的土——碗已经不在了，但土上有印子',
          condition: null
        },
        {
          label: 'C',
          direction: '把木匣锁进旧木箱——和T3藏官服/印信的箱子一样',
          emotionalNote: '藏起来——不能再放在明处了',
          effect: { bond: 5, power: -3 },
          rippleHint: '你把木匣推进去时，碰到了外祖父的侯爵印信。两件「前朝遗物」挤在一个箱子里。你合上箱盖。T38老巴图说「该走了」时，你打开箱子——木匣还在。但你知道它不能永远待在里面',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲北线最痛的一个场景——蒙哥帖木儿的死不是战场上的壮烈，是被「通虏」罪名处死的屈辱。用「遗物」传达丧失——不写行刑场面，写一个木匣。木匣的大小就是一个人被制度碾碎后剩下的体积。与T11出场形成精确对照：从笑声到沉默，从马背到匣子。'
    },
// --------------------------------------------------------
// EA-QY-NEW-GW2 裁卫 (T35, 1390)
// --------------------------------------------------------
{
      id: 'EA-QY-NEW-GW2',
      title: '裁卫',
      triggerTurn: 35,
      year: 1390,
      branch: '亲北',
      coreEvent: '朝廷下令裁撤蒙古左右卫。部众打散并入普通卫所。表兄收到命令——「从明天起，你不是蒙古左卫的人了。蒙古左卫——没了。」',
      emotionalArc: '震惊→愤怒→无力',
      keyBeats: [
        '表兄来找你。他穿着便服，没穿军甲——「不用穿了。从今天起不是蒙古军了。」坐下来，很久没说话。然后：「旗收了。蒙古左卫的旗——烧了。」',
        '母亲听到消息，手里的针线停了。她没有哭：「我说了吧——让你有编制，不是信你。现在连散兵都不如了。你们连「蒙古」两个字都不让叫了。」',
        '老巴图不意外：「蓝玉案还没完呢——蒙古降人是他收的、他荐的。裁卫就是第一步：先把你们打散，让你没法抱团。下一步——」他没说下去',
        '表兄把蒙古弯刀解下来放在桌上：「这个不用带了。在新卫所里——不能说蒙古话，不能穿蒙古衣服，不能说我是蒙古左卫的。」他看着你。「我是谁？」',
        '表兄被分到了几百里外的普通卫所。他走的时候，弯刀留在桌上'
      ],
      requiredNPCs: ['表兄「, 」陈秀英「, 」老巴图'],
      memoryItem: '表兄的蒙古弯刀',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从裁卫消息传来后表兄、母亲、老巴图的对话中，提取关于「我是谁/连蒙古两个字都不让叫了」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中 → 军营门口',
        time: '白天，裁卫令下达后',
        atmosphere: '被制度碾碎的安静——没有打斗、没有哭喊，只有「旗烧了」和「我是谁」',
        requiredElements: ['表兄的蒙古弯刀「, 」被烧掉的旗（消息）「, 」母亲停住的针线「, 」表兄最后问的「我是谁」'],
        forbiddenPatterns: ['心中涌起暖流「, 」慷慨激昂「, 」嚎啕大哭']
      },
      characterDirective: {
        '表兄': {
          state: '震惊后的麻木——他曾经笑得那么开心，现在连愤怒都懒得有了',
          speechStyle: '话少。用「不用穿了」「旗烧了」「我是谁」三个短句说完一切',
          physicalDetails: ['穿便服来「, 」把蒙古弯刀解下来放在桌上「, 」走时没有回头']
        },
        '陈秀英': {
          state: '没有哭——她的预言成真时，她反而平静',
          speechStyle: '用「我说了吧」开头——不是得意，是认命',
          physicalDetails: ['手里的针线停了「, 」没有哭「, 」看着表兄的背影']
        },
        '老巴图': {
          state: '不意外——他早就知道会走到这一步',
          speechStyle: '话不多，每句都是判断。「下一步——」他没说下去，留白比说完整更重',
          physicalDetails: ['不意外地听「, 」没说完就住了口「, 」看着窗外']
        }
      },
      toneDirective: {
        overall: '蒙古左右卫的裁撤是制度绞杀的最终形态——不只消灭你的身体，还消灭你的集体身份',
        technique: '用「旗烧了」和「我是谁」做两个极点——从集体身份的符号到个体身份的追问',
        pacing: '慢。表兄的三个短句之间要有长停顿。弯刀放在桌上的动作要特写'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '送表兄走——「到新地方好好活」',
          emotionalNote: '你选择了忍耐',
          effect: { bond: 8, power: -3 },
          rippleHint: '表兄走了，弯刀留在桌上。母亲把弯刀收进旧木箱——和侯爵印信放在一起。T41老巴图说「该走了」时，你打开木箱看到那把弯刀',
          condition: null
        },
        {
          label: 'B',
          direction: '问表兄「要不要走」——暗示北逃',
          emotionalNote: '你想给表兄留一条路——但路已经没了',
          effect: { power: -5, wisdom: 3 },
          rippleHint: '表兄摇头：「走哪去？北边也回不去了。我在这——至少还活着。」你发现「走」这个选项已经不存在了。T41你也面对同样的绝境',
          condition: null
        },
        {
          label: 'C',
          direction: '去军营看最后一眼——蒙古左卫的旗已经被烧了',
          emotionalNote: '你想记住它——哪怕只是灰烬',
          effect: { bond: 3, wisdom: 5 },
          rippleHint: '你站在空荡荡的营房里。墙上还写着蒙古字——是以前操练时刻的。你用手摸了摸。然后走了。T38老巴图说「该走了」时，你想起墙上的字',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '制度绞杀的最终形态：让你「不存在」。从蒙古军的一员变成某个普通卫所里的无名小卒——连「蒙古人」这个身份都不被允许公开存在。与淮西线T41蓝玉案的直接关联：裁卫的直接原因就是蓝玉案中蒙古降将网络被清算。'
    },
// --------------------------------------------------------
// EA-QY-QM-5 李善长案·通虏加罪 (T38, 1390)
// --------------------------------------------------------
{
      id: 'EA-QY-QM-5',
      title: '李善长案·通虏加罪',
      triggerTurn: 38,
      year: 1390,
      branch: '亲明',
      coreEvent: '李善长案罪名之一是「通虏」——消息传出后，所有降臣后裔的嫌疑骤然加重。朝中同僚看你的眼神变了——不是愤怒，是「果然如此」的确认。',
      emotionalArc: '震惊→愤怒→窒息的绝望→无处可逃',
      keyBeats: [
        '消息传来——李善长被杀，罪名含「通虏」。公房里一瞬间安静了。然后所有目光转向你——你是唯一的降臣后裔。张书吏这次没笑，那种眼神比笑更冷——是「我早就知道了」的确认',
        '主事官把你叫到走廊：「你家里——还有蒙古亲戚吧？」「有。但从来没有来往——」「我没问你有没来往。我问你——有没有。」',
        '「以后——每日到衙门报备。」主事官转身走了。他的背影告诉你：不重要。你有蒙古亲戚——这件事就够了',
        '案上多了一张新贴的告示：「严查通虏嫌疑人员，降臣之后一律加强监控」。旁边的工位空了——张书吏把自己的东西搬走了。空桌面上有一圈茶渍',
        '你把「通虏」印在纸背的反字折起来夹进书里。抽屉里T12的效忠声明副本、T27的「已审查」通知、现在的「每日报备」通知——三份文件摞在一起。十年的「证明」摞在一起，不如一个「通虏」的罪名'
      ],
      requiredNPCs: ['主事官「, 」张书吏'],
      memoryItem: '通虏印在纸背的反字',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从主事官追问蒙古亲戚与告示事件的对话中，提取关于「有没有蒙古亲戚/每日报备」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '官署公房+走廊',
        time: '上午，消息刚传来',
        atmosphere: '窒息的确认——「果然」比「意外」更可怕',
        requiredElements: ['「通虏」印在纸背的画面「, 」张书吏搬走的空工位和茶渍「, 」三份摞在一起的文件「, 」告示的边角压着砚台'],
        forbiddenPatterns: ['锦衣卫直接上门「, 」心中涌起暖流「, 」当场爆发']
      },
      characterDirective: {
        '主事官': {
          state: '冷淡、公事公办——不问你有没通虏，只问你有没有蒙古亲戚。在他眼里你已经定了性',
          speechStyle: '用「我问你——有没有」的句式，把你的辩解堵死。在小本子上写字，不让你看写了什么',
          physicalDetails: ['在小本子上写「, 」摆手打断你的辩解「, 」转身走了不回头']
        },
        '张书吏': {
          state: '搬走了。没说话、没笑——沉默比嘲笑更重。他不需要笑了，因为制度替他做了判断',
          speechStyle: '没有台词。他的动作就是全部',
          physicalDetails: ['把自己的东西搬走「, 」空出来的桌面上留了一圈茶渍']
        }
      },
      toneDirective: {
        overall: '用「确认的眼神」传达最深层的羞辱——他们不是怀疑你，他们「确认」了你。「果然」两个字比什么都重',
        technique: '用「张书吏的空工位」做留白——他不嘲笑你了，因为他不需要了。他走了——这个动作比任何台词都重',
        pacing: '慢——窒息感需要慢节奏来传达'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '回家后对母亲说：「他们说我们通虏。」',
          emotionalNote: '向母亲传递消息——母亲的反应是什么？',
          effect: { bond: 8 },
          rippleHint: '母亲放下针线。沉默了很久。然后：「你外祖父替大明打了十年仗——现在叫「通虏」。」她继续缝衣服。针扎进布里，拔出来时带了一根红线——像一道伤口。T41你被迫举报赵大嫂时想起母亲这根红线',
          condition: null
        },
        {
          label: 'B',
          direction: '把三份文件（效忠声明、已审查通知、每日报备通知）锁进抽屉',
          emotionalNote: '试图把屈辱关起来——但它们还在抽屉里',
          effect: { power: -3, wisdom: 3 },
          rippleHint: '锁上抽屉后你发现钥匙在手里发烫。T41被迫举报时你要打开这个抽屉——拿出「已审查」通知当作「我早就证明过清白」的证据。但没用',
          condition: null
        },
        {
          label: 'C',
          direction: '去找危安——「你也被要求每日报备了吗？」',
          emotionalNote: '寻找同伴——确认自己不是一个人',
          effect: { bond: 3 },
          rippleHint: '危安不在工位上。桌上放着一篇新的效忠文——第十一篇。但人不在。你等了半个时辰——他没来。后来你听说他被「带走聊聊」了。T41你才明白，「聊聊」是什么意思',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲明线「越证明越被羞辱」的核心高潮。十年的证明被一个「通虏」罪名一笔勾销。张书吏从T12的「嗤笑」到T38的「搬走」——制度替他做了判断。T38四线交汇的亲明视角：被迫证明清白。与亲北线QB-5「该走了」形成对照——一个在证明，一个在逃亡。'
    },
// --------------------------------------------------------
// EA-QY-QB-5 李善长案·该走了 (T38, 1390)
// --------------------------------------------------------
{
      id: 'EA-QY-QB-5',
      title: '李善长案·该走了',
      triggerTurn: 38,
      year: 1390,
      branch: '亲北',
      coreEvent: '李善长案「通虏」罪名传来——七十七岁的勋臣都被杀了，蒙古裔的处境已到极限。老巴图深夜来找你，在后院枣树下收拾了一个包袱。他说：「该走了。」三年前他的预言，变成了今天的行动。',
      emotionalArc: '恐惧→沉重→被催逼的紧迫→无法再犹豫',
      keyBeats: [
        '夜晚，月亮刚升起来。院门被敲了三下——很轻，但节奏不对，是蒙古人的暗号。老巴图站在门外，手里拎着一个包袱。他没有进屋。「出来。」',
        '他蹲在枣树下，把包袱放在石头上打开——里面有一把弯刀、一小袋干粮、一张叠得很小的纸。他一边整理一边说话，没有看你',
        '「李善长——七十七了。杀了。罪名是「通虏」。蒙哥帖木儿死了半年了。李善长也死了。下一个——」',
        '「你。我。表兄。所有带「蒙古」两个字的人。」他站起来，拍了拍膝盖上的土。「我走了。北边。」',
        '他把弯刀别在腰间——用拇指摸了摸刀柄上的缠绳。包袱里的东西不多——刀、干粮、一张纸。一个人半辈子的积蓄，就这些',
        '他走到门槛前停了一下。没有回头。「你好好想想。」他的声音比T25沙哑了。他的背影在月光下拉得很长。然后影子消失了。你低头看枣树下的地面——新旧脚印交错。你站了很久'
      ],
      requiredNPCs: ['老巴图「, 」陈秀英'],
      memoryItem: '枣树下新旧交错的脚印',
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从老巴图深夜告别的对话中，提取关于「该走了/所有带蒙古两个字的人」的一句原话作为keyQuote'
      },
      sceneDirective: {
        location: '家中后院，枣树下',
        time: '夜晚，月亮刚升起来',
        atmosphere: '克制的紧迫——老巴图不催你，但你知道时间不多了',
        requiredElements: ['包袱里的三样东西（弯刀/干粮/纸）「, 」枣树下新旧交错的脚印「, 」月亮升起照亮地面「, 」老巴图不回头'],
        forbiddenPatterns: ['锦衣卫直接出场「, 」过度煽情「, 」老巴图回头看你']
      },
      characterDirective: {
        '老巴图': {
          state: '比T25更沉默，话更少但更重——他是来通知你的，不是来劝你的',
          speechStyle: '「该走了」三个字没有语气起伏，像在说一个事实。用行动代替说服',
          physicalDetails: ['蹲着整理包袱，不看你「, 」用拇指摸刀柄上的缠绳「, 」走到门槛前停下但不回头']
        },
        '陈秀英': {
          state: '屋里亮着灯——她知道老巴图来了，但没有出来。她隔着门听到了所有话',
          speechStyle: '没有台词。她的存在本身就是选择',
          physicalDetails: ['屋里亮着灯「, 」没有出来「, 」隔着门听到了所有话']
        }
      },
      toneDirective: {
        overall: '用「三年前的脚印」可视化等待——老巴图在T25画的那些痕迹被踩了一遍又一遍，现在他自己踩出了最后一步',
        technique: '用「不回头」传达决断——老巴图从头到尾没看你一眼。他不是来劝你的，他是来通知你的',
        pacing: '中速——对话简短，动作利落，影子消失就是句号'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '站在枣树下，看着老巴图的脚印消失在巷口',
          emotionalNote: '不回应——但心里已经开始动了',
          effect: { wisdom: 5, bond: 3 },
          rippleHint: '你站了很久。月亮把脚印照得很清楚——老巴图的脚印越来越淡，最后消失在巷子拐角。你低头看自己的脚——你的脚印叠在老巴图T25的旧脚印上。T41你打开门时发现——脚印已经被露水模糊了。时间不等你',
          condition: null
        },
        {
          label: 'B',
          direction: '去找表兄——想带他一起走',
          emotionalNote: '想带走更多的人——但表兄在卫所里，走不了',
          effect: { bond: 8, power: -3 },
          rippleHint: '表兄值夜。你翻进营墙找到他。他听完沉默了。「我走不了——蒙古左卫的人全被盯着。我一走就是「叛逃」。你走吧。」他的眼睛在月光下发亮。T41你听说表兄被「约谈」了——他替你扛了',
          condition: null
        },
        {
          label: 'C',
          direction: '回屋，打开旧木箱看侯爵印信',
          emotionalNote: '面对身份的重量——外祖父的印信是荣耀还是诅咒',
          effect: { wisdom: 5, power: 3 },
          rippleHint: '母亲坐在灯下。她看到你去开箱子，没有拦。「你要走？」你拿起印信——「洪武三年颁」。母亲：「你外祖父替大明打了十年仗——这个印，就是买命钱的收据。」你把印信放回箱子。T41你把印信放进包袱里——带着「收据」上路',
          condition: null
        }
      ],
      conditionalBeats: [],
      linksTo: null,
      designNote: '亲北线T25→T38的弧线闭合——老巴图从「预言者」变成「行动者」。三年前说「先让你胖再让你死」，三年后说「该走了」——从预言到行动。T38四线交汇的亲北视角：立场被看穿、退路被切断。与亲明线QM-5形成对照：一个在证明，一个在逃亡。'
    },

    {
      id: 'EA-QY-8',
      title: '洗白',
      triggerTurn: 41,
      year: 1391,
      coreEvent: '为获取「合法身份」，主角举报了赵大哥的遗孀赵大嫂。母亲听到后碗碎一地：「你父亲不会这么做。」——全前元线最痛的一刀。',
      emotionalArc: '压抑→自我厌恶→被最深的失望击穿',
      keyBeats: [
        '获得「合法身份」的机会——代价是举报一个隐藏的前元旧臣',
        '举报对象是赵大嫂——赵大哥的遗孀，她没有任何罪，只是嫁了一个被处斩的人',
        '回到家告诉母亲，她手里的碗掉在地上碎了',
        '母亲：「赵家大嫂……她有什么罪？她只是嫁了个人。」',
        '「你父亲不会这么做。」——这句话比任何惩罚都重'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '碎碗',
      sceneDirective: {
        location: '家中厨房/饭厅',
        time: '日间，母亲正在做饭',
        atmosphere: '极度压抑，自我厌恶弥漫。碗碎的声音是全场最响的一刻',
        requiredElements: ['碎碗', '母亲的饭勺/围裙', '厨房/饭厅的日常场景'],
        forbiddenPatterns: ['暴力场面', '母亲大喊大叫', '主角慷慨陈词辩护', '煽情背景音乐式描写']
      },
      characterDirective: {
        '陈秀英': {
          state: '极度震惊→失望→最后的审判。儿子出卖了同为前元遗属的赵大嫂，她看到了亡夫的影子',
          speechStyle: '声音极轻，每句话都像刀子。最后那句「你父亲不会这么做」是安静的，不是喊的',
          physicalDetails: ['碗碎了一地', '站着很久没动', '手被碎片割破但没注意到']
        }
      },
      toneDirective: {
        overall: '压抑到窒息的自我厌恶——亲手伤害节点',
        technique: '用碎碗这个日常物件承载道德审判。母亲不哭不闹，一句「你父亲不会这么做」胜过万言',
        pacing: '极慢。碗碎后有长段沉默。母亲的台词一句一句地，像钉子钉进棺材'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '无奈自辩——「妈。我没有选择。」',
          emotionalNote: '说的是实话，但实话不等于对的',
          effect: { power: 8, bond: -10 },
          rippleHint: '母亲没说话。她蹲下来捡碗的碎片。手割破了。她没注意到。你站在那里，想帮她——但她没让你碰',
          condition: null
        },
        {
          label: 'B',
          direction: '沉默承受——什么都没说，回书房坐了一夜',
          emotionalNote: '无法辩解也无法面对，沉默是唯一的出路',
          effect: { wisdom: 3, bond: -5 },
          rippleHint: '你坐了一夜。天快亮的时候你听到母亲在院子里——她在烧东西。又是那些旧东西。但这次你没去看',
          condition: null
        },
        {
          label: 'C',
          direction: '道歉——「妈，对不起。」',
          emotionalNote: '最直接的认错，但对不起三个字比原谅更轻',
          effect: { bond: -3, wisdom: 3 },
          rippleHint: '母亲看了你一眼。「对不起？」她把碎碗扫了。「你去跟赵家大嫂说。去跟我死去的丈夫说。」她进了屋。门关上了',
          condition: null
        }
      ],
      conditionalBeats: [
        // v3.15.2-P2方案C：亲北线T41回响——举报赵大嫂后看到裁卫告示
        {
          condition: 'branchChoice === "亲北"',
          beat: '你走出衙门时，看到街角贴了一张新告示——「蒙古左右卫余部一律编入各卫所，不得以蒙古名号聚集」。你想起T35表兄走的时候说的那句话——「走哪去？北边也回不去了。」现在连「蒙古人」三个字都不让聚在一起了。你举报赵大嫂是为了「合法身份」——但「合法身份」的代价是连蒙古人都当不了了',
          implication: '亲北线T41的双重打击：你出卖了同族（QY-8的核心），同时你的族群身份也被彻底抹去（裁卫余波）。两条线在同一个T41从不同方向碾过来'
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从母亲在碗碎后的对话中，提取「你父亲不会这么做」或关于赵大嫂的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '亲手伤害节点。全前元线最痛的一刀。赵大哥T20的坦荡让沉默可耻——T41你连他的遗孀都出卖了。「你父亲不会这么做」是母亲最后的失望。'
    },
    {
      id: 'EA-QY-9',
      title: '选择',
      triggerTurn: 45,
      year: 1393,
      coreEvent: '太子朱标死后，最后的保护伞消失。母亲在月下与主角最后一次安静地坐在一起：「不管你怎么选——这次我不替你做。」',
      emotionalArc: '疲惫→坦然→温柔的告别',
      keyBeats: [
        '太子朱标死讯传来——最后的保护伞消失了',
        '月下院中——和T8中秋一样的位置，但两人都老了',
        '母亲：「该做决定了。继续藏……还是坦然面对？」',
        '「不管你怎么选——这次我不替你做。你大了。」'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '月下的对话',
      sceneDirective: {
        location: '家中院子——和T8中秋一样的位置',
        time: '月下，夜',
        atmosphere: '月光温柔但对话沉重。这是暴风雨前的最后一次宁静',
        requiredElements: ['月光', '和T8一样的院子位置', '母子两人静坐'],
        forbiddenPatterns: ['紧张的政治分析', '母子抱头痛哭', '慷慨激昂的宣言']
      },
      characterDirective: {
        '陈秀英': {
          state: '已经做好了最坏的打算，不再替儿子做决定。隐忍了一辈子的她，在此刻交出选择权',
          speechStyle: '平静，像月光一样。不再试探，不再隐瞒，直接问',
          physicalDetails: ['看着月亮', '坐姿放松但眼神深远', '和T8做月饼时一样看着月亮']
        }
      },
      toneDirective: {
        overall: '喘息美好——暴风雨前的最后宁静，母子最后的安静时刻',
        technique: '用月光做T8和T45的纽带。同样的月亮，不同的心境',
        pacing: '舒缓，像月光流淌。留大量空间给沉默和月光'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '继续藏——活着最重要',
          emotionalNote: '延续生存策略，但母子都知这条路快到尽头',
          effect: { power: 3, bond: 3 },
          rippleHint: '母亲点了点头。「好。那就继续。」但她叹了口气——是那种认命的叹气',
          condition: null
        },
        {
          label: 'B',
          direction: '不想再藏了——坦然面对',
          emotionalNote: '全线最勇敢的选择，也是母亲最想听到的',
          effect: { wisdom: 8, bond: 8 },
          rippleHint: '母亲看了你很久。然后她笑了——是那种「终于等到你说了」的笑。「好。那就不藏了。」',
          condition: null
        },
        {
          label: 'C',
          direction: '坦诚迷茫——「我不知道。」',
          emotionalNote: '最真实的答案，母亲用握手代替了回答',
          effect: { wisdom: 5, bond: 5 },
          rippleHint: '母亲伸手握住了你的手。「不知道也没关系。有些决定……不到最后一刻，不用做。」',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈秀英月下对话中，提取关于「做决定/不替你做/怎么选」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '喘息-美好→被T47摧毁。母子最后的安静时刻。T8的月亮和T45的月亮是同一个月亮——但看月亮的人已经不一样了。'
    },
    {
      id: 'EA-QY-4',
      title: '身份暴露',
      triggerTurn: 47,
      year: 1393,
      coreEvent: '蓝玉案爆发后锦衣卫大清洗，母亲被举报为「前元余孽」。她坦然烧书交物，说出最后的告白：「最对的一件事是生了你，最错的一件事是让你活在谎里。」',
      emotionalArc: '恐惧→坦然→最深的痛与爱',
      keyBeats: [
        '锦衣卫因举报上门搜查——母亲的坦然出乎所有人意料',
        '母亲平静地烧掉父亲留下的书——「该来的来了。」',
        '交出包袱：玉佩和元人文字纸页——藏了二十四年的全部真相',
        '「你走。别管我。」——母亲试图独自承担',
        '「儿子。」——她第一次这样叫你。然后是最重的一句话：「最对的一件事，是生了你。最错的一件事，是让你活在谎里。」'
      ],
      requiredNPCs: ['陈秀英'],
      memoryItem: '玉佩和元人文字纸页',
      sceneDirective: {
        location: '家中院子',
        time: '蓝玉案期间的深夜',
        atmosphere: '锦衣卫搜查后的余悸，火盆烧书的烟雾，母亲异常的平静比恐惧更有力量',
        requiredElements: ['火盆（烧书用）', '包袱（内有玉佩和元人文字纸页）', '旧木箱'],
        forbiddenPatterns: ['母子抱头痛哭', '长篇遗言式独白', '锦衣卫暴力破门']
      },
      characterDirective: {
        '陈秀英': {
          state: '从隐忍到坦然——二十四年的 hiding 在此刻卸下，她反而比所有人都平静',
          speechStyle: '极简短句，每句像遗言。第一次叫「儿子」。最重的话用最平的语气说',
          physicalDetails: ['烧书时手不再抖', '递包袱时很稳', '站在那里不动']
        }
      },
      toneDirective: {
        overall: '坦然——二十四年的隐藏在此刻卸下，母亲的告别比任何审判都重',
        technique: '母亲不哭。她比所有人都平静。这种平静是最锋利的刀',
        pacing: '烧书是持续的，台词在烧书的间隙中一句一句落下。每句之间都有空间'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '保护母亲——贿赂锦衣卫掩盖身份',
          emotionalNote: '用尽一切保护她，像她保护你一辈子一样',
          effect: { power: -10, bond: 8 },
          rippleHint: '你花掉了积蓄的大半。母亲活下来了，但从此你们必须更加小心。她对你说了一句话：「你用了你父亲教你的方法——把账做清。」',
          condition: null
        },
        {
          label: 'B',
          direction: '安排母亲从后门走，自己留下应对',
          emotionalNote: '这次换你保护她',
          effect: { wisdom: 8, power: -8 },
          rippleHint: '母亲走之前回头看了一眼院子。「这院子我住了十八年。」她走了。你不知道她去了哪。但你把那个包袱留了下来——玉佩和那几页纸，你锁进了自己的柜子里',
          condition: null
        },
        {
          label: 'C',
          direction: '把你知道的一切告诉锦衣卫——亲手交出母亲',
          emotionalNote: '最痛的选择。延续EA-QY-3选C的行为模式——不信任、自保、出卖',
          effect: { power: 10, bond: -20 },
          rippleHint: '锦衣卫带走了你母亲。她走的时候回头看了你一眼。那个眼神——不是恨，不是失望。是一种「我早知道」的平静。你从此再也没见过她',
          condition: 'EA-QY-3选C'
        }
      ],
      conditionalBeats: [
        {
          condition: 'EA-QY-3选C',
          beat: '你查到的真相成了致命把柄——母亲可能一直在替前元旧臣传递消息',
          implication: 'EA-QY-3中暗中调查发现的秘密，在此刻变成了你举报的弹药'
        }
      ],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从陈秀英烧书交物时的对话中，提取「最对是生了你/最错是让你活在谎里」的一句原话作为keyQuote'
      },
      linksTo: '蓝玉案',
      designNote: '前元线终局——身份的代价。问题不是「保不保母亲」，是「你愿意接受她是谁吗」。'
    },
    {
      id: 'EA-QY-10',
      title: '新名',
      triggerTurn: 55,
      year: 1394,
      coreEvent: '朱元璋驾崩后新帝大赦，前元不在赦例。主角打开旧木箱取出锦袍——T3锁上的箱子在T55被打开，锦袍成为和解的象征。',
      emotionalArc: '犹豫→回忆→平静的坚定',
      keyBeats: [
        '大赦到了但前元不在赦例——身份问题依然无解',
        '手里拿着旧木箱的钥匙——母亲给你的',
        '打开木箱取出锦袍——它比你想象的轻',
        '想起T3那个除夕夜——母亲蹲在院子里，手在抖。现在你也站在院子里，但你的手不抖了',
        '做了一个决定'
      ],
      requiredNPCs: [],
      memoryItem: '旧锦袍（取出）',
      sceneDirective: {
        location: '家中院子，旧木箱前',
        time: '日间，大赦之后',
        atmosphere: '尘埃落定后的安静。没有月光了，是白天。手不抖了',
        requiredElements: ['旧木箱（打开）', '钥匙', '前元锦袍'],
        forbiddenPatterns: ['廉价煽情', '政治宣言式的独白', '夸张的仪式感']
      },
      characterDirective: {},
      toneDirective: {
        overall: '和解——与前元身份、与母亲、与自己的和解',
        technique: '用锦袍的「轻」对比T3的「重」。用主角手不抖对比T3母亲手在抖',
        pacing: '极慢。开箱、取袍、回忆、决定。每一步之间留足空间'
      },
      choiceDirections: [
        {
          label: 'A',
          direction: '穿上锦袍——接受全部身份',
          emotionalNote: '身份宣言。不是反抗，是和解',
          effect: { bond: 10, power: -10 },
          rippleHint: '你穿上了。它有点大——你比父亲瘦。但你站得很直。「我叫什么不重要。我知道我是谁。」',
          condition: null
        },
        {
          label: 'B',
          direction: '叠好放回箱子锁上——传承母亲的隐忍',
          emotionalNote: '知道它是自己的，但不用穿出来',
          effect: { wisdom: 8, bond: 5 },
          rippleHint: '你把箱子放回原处。钥匙挂在脖子上——和母亲当年一样。「有些东西不用穿出来。知道它在就行。」',
          condition: null
        },
        {
          label: 'C',
          direction: '烧掉锦袍——与过去彻底决裂',
          emotionalNote: '最决绝的选择，烧毁是为了自由',
          effect: { power: 5, bond: -5 },
          rippleHint: '火烧起来的时候，你看到了母亲的脸。她没有生气。她只是……很疲倦。「烧了就干净了。」她如果活着，也许会这么说',
          condition: null
        }
      ],
      conditionalBeats: [],
      memoryTemplate: {
        format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
        extractionRule: '从主角打开木箱取出锦袍后的独白或决定中，提取关于「身份/我是谁」的一句原话作为keyQuote'
      },
      linksTo: null,
      designNote: '前元线终局。T3锁上的箱子在T55被打开。锦袍是贯穿全线的象征物件——穿上是和解，藏起是传承，烧掉是解脱。'
    }
  ]
};
