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
  // v3.11.0d: 家庭信任度（家庭叙事回响系统）
  familyTrust: 50,              // 家庭信任度：0-100，50为中性起点
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

// ────────────────────────────────────────────────────────
// EA-HW-9 唇亡齿寒 (T38, 1389) [被摧毁的美好]
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-9',
  title: '唇亡齿寒',
  triggerTurn: 38,
  year: 1389,
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
{
  id: 'EA-HW-10',
  title: '定罪文书',
  triggerTurn: 41,
  year: 1391,
  coreEvent: '主角签下周大哥的「通敌」指证文书。蕴真看到签字，从墙上取下蓝玉送的弓放在桌上。',
  emotionalArc: '撕裂·背叛→沉默的悲恸',
  keyBeats: [
    '拿到文书时手在抖——周大哥的名字在名单上',
    '笔尖悬在纸上方很久。然后签了',
    '回家时蕴真看到文书上的签字——「你签了。」不是质问，是陈述',
    '蕴真走到墙边取下弓放在桌上——弓弦嗡地响了一声',
    '「他以前每次来喝酒，都要摸这把弓。说『这是将军的弓，比我的命还值钱。』」'
  ],
  requiredNPCs: ['张蕴真'],
  memoryItem: '弓（从墙上取下）',
  memoryTemplate: {
    format: '{npc}在{location}说了「{keyQuote}」——{protagonist}记住了{memoryItem}',
    extractionRule: '从蕴真的对话中，提取关于「弓/周大哥/念想」主题的一句原话作为keyQuote'
  },
  sceneDirective: {
    location: '家中堂屋，桌上放着弓',
    time: '夜晚，签字后回家',
    atmosphere: '死寂。不是争吵后的安静——是某种东西彻底碎了的安静。弓弦那一声嗡响是全屋唯一的声音',
    requiredElements: ['文书（签字）', '弓（从墙上取下放在桌上）', '弓弦的嗡响'],
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
    }
  ],
  linksTo: null,
  designNote: '亲手伤害节点。全淮西线情感最高潮。「亲手」意味着——这是你签的字。T6的「不散」和T32的「活着就够了」在此变成了两把刀。'
},

// ────────────────────────────────────────────────────────
// EA-HW-5 最后之夜 (T46, 1393)
// ────────────────────────────────────────────────────────
{
  id: 'EA-HW-5',
  title: '最后之夜',
  triggerTurn: 46,
  year: 1393,
  coreEvent: '蓝玉案前夜，蓝玉来访。没有踢靴子，安静坐着。问了一句「咱这辈子值不值」。',
  emotionalArc: '告别·无法挽回→沉默的送别',
  keyBeats: [
    '蓝玉来了——没有踢靴子。他坐在你面前，很安静',
    '蕴真端了酒来，他接过碗没喝。沉默了很久',
    '「小子，你说咱这辈子值不值？」',
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

    {
      id: 'EA-ZD-8',
      title: '故人之刃',
      triggerTurn: 33,
      year: 1388,
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
      triggerTurn: 54,
      year: 1394,
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
          condition: 'EA-SG-3选A（全力救父）',
          beat: '你刚花光了积蓄打点父亲的事——现在父亲又用最后一笔银子救了你。银子已经不够了',
          implication: 'T3的倾力消耗了资源，T12的保险不够用'
        },
        {
          condition: 'EA-SG-3选B（明哲保身）',
          beat: '父亲被罚后对你的冷淡还在——但账本依然交给了婉清。他没有怪你，但他也不再期待了',
          implication: 'T3的疏远让T12的理解打了折扣'
        }
      ],
      linksTo: '胡惟庸案',
      designNote: '商贾线情感高潮之一——你终于理解了父亲。不是因为他做了多大的事，而是因为他一直在用他的方式爱你。账本从T3递出→T4婉清翻出最后一页→T28翻出后半部分→T55写下「账清了」——核心道具贯穿全线。'
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
          condition: 'EA-SG-4选A（用父亲银子打点）',
          beat: '婉清分析淮盐时提到：「你爹那笔银子要是没用完，可以拿来周转。」她开始用父亲的方式思考',
          implication: 'T12的理解让她继承了父亲的商业直觉'
        },
        {
          condition: 'EA-SG-4选B（主动上报）',
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
          condition: 'EA-SG-1选C（追问不干净的账）',
          beat: '陈三走时回头说了句：「你爹改了的账——我帮你爹改的。你连改都没改。」',
          implication: 'T1你追问的「不干净的账」在此变成回旋镖——父亲的「改了」和你的「没改」形成对照'
        },
        {
          condition: 'EA-SG-6选A（生意就是生意）',
          beat: '婉清在隔壁听到陈三的话后，终于出来了。她只说了一句：「生意就是生意，对吧？」',
          implication: 'T19你的冷漠回应在此回旋——婉清用你的话来审判你'
        },
        {
          condition: 'EA-SG-6选C（认错反思）',
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
          rippleHint: '母亲看了你很久。「你跟你父亲一样聪明。」她转身继续做月饼。但她的手在抖',
          condition: null
        },
        {
          label: 'B',
          direction: '震惊追问——「妈……你是元人？」',
          emotionalNote: '虽然一直知道些蛛丝马迹，但亲耳听到还是不同',
          effect: { wisdom: 5, bond: 5 },
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
    {
      id: 'EA-QY-6',
      title: '面具',
      triggerTurn: 26,
      year: 1385,
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
    {
      id: 'EA-QY-7',
      title: '旧人的信',
      triggerTurn: 33,
      year: 1388,
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
      conditionalBeats: [],
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
