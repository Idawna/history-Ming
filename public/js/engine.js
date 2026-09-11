// ========== 墨史·大明 v3.15.0（出身线EA扩展：40→74，前元线亲明/亲北分支） ==========
// ========== LIVE MODE: CALL BOT API VIA PROXY ==========
// v3.8.17 上下文优化 Phase 2：前情提要重构 — 最近3段全文 + 滚动摘要
// 作用：①读档后 chatHistory 清空，AI 靠这个衔接剧情 ②长局历史被裁剪后也不会忘身世
// 优化：从8段全文改为3段全文+滚动摘要，单回合recent_plot从~4000字降至~1200字
function collectRecentPlot(n) {
  const areas = gameContainer.querySelectorAll('.narrative-area .narrative-text');
  if (!areas.length) return undefined;

  // 最近 3 段保留全文（截断200字/段，确保AI有足够细节衔接）
  const recent = [];
  for (let i = areas.length - 1; i >= Math.max(0, areas.length - 3); i--) {
    const t = areas[i].textContent.trim();
    if (t) recent.unshift(t.slice(0, 200));
  }

  // 更早的剧情用滚动摘要替代（由 updatePlotSummary 每回合更新）
  const summary = GameState.plotSummary || '';

  let result = '【前情提要】';
  if (summary) {
    result += '更早剧情概要：' + summary + '\n';
  }
  if (recent.length) {
    result += '最近剧情（须无缝衔接，严禁重复已写场景/事件/措辞/桥段）：\n' + recent.join('\n');
  }

  return result;
}

// v3.8.17 上下文优化 Phase 2：每回合结束时更新滚动摘要
// 从第4段往回的叙事中提取每段首句，作为更早剧情的紧凑概要
// 下次 collectRecentPlot 调用时会将其作为"更早剧情概要"下发
function updatePlotSummary() {
  const areas = gameContainer.querySelectorAll('.narrative-area .narrative-text');
  if (areas.length <= 3) return; // 3段以内全部保留全文，不需要摘要

  const older = [];
  for (let i = areas.length - 4; i >= Math.max(0, areas.length - 8); i--) {
    const t = areas[i].textContent.trim();
    if (t) older.unshift(t);
  }

  if (older.length) {
    GameState.plotSummary = older.map(function(t) {
      // 提取每段的第一句话（到句号/叹号/问号为止）作为摘要
      const firstSentence = t.split(/[。！？]/)[0];
      return firstSentence + '。';
    }).join('');
  }
}

// 收集最近已出现/已选择的选项，防止 AI 反复给同样的选项
function collectRecentChoices() {
  const texts = [];
  const areas = gameContainer.querySelectorAll('.choices-area');
  for (let i = Math.max(0, areas.length - 3); i < areas.length; i++) {
    areas[i].querySelectorAll('.choice-text').forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && !t.includes('自由行动') && !t.includes('自由')) texts.push(t);
    });
  }
  gameContainer.querySelectorAll('.history-choice-made').forEach(el => {
    const t = (el.textContent || '').replace(/^▸\s*/, '').trim();
    if (t) texts.push('（玩家已选过）' + t);
  });
  if (!texts.length) return undefined;
  return '【近期选项·严禁重复】以下选项最近已经给过或玩家已经选过，本回合3个固定选项必须是全新的行动方向，严禁原样重复或近义改写（如换个同义词再说一遍）；每个选项必须推动局面发生实质变化，严禁"静观其变/继续前行"这类选了毫无进展的凑数选项：\n' + texts.slice(-12).join('\n');
}

// v3.8.21: 收集最近3轮叙事的关键句，防止AI重复使用相同的叙事措辞和场景描写
function collectRecentNarrativePhrases() {
  const areas = gameContainer.querySelectorAll('.narrative-area .narrative-text');
  if (!areas.length) return undefined;

  const phrases = [];
  // 提取最近3轮叙事的最后一句（通常是氛围描写或悬念）
  for (let i = Math.max(0, areas.length - 3); i < areas.length; i++) {
    const text = areas[i].textContent.trim();
    if (text) {
      // 按句号/叹号/问号分割，取最后一句（长度5-50字的）
      const sentences = text.split(/[。！？]/).filter(function(s) { return s.trim().length > 5; });
      if (sentences.length > 0) {
        const lastSentence = sentences[sentences.length - 1].trim();
        if (lastSentence.length > 5 && lastSentence.length < 50) {
          phrases.push(lastSentence + '。');
        }
      }
    }
  }

  if (!phrases.length) return undefined;
  return '【近期叙事关键句·严禁重复以下句式/措辞/场景描述】以下句子在最近叙事中已经出现过，本回合严禁使用相同的句式结构、比喻手法或场景描写：\n' + phrases.join('\n');
}

// ========== 历史锚点节奏引擎（前端硬控，不再依赖AI自觉） ==========
// 锚点表按历史年份严格排序（v3.8.9修正：胡惟庸案1380→空印案1382）
const HISTORY_ANCHORS = [
  { id: 1, name: '刘伯温之死', desc: '刘伯温病逝/被毒杀，浙东线核心触发', start: 2,  end: 4,  time: '洪武八年·1375年四月', year: 1375 },
  { id: 2, name: '胡惟庸案',   desc: '胡惟庸被诛、牵连数万人，第一次大清洗', start: 12, end: 15, time: '洪武十三年·1380年正月', year: 1380 },
  { id: 3, name: '空印案',     desc: '各地官员携空白盖印文书入京被查处，户部系统震荡', start: 21, end: 22, time: '洪武十五年·1382年', year: 1382 },
  { id: 4, name: '郭桓案',     desc: '户部侍郎郭桓贪腐案发，经济线大案', start: 27, end: 29, time: '洪武十八年·1385年', year: 1385 },
  { id: 5, name: '李善长案',   desc: '李善长被赐死、株连三万余人，株连最广', start: 38, end: 40, time: '洪武二十三年·1390年', year: 1390 },
  { id: 6, name: '太子之死',   desc: '太子朱标病逝，继承格局骤变，诸王觊觎储位', start: 43, end: 44, time: '洪武二十五年·1392年', year: 1392 },
  { id: 7, name: '蓝玉案',     desc: '蓝玉被诛、牵连一万五千余人，淮西勋贵末日', start: 47, end: 49, time: '洪武二十六年·1393年', year: 1393 },
  { id: 8, name: '锦衣卫膨胀', desc: '锦衣卫权力巅峰，诏狱人满为患，朝野噤声', start: 52, end: 53, time: '洪武二十九年·1396年', year: 1396 },
  { id: 9, name: '朱元璋驾崩', desc: '朱元璋病逝、建文帝即位，游戏终点', start: 57, end: 60, time: '洪武三十一年·1398年闰五月', year: 1398 }
];

// ========== v3.14.0: 统一锚点插值表（P1-3） ==========
// 年份→回合 锚点插值表：所有年份→回合转换统一查此表，禁止散落硬编码映射。
// 代表回合取值沿用 v3.13.0 修复后的保守锚点对（保持既有调度行为不变），
// 与 HISTORY_ANCHORS 窗口对应关系：
//   锚点1 刘伯温之死(1375,T2-4)→3   锚点2 胡惟庸案(1380,T12-15)→13
//   锚点3 空印案(1382,T21-22)→21    锚点4 郭桓案(1385,T27-29)→28
//   锚点5 李善长案(1390,T38-40)→39  锚点6 太子之死(1392,T43-44)→43
//   锚点7 蓝玉案(1393,T47-49)→48    锚点8 锦衣卫膨胀(1396,T52-53)→52
//   锚点9 朱元璋驾崩(1398,T57-60)→58
const ANCHOR_TURN_TABLE = [
  { year: 1375, turn: 3,  anchorId: 1 },
  { year: 1380, turn: 13, anchorId: 2 },
  { year: 1382, turn: 21, anchorId: 3 },
  { year: 1385, turn: 28, anchorId: 4 },
  { year: 1390, turn: 39, anchorId: 5 },
  { year: 1392, turn: 43, anchorId: 6 },
  { year: 1393, turn: 48, anchorId: 7 },
  { year: 1396, turn: 52, anchorId: 8 },
  { year: 1398, turn: 58, anchorId: 9 }
];

// v3.14.0: 年份→回合 统一转换函数（查 ANCHOR_TURN_TABLE 线性插值）
function yearToTurn(year) {
  var table = (typeof ANCHOR_TURN_TABLE !== 'undefined') ? ANCHOR_TURN_TABLE : [];
  if (!table.length) return Math.round((year - 1373) * 2.85); // 极端兜底，正常不会走到
  if (year <= table[0].year) return table[0].turn;
  if (year >= table[table.length - 1].year) return table[table.length - 1].turn;
  for (var i = 1; i < table.length; i++) {
    if (year <= table[i].year) {
      var y0 = table[i - 1].year, y1 = table[i].year;
      var t0 = table[i - 1].turn, t1 = table[i].turn;
      var ratio = (year - y0) / (y1 - y0);
      return Math.round(t0 + ratio * (t1 - t0));
    }
  }
  return table[table.length - 1].turn;
}

// 即将生成的回合号：屏幕上还没有叙事=开局第1回；否则=当前回合+1
function getNextTurn() {
  const hasNarratives = gameContainer.querySelectorAll('.narrative-area').length > 0;
  return hasNarratives ? GameState.turn + 1 : GameState.turn;
}

// ========== 动态规则生成器（v3.5：SP规则代码化） ==========

// NPC生卒年表（硬编码，不再依赖AI判断）
const NPC_BIRTH_DEATH = {
  '朱元璋': { birth: 1328, death: 1398, personality: '多疑务实、痛恨贪腐、欣赏能臣。日常自称「咱」，朝堂自称「朕」' },
  '朱标':   { birth: 1355, death: 1392, personality: '仁厚温和、太子、1392年病逝。自称「孤/本王」，严禁自称「朕」（朕为皇帝专属）' },
  '朱棣':   { birth: 1360, death: 1424, personality: '燕王、骁勇善战、野心勃勃。自称「本王」' },
  '蓝玉':   { birth: null, death: 1393, personality: '淮西勋贵、粗犷直接、骄横跋扈。武将自称「末将」' },
  '李善长': { birth: 1314, death: 1390, personality: '前朝旧臣、圆滑世故、优柔寡断。文官自称「下官/臣」' },
  '胡惟庸': { birth: null, death: 1380, personality: '中书省丞相、精明强干、野心勃勃。文官自称「下官/臣」' },
  '刘基':   { birth: 1311, death: 1375, personality: '浙东文臣、含蓄深沉、算无遗策。文官自称「下官/臣」' },
  '汤和':   { birth: 1326, death: 1395, personality: '淮西老将、谨慎低调、明哲保身。武将自称「末将」' },
  '郭桓':   { birth: null, death: 1385, personality: '户部侍郎、贪腐案发。文官自称「下官/臣」' },
  // P0-1: 近臣NPC新增
  '宋濂':   { birth: 1310, death: 1381, personality: '翰林学士承旨、太子师、"开国文臣之首"。温厚儒雅、学识渊博。文官自称「下官/臣」' },
  '毛骧':   { birth: null, death: 1390, personality: '锦衣卫首任指挥使、凤阳定远人。阴鸷精明、对皇帝绝对忠诚。武官自称「末将/卑职」' }
};

// ========== v3.14.0: 公共工具（P1-2 重复代码抽取） ==========
// NPC 是否在当前年份已死亡/未出场（统一 getAliveNPCs / getDeadNPCs 的判断）：
//   - 刘伯温（刘基）之死是锚点事件1，必须等锚点1完成后才算死亡
//   - 毛骧 1382 年前未出场（锦衣卫尚未设立），视为"已死"以排除出场
function isNPCDead(name, info, year) {
  var isDead = year >= info.death;
  if ((name === '刘伯温' || name === '刘基') &&
      (!GameState.completedAnchors || !GameState.completedAnchors.includes(1))) {
    isDead = false; // 锚点1未完成，刘伯温不算死亡
  }
  if (name === '毛骧' && year < 1382) {
    isDead = true; // 未出场，不显示
  }
  return isDead;
}

// v3.9: NPC↔锚点绑定表——哪个NPC的命运与哪个未来锚点挂钩
// 用于信息隔离：当该锚点尚未发生时，在NPC描述中附加禁止指令
const NPC_ANCHOR_LINK = {
  '刘基':   { boundAnchor: 1, boundEvent: '刘伯温之死' },
  '胡惟庸': { boundAnchor: 2, boundEvent: '胡惟庸案' },
  '郭桓':   { boundAnchor: 4, boundEvent: '郭桓案' },
  '李善长': { boundAnchor: 5, boundEvent: '李善长案' },
  '朱标':   { boundAnchor: 6, boundEvent: '太子之死' },
  '蓝玉':   { boundAnchor: 7, boundEvent: '蓝玉案' },
  '朱元璋': { boundAnchor: 9, boundEvent: '朱元璋驾崩' },
  // P0-1: 近臣NPC锚点绑定
  '宋濂':   { boundAnchor: 2, boundEvent: '胡惟庸案（因长孙宋慎牵连）' },
  '毛骧':   { boundAnchor: 5, boundEvent: '李善长案（以"胡党"被杀）' }
};

// ========== v3.8.15: 正面种子系统（D） ==========
// 正面种子类型：在日常/缓冲回合中有概率种下，给玩家带来正面收益
// v3.8.18: 正面种子类型（v1.1修正：新增圣眷/阵营回复效果）
var POSITIVE_SEED_TYPES = [
  { id: '贵人提携', type: '正面·人脉', effect: { attributes: { power: 7, people: 4 }, emperor_feeling: 3 }, desc: '一位朝中前辈主动指点你官场门道，皇帝对你印象渐好' },
  { id: '民心归附', type: '正面·声望', effect: { attributes: { people: 7, fame: 4 }, faction_boost: 3 }, desc: '你的善举在民间传开，各派势力对你刮目相看' },
  { id: '知己相交', type: '正面·情谊', effect: { attributes: { bond: 7, wisdom: 3 }, emperor_feeling: 2 }, desc: '偶遇一位志趣相投的同僚，引为知己，圣眷微升' },
  { id: '意外之喜', type: '正面·机遇', effect: { attributes: { wisdom: 5, power: 3, fame: 2 } }, desc: '偶然获得一份有价值的信息或资源' },
  { id: '声名渐起', type: '正面·名望', effect: { attributes: { fame: 7, people: 3 }, emperor_feeling: 2 }, desc: '你的才干逐渐为人所知，皇帝也有所耳闻' }
];

// ========== v3.14.0: 正面种子公共工具（P1-2 重复代码抽取） ==========
// 统计当前未触发正面种子数量（random 种植与建设种植共用）
function countPendingPositiveSeeds() {
  var count = 0;
  for (var i = 0; i < GameState.seeds.length; i++) {
    var s = GameState.seeds[i];
    if (s.type && s.type.indexOf('正面') === 0) count++;
  }
  return count;
}

// 构造正面种子对象（tag 用于区分来源：'_' 随机种植 / '_build_' 建设触发）
function createPositiveSeed(seedType, turn, tag) {
  var newSeed = {
    id: seedType.id + tag + turn,
    type: seedType.type,
    planted_turn: turn,
    trigger_turn: turn + 3 + Math.floor(Math.random() * 3), // 3-5回合后触发
    effect: JSON.parse(JSON.stringify(seedType.effect)), // 深拷贝
    desc: seedType.desc,
    positive: true
  };
  if (tag === '_build_') newSeed.from_building = true; // 标记为建设类触发
  return newSeed;
}

// 避免重复并种植（返回是否成功种植；成功时写种植通知）
function addSeedIfNew(newSeed, seedTypeId, fromBuilding) {
  if (GameState.seeds.some(function(s) { return s.id === newSeed.id; })) return false;
  GameState.seeds.push(newSeed);
  var notif = { action: 'planted', id: seedTypeId, type: newSeed.type, desc: newSeed.desc, positive: true };
  if (fromBuilding) notif.from_building = true;
  GameState._pendingSeedNotif = notif;
  return true;
}

// v3.8.18: 种植正面种子（P0-1修正：概率提升+上限提升+沉淀回合+紧迫减半）
function plantPositiveSeed(turn) {
  var pacing = GameState.pacing;
  // 沉淀回合也允许种植；紧迫回合概率减半
  if (pacing !== '日常' && pacing !== '缓冲' && pacing !== '沉淀' && pacing !== '紧迫') return;

  // 已有未触发的正面种子>=3个，不再种植（v3.14.0: 公共计数函数）
  if (countPendingPositiveSeeds() >= 3) return;

  // 35%概率种植（紧迫回合减半为17.5%）
  var effectiveProb = (pacing === '紧迫') ? 0.175 : 0.35;
  if (Math.random() >= effectiveProb) return;

  // 随机选一种正面种子
  var seedType = POSITIVE_SEED_TYPES[Math.floor(Math.random() * POSITIVE_SEED_TYPES.length)];
  var newSeed = createPositiveSeed(seedType, turn, '_');

  // 避免重复（v3.14.0: 公共种植函数）
  if (addSeedIfNew(newSeed, seedType.id, false)) {
    // v3.8.20: 种植通知（UI层读取后清除）
    console.log('[正面种子] 种下「' + seedType.id + '」：' + seedType.desc);
  }
}

// v3.8.19: 建设类行动触发正面种子（P1-5节奏曲线改进）
// 当玩家选择建设类选项时，100%种植对应正面种子（不受概率限制）
// actionCategory: '建设' | '社交' | '政治' | 其他（只有'建设'触发）
function plantBuildingSeed(turn, actionCategory) {
  if (actionCategory !== '建设') return;

  // 已有未触发的正面种子>=4个，不再额外种植（比随机上限高1）
  var positiveCount = countPendingPositiveSeeds();
  if (positiveCount >= 4) {
    console.log('[建设种子] 正面种子已满（' + positiveCount + '个），跳过种植');
    return;
  }

  // 根据建设类型选择对应种子
  // 建设类选项：发展人脉→贵人提携/知己相交，积累财富→意外之喜，培养门生→民心归附/声名渐起
  var buildingSeeds = POSITIVE_SEED_TYPES.filter(function(s) {
    return s.type.indexOf('人脉') !== -1 || s.type.indexOf('情谊') !== -1 ||
           s.type.indexOf('机遇') !== -1 || s.type.indexOf('声望') !== -1 ||
           s.type.indexOf('名望') !== -1;
  });

  if (buildingSeeds.length === 0) return;

  var seedType = buildingSeeds[Math.floor(Math.random() * buildingSeeds.length)];
  var newSeed = createPositiveSeed(seedType, turn, '_build_');

  // 避免重复（v3.14.0: 公共种植函数）
  if (addSeedIfNew(newSeed, seedType.id, true)) {
    // v3.8.20: 种植通知
    console.log('[建设种子] 玩家选择建设类行动，种下「' + seedType.id + '」：' + seedType.desc);

    // P1-7: 即时微效——建设选择当回合获得+1~+2属性回报
    var instantBonus = {};
    var bonusKey = ['power', 'people'][Math.floor(Math.random() * 2)];
    instantBonus[bonusKey] = 1 + Math.floor(Math.random() * 2);
    for (var bk in instantBonus) {
      if (instantBonus.hasOwnProperty(bk) && GameState.attributes[bk] !== undefined) {
        GameState.attributes[bk] = Math.min(100, GameState.attributes[bk] + instantBonus[bk]);
      }
    }
    GameState._buildingInstantBonus = instantBonus; // UI层读取后清除
    console.log('[建设即时回报]', JSON.stringify(instantBonus));
  }
}

// ========== v3.8.15: 生活事件系统（P2-G Phase 1） ==========
// 家庭初始化：根据出身生成初始家庭结构
function initFamily(background) {
  var family = {
    spouse: null,
    children: [],
    parents: { father: null, mother: null },
    siblings: []
  };
  
  switch (background) {
    case '淮西武将之后':
      family.spouse = { name: '', relation: '妻', background: '淮西同阵营武将之女', status: '在世', marriedTurn: 0 };
      // v3.11.0b: 父在世但鄱阳湖重伤卧病（为father_death和crisis_li_father铺垫），母已故（与身世小传一致）
      family.parents.father = { name: '', relation: '父', background: '淮西老将（鄱阳湖重伤致残，归乡卧病）', status: '在世', deathTurn: 0 };
      family.parents.mother = { name: '', relation: '母', background: '蓝氏（积劳早逝）', status: '已故', deathTurn: 0 };
      break;
    case '浙东寒门书生':
      // v3.11.0b: 修复与身世小传矛盾——父在世（乡中开馆授徒），母已故（自幼丧母）
      family.parents.father = { name: '', relation: '父', background: '寒门秀才（乡中开馆授徒）', status: '在世', deathTurn: 0 };
      family.parents.mother = { name: '', relation: '母', background: '早亡', status: '已故', deathTurn: 0 };
      break;
    case '应天府商贾之子':
      family.spouse = { name: '', relation: '妻', background: '商贾联姻（精明能干）', status: '在世', marriedTurn: 0 };
      // v3.11.0b: 父亲升级为有完整恐惧弧线的角色
      family.parents.father = { name: '', relation: '父', background: '应天绸缎商（从商入仕的总设计师，洪武朝商人恐惧的缩影）', status: '在世', deathTurn: 0 };
      // v3.11.0b: 母亲从空白到有弧线
      family.parents.mother = { name: '', relation: '母', background: '娘家商贾出身（初期娇弱，后与儿媳联手撑起家业）', status: '在世', deathTurn: 0 };
      break;
    case '落魄前元官员之后':
      // v3.11.0c: 三人三种恐惧——父亲悔恨归顺、母亲恐惧暴露、妻子愤怒不甘
      family.spouse = { name: '', relation: '妻', background: '前元降臣后代（与旧臣家族有来往，情绪激烈，不甘心隐藏身份）', status: '在世', marriedTurn: 0 };
      family.parents.father = { name: '', relation: '父', background: '前元汉人翰林待制（降臣恐惧缩影，经历弹劾羞辱，临终醉后表露后悔归顺）', status: '已故', deathTurn: 0 };
      family.parents.mother = { name: '', relation: '母', background: '北元贵族后裔（亲眼见过张昶式悲剧，恐惧到夹紧尾巴伪装，假扮杭州汉人二十余年）', status: '在世', deathTurn: 0 };
      break;
    default:
      console.log('[生活事件] 未知出身，家庭留空');
  }
  
  return family;
}

// 生活事件总表：按触发窗口、出身条件、概率排序
var LIFE_EVENTS = [
  // ---- 婚后安顿（只有已有妻子的出身才会触发）----
  { id: 'settling', turnWindow: [3, 8], backgrounds: ['淮西武将之后', '应天府商贾之子', '落魄前元官员之后'],
    probability: 0.40, category: '婚后安顿', requiresSpouse: true,
    effects: { bond: 3 },
    narrative: '新婚安顿。叙事融入新家/邻里/妻子日常相处，建立家庭存在感。2-3句即可。' },
  // ---- 第一个孩子 ----
  // v3.8.17 P1-4修复：turnWindow从[5,12]扩展到[5,22]，解决书生线child1窗口与scholar_marriage[8-15]严重错位问题
  { id: 'child1', turnWindow: [5, 22], probability: 0.35, category: '生子',
    requiresSpouse: true,
    backgroundMinTurn: { '淮西武将之后': 11 }, // v3.9.0: 为EA-HW-3(T10)"初为人父"留叙事空间
    effects: { bond: 5, people: 2 },
    narrative: '第一个孩子出生。根据出身交代生产场景，写出初为人父/母的感受。2-3句即可。' },
  // ---- 宝钞贬值（商贾专属，T4-6）----
  // v3.11.0b: 商贾线父亲恐惧弧线第一环——宝钞崩盘
  { id: 'baochao_collapse_merchant', turnWindow: [4, 6],
    backgrounds: ['应天府商贾之子'],
    probability: 0.35, category: '家计',
    effects: { wisdom: 2, bond: -2 },
    narrative: '宝钞剧烈贬值。父亲库里几万贯宝钞一夜之间只值原来三成——绸缎铺子的货款收回来全是废纸。他在账房坐了一整夜，第二天白了几根头发。母亲慌了，问"怎么办"，父亲只说"别动银子，先看看"。你站在门口，第一次看到父亲的手在抖——不是冷，是怕。写出洪武朝商人对朝廷货币政策毫无抵抗力的恐惧。' },
  // ---- 锦衣卫勒索（商贾专属，T6-8）----
  // v3.11.0b: 商贾线父亲恐惧弧线第二环——权力碾压+母亲觉醒
  { id: 'jinyiwei_extortion_merchant', turnWindow: [6, 8],
    backgrounds: ['应天府商贾之子'],
    probability: 0.30, category: '家计',
    effects: { power: -3, wisdom: 3 },
    narrative: '锦衣卫以"通敌"之名上门，说父亲跟张士诚旧部有生意来往。父亲陪笑、递茶、塞银子——五百两才打发走。当晚父亲在书房摔了茶杯，母亲吓得不敢出声。但母亲偷偷做了件事：把家里真正的暗账缝进了棉衣夹层——这是她第一次意识到"账本可能害死全家"。写母亲从娇弱到开始有保护意识的转变。' },
  // ---- 同行被抄家（商贾专属，T8-10）----
  // v3.11.0b: 商贾线父亲恐惧弧线第三环——父亲病倒+母亲请缨
  { id: 'peer_seized_merchant', turnWindow: [8, 10],
    backgrounds: ['应天府商贾之子'],
    probability: 0.35, category: '家计',
    effects: { bond: -5, wisdom: 3 },
    narrative: '父亲的旧交、秦淮河畔最大的绸缎商被抄家——家产充公，全家流放。父亲去送行，回来一病不起。他对你说："捐监生、托差事……我花了多少银子，就是想让你走出这条路。现在看来，做官也不安全。"母亲端药进书房，手抖得药碗差点摔了——但这次她没哭，而是问了一句："老爷，铺子的事我来管吧。"父亲看了她很久，点了头。这是母亲第一次主动管铺子的事。' },
  // ---- 父亲去世（有在世父亲的出身）----
  { id: 'father_death', turnWindow: [8, 18],
    backgrounds: ['淮西武将之后', '应天府商贾之子'],
    probability: 0.30, category: '丧亲',
    requiresFatherAlive: true,
    backgroundMinTurn: { '应天府商贾之子': 11 }, // v3.9.0: 为EA-SG-3(T10)"传灯"留叙事空间
    effects: { bond: -8, people: 3 },
    narrative: '父亲去世。武将出身：丧礼简朴，军中旧交来吊唁。商贾出身：他走的时候，账房的灯还亮着——桌上摊着没看完的账本。丧礼办得很大，秦淮河畔的商人都来了，但母亲没有哭。她只是站在书房门口，看着那面曾经挂满账本的墙——现在只剩半面了。"账本合上了，但账还没清。"叙事融入父亲一生的恐惧与算计——一个商人用一辈子给儿子铺路，最终还是没能算过朝廷。' },
  // ---- 父亲去世（书生专属，T10-20）----
  // v3.11.0b: 书生线父亲开馆授徒但完全隐形，补上叙事弧线
  { id: 'father_death_scholar', turnWindow: [10, 20],
    backgrounds: ['浙东寒门书生'],
    probability: 0.30, category: '丧亲',
    requiresFatherAlive: true,
    effects: { bond: -8, wisdom: 3 },
    narrative: '父亲在乡间病逝。可能是多年清苦教书积劳成疾，也可能是某次文字狱风波后的惊悸成病。叙事写出寒门丧礼的清冷——没有淮西的军中旧交吊唁，没有商贾的铺张体面，只有几个乡邻和昔日学生的素服。可融入父亲一生的回忆：一个教了一辈子书的老秀才，留下的只有几箱旧书和满墙墨迹。' },
  // ---- 第二个孩子 ----
  { id: 'child2', turnWindow: [10, 20], probability: 0.20, category: '生子',
    requiresSpouse: true, minChildren: 1,
    effects: { bond: 3 },
    narrative: '第二个孩子出生。简单交代即可，1-2句。可以提及老大对弟弟/妹妹的反应。' },
  // ---- 第三个孩子 ----
  // v3.8.17 P2-2修复：新增第三个孩子事件，使"家族兴旺"结局（3+子女）可达
  { id: 'child3', turnWindow: [18, 30], probability: 0.15, category: '生子',
    requiresSpouse: true, minChildren: 2,
    effects: { bond: 3, people: 1 },
    narrative: '第三个孩子出生。家丁兴旺，值得庆贺。简单交代即可，1-2句。' },
  // ---- 母亲去世 ----
  { id: 'mother_death', turnWindow: [15, 25], probability: 0.30, category: '丧亲',
    requiresMotherAlive: true,
    backgroundExcludes: ['落魄前元官员之后'], // v3.9.0: 前元线情感核心依赖母亲存活到T47
    effects: { bond: -6, wisdom: 3 },
    narrative: '母亲去世。根据母亲的身份不同，丧礼氛围不同。前元出身→母亲身份敏感，丧事需低调；武将→军中旧交来吊唁；商人→铺张。' },
  // ---- 子女早夭 ----
  // v3.8.17 P2-2修复：新增子女早夭事件，使"家道中落"结局（allChildrenDead）可达
  { id: 'child_death', turnWindow: [8, 25], probability: 0.15, category: '丧亲',
    minChildren: 1,
    effects: { bond: -10, wisdom: 2 },
    narrative: '一个年幼的孩子夭折了。洪武朝婴儿死亡率极高，疫病、灾荒随时夺走幼小的生命。写出角色失去骨肉的悲痛——这是无声的崩溃。2-3句即可。' },
  // ---- 配偶去世 ----
  // v3.8.17 P2-1修复：新增配偶死亡事件，填补"妻子永远不会死"的设计缺口
  { id: 'spouse_death', turnWindow: [20, 45], probability: 0.20, category: '丧亲',
    requiresSpouse: true,
    effects: { bond: -12, wisdom: 3, people: 2 },
    narrative: '妻子去世了。难产、疫病、或是一场不起眼的风寒——在这个时代，夺走一条命太容易了。写出角色的丧妻之痛和丧礼场景。2-3句。' },
  // ---- 子女教育 ----
  { id: 'child_education', turnWindow: [18, 30], probability: 0.30, category: '教育',
    minChildren: 1,
    effects: { wisdom: 3, bond: 2 },
    narrative: '孩子渐长，到了启蒙读书的年纪。叙事中写角色为孩子选择老师或亲自教导的场景。' },
  // ---- 子女婚嫁 ----
  { id: 'child_marriage', turnWindow: [28, 42], probability: 0.30, category: '婚嫁',
    minChildren: 1,
    effects: { people: 5, bond: 3 },
    narrative: '子女到了婚嫁年龄。叙事中写有人上门提亲或角色物色亲家的场景。' },
  // ---- 孙辈出生 ----
  // v3.8.17 P0-3修复：孙辈事件必须等子女已婚嫁（requiresChildMarried），避免"未婚生子→直接有孙子"的逻辑悖论
  { id: 'grandchild', turnWindow: [35, 50], probability: 0.25, category: '子孙',
    minChildren: 1,
    requiresChildMarried: true,
    effects: { bond: 5, wisdom: 2 },
    narrative: '孙辈出生。写角色的天伦之乐——在乱世之中，这是难得的温暖。' },
  // ---- 晚年回忆 ----
  // v3.8.17 P0-4修复：turnWindow从[45,55]推迟到[48,56]，确保书生出身也至少45岁才触发
  { id: 'old_age_reflection', turnWindow: [48, 56], probability: 0.35, category: '晚年',
    effects: { wisdom: 5 },
    narrative: '角色渐入半百之年。叙事中写角色回望一生、思考传承的场景。注意措辞用"渐入暮年"或"半百之年"，不要用"暮年"——角色可能才四十多岁。' },
  // ---- 父亲被羞辱往事（前元专属，T3-6）----
  // v3.11.0c: 前元线父亲恐惧弧线——通过母亲讲述呈现（父亲已故）
  { id: 'father_humiliation_qy', turnWindow: [3, 6],
    backgrounds: ['落魄前元官员之后'],
    probability: 0.35, category: '往事',
    effects: { wisdom: 3, bond: 2 },
    narrative: '母亲在一个阴雨天主动提起了父亲生前的事。她说你父亲在翰林院做待诏时，有一次被叫到堂上，有人上疏说"前元降臣不宜留在翰林院"。你父亲被当众质问"你当年为什么不跟元顺帝走"——他一个字也答不上来。回到家后他把那件翰林待制的官服从箱子里拿出来看了很久，然后又锁了回去。母亲说："从那以后，你父亲就再也没提过\'官\'这个字。"她说完沉默了很久，又补了一句："你父亲这辈子最怕的事，就是被人翻出旧账。"写出降臣之后从母亲口中得知父亲屈辱往事的感受。' },
  // ---- 前元降臣被牵连（前元专属，T12-18）----
  // v3.11.0c: 前元线恐惧升级——降臣封侯仍不免，妻子愤怒+母亲恐惧
  { id: 'peer_implicated_qy', turnWindow: [12, 18],
    backgrounds: ['落魄前元官员之后'],
    probability: 0.30, category: '时事',
    effects: { wisdom: 2, bond: -2 },
    narrative: '一个前元降臣家族被牵连的消息传来——这家人表面上在新朝做官，暗地里与旧臣来往，被人举报"心思塞北"。全家被锦衣卫带走。你的妻子听到消息后脸色铁青，说"他们也配？封了侯又怎样，到头来还是刀下鬼"——她的愤怒不是针对朝廷，是针对这个逼人要藏要装的世界。母亲则吓得当天就把家里最后几件旧物烧了，手抖得火折子都拿不稳。两个女人，一个愤怒，一个恐惧，但恐惧的方式完全不同。写出这种反差。' },
  // ---- Phase 2: 书生婚姻选择（回合8-15）----
  { id: 'scholar_marriage', turnWindow: [8, 15], backgrounds: ['浙东寒门书生'],
    probability: 0.35, category: '婚姻', requiresNoSpouse: true,
    effects: { bond: 5, people: 3 },
    narrative: '有人上门提亲。寒门书生得此机缘，需抉择联姻对象——不同选择影响不同阵营关系。',
    hasChoice: true }
];

// ========== Phase 2: 联姻选项表（书生出身专属） ==========
// v3.8.17 P0-2修复：name/desc去掉阵营名和暗示性措辞，改为纯叙事描述
// 阵营数值效果保留在 factionEffect（代码内部使用），但不再暴露给AI
var MARRIAGE_PROPOSALS = [
  { id: 'marriage_huaixi', name: '武将之女', factionEffect: { huaixi: 12, zhedong: -5 },
    desc: '一位军中老将愿将女儿许配于你。此女性格爽利，嫁妆丰厚。但朝中文人或许会觉得你与武将走得太近。' },
  { id: 'marriage_zhedong', name: '同门之妹', factionEffect: { zhedong: 10, huaixi: -3 },
    desc: '同门师兄弟的妹妹，知书达理，温婉贤淑。此亲事在文人圈中颇受称道，但军中旧交或许会对你另眼相看。' },
  { id: 'marriage_commoner', name: '清白民女', factionEffect: { people: 3, wisdom: 2 },
    desc: '一户清白人家的女儿，与朝堂无涉，不涉纷争。门户虽不高，但胜在干净。' }
];

// ========== Phase 3: 家庭牵连危机系统 ==========
// 在政治大案期间，家人可能被牵连——产生"保人vs自保"的抉择
var FAMILY_CRISIS_EVENTS = [
  // 胡惟庸案期间（锚点2，turn 12-15）——通用版（淮西+商贾）
  { id: 'crisis_hu_spouse', anchorId: 2, backgrounds: ['淮西武将之后', '应天府商贾之子'],
    target: 'spouse', probability: 0.20,
    title: '妻子被牵连',
    desc: '胡惟庸案大清洗中，你妻子的娘家被查出与胡党有牵连。锦衣卫已登门问话。',
    choices: [
      { text: '变卖家产打点关系，保全妻子娘家', effects: { power: -8, bond: 10, people: 3 }, outcome: '保人' },
      { text: '主动休妻切割，向朝廷表忠心', effects: { power: 5, bond: -15, fame: -5 }, outcome: '自保' },
      { text: '暗中转移妻子，表面配合调查', effects: { wisdom: 5, power: -5, bond: 8 }, outcome: '两全' }
    ]
  },
  // 胡惟庸案期间——前元线特殊（妻子前元身份暴露风险）
  // v3.11.0c: 妻子也是前元后裔，与旧臣有来往，危机=双重暴露
  { id: 'crisis_hu_spouse_qianyuan', anchorId: 2, backgrounds: ['落魄前元官员之后'],
    target: 'spouse', probability: 0.30,
    title: '妻子的前元圈子被清查',
    desc: '胡惟庸案大清洗中，锦衣卫追查与前元旧臣有来往的人家。你妻子娘家与多个前元降臣家族有来往——其中包括被卷入此案的人家。妻子的愤怒爆发了："藏了这么多年，到头来还是不放过我们！"而母亲则吓得要立刻烧掉所有旧物。两个女人第一次正面冲突——妻子说"烧什么烧？烧了就干净了？"母亲说"你想死别拉上全家。"你夹在中间。',
    choices: [
      { text: '连夜转移妻子，安排她藏到远亲家中', effects: { power: -10, bond: 8, wisdom: 5 }, outcome: '保人' },
      { text: '让妻子主动与那些家族断绝来往，写保证书', effects: { power: 3, bond: -12, wisdom: 3 }, outcome: '自保' },
      { text: '贿赂锦衣卫中认识的人，让妻子的名字从名单上消失', effects: { power: -8, bond: 5, wisdom: 3 }, outcome: '两全' }
    ]
  },
  // 胡惟庸案期间——书生出身特殊（老师宋濂被牵连）
  { id: 'crisis_hu_teacher', anchorId: 2, backgrounds: ['浙东寒门书生'],
    target: 'teacher', probability: 0.30,
    title: '恩师宋濂被牵连',
    desc: '胡惟庸案爆发，恩师宋濂的长孙宋慎被查出是"胡党"。有人提议连你一起查办。',
    choices: [
      { text: '上书力保恩师，不惜触怒皇帝', effects: { fame: 10, bond: 12, power: -10 }, outcome: '保人' },
      { text: '联合数名同门私下求情', effects: { bond: 5, wisdom: 3, power: -3 }, outcome: '两全' },
      { text: '断绝来往，明哲保身', effects: { bond: -12, power: 3 }, outcome: '自保' }
    ]
  },
  // 李善长案期间（锚点5，turn 38-40）
  { id: 'crisis_li_father', anchorId: 5, backgrounds: ['淮西武将之后'],
    target: 'father', probability: 0.25, requiresFatherAlive: true,
    title: '父亲被牵连',
    desc: '李善长案株连淮西老人，你的父亲作为淮西老将，也被列入排查名单。',
    choices: [
      { text: '动用一切关系保全父亲', effects: { power: -12, bond: 15, people: 5 }, outcome: '保人' },
      { text: '主动告发父亲的"过失"以求自保', effects: { power: 8, bond: -20, fame: -8 }, outcome: '自保' },
      { text: '送父亲回乡避风头，表面配合', effects: { wisdom: 5, power: -5, bond: 8 }, outcome: '两全' }
    ]
  },
  // 李善长案期间——书生出身特殊（父亲被文字狱波及）
  // v3.11.0b: 书生父亲是乡间老秀才，文字狱时代天然靶子
  { id: 'crisis_li_father_scholar', anchorId: 5, backgrounds: ['浙东寒门书生'],
    target: 'father', probability: 0.25, requiresFatherAlive: true,
    title: '父亲被文字狱波及',
    desc: '李善长案株连甚广，锦衣卫追查"浙东学派"渊源。你的父亲在乡间开馆数十年，教出的学生遍布朝野——如今这成了罪名。有人举报他"以讲学为名结党营私"，锦衣卫已往青田县派人。',
    choices: [
      { text: '立刻回乡接父亲入京，藏在同门家中', effects: { power: -8, bond: 12, wisdom: 5 }, outcome: '保人' },
      { text: '上书自辩，证明父亲不过一介寒儒', effects: { fame: 8, bond: 5, power: -10 }, outcome: '两全' },
      { text: '断绝父子来往记录，撇清关系', effects: { power: 5, bond: -15, fame: -5 }, outcome: '自保' }
    ]
  },
  // 蓝玉案期间（锚点7，turn 47-49）——淮西武将的终极危机
  { id: 'crisis_lan_clan', anchorId: 7, backgrounds: ['淮西武将之后'],
    target: 'clan', probability: 0.35,
    title: '蓝玉案株连淮西',
    desc: '蓝玉案爆发，淮西勋贵被连根拔起。你的家族、姻亲、旧部人人自危。这是淮西武将的末日。',
    choices: [
      { text: '倾尽家财疏通关系，保全族人', effects: { power: -15, bond: 18, people: 8 }, outcome: '保人' },
      { text: '主动揭发"同党"以求自保', effects: { power: 10, bond: -25, fame: -10 }, outcome: '自保' },
      { text: '携家眷连夜出逃', effects: { power: -20, bond: 10, wisdom: 8, people: -5 }, outcome: '逃亡' }
    ]
  },
  // 蓝玉案期间——前元老母身份暴露风险
  { id: 'crisis_lan_mother', anchorId: 7, backgrounds: ['落魄前元官员之后'],
    target: 'mother', probability: 0.30, requiresMotherAlive: true,
    title: '母亲身份暴露',
    desc: '蓝玉案大清洗中，锦衣卫查到你母亲的前元旧臣身份。在这风声鹤唳之时，这个身份可能是催命符。',
    choices: [
      { text: '重金贿赂锦衣卫，掩盖母亲身份', effects: { power: -10, bond: 8, wisdom: 3 }, outcome: '保人' },
      { text: '主动举报母亲"前朝余孽"身份', effects: { power: 5, bond: -18, fame: -5 }, outcome: '自保' },
      { text: '安排母亲隐匿，自己出面应对盘查', effects: { wisdom: 8, power: -8, bond: 10 }, outcome: '两全' }
    ]
  },
  // 胡惟庸案期间——商贾线特殊：母亲与婉清联手撑家
  // v3.11.0b: 两个女人撑起富商家业
  { id: 'crisis_hu_mothers_merchant', anchorId: 2, backgrounds: ['应天府商贾之子'],
    target: 'mother', probability: 0.30,
    title: '母亲与婉清撑起家业',
    desc: '胡惟庸案风暴中，父亲已病倒或去世，家中群龙无首。锦衣卫在附近搜查商人宅邸，刁奴趁机转移家产，忠仆陈三被打伤。母亲第一次没有慌——她叫来婉清，两人在账房对坐，把家产清单一条一条理出来。母亲说："陈三不能丢。铺子可以关，人不能散。"婉清看了婆婆一眼，第一次叫她"娘"而不是"婆婆"。',
    choices: [
      { text: '让母亲主持大局，自己在衙门配合', effects: { power: -5, bond: 10, wisdom: 5 }, outcome: '母媳守家' },
      { text: '自己赶回去处理，让母亲和婉清别出门', effects: { power: -8, bond: 5 }, outcome: '独扛' },
      { text: '放弃部分铺子保全家人', effects: { power: -12, bond: 8, wisdom: 8 }, outcome: '断尾求生' }
    ]
  }
];

// 检查并触发家庭牵连危机（在锚点期间调用）
function checkFamilyCrisis(turn) {
  if (!GameState.family) return;
  
  // 已触发过家庭危机？本锚点期间只触发一次
  if (GameState.familyCrisisTriggeredThisAnchor) return;
  
  var bg = GameState.character.background;
  var family = GameState.family;
  
  // 找出当前回合所在的锚点
  var currentAnchor = null;
  for (var ai = 0; ai < HISTORY_ANCHORS.length; ai++) {
    if (turn >= HISTORY_ANCHORS[ai].start && turn <= HISTORY_ANCHORS[ai].end) {
      currentAnchor = HISTORY_ANCHORS[ai];
      break;
    }
  }
  if (!currentAnchor) return;
  
  // v3.9.1: 情感锚点回合不触发家庭危机（避免叙事重复）
  // v3.14.0: 统一走 isEATurn（P1-2）
  if (isEATurn(turn)) {
    console.log('[家庭危机] 跳过：当前回合有情感锚点');
    return;
  }
  
  // 遍历家庭牵连事件表
  for (var i = 0; i < FAMILY_CRISIS_EVENTS.length; i++) {
    var evt = FAMILY_CRISIS_EVENTS[i];
    
    // 锚点ID匹配？
    if (evt.anchorId !== currentAnchor.id) continue;
    
    // 出身匹配？
    if (evt.backgrounds && evt.backgrounds.indexOf(bg) < 0) continue;
    
    // 已触发过这个事件？
    if (GameState.lifeEventsTriggered.indexOf(evt.id) >= 0) continue;
    
    // 需要父亲在世？
    if (evt.requiresFatherAlive && (!family.parents.father || family.parents.father.status !== '在世')) continue;
    
    // 需要母亲在世？
    if (evt.requiresMotherAlive && (!family.parents.mother || family.parents.mother.status !== '在世')) continue;
    
    // 需要配偶在世？
    if (evt.target === 'spouse' && (!family.spouse || family.spouse.status !== '在世')) continue;
    
    // 概率判定（P2-4: 家庭事件触发时，选择权重+20%）
    var adjustedProb = evt.probability;
    // 家庭类事件概率增强：让家庭线更有存在感
    var familyCategories = ['婚后安顿', '生子', '教育', '婚嫁', '晚年', '子孙'];
    if (familyCategories.indexOf(evt.category) >= 0) {
      adjustedProb = Math.min(1.0, evt.probability * 1.20);
    }
    if (Math.random() >= adjustedProb) continue;
    
    // === 触发！ ===
    GameState.lifeEventsTriggered.push(evt.id);
    GameState.familyCrisisTriggeredThisAnchor = true;
    GameState.currentFamilyCrisis = {
      id: evt.id,
      title: evt.title,
      desc: evt.desc,
      choices: evt.choices,
      turn: turn,
      anchorId: currentAnchor.id
    };
    
    console.log('[家庭危机] 触发「' + evt.title + '」');
    return;
  }
}

// 检查并触发生活事件（每回合在updateDeathTracking中调用）
function checkLifeEvents(turn) {
  // 家庭数据不存在则跳过（旧存档兼容）
  if (!GameState.family) return;
  
  var pacing = GameState.pacing;
  // 紧迫/反转/沉淀回合不触发生活事件（政治优先）
  if (pacing === '紧迫' || pacing === '反转' || pacing === '沉淀') return;
  
  // 锚点回合不触发（锚点事件本身已经够密集）
  for (var ai = 0; ai < HISTORY_ANCHORS.length; ai++) {
    if (turn >= HISTORY_ANCHORS[ai].start && turn <= HISTORY_ANCHORS[ai].end) return;
  }
  
  // 冷却检查：距上次生活事件至少4回合
  if (GameState.lifeEventLastTurn > 0 && (turn - GameState.lifeEventLastTurn) < 4) return;
  
  var bg = GameState.character.background;
  var family = GameState.family;
  
  // v3.9.0: 情感锚点回合不触发生活事件（叙事密度已经够高）
  // v3.14.0: 统一走 isEATurn（P1-2）
  if (isEATurn(turn)) return;
  
  // 遍历所有事件，找到当前可触发的
  for (var i = 0; i < LIFE_EVENTS.length; i++) {
    var evt = LIFE_EVENTS[i];
    
    // 已触发过？跳过
    if (GameState.lifeEventsTriggered.indexOf(evt.id) >= 0) continue;
    
    // 回合窗口检查
    if (turn < evt.turnWindow[0] || turn > evt.turnWindow[1]) continue;
    
    // 出身限制检查
    if (evt.backgrounds && evt.backgrounds.indexOf(bg) < 0) continue;
    
    // v3.9.0: 出身排除检查（情感锚点冲突修复）
    if (evt.backgroundExcludes && evt.backgroundExcludes.indexOf(bg) >= 0) continue;
    // v3.9.0: 出身专属最小回合（情感锚点冲突修复）
    if (evt.backgroundMinTurn && evt.backgroundMinTurn[bg] && turn < evt.backgroundMinTurn[bg]) continue;
    
    // 需要配偶？
    if (evt.requiresSpouse && (!family.spouse || family.spouse.status !== '在世')) continue;
    
    // Phase 2: 需要未婚？
    if (evt.requiresNoSpouse && family.spouse && family.spouse.status === '在世') continue;
    
    // 需要父亲在世？
    if (evt.requiresFatherAlive && (!family.parents.father || family.parents.father.status !== '在世')) continue;
    
    // 需要母亲在世？
    if (evt.requiresMotherAlive && (!family.parents.mother || family.parents.mother.status !== '在世')) continue;
    
    // 最少孩子数量？
    var livingChildren = 0;
    for (var ci = 0; ci < family.children.length; ci++) {
      if (family.children[ci].status === '在世') livingChildren++;
    }
    if (evt.minChildren && livingChildren < evt.minChildren) continue;

    // v3.8.17 P0-3修复：孙辈事件必须等子女已完成婚嫁
    if (evt.requiresChildMarried && GameState.lifeEventsTriggered.indexOf('child_marriage') < 0) continue;
    
    // 概率判定
    if (Math.random() >= evt.probability) continue;
    
    // === 触发！ ===
    GameState.lifeEventsTriggered.push(evt.id);
    GameState.lifeEventLastTurn = turn;
    GameState.currentLifeEvent = {
      id: evt.id,
      category: evt.category,
      narrative: evt.narrative,
      effects: evt.effects,
      turn: turn
    };
    
    // 执行事件效果
    if (evt.effects) {
      for (var attr in evt.effects) {
        if (evt.effects.hasOwnProperty(attr) && GameState.attributes[attr] !== undefined) {
          GameState.attributes[attr] = Math.max(0, Math.min(100, GameState.attributes[attr] + evt.effects[attr]));
        }
      }
    }
    
    // 根据事件类型更新家庭数据
    switch (evt.id) {
      case 'child1':
        family.children.push({
          name: '', birthTurn: turn, birthYear: GameState.year,
          gender: Math.random() > 0.5 ? '男' : '女',
          status: '在世', order: 1
        });
        break;
      case 'child2':
        family.children.push({
          name: '', birthTurn: turn, birthYear: GameState.year,
          gender: Math.random() > 0.5 ? '男' : '女',
          status: '在世', order: 2
        });
        break;
      case 'child3':
        family.children.push({
          name: '', birthTurn: turn, birthYear: GameState.year,
          gender: Math.random() > 0.5 ? '男' : '女',
          status: '在世', order: 3
        });
        break;
      case 'father_death':
        family.parents.father.status = '已故';
        family.parents.father.deathTurn = turn;
        break;
      case 'mother_death':
        family.parents.mother.status = '已故';
        family.parents.mother.deathTurn = turn;
        break;
      case 'spouse_death':
        if (family.spouse) {
          family.spouse.status = '已故';
          family.spouse.deathTurn = turn;
        }
        break;
      case 'child_death':
        // 选择最年幼的在世子女使其夭折（叙事上更合理——幼孩最脆弱）
        var youngestChild = null;
        for (var ci = family.children.length - 1; ci >= 0; ci--) {
          if (family.children[ci].status === '在世') { youngestChild = family.children[ci]; break; }
        }
        if (youngestChild) {
          youngestChild.status = '已故';
          youngestChild.deathTurn = turn;
          console.log('[生活事件] 子女夭折：第' + youngestChild.order + '个孩子');
        }
        break;
      case 'scholar_marriage':
        // Phase 2: 书生婚姻——设置待选联姻选项
        GameState.pendingMarriageChoice = {
          proposals: MARRIAGE_PROPOSALS,
          turn: turn
        };
        break;
    }
    
    // v3.8.20: 家庭事件→正面种子联动（路径A）
    plantFamilySeed(evt.id);
    
    console.log('[生活事件] 触发「' + evt.category + '」：' + evt.narrative.substring(0, 20) + '...');
    return; // 每回合最多触发一个生活事件
  }
}

// 1. 获取当前在世NPC列表（v3.9：信息隔离——对绑定未来锚点的NPC附加禁止指令）
// v3.14.0：死亡判断统一走 isNPCDead（P1-2）
function getAliveNPCs(year) {
  const alive = [];
  const dead = [];
  for (const [name, info] of Object.entries(NPC_BIRTH_DEATH)) {
    var isDead = isNPCDead(name, info, year);
    if (!isDead) {
      const age = info.birth ? year - info.birth : null;
      const ageStr = age ? `${age}岁` : '年龄不详';
      var desc = info.personality;
      
      // v3.9: 信息隔离——如果此NPC绑定了尚未发生的锚点，附加禁止指令
      var maxAllowed = (typeof getAllowedMaxAnchorId === 'function') ? getAllowedMaxAnchorId() : 999;
      var link = NPC_ANCHOR_LINK[name];
      if (link && link.boundAnchor > maxAllowed) {
        desc += `。【叙事铁律·此人当前活跃在世】可描写其日常政务、人际交往、权力运作；严禁以任何方式描写其未来「${link.boundEvent}」相关情节（不得写其谋反/下狱/被诛/案发/赐死/牵连/病逝等结局，不得暗示其未来命运，不得以"日后""终将"等预言式笔法描写）。违反将导致本回合被驳回。`;
      }
      
      alive.push(`${name}(${ageStr}，${desc})`);
    } else {
      dead.push(`${name}(卒于${info.death}年)`);
    }
  }
  var result = alive.length ? `【当前在世重要人物】${alive.join('；')}。` : '';
  if (dead.length) {
    result += `【已故人物·严禁以活人身份出场】${dead.join('、')}。这些人在当前年份已死，绝对不可让他们以活人身份出场、对话、被拜访或被提及近况。仅在回忆/追悼语境中可以提及他们的名字。违反将导致本回合被驳回。`;
  }
  return result;
}

// v3.8.14: 获取当前已故NPC列表（用于输出校验）
// v3.14.0：死亡判断统一走 isNPCDead（P1-2）
function getDeadNPCs(year) {
  var dead = [];
  for (var name in NPC_BIRTH_DEATH) {
    var info = NPC_BIRTH_DEATH[name];
    var isDead = isNPCDead(name, info, year);
    if (isDead) {
      dead.push({ name: name, deathYear: info.death });
    }
  }
  return dead;
}

// 2. 获取当前可用机构名称（制度时间窗硬控，杜绝穿帮）
function getAllowedInstitutions(year) {
  const allowed = ['官差', '衙役'];
  if (year >= 1382) allowed.push('巡卒', '缇骑', '锦衣卫');
  if (year >= 1420) allowed.push('东厂');
  if (year >= 1477) allowed.push('西厂');
  
  const forbidden = [];
  if (year < 1382) forbidden.push('锦衣卫', '缇骑', '巡卒');
  if (year < 1420) forbidden.push('东厂');
  if (year < 1477) forbidden.push('西厂');
  
  let hint = `【当前时期(${year}年)可用称谓】${allowed.join('、')}`;
  if (forbidden.length) {
    hint += `；【严禁使用】${forbidden.join('、')}（尚未设立）`;
  }
  return hint;
}

// ========== P0-1: 近臣事件系统 ==========
// 近臣阵营独有事件表——8个事件，分两阶段（宋濂线+毛骧线）
// 每个事件有触发窗口、jinchen门槛、NPC代言人
const JINCHEN_EVENTS = [
  // 第一阶段：宋濂线（1375-1381，turn 2-16）
  { id: 'jc_1', name: '经筵问对',   window: [5, 7],   yearRange: [1375, 1381], minJinchen: -999, npc: '宋濂' },
  { id: 'jc_2', name: '诗会风波',   window: [8, 10],  yearRange: [1375, 1381], minJinchen: 5,     npc: '宋濂' },
  { id: 'jc_3', name: '太子宴',     window: [10, 11], yearRange: [1375, 1381], minJinchen: -999,  npc: '宋濂' },
  { id: 'jc_4', name: '宋濂之劫',   window: [12, 15], yearRange: [1375, 1381], minJinchen: 10,    npc: '宋濂', anchorBind: 2 },
  // 第二阶段：毛骧线（1382-1398，turn 17+）
  { id: 'jc_5', name: '锦衣卫约谈', window: [23, 25], yearRange: [1382, 1398], minJinchen: -999,  npc: '毛骧' },
  { id: 'jc_6', name: '暗桩交易',   window: [27, 30], yearRange: [1382, 1398], minJinchen: 0,     npc: '毛骧' },
  { id: 'jc_7', name: '诏狱惊魂',   window: [35, 37], yearRange: [1382, 1398], minJinchen: -999,  npc: '毛骧' },
  { id: 'jc_8', name: '毛骧之死',   window: [38, 40], yearRange: [1382, 1398], minJinchen: -999,  npc: '毛骧', anchorBind: 5 }
];

// 检查当前回合是否有近臣事件需要触发
function checkJinchenEvents(turn, jinchen, year) {
  const triggered = [];
  for (const evt of JINCHEN_EVENTS) {
    // 已触发则跳过
    if (GameState.jinchenEvents && GameState.jinchenEvents[evt.id]) continue;
    // 回合窗口检查
    if (turn < evt.window[0] || turn > evt.window[1]) continue;
    // 年份范围检查
    if (year < evt.yearRange[0] || year > evt.yearRange[1]) continue;
    // jinchen最低值检查
    if (jinchen < evt.minJinchen) continue;
    // 锚点绑定检查（如果有anchorBind，需要当前锚点窗口内）
    if (evt.anchorBind) {
      const anchor = HISTORY_ANCHORS.find(a => a.id === evt.anchorBind);
      if (!anchor || turn < anchor.start || turn > anchor.end) continue;
    }
    triggered.push(evt);
  }
  return triggered;
}

// 生成近臣事件的叙事指令（注入AI directive）
function getJinchenEventDirective(turn, jinchen, year) {
  const events = checkJinchenEvents(turn, jinchen, year);
  if (events.length === 0) return '';
  
  const evt = events[0]; // 每回合最多触发一个近臣事件
  let directive = `\n【近臣事件·${evt.name}】本回合必须包含此事件场景。`;
  
  // 根据事件ID给出场景描述和选项提示
  switch(evt.id) {
    case 'jc_1':
      directive += `\n场景：经筵上，翰林学士宋濂以"《春秋》微言大义"为题考问在场官员，目光转向你。`;
      directive += `\n选项提示：A.以经义应对请教学问(jinchen+8,zhedong+5) B.沉默不语(jinchen+2) C.以实务反驳经学空谈(jinchen-3,power+5)`;
      break;
    case 'jc_2':
      directive += `\n场景：宋濂即将告老还乡，同僚们在城外别业设宴送行。有人悄悄提醒："宋学士圣眷正衰，此时沾边，恐非善策。"`;
      directive += `\n选项提示：A.公开赴宴为宋濂赋诗送行(jinchen+10,fame+5) B.不赴宴私下赠礼(jinchen+5) C.不去划清界限(jinchen-5)`;
      break;
    case 'jc_3':
      directive += `\n场景：太子朱标在东宫设小宴，邀了几位旧日文臣叙旧。宋濂也在场。席间朱标问起你对当前朝局的看法。`;
      directive += `\n选项提示：A.直言进谏指出隐患(donggong+8,jinchen+5) B.只谈风月不涉及政事(jinchen+3) C.暗中替朱元璋说话(favor+10,donggong-8)`;
      break;
    case 'jc_4':
      directive += `\n场景：胡惟庸案爆发，宋濂长孙宋慎被查出是"胡党"。有人提议连你一起查办，因为你曾与宋濂有诗文往来。`;
      directive += `\n选项提示：A.上书力保宋濂(jinchen+15,fame+8,favor-12) B.联合数人私下求情(jinchen+8,favor-5) C.断绝来往自保(jinchen-12) D.暗中送盘缠(jinchen+5,favor-8)`;
      break;
    case 'jc_5':
      directive += `\n场景：两个穿飞鱼服的人找到你，请你去锦衣卫衙门"喝茶"。毛骧亲自主持——他翻开一本册子，上面记着你近三年的行踪。`;
      directive += `\n选项提示：A.如实回答所有问题(jinchen+10,bond-8) B.巧妙周旋滴水不漏(jinchen+3) C.断然拒绝拂袖而去(jinchen-15)`;
      break;
    case 'jc_6':
      directive += `\n场景：毛骧派人送来密信，要你帮忙留意某位同僚的行迹，"为本卫最大的帮助"。`;
      directive += `\n选项提示：A.答应做暗桩提供情报(jinchen+12,bond-12) B.将情报提前告知同僚(jinchen-10,bond+10) C.销毁密信装作没收到(jinchen-5) D.模糊回应两边下注(jinchen+3)`;
      break;
    case 'jc_7':
      directive += `\n场景：你因公务经过锦衣卫诏狱，认出了其中一张脸——你的同年进士。他挣扎着喊了你的名字。锦衣卫校尉转头看向你。`;
      directive += `\n选项提示：A.上前询问试图帮忙(jinchen-8,bond+5) B.别过脸去快步走过(jinchen+3) C.暗中记下被捕者名单(jinchen+5,bond+8)`;
      break;
    case 'jc_8':
      directive += `\n场景：锦衣卫指挥使毛骧被下诏狱，罪名是"胡党余孽"。他办了一辈子案，最后自己也成了案中人。`;
      directive += `\n选项提示：A.主动揭发毛骧以表忠心(jinchen-10,favor+10,fame-8) B.沉默不言(jinchen+5) C.暗中保全毛骧家人(jinchen-5,bond+10)`;
      break;
  }
  
  directive += `\n（选择后请调用 GameState.jinchenEvents['${evt.id}'] = 选项字母 记录已触发）`;
  return directive;
}

// 3. 获取锚点铺垫方向（只给方向不给名称，防止剧透）
function getAnchorDirection(anchorId) {
  const directions = {
    1: "浙东文臣的命运正在被审视",
    2: "丞相府风声渐紧，中书省权力引发猜忌", // v3.8.9: 胡惟庸案现为id=2
    3: "地方官携带空白盖印文书入京，户部系统暗流涌动", // v3.8.9: 空印案现为id=3
    4: "户部账目异常、地方财政频出问题",
    5: "前朝旧臣的牵连开始浮现",
    6: "太子东宫气氛凝重，储位之争暗流涌动",
    7: "淮西勋贵骄横跋扈、屡生事端",
    8: "锦衣卫诏狱人满为患，朝野噤若寒蝉",
    9: "太祖龙体抱恙、朝局暗流涌动"
  };
  return directions[anchorId] || "";
}

// 4. 获取锚点信息（分层：当前锚点完整信息、下一个锚点只给方向、更远锚点禁止提及）
function getAnchorHints(currentTurn) {
  let currentAnchor = null;
  let nextAnchorHint = null;
  const forbiddenEvents = [];
  
  for (const anchor of HISTORY_ANCHORS) {
    // 当前锚点：在窗口内或刚结束（余波期2回合）
    if (currentTurn >= anchor.start && currentTurn <= anchor.end + 2) {
      currentAnchor = anchor;
    }
    // 下一个锚点：即将发生（距离≤5回合）→ 只给铺垫方向
    else if (currentTurn < anchor.start && currentTurn >= anchor.start - 5) {
      nextAnchorHint = getAnchorDirection(anchor.id);
    }
    // 更远的锚点：禁止提及
    else if (currentTurn < anchor.start - 5) {
      forbiddenEvents.push(anchor.name);
    }
  }
  
  const hints = {};
  if (currentAnchor) {
    hints.current = `【当前锚点】${currentAnchor.name}（${currentAnchor.time}）：${currentAnchor.desc}`;
  }
  if (nextAnchorHint) {
    hints.next_hint = `【可铺垫方向】${nextAnchorHint}（可写模糊的坊间传闻、制度异常、人物处境，但严禁点名事件名称或预言结局）`;
  }
  if (forbiddenEvents.length) {
    hints.forbidden = `【严禁提及】${forbiddenEvents.join('、')}（尚未发生，不得作为已发生事件描写）`;
  }
  // v3.9: 正面引导替代负面禁止——告诉AI当前应该写什么
  var maxAllowedId = (typeof getAllowedMaxAnchorId === 'function') ? getAllowedMaxAnchorId() : HISTORY_ANCHORS[HISTORY_ANCHORS.length - 1].id;
  var maxAnchor = HISTORY_ANCHORS.find(function(a){ return a.id === maxAllowedId; });
  var guide = '【时间线·当前焦点】叙事焦点应为「' + (maxAnchor ? maxAnchor.name : '日常政务') + '」及其相关人物的日常活动。';
  if (maxAnchor) {
    guide += '可以描写：' + maxAnchor.desc + '。';
    // 列出与此锚点相关的NPC
    var relatedNPCs = [];
    for (var npcName in NPC_ANCHOR_LINK) {
      if (NPC_ANCHOR_LINK[npcName].boundAnchor === maxAnchor.id) {
        relatedNPCs.push(npcName);
      }
    }
    if (relatedNPCs.length > 0) {
      guide += '相关人物（' + relatedNPCs.join('、') + '）正处于命运转折的前夜。';
    }
  }
  // 简洁的负面约束
  var futureAnchors = HISTORY_ANCHORS.filter(function(a){ return a.id > maxAllowedId; });
  if (futureAnchors.length > 0) {
    guide += ' 严禁：' + futureAnchors.map(function(a){ return a.name; }).join('、') + ' 尚未发生，不得描写。';
  }
  hints.anchor_order_lock = guide;
  return hints;
}

// ========== v3.8.20: 自由行动引导 ==========
// 根据当前游戏状态生成一行提示，帮助玩家思考自由行动该输入什么
// 返回字符串或null（不显示）
function getActionHint() {
  var turn = GameState.turn;
  var pacing = GameState.pacing;
  var attrs = GameState.attributes;
  var ef = GameState.emperor_feeling;

  // 1. 临近锚点提示（最重要）
  var nextAnchor = null;
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    if (turn < HISTORY_ANCHORS[i].start && turn >= HISTORY_ANCHORS[i].start - 5) {
      nextAnchor = HISTORY_ANCHORS[i];
      break;
    }
  }
  if (nextAnchor) {
    var gap = nextAnchor.start - turn;
    if (gap <= 2) return '风暴将至，或可提前布局——结交关键人物、打探消息、准备后路';
    if (gap <= 5) return '朝中暗流涌动，或有值得打探的消息';
  }

  // 2. 圣眷危险提示
  if (ef <= -20) return '圣眷低迷，或可设法修复——上书陈情、办妥差事、或通过近臣美言';
  if (ef >= 30) return '圣眷正隆，趁此良机或可谋更大图谋';

  // 3. 属性极端提示
  if (attrs.power >= 65) return '权势过盛，功高震主之忧——或可主动示弱、韬光养晦';
  if (attrs.people >= 65) return '民心所向，百姓拥戴——或可借此为朝廷办几件实事';
  if (attrs.bond <= 15) return '朝中孤立，无人可依——或可主动结交同僚、修复关系';
  if (attrs.wisdom >= 65) return '智谋出众，或可运筹帷幄——布局长远、谋定后动';

  // 4. 种子相关提示
  var overdueSeeds = 0;
  for (var si = 0; si < GameState.seeds.length; si++) {
    if (GameState.seeds[si].trigger_turn <= turn + 1) overdueSeeds++;
  }
  if (overdueSeeds > 0) return '此前埋下的伏笔即将揭晓——静观其变，或可主动推动';

  // 5. 日常回合通用提示
  if (pacing === '日常') {
    var dailyHints = [
      '日常政务之余，或可发展个人关系',
      '趁此平静时光，或可积累资源、经营人脉',
      '朝堂暂歇，正是布局好时机'
    ];
    return dailyHints[turn % dailyHints.length];
  }

  return null;
}


// ========== v3.6: background-anchor mapping, ending paths, surveillance ==========

// v3.8.10-fix A4: 出身锚点提示表重建为 1-9 全键，与 HISTORY_ANCHORS id 严格对应
// v3.10.0: P2-3 每条锚点新增 infoFragment 信息碎片——出身独有的情报收集线索
const BACKGROUND_ANCHOR_MAP = {
  '淮西武将之后': {
    core_interest: '军权、旧部存亡、出征机会',
    anchors: {
      1: '恩师故交凋零，军中老将感叹朝局无常',
      2: '淮西阵营被猜忌，武将人人自危——胡丞相同是淮西人，你感同身受',
      3: '空印案严查地方文书，军中屯田账目亦受波及',
      4: '郭桓案牵连军费拨付，卫所粮饷告急',
      5: '李善长案株连淮西老人，武将感到唇亡齿寒',
      6: '太子薨逝——武将最后的靠山倒了，诸王觊觎储位，需抉择站队',
      7: '舅舅蓝玉被诛——全书最高潮，亲情与自保的抉择',
      8: '锦衣卫大肆搜捕军中旧交，武将几近灭绝',
      9: '朱元璋驾崩，旧时代终结。新帝削藩，武将被卷入新一轮站队'
    },
    infoFragments: {
      1: '你在老营帐中发现一封旧信——朱元璋亲笔，要求将领"自报家底"。这是清洗的前兆',
      2: '胡惟庸府上的幕僚偷偷传话：丞相在拉拢淮西武将，名单上有你的名字',
      3: '军中屯田账目对不上——有人侵吞了军粮，而空印案正好在查这个',
      4: '户部拨付的军费比账面少了三成——郭桓案揭开的不只是贪腐，还有军费去向',
      5: '李善长的管家被拿了，他手里有一本账册，记着淮西勋贵之间的往来',
      6: '燕王派人秘密接触淮西旧将——他在为将来布局，你需要决定站哪边',
      7: '蓝玉被捕前夜，有人从府中递出一封血书，收件人是你——内容是"快走"',
      8: '锦衣卫的名簿上，你看到了许多熟悉的名字——他们不是通敌，只是"淮西人"',
      9: '新帝削藩令下，北平那边有动静——武将们被要求表态，你必须在忠旧与顺新之间选'
    }
  },
  '浙东寒门书生': {
    core_interest: '文名、师门存亡、文字风险',
    anchors: {
      1: '恩师刘伯温之死——开局情感暴击，精神导师陨落',
      2: '胡案余波中浙东文人被卷入政治漩涡，文字狱风险升温',
      3: '空印案追查地方文书，可让同门上书议论，展现浙东学人风骨',
      4: '郭桓案后户部震荡，牵连的文官系统动荡',
      5: '李善长案株连浙东系文人，师门岌岌可危',
      6: '太子之死——文官集团失去最大靠山，新储君对浙东态度不明',
      7: '蓝玉案后文官噤声，朝堂万马齐喑，书生面临恐怖中的坚守',
      8: '锦衣卫搜捕异己，文字狱风声鹤唳',
      9: '新帝即位，文治还是武功？书生以笔为剑的新篇章'
    },
    infoFragments: {
      1: '整理刘伯温遗物时发现一封未寄出的信——写给朱元璋，论"功臣之祸"。这封信若被人看到，师门危矣',
      2: '胡惟庸案中牵出一份文人名单，浙东同门有三人在列——罪名是"以文结党"',
      3: '同门写了一篇议论空印案的文章，被御史抄送御前——文章是忠言，但可能被解读为"怨望"',
      4: '郭桓案后户部清理文书，你发现一份旧档记录了浙东文官的举荐关系网',
      5: '李善长案牵连出的供词中提到"浙东学派"——师门正在被当作一个"派系"来清算',
      6: '太子生前曾托人转告浙东文人"安心治学"——如今太子不在了，这话还算数吗',
      7: '一位同门因私藏"违禁文字"被拿——他的书房里只有刘伯温的注疏',
      8: '锦衣卫在搜查中抄走了一批书——其中有你师门的文集，这些书可能成为"罪证"',
      9: '新帝下诏求贤——但诏书中"严辨学术正邪"几个字让浙东文人心惊'
    }
  },
  '应天府商贾之子': {
    core_interest: '商路、账目、税赋、货源',
    anchors: {
      1: '朝局动荡影响商路安全，观望囤货',
      2: '胡案牵连商业伙伴被盘查，需切割关系自保',
      3: '空印案——户部直属全书高潮，直接面临交出账本/销毁证据/趁乱转移的抉择',
      4: '郭桓案直接冲击：户部系统被清洗，你作为户部办事首当其冲',
      5: '李善长案后的政治站队问题，商贾需选边',
      6: '太子之死——经济政策可能大变，宝钞与商税面临变局',
      7: '蓝玉案中商人被牵连（资助淮西嫌疑），军需采购被查',
      8: '锦衣卫搜查商号，以"通敌"之名勒索',
      9: '新朝经济政策洗牌，最终商业格局定格'
    },
    infoFragments: {
      1: '你从商路上得到消息：有人在囤积军需物资，价格异常——这是朝局变动的先兆',
      2: '你的一个商业伙伴被锦衣卫约谈——他和你都跟胡惟庸府上的管事有过生意',
      3: '户部要求你交出近三年的商号账簿——空印案正在查账，你的账目是否经得起查',
      4: '郭桓案的名单上有一个你认识的名字——他帮你做过一笔"灰色"的盐引生意',
      5: '两派都在拉拢商人筹款——你需要决定把银子押在哪边，还是两边都押',
      6: '宝钞贬值的消息在商圈传开——太子在世时曾压制通胀，现在谁来稳住币值',
      7: '军需采购被查，你发现经手的丝绸和铁器订单——最终流向了蓝玉的军中',
      8: '锦衣卫以"通敌"之名搜查你的商号——你知道他们真正要的是你和某位大人的账目往来',
      9: '新帝推行新的商税政策——旧的商业格局被打破，你需要在新秩序中找到位置'
    }
  },
  '落魄前元官员之后': {
    core_interest: '身份安全、监视压力、洗白机会',
    anchors: {
      1: '新朝清洗信号，前元旧臣人人自危，需隐匿身份',
      2: '胡案波及所有"身份可疑"之人，被排查风险',
      3: '空印案中底层小官被推出来当替罪羊——你通过代笔文书观察到清洗波及范围',
      4: '郭桓案中户部被清洗，前元旧臣首当其冲，身份危机浮现',
      5: '李善长案：保护人倒了，前元身份面临暴露风险',
      6: '太子之死：新储君对前元旧臣态度不明，重新评估洗白策略',
      7: '蓝玉案大清洗气氛，监视压力达到顶峰，前朝身份随时被清算',
      8: '锦衣卫大肆搜捕，前朝身份问题面临最终清算',
      9: '新帝是否接纳前朝余孽？最终命运定格'
    },
    infoFragments: {
      1: '你在旧箱底发现父亲的元朝官印——这东西若被锦衣卫看到，全家性命难保',
      2: '胡案排查中，有人举报你的邻居是"前元余孽"——你意识到自己也随时可能被举报',
      3: '代笔文书时你注意到一个规律：被推出来的替罪羊都有一个共同特征——"非洪武旧臣"',
      4: '户部被清洗的名单中，前元旧臣占了七成——这不是反腐，这是按出身清洗',
      5: '你的保护人因李善长案被牵连——他倒台后，你失去了一层身份屏障',
      6: '太子在世时曾暗中保护过几个前元旧臣——现在太子不在了，这层保护还在吗',
      7: '蓝玉案期间锦衣卫挨户排查，你在门后听到了他们翻找的声音——他们在找"前朝证据"',
      8: '锦衣卫掌握了你的真实身份——但他们没有立即动手，而是在等你"主动交代"',
      9: '新帝即位后大赦天下——但赦令中有一行小字："前元伪官不在赦例"'
    }
  }
};

function getBackgroundAnchorHint(bg, t) {
  var m = BACKGROUND_ANCHOR_MAP[bg];
  if (!m) return '';
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (t >= a.start - 3 && t <= a.end + 2) {
      var h = m.anchors[a.id] || '';
      var result = '【' + a.name + '·你的切身利益】' + h + '（你的核心利益：' + m.core_interest + '。选项必须从此角度切入，至少1个选项直接关联此利益）';
      // v3.10.0: P2-3 信息碎片注入
      if (m.infoFragments && m.infoFragments[a.id]) {
        result += '\n【信息碎片·仅你可知】' + m.infoFragments[a.id];
      }
      return result;
    }
  }
  return '';
}

var ENDING_CONDITIONS = {
  '淮西武将之后': [
    {name:'封狼居胥',cond:'权势\u226570 + 民\u5fc3\u226550 + 淮\u897f\u2265+30 + 天\u5b50\u597d\u611f\u2265-10 + 出\u5f81\u22652\u6b21',note:'战\u529f\u8d6b\u8d6b'},
    {name:'卸\u7532\u5f52\u7530',cond:'权\u52bf\u226430 + 民\u5fc3\u226545 + 天\u5b50\u597d\u611f\u2265+20 + 忠\u8bda\u226540',note:'解\u7532\u8fd8\u4e61'},
    {name:'武\u5723\u4f20\u4eba',cond:'智\u8c0b\u226565 + 声\u671b\u226560 + 权\u52bf30~55',note:'以\u6b66\u5165\u9053'}
  ],
  '浙东寒门书生': [
    {name:'一\u4ee3\u5927\u5112',cond:'智\u8c0b\u226580 + 声\u671b\u226580 + 权\u52bf\u226440 + 浙\u4e1c\u2265+50 + 忠\u8bda\u226565',note:'文\u575b\u5b97\u5e08'},
    {name:'帝\u5e08',cond:'东\u5bab\u597d\u611f\u2265+70 + 智\u8c0b\u226570 + 天\u5b50\u597d\u611f\u2265+10 + 声\u671b\u226560 + 忠\u8bda\u226555',note:'天\u5b50\u4e4b\u5e08'},
    {name:'殉\u9053\u8005',cond:'文\u5b57\u72f1/\u515a\u4e89\u6b7b + 声\u671b\u226575 + 智\u8c0b\u226555 + 忠\u8bda\u226570 + 浙\u4e1c\u2265+60',note:'以\u6b7b\u660e\u5fd7'}
  ],
  '应天府商贾之子': [
    {name:'富\u7532\u4e00\u65b9',cond:'权\u52bf\u226425 + 民\u5fc3\u226550 + 声\u671b\u226540',note:'商\u9053\u81f3\u5c0a'},
    {name:'财\u653f\u540d\u81e3',cond:'权\u52bf\u226555 + 民\u5fc3\u226555 + 声\u671b\u226560 + 天\u5b50\u597d\u611f\u2265+20',note:'理\u8d22\u9ad8\u624b'},
    {name:'两\u9762\u4e09\u5200',cond:'权\u52bf\u226550 + 2+\u9635\u8425\u2265+40 + 忠\u8bda\u226435 + 声\u671b30~55 + 民\u5fc3\u226440',note:'灰\u8272\u751f\u5b58'}
  ],
  '落\u9b44\u524d\u5143\u5b98\u5458\u4e4b\u540e': [
    {name:'天\u5b50\u8fd1\u81e3',cond:'权\u52bf\u226570 + 近\u81e3\u2265+60 + 天\u5b50\u597d\u611f\u2265+20 + 其\u4ed6\u9635\u8425\u2264+10 + 智\u8c0b\u226565 + 忠\u8bda\u226440',note:'孤\u72ec\u6743\u81e3'},
    {name:'洗\u5fc3\u9769\u9762',cond:'民\u5fc3\u226580 + 声\u671b\u226570 + 天\u5b50\u597d\u611f\u2265+30 + 忠\u8bda\u226560',note:'以\u7ee9\u6d17\u540d'},
    {name:'前\u671d\u4f59\u5b7d',cond:'死\u4ea1(\u65cf\u706d/\u515a\u4e89) + 声\u671b\u226575',note:'宿\u547d\u96be\u9003'}
  ]
};

function getEndingConditions(bg) {
  var list = ENDING_CONDITIONS[bg];
  if (!list) return '';
  var lines = list.map(function(e){return '  \u2192 '+e.name+'\uff08'+e.note+'\uff09\uff1a'+e.cond;}).join('\n');
  return '\u3010\u4f60\u7684\u51fa\u8eab\u4e13\u5c5e\u7ed3\u5c40\u8def\u5f84\u3011\u6bcf\u6b21\u751f\u6210\u9009\u9879\u65f6\uff0c\u81f3\u5c111\u4e2a\u9009\u9879\u987b\u63a8\u52a8\u4ee5\u4e0b\u67d0\u4e2a\u7ed3\u5c40\u6761\u4ef6\uff1a\n' + lines;
}

function getBackgroundPathReminder(bg, turn) {
  if (!bg) return '';
  if (bg === '浙东寒门书生' && turn > 0 && turn % 4 === 0) {
    return '\u3010\u6587\u5b57\u8def\u5f84\u63d0\u9192\u3011\u672c\u56de\u5408\u987b\u5305\u542b\u81f3\u5c111\u4e2a\u6587\u4eba\u884c\u4e3a\u9009\u9879\uff08\u7f16\u7e82\u6587\u96c6/\u53c2\u4e0e\u8bd7\u4f1a/\u6559\u6388\u751f\u5f92/\u4e0a\u4e66\u8bba\u653f/\u4e0e\u6587\u4eba\u5708\u901a\u4fe1\uff09\uff0c\u8fd9\u662f\u901a\u5411\u201c\u6b89\u9053\u8005\u201d\u7ed3\u5c40\u7684\u5fc5\u8981\u79ef\u7d2f\u3002';
  }
  if (bg === '落魄前元官员之后' && turn > 0 && turn % 4 === 0) {
    return '\u3010\u6d17\u767d\u8def\u5f84\u63d0\u9192\u3011\u672c\u56de\u5408\u987b\u5305\u542b\u81f3\u5c111\u4e2a\u201c\u529e\u5b9e\u4e8b/\u79ef\u6c11\u5fc3\u201d\u9009\u9879\uff08\u5ba1\u7406\u5192\u6848/\u8d48\u6d4e\u707e\u6c11/\u5174\u4fee\u6c34\u5229/\u6559\u5316\u767e\u59d3\uff09\uff0c\u8fd9\u662f\u901a\u5411\u201c\u6d17\u5fc3\u9769\u9762\u201d\u7ed3\u5c40\u7684\u5fc5\u8981\u79ef\u7d2f\u3002';
  }
  return '';
}

function getSurveillanceHint(year, turn, bg) {
  if (bg !== '落魄前元官员之后') return '';
  var lv = 1;
  if (turn >= 8) lv = 2;
  if (turn >= 18) lv = 3;
  if (turn >= 30) lv = 4;
  if (turn >= 40) lv = 5;
  var purge = (turn>=12&&turn<=17)||(turn>=21&&turn<=24)||(turn>=27&&turn<=29)||(turn>=38&&turn<=40)||(turn>=43&&turn<=44)||(turn>=47&&turn<=49)||(turn>=52&&turn<=53); // v3.8.10-fix: 补胡案窗口12-17
  if (purge) lv = Math.min(5, lv + 1);
  var h = {
    1:'\u3010\u76d1\u89c6\u00b7\u6697\u6d41\u3011\u9526\u8863\u536b\u5076\u5c14\u6709\u4eba\u5728\u4f60\u529e\u516c\u7684\u53bf\u8865\u9644\u8fd1\u8f6c\u60a0\uff0c\u4f46\u672a\u76f4\u63a5\u63a5\u89e6\u3002',
    2:'\u3010\u76d1\u89c6\u00b7\u6e10\u7d27\u3011\u4f60\u6ce8\u610f\u5230\u6709\u4eba\u8bb0\u5f55\u4f60\u6bcf\u65e5\u7684\u884c\u8e2a\uff0c\u4fe1\u4ef6\u4f3c\u88ab\u62c6\u9605\u8fc7\u3002',
    3:'\u3010\u76d1\u89c6\u00b7\u76d8\u67e5\u3011\u9526\u8863\u536b\u767e\u6237\u4eb2\u81ea\u767b\u95e8\u201c\u62dc\u8bbf\u201d\uff0c\u95ee\u4f60\u51e0\u4e2a\u5173\u4e8e\u524d\u671d\u65e7\u4e8b\u7684\u95ee\u9898\u3002',
    4:'\u3010\u76d1\u89c6\u00b7\u9ad8\u538b\u3011\u4f60\u7684\u516c\u52a1\u88ab\u53cd\u590d\u6838\u67e5\uff0c\u540c\u50da\u5f00\u59cb\u523b\u610f\u4e0e\u4f60\u4fdd\u6301\u8ddd\u79bb\u3002',
    5:'\u3010\u76d1\u89c6\u00b7\u5371\u6025\u3011\u9526\u8863\u536b\u5df2\u638c\u63e1\u4f60\u90e8\u5206\u628a\u67c4\uff0c\u968f\u65f6\u53ef\u80fd\u52a8\u624b\u2014\u2014\u5927\u6848\u671f\u95f4\u5c24\u5176\u5371\u9669\u3002'
  };
  return h[lv];
}


// v3.7: 出身支线焦点表（空白期差异化填充）
const BRANCH_FOCUS = {
  '淮西武将之后': [
    { start: 5, end: 8, focus: '卫所逃兵问题频发，军中袍泽被调往北方备边' },
    { start: 9, end: 11, focus: '北伐征兵令下，旧部被抽调，蓝玉在朝中不满' },
    { start: 14, end: 15, focus: '军屯纠纷——武将与文官争夺屯田，利益冲突加剧' },
    { start: 16, end: 17, focus: '胡惟庸案余波：淮西武将人人自危，旧部被盘查' },
    { start: 18, end: 20, focus: '胡案余波未平，军屯争端再起，武将两面受压' },
    { start: 25, end: 26, focus: '空印案余波：地方官被严查，军中文书亦受牵连' },
    { start: 30, end: 37, focus: '郭桓案余波中武将利益受损，军费被削减' },
    { start: 41, end: 42, focus: '李善长案株连淮西老人，武将感到唇亡齿寒' },
    { start: 45, end: 46, focus: '太子之死：武将需在诸王间抉择站队' },
    { start: 50, end: 51, focus: '蓝玉案余波：淮西旧部凋零，武将时代落幕' },
    { start: 54, end: 56, focus: '朱元璋大清洗后的朝局，武将几近灭绝' }
  ],
  '浙东寒门书生': [
    { start: 5, end: 8, focus: '刘伯温遗著的整理与暗中流传，师门使命' },
    { start: 9, end: 11, focus: '科举取士之年，同门师兄弟纷纷入朝' },
    { start: 14, end: 15, focus: '文字审查渐严，诗文集被禁，同门遭殃' },
    { start: 16, end: 17, focus: '胡惟庸案余波：浙东文人被卷入政治漩涡' },
    { start: 18, end: 20, focus: '胡案牵连未散，文字狱风声再起' },
    { start: 25, end: 26, focus: '空印案余波：地方文书被追查，文官系统震荡' },
    { start: 30, end: 37, focus: '郭桓案后户部震荡，牵连的文官系统动荡' },
    { start: 41, end: 42, focus: '李善长案株连浙东系文人，师门岌岌可危' },
    { start: 45, end: 46, focus: '太子之死：文官集团失去最大靠山' },
    { start: 50, end: 51, focus: '蓝玉案后文官噤声，朝堂万马齐喑' },
    { start: 54, end: 56, focus: '文字狱风声鹤唳，书生面临最终抉择' }
  ],
  '应天府商贾之子': [
    { start: 5, end: 8, focus: '商路拓展，宝钞流通出现问题，商户抱怨' },
    { start: 9, end: 11, focus: '在户部积累人脉，接触盐引、商税核心业务' },
    { start: 14, end: 15, focus: '商税争议——朝廷加征商税，商户利益受损' },
    { start: 16, end: 17, focus: '胡惟庸案余波：商业利益网络被彻查' },
    { start: 18, end: 20, focus: '胡案余波渐息，宝钞贬值问题浮现' },
    { start: 25, end: 26, focus: '空印案余波：户部核查地方账目，商税牵连其中' },
    { start: 30, end: 37, focus: '郭桓案直接冲击：户部系统被清洗，你作为户部办事首当其冲' },
    { start: 41, end: 42, focus: '李善长案后的政治站队问题' },
    { start: 45, end: 46, focus: '太子之死：经济政策走向可能大变' },
    { start: 50, end: 51, focus: '蓝玉案中商人被牵连（资助淮西嫌疑）' },
    { start: 54, end: 56, focus: '宝钞贬值危机，商路安全受威胁' }
  ],
  '落魄前元官员之后': [
    { start: 5, end: 8, focus: '身份隐匿，小心翼翼，避免暴露前朝背景' },
    { start: 9, end: 11, focus: '锦衣卫(1382年设立)带来的监视升级，暗中试探你的身份' },
    { start: 14, end: 15, focus: '洗白机会：通过政绩证明忠诚，积累洗白资本' },
    { start: 16, end: 17, focus: '胡惟庸案余波：前元旧臣被怀疑立场不明' },
    { start: 18, end: 20, focus: '胡案余波渐息，洗白之路仍需谨慎' },
    { start: 25, end: 26, focus: '空印案余波：地方文书清查，前元旧臣身份再受盘查' },
    { start: 30, end: 37, focus: '郭桓案中户部系统被清洗，前元旧臣首当其冲' },
    { start: 41, end: 42, focus: '李善长案：父辈同乡旧识被株连，你的身份危机到达顶点' },
    { start: 45, end: 46, focus: '太子之死：新储君对前元旧臣态度不明' },
    { start: 50, end: 51, focus: '蓝玉案中被怀疑与淮西有染' },
    { start: 54, end: 56, focus: '锦衣卫大肆搜捕，前朝身份问题面临最终清算' }
  ]
};

function getBranchFocus(turn, background) {
  var focus = BRANCH_FOCUS[background];
  if (!focus) return '';
  for (var i = 0; i < focus.length; i++) {
    var f = focus[i];
    if (turn >= f.start && turn <= f.end) {
      return '【出身线焦点】' + f.focus;
    }
  }
  return '';
}


// ========== v3.8: 死亡系统+通用结局+隐藏结局 代码硬控 ==========
var DEATH_NAMES = [
  '牵连族灭','帝怒诛杀','胡案牵连','党争覆灭','功高震主',
  '四面楚歌','流放致死','文字狱','阴谋暗杀','积劳成疾',
  '蓝案牵连'
];
var DEATH_DESCS = [
  '洪武朝的刀，从来不只砍一个人的头。你的权力太大，你的靠山太危险——当锦衣卫的靴声在巷口响起时，你知道这一切终将到来。满门抄斩，九族俱灭。府邸被查封，族谱被焚毁，你的名字从朝堂上被彻底抹去，仿佛从未存在过。邻里噤若寒蝉，旧交纷纷断绝往来。但史书的空白处，自有后人读出你的故事。',
  '朱元璋亲自下的旨。没有三法司会审，没有朝堂辩论，只有一句"着即处死"。天威难测，昨日还是肱股之臣，今日便是阶下之囚。你在诏狱中度过了最后几个时辰，回想这一生——从初入仕途到权倾一方，每一步都走得小心翼翼，却终究没能逃过帝王的猜忌。刑场上的风很冷，你最后望了一眼紫金山的方向。',
  '洪武十三年，胡惟庸案爆发。丞相府被围，党羽被清洗，禁军拿着名单挨户拿人。你与胡惟庸未必有多深的交情，但在洪武朝的棋盘上，"可能威胁到皇权"就是死罪。你的府邸被抄没，家眷被流放。朝中无人敢为你求情——他们自己的名字，或许也在那份名单的边缘。',
  '你所依附的派系，核心人物倒了。覆巢之下无完卵。弹劾的奏章如雪片般飞来，曾经推杯换盏的同僚纷纷与你划清界限。朱元璋乐见其成——朝堂的派系清洗，从来都是帝王术的一部分。你的名字被从功臣榜上抹去，家族的命运随着派系的崩塌而终结。官场上再提起你，只是一声叹息。',
  '你做得太多了。战功太赫，声望太高，百姓太爱戴你。这在大宋是美事，在洪武朝却是催命符。朱元璋看着你的眼神，从欣赏变成了忌惮，从忌惮变成了杀意。"功盖天下而主不能容"——古人的话，你终究没能躲过。赐死的旨意来得很平静，就像一杯御赐的茶。你饮下那杯酒时，终于明白了一个道理：在这个朝代，活下来才是最大的军功。',
  '所有的门都对你关上了。淮西的旧交不敢认你，浙东的门生不敢提你，连家里的仆人都被锦衣卫带走问话。你写了奏疏，没人敢递。你托人说情，没人敢接。在这个庞大的帝国机器面前，你发现自己已经完全孤立——像一只被困在蛛网中的飞虫，越挣扎缠得越紧。最终的结局无人知晓，只知道某一天，你的名字从所有文书中消失了。',
  '贬谪的圣旨来得很突然。从应天府到岭南，三千里流放路。瘴气、饥寒、疲惫，还有押送差役的冷眼。你没能走到目的地——在某个不知名的驿站，你倒下了。没有人在意一个流放犯的死亡。驿站老板草草将你葬在后山的坡上，连块墓碑都没有。你的故事，连同你的名字，消散在南方的烟雨里。',
  '你写的那些文字，被人断章取义地呈到了御前。"怨望""诽谤""大不敬"——每一顶帽子都足以杀你一百次。也许你只是写了一首感怀的诗，也许你只是在一封家书里发了几句牢骚，但在洪武朝，文字就是罪证。锦衣卫的诏狱里，你被要求交代"幕后主使"。没有幕后主使，只有文字本身，和一颗被误解的心。你的案卷被归入文字狱的卷宗，与数百人并列。',
  '深夜，有人闯入了你的住处。你可能甚至没来得及看清来人的脸。在这个朝堂上，想让你死的人太多了——也许是政敌，也许是知道你太多秘密的人，也许只是某个想拿你人头换功劳的锦衣卫。你的死被记录为"暴病而亡"，没人追问真相。丧事办得冷清，来吊唁的人寥寥无几——他们怕惹上麻烦。在这个时代，真相从来不是最重要的。',
  '太医的脉案写得很含蓄："积劳成疾，脉象已绝。"但你知道真相：连续数月的高强度操劳，日夜不休的政务，加上洪武朝特有的精神压力，终于压垮了你的身体。你躺在病榻上，看着窗外的月亮，想着还有多少公文没有批阅，多少承诺没有兑现。药石无灵，你在一个安静的夜晚合上了眼。朝中只来了一个送花圈的官员，站了一刻钟便走了。',
  '蓝玉案爆发，比胡惟庸案更加惨烈。淮西勋贵被连根拔起，一万五千余人被处死，朝堂为之一空。你或许与蓝玉并无深交，但"淮西"这个标签就是你的原罪。锦衣卫拿着名簿挨个拿人，你的府邸被围时，邻居们关紧了门户。你的名字也在那份名簿上——不是因为做了什么，而是因为你是谁。这场清洗之后，洪武朝的功臣几乎殆尽。'
];


// v3.8.6: 墓志铭底色（代码提供基调，AI动态续写）
var EPITAPHS = {
  // === 死亡结局（11种死因） ===
  '牵连族灭': '九族俱灭，青烟散尽。',
  '帝怒诛杀': '天威难测，一朝身死。',
  '胡案牵连': '城门失火，池鱼遭殃。',
  '党争覆灭': '覆巢之下，岂有完卵。',
  '功高震主': '功盖天下，主不能容。',
  '四面楚歌': '众叛亲离，末路穷途。',
  '流放致死': '贬谪万里，魂断征途。',
  '文字狱': '以文贾祸，字字成殇。',
  '阴谋暗杀': '暗夜无光，真相永埋。',
  '积劳成疾': '鞠躬尽瘁，死而后已。',
  '蓝案牵连': '淮西骨寒，功臣泪尽。',
  // === 出身专属死亡结局 ===
  '前朝余孽': '宿命难逃，因果循环。',
  '殉道者': '以死明志，千秋凛然。',
  // === 存活结局（14种） ===
  '青史留名': '名垂竹帛，后世景仰。',
  '智绝天下': '算无遗策，谋定乾坤。',
  '民心所向': '德被苍生，万民感念。',
  '权倾朝野': '一人之下，万人之上。',
  '遮臭万年': '遗臭万年，后人警戒。',
  '乱世隐者': '归隐林泉，独善其身。',
  '乡望素著': '乡里称颂，口碑载道。',
  '名满天下': '天下景仰，士林楷模。',
  '全身而退': '明哲保身，善终于家。',
  '朝中名宦': '朝堂立足，中规中矩。',
  '英年早逝': '壮志未酬，赍志而殁。',
  '封狼居胥': '勒石燕然，威震北疆。',
  '卸甲归田': '解甲归田，安然终老。',
  '武圣传人': '以武入道，万世宗师。',
  '一代大儒': '开宗立派，万世师表。',
  '帝师': '天子之师，教化储君。',
  '富甲一方': '商通四海，富泽乡里。',
  '财政名臣': '理财高手，国用丰足。',
  '两面三刀': '左右逢源，苟全乱世。',
  '天子近臣': '孤独权臣，宠冠一时。',
  '洗心革面': '以绩洗名，脱胎换骨。',
  // ========== Phase 4: 传承结局 ==========
  '家族兴旺': '子孙满堂，家道昌盛。',
  '孤身来去': '孑然一身，来去无痕。',
  '家道中落': '家族凋零，门庭冷落。',
  // === 隐藏结局 ===
  '墨史归一': '完美平衡，万世太平。',
  '靖难先声': '预见未来，择木而栖。'
};

// v3.10.0: P1-2A 动态墓志铭——根据玩家一生行为生成差异化墓志铭
// 在AI续写墓志铭失败/缺失时，由代码生成保底墓志铭
function generateDynamicEpitaph(endingTitle) {
  var a = GameState.attributes;
  var ef = GameState.emperor_feeling;
  var bg = GameState.character.background || '';
  var parts = [];

  // 1. 基于最高属性确定人物基调
  var maxAttr = 'bond', maxVal = a.bond;
  var attrNames = { power: '权势', people: '民心', wisdom: '智谋', bond: '情义', fame: '声望' };
  for (var k in a) {
    if (a[k] > maxVal) { maxVal = a[k]; maxAttr = k; }
  }
  var traitLines = {
    power: ['权倾一时', '纵横捭阖', '以势立身'],
    people: ['德被乡里', '民心思之', '以仁处世'],
    wisdom: ['谋深虑远', '明察秋毫', '以智全身'],
    bond: ['重情重义', '不负故交', '以义立世'],
    fame: ['名动天下', '清名远播', '以文传世']
  };
  var traitPool = traitLines[maxAttr] || traitLines.bond;
  parts.push(traitPool[Math.floor(Math.random() * traitPool.length)]);

  // 2. 基于阵营倾向补充
  var f = GameState.factions;
  if (f.huaixi > f.zhedong + 20) {
    parts.push('淮西旧臣，始终未背袍泽');
  } else if (f.zhedong > f.huaixi + 20) {
    parts.push('浙东一脉，笔耕不辍');
  } else if (Math.abs(f.huaixi - f.zhedong) <= 15) {
    parts.push('游走两党之间，独善其身');
  }

  // 3. 基于圣眷定性结局
  if (ef >= 40) {
    parts.push('圣眷优渥，善终於家');
  } else if (ef <= -30) {
    parts.push('天威难测，终见猜忌');
  }

  // 4. 基于出身线特色
  var originEndings = {
    '淮西武将之后': '马上得功名',
    '浙东寒门书生': '笔下写春秋',
    '应天府商贾之子': '商道通天下',
    '落魄前元官员之后': '洗心以立命'
  };
  if (originEndings[bg]) parts.push(originEndings[bg]);

  // 5. 基于情感记忆（若有）
  if (GameState.emotionalMemory && GameState.emotionalMemory.length >= 3) {
    var lastMem = GameState.emotionalMemory[GameState.emotionalMemory.length - 1];
    if (lastMem && lastMem.ripple) {
      parts.push('一生所系，不过情义二字');
    }
  }

  // 组装：取2-3句
  var result = parts.slice(0, Math.min(parts.length, 3)).join('。') + '。';
  return result;
}

// v3.10.0: P1-2B 情感记忆回响——生成终局情感摘要
// 选取2-3个关键情感记忆点，用于终局叙事指令中注入
function getEmotionalEchoForFinale() {
  if (!GameState.emotionalMemory || GameState.emotionalMemory.length === 0) return '';
  var mems = GameState.emotionalMemory;
  // 选取策略：取第1个（开局）、中间1个、最后1个，最多3个
  var selected = [];
  if (mems.length === 1) {
    selected.push(mems[0]);
  } else if (mems.length === 2) {
    selected.push(mems[0], mems[1]);
  } else {
    selected.push(mems[0]);
    var midIdx = Math.floor(mems.length / 2);
    selected.push(mems[midIdx]);
    selected.push(mems[mems.length - 1]);
  }
  var lines = ['【情感记忆回响——终局须回响这些关键时刻】'];
  for (var i = 0; i < selected.length; i++) {
    var m = selected[i];
    lines.push('· ' + (m.npc || '故人') + '：' + (m.ripple || '那段选择') + '（' + (m.memoryItem || '') + '）');
  }
  lines.push('终局叙事中须自然回响上述记忆——不是直接复述，而是通过意象、道具、对话的呼应，让读者感受到"一路走来"的厚重。');
  return lines.join('\n');
}

function maxFaction() {
  var f = GameState.factions, mx = -999;
  for (var k in f) if (f[k] > mx) mx = f[k];
  return mx;
}
function minFaction() {
  var f = GameState.factions, mn = 999;
  for (var k in f) if (f[k] < mn) mn = f[k];
  return mn;
}
function countFactionsGTE(v) {
  var f = GameState.factions, c = 0;
  for (var k in f) if (f[k] >= v) c++;
  return c;
}
function countFactionsLTE(v) {
  var f = GameState.factions, c = 0;
  for (var k in f) if (f[k] <= v) c++;
  return c;
}
function allFactionsGTE(v) {
  var f = GameState.factions;
  for (var k in f) if (f[k] < v) return false;
  return true;
}
function allFactionsLTE(v) {
  var f = GameState.factions;
  for (var k in f) if (f[k] > v) return false;
  return true;
}

// ========== P0-2: 死亡容错机制 — 数据表 ==========

// 危机事件表（每种死法对应的危机描述）
var CRISIS_EVENTS = {
  // === 必死型预警 ===
  1: { title: '满门之祸', desc: '锦衣卫在你府外徘徊，邻居们纷纷搬走。你知道，大难将至。', directive: '玩家面临满门抄斩的危机，需要立即采取行动：主动请辞、交出家产、或寻求宗室庇护。' },
  6: { title: '众叛亲离', desc: '曾经的朋友都绕着你走，朝堂上无人敢与你搭话。你像一座孤岛。', directive: '玩家被所有派系抛弃，需要修复至少一个派系关系，或主动辞官避祸。' },
  // === 概率直接死型预警 ===
  8: { title: '文字之祸', desc: '你听说有人在御前提到你的诗文，语气不善。锦衣卫可能已经在查你了。', directive: '玩家可能因文字获罪，需要销毁争议文字、找人疏通、或主动请罪。' },
  9: { title: '杀机暗藏', desc: '你感觉有人在跟踪你，深夜有异响。几个对你怀恨在心的人，可能已经动手了。', directive: '玩家面临暗杀威胁，需要加强戒备、远离险地、或主动示好化解仇恨。' },
  // === 倒计时型 ===
  2: { title: '天威震怒', desc: '陛下在朝堂上怒斥你的过失，目光如刀。你知道，这可能是最后的警告了。', directive: '玩家面临帝王震怒的危机，需要在3回合内通过某种方式挽回圣心，否则将被处死。' },
  3: { title: '丞相府被围', desc: '胡惟庸的府邸被禁军包围，名单上有你认识的名字。你感到一阵寒意。', directive: '胡惟庸案爆发，玩家可能被牵连，需要通过打点关系或主动请辞来避祸。' },
  4: { title: '覆巢之危', desc: '你所属的派系核心人物倒台了，弹劾的奏章如雪片般飞来。', directive: '玩家所属派系被清洗，需要划清界限或自请外放来保命。' },
  5: { title: '兔死狗烹', desc: '有人在御前参你"功高不赏"，陛下的眼神变了。', directive: '玩家功高震主，需要主动交权或称病辞官来避祸。' },
  7: { title: '贬谪之兆', desc: '御史弹劾你的奏折被留中了，这是不祥之兆。', directive: '玩家可能被流放，需要提升民心或找靠山来化解。' },
  10: { title: '油尽灯枯', desc: '你已经连续数月没有睡过一个好觉，太医说你需要休养。', directive: '玩家身体濒临崩溃，需要减少操劳、休养身体。' },
  11: { title: '淮西清洗', desc: '锦衣卫拿着名簿挨户拿人，你听到了邻居的惨叫。', directive: '蓝玉案爆发，淮西勋贵被清洗，玩家需要打点关系或主动请辞来避祸。' }
};

// 自救选项表（硬编码方向 + 属性阈值 + 效果）
var RESCUE_OPTIONS = {
  1: { directions: ['主动请辞交出权力', '寻求宗室庇护', '散尽家产表忠心'], threshold: { power: 30, wisdom: 50 }, effect: { power: -40, fame: -20, emperor_feeling: 15 }, failureDeath: true },
  6: { directions: ['修复某派系关系', '主动辞官归隐', '离京避祸'], threshold: { bond: 40 }, effect: { bond: 20, people: 10 }, failureDeath: true },
  8: { directions: ['销毁争议文字', '主动请罪', '找人疏通'], threshold: { wisdom: 45, fame: 40 }, effect: { fame: -15, wisdom: 5 }, failureDeath: true },
  9: { directions: ['加强戒备', '远离险地', '主动示好化解仇恨'], threshold: { wisdom: 50, bond: 30 }, effect: { wisdom: 5, bond: -10 }, failureDeath: true },
  2: { directions: ['上疏请罪', '托近臣说情', '称病避祸'], threshold: { emperor_feeling: -40 }, effect: { emperor_feeling: 25, fame: -10 }, failureDeath: true },
  3: { directions: ['花钱打点', '主动请辞', '找靠山求情'], threshold: { power: 40, wisdom: 45 }, effect: { power: -20, wisdom: 5 }, failureDeath: true },
  4: { directions: ['划清界限', '自请外放'], threshold: { power: 35 }, effect: { power: -25, bond: -15 }, failureDeath: true },
  5: { directions: ['主动交权', '称病辞官'], threshold: { power: 40, emperor_feeling: -20 }, effect: { power: -35, emperor_feeling: 30 }, failureDeath: true },
  7: { directions: ['提升民心', '找靠山'], threshold: { people: 35, emperor_feeling: -30 }, effect: { people: 15, emperor_feeling: 10 }, failureDeath: true },
  10: { directions: ['减少操劳', '休养身体'], threshold: { bond: 35 }, effect: { bond: 15, power: -10 }, failureDeath: true },
  11: { directions: ['花钱打点', '主动请辞', '找靠山求情'], threshold: { power: 40, wisdom: 45 }, effect: { power: -20, wisdom: 5 }, failureDeath: true }
};

// 降级条件表（满足条件才能降级而非死亡）
var DOWNGRADE_CONDITIONS = {
  2: { emperor_feeling: -50 },  // 帝怒：圣眷不是最低才可能降级
  4: { power: 50 },             // 党争：权力不是最高才可能降级
  5: { wisdom: 40 },            // 功高：智谋不太低才可能降级（懂得进退）
  7: { people: 30 },            // 流放：民心不太低才可能降级（有人求情）
  10: { bond: 40 }              // 积劳：情义不太低才可能降级（有人照顾）
};

// 降级结果表
var DEGRADATION_TITLES = { 2: '贬为庶民', 4: '外放边远', 5: '削职为民', 7: '贬谪存活', 10: '病倒痊愈' };
var DEGRADATION_EFFECTS = {
  2: { power: -40, fame: -30, emperor_feeling: 10 },
  4: { power: -30, fame: -20 },
  5: { power: -50, emperor_feeling: 20 },
  7: { power: -35, fame: -25, people: 10 },
  10: { power: -20, bond: -15 }
};
var DEGRADATION_NARRATIVES = {
  2: '天子震怒之下，你被夺去一切官职，贬为庶民。走出午门时，阳光刺眼——你已经很久没有以平民的身份站在这座城里了。但你活着。活着就还有机会。',
  4: '风暴来得太快，你来不及分辨敌友。一纸调令，你被外放到帝国最偏远的角落。马车颠簸在泥泞的官道上，回望京城方向，那里已是云雾茫茫。',
  5: '皇帝念你旧日功勋，没有赶尽杀绝——只是将你的权力尽数收回。你交出了印信，走出了府邸。身后的门缓缓关上，像是一个时代的终结。',
  7: '岭南的瘴气没有杀死你。在偏远的小镇上，你安顿下来。日子清苦，但比流放路上好多了。至少，这里没有人想杀你。',
  10: '你病倒了。太医说再撑几天就来不及了。卧床数月，药石不断，终于在某个清晨睁开了眼。窗外还是那轮月亮，但你感觉自己老了许多。'
};
var DEGRADATION_FOOTNOTES = [
  '记住这次教训。',
  '洪武朝的刀，从来不远。',
  '活着，就是最大的胜利。',
  '你捡回了一条命。下次未必。',
  '大难不死，未必有福。'
];

// 降级后锚点触发系数（降级后仍可触发锚点，但概率降低）
var DEGRADATION_ANCHOR_MOD = {
  2: 0.3,   // 贬为庶民：远离权力中心
  4: 0.5,   // 外放边远：仍在体制内但远离京城
  5: 0.3,   // 削职为民：无职无权
  7: 0.5,   // 贬谪存活：偏远之地
  10: 0.8   // 病倒痊愈：仍在京城，影响较小
};

// P0-2: 缓冲属性修正（概率修正而非硬阈值）
function getBufferModifier() {
  var a = GameState.attributes;
  var modifier = 0;
  if (a.bond >= 80) modifier -= 0.15;       // 情义极高：朋友来救
  else if (a.bond >= 60) modifier -= 0.10;
  if (a.people >= 80) modifier -= 0.10;     // 人望极高：民心保护
  else if (a.people >= 60) modifier -= 0.05;
  return modifier; // 负值 = 降低死亡概率
}

// P0-2: 自救判定
function attemptRescue(crisisType) {
  var opt = RESCUE_OPTIONS[crisisType];
  if (!opt) return { success: false, effects: {} };

  // 30%概率直接失败（保持死亡威胁）
  if (Math.random() < 0.3) {
    return { success: false, effects: {}, reason: 'fate' };
  }

  // 属性阈值判定
  var a = GameState.attributes;
  var ef = GameState.emperor_feeling;
  var threshold = opt.threshold;
  for (var key in threshold) {
    var val = (key === 'emperor_feeling') ? ef : a[key];
    if (val === undefined) val = 0;
    if (val < threshold[key]) {
      return { success: false, effects: {}, reason: 'threshold' };
    }
  }

  // 自救成功，应用效果
  applyChanges(opt.effect);
  return { success: true, effects: opt.effect };
}

// P0-2: 降级判定（自救失败后检查是否可降级）
function attemptDowngrade(crisisType) {
  var cond = DOWNGRADE_CONDITIONS[crisisType];
  if (!cond) return { canDowngrade: false }; // 不可降级

  var a = GameState.attributes;
  var ef = GameState.emperor_feeling;

  // 检查降级条件
  for (var key in cond) {
    var val = (key === 'emperor_feeling') ? ef : a[key];
    if (val === undefined) val = 0;
    if (val < cond[key]) {
      return { canDowngrade: false }; // 条件不满足
    }
  }

  // 可降级
  return {
    canDowngrade: true,
    effects: DEGRADATION_EFFECTS[crisisType] || {},
    title: DEGRADATION_TITLES[crisisType] || '劫后余生',
    narrative: DEGRADATION_NARRATIVES[crisisType] || ''
  };
}

// P0-2: 获取降级后锚点触发概率修正系数
function getDegradationAnchorMod() {
  if (!GameState.degradationActive || !GameState.degradationType) return 1.0;
  return DEGRADATION_ANCHOR_MOD[GameState.degradationType] || 1.0;
}

// v3.8.18: 锚点弹性烈度分级（策划报告#3）
// 每个锚点根据玩家状态计算烈度1/2/3，输出给SP调整叙事烈度
var ANCHOR_FACTION_MAP = {
  1: 'zhedong',   // 刘伯温之死 → 浙东线
  2: 'huaixi',    // 胡惟庸案 → 淮西/中书省
  3: null,         // 空印案 → 户部系统性（无特定阵营）
  4: null,         // 郭桓案 → 户部系统性
  5: 'huaixi',    // 李善长案 → 淮西
  6: 'donggong',  // 太子之死 → 东宫
  7: 'huaixi',    // 蓝玉案 → 淮西
  8: 'jinchen',   // 锦衣卫膨胀 → 近臣/锦衣卫
  9: null          // 朱元璋驾崩 → 全局
};

function calcAnchorIntensity(anchorId) {
  var factionKey = ANCHOR_FACTION_MAP[anchorId];
  var f = GameState.factions;
  var a = GameState.attributes;
  var score = 0;

  // 因子1：相关阵营温度 ≥40
  if (factionKey && f[factionKey] >= 40) score++;

  // 因子2：权力水平 ≥50（权力大=被关注多=卷入深）
  if (a.power >= 50) score++;

  // 因子3：深度卷入——已清洗相关阵营 / 有近臣NPC绑定此锚点
  if (factionKey && GameState.factionPurged && GameState.factionPurged[factionKey]) score++;
  for (var npc in NPC_ANCHOR_LINK) {
    if (NPC_ANCHOR_LINK[npc].boundAnchor === anchorId) {
      if (GameState.jinchenEvents && Object.keys(GameState.jinchenEvents).length > 0) score++;
      break;
    }
  }

  // 系统性事件（空印案/郭桓案/朱元璋驾崩）：基础烈度至少1，额外看ef
  if (!factionKey) {
    score = Math.max(score, 1);
    if (GameState.emperor_feeling >= 60) score++;
  }

  // 映射到1-3档
  var intensity = score <= 1 ? 1 : (score <= 2 ? 2 : 3);
  return intensity;
}

// 获取当前活跃锚点的烈度（供contextPayload使用）
function getCurrentAnchorIntensity() {
  var turn = GameState.turn;
  var anchor = null;
  // 优先找当前窗口内的锚点
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    if (turn >= HISTORY_ANCHORS[i].start && turn <= HISTORY_ANCHORS[i].end + 2) {
      anchor = HISTORY_ANCHORS[i];
      break;
    }
  }
  // 找不到就找下一个即将发生的
  if (!anchor) {
    for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
      if (turn < HISTORY_ANCHORS[i].start && turn >= HISTORY_ANCHORS[i].start - 5) {
        anchor = HISTORY_ANCHORS[i];
        break;
      }
    }
  }
  if (!anchor) return null;
  return {
    anchor_id: anchor.id,
    anchor_name: anchor.name,
    intensity: calcAnchorIntensity(anchor.id)
  };
}

// v3.8.2: 死亡倒计时机制（P0-2重写：优先级+预警+冷却+缓冲）
function checkDeath() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  var mx = maxFaction(), mn = minFaction();
  var fk = Object.keys(f);
  var buffer = getBufferModifier();  // P0-2: 缓冲属性修正
  var degMod = getDegradationAnchorMod(); // P0-2: 降级后锚点概率修正

  // P0-2辅助：检查某死法类型是否在冷却中
  function isCooling(type) { return GameState.deathCooldown && GameState.deathCooldown[type] > 0; }
  // P0-2辅助：设置冷却期（5回合）
  function setCooldown(type) { if (!GameState.deathCooldown) GameState.deathCooldown = {}; GameState.deathCooldown[type] = 5; }
  // P0-2辅助：设置预警（必死型/概率直接死型首次触发时）
  function setWarning(crisisType) {
    if (GameState.deathWarning > 0) return -2; // 已有预警，下回合判定
    GameState.deathWarning = 1;
    GameState.deathWarningType = crisisType;
    return -2; // 返回-2 = 预警，不是死亡
  }
  // P0-2辅助：优先级替换——新死法优先级高于当前倒计时则替换
  // 优先级映射：crisisType → priority（数字越小优先级越高）
  var PRIORITY = { 1:1, 6:2, 8:3, 9:4, 2:5, 5:6, 4:7, 3:8, 11:9, 7:10, 10:11 };
  function shouldReplace(newType) {
    if (!GameState.deathCountdown || GameState.deathCountdown <= 0) return true; // 当前无倒计时
    var oldP = PRIORITY[GameState.deathCountdownType] || 99;
    var newP = PRIORITY[newType] || 99;
    return newP < oldP; // 新优先级更高（数字更小）则替换
  }

  // ========== 优先级1: 牵连族灭 (必死型，不可降级) ==========
  if (a.power >= 60 && mx >= 80 && ef <= -30 && a.wisdom < 40) {
    if (!isCooling(1)) {
      if (GameState.deathWarningType === 1 && GameState.deathWarning > 0) return 0; // 预警期已过，真正死亡
      setCooldown(1);
      return setWarning(1); // 首次触发：1回合预警
    }
  }

  // ========== 优先级2: 四面楚歌 (必死型，不可降级) ==========
  if (mn <= -60 && countFactionsLTE(-30) >= 3) {
    if (!isCooling(6)) {
      if (GameState.deathWarningType === 6 && GameState.deathWarning > 0) return 5;
      setCooldown(6);
      return setWarning(6);
    }
  }

  // ========== 优先级3: 文字狱 (概率60%直接死，不可降级) ==========
  if (f.zhedong >= 40 && (a.fame >= 50 || a.power >= 40) && ef < 10 && GameState.wroteControversialText) {
    if (!isCooling(8)) {
      var p8 = (0.6 + buffer) * degMod;
      p8 = Math.max(0.05, Math.min(p8, 0.95));
      if (GameState.deathWarningType === 8 && GameState.deathWarning > 0) {
        // 预警期已过，roll概率死亡
        if (Math.random() < p8) { setCooldown(8); return 7; }
        else { GameState.deathWarning = 0; GameState.deathWarningType = 0; }
      } else {
        setCooldown(8);
        return setWarning(8); // 首次触发：1回合预警
      }
    }
  }

  // ========== 优先级4: 阴谋暗杀 (概率50%直接死，不可降级) ==========
  if (a.wisdom <= 50) {
    var lowC = 0; for (var m = 0; m < fk.length; m++) if (f[fk[m]] <= -40) lowC++;
    if (lowC >= 2 && (a.power >= 40 || a.fame >= 50)) {
      if (!isCooling(9)) {
        var p9 = (0.5 + buffer) * degMod;
        p9 = Math.max(0.05, Math.min(p9, 0.95));
        if (GameState.deathWarningType === 9 && GameState.deathWarning > 0) {
          if (Math.random() < p9) { setCooldown(9); return 8; }
          else { GameState.deathWarning = 0; GameState.deathWarningType = 0; }
        } else {
          setCooldown(9);
          return setWarning(9);
        }
      }
    }
  }

  // ========== 优先级5: 帝怒诛杀 (倒计时型，可降级) ==========
  if (ef <= -70 && (a.power >= 50 || a.fame >= 60)) {
    if (!isCooling(2)) {
      if (GameState.deathCountdownType === 2) {
        if (GameState.deathCountdown === 0) { setCooldown(2); return 1; }
      } else if (shouldReplace(2)) {
        GameState.deathCountdown = 3; GameState.deathCountdownType = 2; setCooldown(2);
        GameState.rescueAttempted = false;
        return -1;
      }
    }
  }

  // ========== 优先级6: 功高震主 (倒计时型，可降级) ==========
  if (a.power >= 75 && a.wisdom < 60 && ef < 30) {
    if (!isCooling(5)) {
      if (GameState.deathCountdownType === 5) {
        if (GameState.deathCountdown === 0) { setCooldown(5); return 4; }
      } else if (shouldReplace(5)) {
        GameState.deathCountdown = 3; GameState.deathCountdownType = 5; setCooldown(5);
        GameState.rescueAttempted = false;
        return -1;
      }
    }
  }

  // ========== 优先级7: 党争覆灭 (倒计时型，可降级) ==========
  for (var j = 0; j < fk.length; j++) {
    if (f[fk[j]] >= 70 && GameState.factionPurged && GameState.factionPurged[fk[j]]) {
      if (!isCooling(4)) {
        if (GameState.deathCountdownType === 4) {
          if (GameState.deathCountdown === 0) { setCooldown(4); return 3; }
        } else if (shouldReplace(4)) {
          GameState.deathCountdown = 3; GameState.deathCountdownType = 4; setCooldown(4);
          GameState.rescueAttempted = false;
          return -1;
        }
      }
      break;
    }
  }

  // ========== 优先级8: 胡案牵连 (anchor 2, 倒计时型, 不可降级) ==========
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var an = HISTORY_ANCHORS[i];
    if (an.id === 2 && GameState.turn >= an.start && GameState.turn <= an.end + 2) {
      if (!isCooling(3) && (!GameState.anchorTriggerCount || GameState.anchorTriggerCount[2] < 2)) {
        var p3 = ((mx * 0.25 + Math.max(0, -ef) * 0.15 + Math.max(0, 50 - a.wisdom) * 0.1) / 100) * degMod;
        p3 = Math.max(0.05, p3 + buffer);
        if (GameState.deathCountdownType === 3) {
          if (GameState.deathCountdown === 0) { setCooldown(3); if (!GameState.anchorTriggerCount) GameState.anchorTriggerCount = {}; GameState.anchorTriggerCount[2] = (GameState.anchorTriggerCount[2]||0)+1; return 2; }
        } else if (Math.random() < p3) {
          if (shouldReplace(3)) {
            GameState.deathCountdown = 3; GameState.deathCountdownType = 3; setCooldown(3);
            GameState.rescueAttempted = false;
            return -1;
          }
        }
      }
      break;
    }
  }

  // ========== 优先级9: 蓝案牵连 (anchor 7, 倒计时型, 不可降级) ==========
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var an = HISTORY_ANCHORS[i];
    if (an.id === 7 && GameState.turn >= an.start && GameState.turn <= an.end + 2) {
      if (!isCooling(11) && (!GameState.anchorTriggerCount || GameState.anchorTriggerCount[7] < 2)) {
        var p11 = ((mx * 0.2 + Math.max(0, -ef) * 0.15 + Math.max(0, 50 - a.wisdom) * 0.1) / 100) * degMod;
        if (GameState.background === '淮西武将之后') p11 += 0.12;
        if (a.power >= 60) p11 += 0.08;
        p11 = Math.min(p11, 0.5);
        p11 = Math.max(0.05, p11 + buffer);
        if (GameState.deathCountdownType === 11) {
          if (GameState.deathCountdown === 0) { setCooldown(11); if (!GameState.anchorTriggerCount) GameState.anchorTriggerCount = {}; GameState.anchorTriggerCount[7] = (GameState.anchorTriggerCount[7]||0)+1; return 10; }
        } else if (Math.random() < p11) {
          if (shouldReplace(11)) {
            GameState.deathCountdown = 3; GameState.deathCountdownType = 11; setCooldown(11);
            GameState.rescueAttempted = false;
            return -1;
          }
        }
      }
      break;
    }
  }

  // ========== 优先级10: 流放致死 (倒计时型，可降级) ==========
  if (ef <= -50 && a.people <= 20 && mn <= -30) {
    if (!isCooling(7)) {
      if (GameState.deathCountdownType === 7) {
        if (GameState.deathCountdown === 0) { setCooldown(7); return 6; }
      } else if (shouldReplace(7)) {
        GameState.deathCountdown = 3; GameState.deathCountdownType = 7; setCooldown(7);
        GameState.rescueAttempted = false;
        return -1;
      }
    }
  }

  // ========== 优先级11: 积劳成疾 (倒计时型，可降级) ==========
  if (GameState.consecutiveHighPowerTurns >= 6 && a.power >= 60 && a.bond <= 30) {
    if (!isCooling(10)) {
      if (GameState.deathCountdownType === 10) {
        if (GameState.deathCountdown === 0) { setCooldown(10); return 9; }
      } else if (shouldReplace(10)) {
        GameState.deathCountdown = 3; GameState.deathCountdownType = 10; setCooldown(10);
        GameState.rescueAttempted = false;
        return -1;
      }
    }
  }

  return -1;
}

// v3.8.2: 死亡倒计时递减（P0-2: 增加冷却递减 + 预警递减）
function tickDeathCountdown() {
  // P0-2: 冷却期递减
  if (GameState.deathCooldown) {
    for (var ct in GameState.deathCooldown) {
      GameState.deathCooldown[ct]--;
      if (GameState.deathCooldown[ct] <= 0) delete GameState.deathCooldown[ct];
    }
  }
  // P0-2: 预警递减（预警回合结束，下回合由checkDeath判定真正死亡）
  if (GameState.deathWarning > 0) {
    GameState.deathWarning--;
  }
  // P0-2: 缓冲属性标记重置
  GameState.crisisBufferActive = false;

  if (GameState.deathCountdown > 0) {
    GameState.deathCountdown--;
    // 倒计时归零且条件不再成立→逃脱，清除倒计时
    if (GameState.deathCountdown === 0) {
      var stillDying = false;
      var t = GameState.deathCountdownType;
      var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
      if (t === 2 && ef <= -70 && (a.power >= 50 || a.fame >= 60)) stillDying = true;
      // 胡案牵连：anchor窗口内仍触发则继续
      if (t === 3) {
        var mx2 = maxFaction();
        for (var q = 0; q < HISTORY_ANCHORS.length; q++) {
          var an2 = HISTORY_ANCHORS[q];
          if (an2.id === 2 && GameState.turn >= an2.start && GameState.turn <= an2.end + 2) {
            var p2 = (mx2 * 0.25 + Math.max(0, -ef) * 0.15 + Math.max(0, 50 - a.wisdom) * 0.1) / 100;
            if (p2 > 0.05) stillDying = true; // v3.8.4b: 安全阈值检查替代随机重检; v3.8.10-fix: id===3→id===2（胡案对调修正）
            break;
          }
        }
      }
      // 蓝案牵连：anchor窗口内仍触发则继续
      if (t === 11) {
        var mx3 = maxFaction();
        for (var q = 0; q < HISTORY_ANCHORS.length; q++) {
          var an2 = HISTORY_ANCHORS[q];
          if (an2.id === 7 && GameState.turn >= an2.start && GameState.turn <= an2.end + 2) {
            var p3 = (mx3 * 0.2 + Math.max(0, -ef) * 0.15 + Math.max(0, 50 - a.wisdom) * 0.1) / 100;
            if (GameState.background === '淮西武将之后') p3 += 0.12;
            if (a.power >= 60) p3 += 0.08;
            p3 = Math.min(p3, 0.5);
            if (p3 > 0.05) stillDying = true; // v3.8.4b: 安全阈值检查替代随机重检
            break;
          }
        }
      }
      if (t === 5 && a.power >= 75 && a.wisdom < 60 && ef < 30) stillDying = true;
      if (t === 7 && ef <= -50 && a.people <= 20 && minFaction() <= -30) stillDying = true;
      if (t === 10 && GameState.consecutiveHighPowerTurns >= 6 && a.power >= 60 && a.bond <= 30) stillDying = true;
      // P4需检查阵营清洗状态
      if (t === 4) {
        var fk = Object.keys(f);
        for (var j = 0; j < fk.length; j++) {
          if (f[fk[j]] >= 70 && GameState.factionPurged && GameState.factionPurged[fk[j]]) stillDying = true;
        }
      }
      if (!stillDying) {
        GameState.deathCountdownType = 0;
      }
    }
  }
}

function checkDeathWarning() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  var warns = [];
  if (a.power >= 70 && ef <= -20) warns.push('帝怒将至');
  if (a.power >= 75 && a.wisdom < 55 && ef < 30) warns.push('功高震主');
  var mn2 = minFaction();
  if (mn2 <= -40) warns.push('派系倾轧');
  if (ef <= -40 && a.people <= 30) warns.push('流放之兆');
  // v3.8.2 + P0-2: 死亡倒计时预警 + 危机事件预警
  if (GameState.deathWarning > 0 && GameState.deathWarningType > 0) {
    var crisisEvt = CRISIS_EVENTS[GameState.deathWarningType];
    warns.push('⚠ ' + (crisisEvt ? crisisEvt.title : '大祸临头') + '（最后警告）');
  }
  if (GameState.deathCountdown > 0) {
    var crisisEvt2 = CRISIS_EVENTS[GameState.deathCountdownType];
    var label = crisisEvt2 ? crisisEvt2.title : '死劫';
    if (GameState.deathCountdown === 1) warns.push('☠ ' + label + '（命悬一线）');
    else warns.push('☠ ' + label + '（剩余' + GameState.deathCountdown + '回合）');
    if (GameState.rescueAttempted) warns.push('  └ 已使用自救机会');
    else warns.push('  └ 尚有自救机会');
  }
  // v3.8.1: 英年早逝预警
  if (a.power <= 20 && a.bond <= 25 && a.people <= 30 && a.fame <= 25) warns.push('壮志未酬');
  // v3.8.4: 种子到期预警
  var overdue = checkOverdueSeeds();
  if (overdue.length > 0) warns.push('伏笔待收（' + overdue.length + '条种子超期未引爆）');
  // v3.8.5: P1-D 圣眷预警
  if (ef >= 70) warns.push('宠极生厌（圣眷过高，帝王猜忌日深）');
  else if (ef >= 40 && GameState.consecutiveHighEfTurns >= 2) warns.push('天威难测（圣眷持续偏高，功高遭忌）');
  // P0-1: 近臣信息预警
  if (f.jinchen >= 40 && GameState.deathCountdown > 0) {
    warns.push('暗中有人通风报信（近臣情报优势）');
  }
  if (f.jinchen <= -30) warns.push('你感到被注视（锦衣卫监控）');
  return warns;
}

// v3.8.4: 种子系统硬控——检查即将到期（≥6回合）的种子，返回预警列表
// 注：实际自动引爆逻辑已移入 ui.js applyChanges()
function checkOverdueSeeds() {
  var overdue = [];
  var turn = GameState.turn;
  for (var i = 0; i < GameState.seeds.length; i++) {
    var s = GameState.seeds[i];
    var age = turn - (s.planted_turn || 0);
    // 存活≥6回合的种子发出预警（距自动引爆还剩2回合）
    if (age >= 6) {
      overdue.push(s.id || s);
    }
  }
  return overdue;
}

function updateDeathTracking(narrative) {
  // 连续高权势追踪
  if (GameState.attributes.power >= 60) {
    GameState.consecutiveHighPowerTurns++;
  } else {
    GameState.consecutiveHighPowerTurns = 0;
  }
  // P2-C: 争议文字检测已移至 ui.js applyChanges()，由 AI 通过 state block 标记
  // 此处保留 faction purge tracking
  var turn = GameState.turn;
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var an = HISTORY_ANCHORS[i];
    if (turn >= an.start && turn <= an.end + 2) {
      if (an.id === 2) GameState.factionPurged.huaixi = true; // v3.8.9: 胡惟庸案现为id=2
      if (an.id === 7) GameState.factionPurged.huaixi = true;
      if (an.id === 5) GameState.factionPurged.zhedong = true;
      if (an.id === 6) GameState.factionPurged.donggong = true;
      if (an.id === 8) GameState.factionPurged.jinchen = true;
    }
  }
  // v3.8.5: P1-C 阵营极端值衰减
  applyFactionDecay();
  // v3.8.5: P1-D 圣眷风险追踪与暴跌
  if (GameState.emperor_feeling >= 40) {
    GameState.consecutiveHighEfTurns++;
  } else {
    GameState.consecutiveHighEfTurns = 0;
  }
  applyFavorRisk();
  // P0-4: 近臣监控种子修复（v3.8.18：存在性检查+效果递减+退出条件）
  // 退出条件：jinchen回升到-40以上，清除所有监控种子
  if (GameState.factions.jinchen > -40) {
    var hadWatch = GameState.seeds.some(function(s) { return s.id.indexOf('被盯上_') === 0; });
    if (hadWatch) {
      GameState.seeds = GameState.seeds.filter(function(s) { return s.id.indexOf('被盯上_') !== 0; });
      GameState.jinchenWatchCount = 0;
      console.log('[近臣监控] jinchen回升到-40以上，监控种子已清除');
    }
  }
  // 种植条件：jinchen<=-60 + 每5回合 + 不存在未引爆的监控种子
  if (GameState.factions.jinchen <= -60 && turn % 5 === 0) {
    var hasExistingWatch = GameState.seeds.some(function(s) { return s.id.indexOf('被盯上_') === 0; });
    if (!hasExistingWatch) {
      // 效果递减：第1次×1.0，第2次×0.5，第3次×0.25，保底-1/-1/-2
      var watchCount = GameState.jinchenWatchCount || 0;
      var decay = Math.pow(0.5, watchCount);
      var watchedSeed = {
        id: '被盯上_' + turn,
        type: '把柄暴露',
        planted_turn: turn,
        trigger_turn: turn + 4,
        effect: {
          attributes: {
            power: Math.max(Math.round(-5 * decay), -1),
            wisdom: Math.max(Math.round(-3 * decay), -1)
          },
          emperor_feeling: Math.max(Math.round(-8 * decay), -2)
        }
      };
      GameState.seeds.push(watchedSeed);
      GameState.jinchenWatchCount = watchCount + 1;
      console.log('[近臣监控] 种下"被盯上"种子，衰减系数:', decay.toFixed(2), '回合', turn);
    }
  }
  // v3.8.15: 正面种子种植（D）
  plantPositiveSeed(turn);
  // v3.8.15: 生活事件系统（P2-G Phase 1）
  if (!GameState.family && GameState.character.background) {
    GameState.family = initFamily(GameState.character.background);
    console.log('[生活事件] 家庭初始化完成（出身：' + GameState.character.background + '）');
  }
  if (GameState.family) {
    checkLifeEvents(turn);
    // Phase 3: 家庭牵连危机（在锚点期间检测）
    checkFamilyCrisis(turn);
    // 锚点切换时重置家庭危机标记
    var inAnchor = false;
    for (var ai = 0; ai < HISTORY_ANCHORS.length; ai++) {
      if (turn >= HISTORY_ANCHORS[ai].start && turn <= HISTORY_ANCHORS[ai].end) {
        inAnchor = true;
        if (GameState.lastFamilyCrisisAnchor !== HISTORY_ANCHORS[ai].id) {
          GameState.familyCrisisTriggeredThisAnchor = false;
          GameState.lastFamilyCrisisAnchor = HISTORY_ANCHORS[ai].id;
        }
        break;
      }
    }
    if (!inAnchor) {
      GameState.familyCrisisTriggeredThisAnchor = false;
      GameState.lastFamilyCrisisAnchor = 0;
    }
  }
  // v3.13.0: 限时倒计时——每回合推进时递减活跃危机的倒计时（先于新事件调度）
  if (typeof crisisTimerTick === 'function') {
    crisisTimerTick();
  }
  // v3.12.0: 生死危机事件层——每回合检查是否触发危机故事事件
  if (typeof checkCrisisStoryEvent === 'function') {
    checkCrisisStoryEvent();
  }
  // v3.12.0: 自然恢复检查（每5回合）
  if (typeof naturalRecoveryCheck === 'function') {
    naturalRecoveryCheck();
  }
  // v3.12.0: 清理过期危机标签
  if (GameState.crisisTags) {
    for (var _ct in GameState.crisisTags) {
      if (GameState.crisisTags.hasOwnProperty(_ct)) {
        var _tag = GameState.crisisTags[_ct];
        if (!_tag.permanent && _tag.expiresAt && _tag.expiresAt <= turn) {
          delete GameState.crisisTags[_ct];
          console.log('[危机标签] 过期清除: ' + _ct);
        }
      }
    }
  }
}

function getCommonEnding() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  var endings = [
    {name:'\u9752\u53f2\u7559\u540d', desc:'\u540d\u5782\u5343\u53e4\uff0c\u4e07\u4e16\u6d41\u82b3\u3002\u4f60\u7684\u540d\u5b57\u88ab\u5199\u5165\u300a\u660e\u53f2\u300b\uff0c\u540e\u4e16\u6bcf\u4e00\u4e2a\u8bfb\u4e66\u4eba\u90fd\u4f1a\u8bfb\u5230\u4f60\u7684\u6545\u4e8b\u3002\u4f60\u7684\u4e00\u751f\u662f\u4e00\u90e8\u6d53\u7f29\u7684\u6d2a\u6b66\u53f2\u2014\u2014\u4ece\u5c0f\u5c0f\u4eba\u7269\u5230\u540d\u52a8\u5929\u4e0b\uff0c\u6bcf\u4e00\u6b65\u90fd\u8e29\u5728\u4e86\u6b63\u786e\u7684\u4f4d\u7f6e\u3002\u767e\u5e74\u4e4b\u540e\uff0c\u5f53\u4eba\u4eec\u8c08\u8d77\u6d2a\u6b66\u671d\u7684\u98ce\u4e91\u4eba\u7269\uff0c\u4f60\u7684\u540d\u5b57\u59cb\u7ec8\u5728\u5176\u4e2d\u3002',
     check: function(){ return a.fame >= 85 && a.wisdom >= 70 && ef >= 0 && GameState.attributes.bond >= 60; }},
    {name:'\u667a\u7edd\u5929\u4e0b', desc:'\u7b97\u65e0\u9057\u7b56\uff0c\u8c0b\u5b9a\u4e7e\u5764\u3002\u4f60\u7684\u667a\u8c0b\u8ba9\u6240\u6709\u4eba\u670d\u6c14\u2014\u2014\u671d\u5803\u4e0a\u4e0b\u65e0\u4eba\u6562\u5c0f\u89d8\u4f60\uff0c\u8fde\u6731\u5143\u7490\u90fd\u5bf9\u4f60\u7684\u5224\u65ad\u53e6\u773c\u76f8\u770b\u3002\u4f60\u7684\u6bcf\u4e00\u6b21\u8fdb\u8a00\u90fd\u88ab\u5370\u8bc1\u4e3a\u6b63\u786e\uff0c\u6bcf\u4e00\u6b21\u5e03\u5c40\u90fd\u5728\u6570\u5e74\u540e\u5f97\u5230\u9a8c\u8bc1\u3002\u540e\u4e16\u8bfb\u5230\u4f60\u7684\u6545\u4e8b\uff0c\u4f1a\u53f9\u606f\uff1a\u82e5\u6b64\u4eba\u751f\u4e8e\u592a\u5e73\u4e4b\u4e16\uff0c\u5f53\u4e3a\u4e00\u4ee3\u540d\u81e3\u3002',
     check: function(){ return a.wisdom >= 90 && a.fame >= 70 && a.power >= 40 && a.power <= 75; }},
    {name:'\u6c11\u5fc3\u6240\u5411', desc:'\u767e\u59d3\u62e5\u6234\uff0c\u6c11\u671b\u5982\u5929\u3002\u4f60\u6df1\u5f97\u6c11\u5fc3\uff0c\u5373\u4fbf\u671d\u5803\u4e0a\u6709\u4eba\u5fcc\u5989\u4f60\uff0c\u767e\u59d3\u5374\u89c6\u4f60\u5982\u7236\u6bcd\u3002\u4f60\u8d70\u8fc7\u7684\u6bcf\u4e00\u4e2a\u5730\u65b9\u90fd\u7559\u4e0b\u4e86\u53e3\u7891\u3002\u5373\u4fbf\u4f60\u79bb\u4efb\u6216\u79bb\u4e16\uff0c\u5f53\u5730\u767e\u59d3\u4f1a\u81ea\u53d1\u4e3a\u4f60\u8bbe\u7960\u796d\u7960\u3002\u8fd9\u4efd\u611f\u60c5\u4e0d\u662f\u6743\u4f4d\u80fd\u4e70\u7684\uff0c\u662f\u4f60\u4e00\u6b65\u4e00\u6b65\u8d70\u51fa\u6765\u7684\u3002\u5728\u6d2a\u6b66\u671d\u90a3\u6837\u4e00\u4e2a\u66b4\u529b\u7684\u65f6\u4ee3\uff0c\u8fd9\u662f\u6700\u7f55\u89c1\u7684\u6e29\u6696\u3002',
     check: function(){ return a.people >= 85 && a.fame >= 60 && a.power >= 30 && ef >= -10; }},
    {name:'\u6743\u503e\u671d\u91ce', desc:'\u4e00\u4eba\u4e4b\u4e0b\uff0c\u4e07\u4eba\u4e4b\u4e0a\u3002\u4f60\u7684\u6743\u52bf\u5df2\u7ecf\u5230\u4e86\u4eba\u81e3\u7684\u9876\u5cf0\u2014\u2014\u671d\u5803\u5927\u5c0f\u4e8b\u52a1\u7686\u7531\u4f60\u5b9a\u593a\uff0c\u516d\u90e8\u5c1a\u4e66\u89c1\u4e86\u4f60\u8981\u7ed5\u8def\u8d70\u3002\u4f46\u4f60\u5fc3\u91cc\u6e05\u695a\uff0c\u8fd9\u4efd\u6743\u52bf\u6765\u81ea\u6731\u5143\u7490\u7684\u4fe1\u4efb\uff0c\u4e5f\u53ef\u80fd\u5728\u67d0\u4e00\u5929\u88ab\u6536\u56de\u3002\u4f60\u7ad9\u5728\u4e86\u4eba\u81e3\u7684\u6700\u9ad8\u5904\uff0c\u4e5f\u7ad9\u5728\u4e86\u60ac\u5d16\u7684\u6700\u8fb9\u7f18\u3002\u540e\u4e16\u53f2\u5bb6\u8bc4\u4f60\uff1a\u201c\u6743\u503e\u4e00\u65f6\uff0c\u800c\u4e0d\u80fd\u81ea\u4fdd\u3002\u201d',
     check: function(){ return a.power >= 85 && a.wisdom >= 60 && ef >= -20 && countFactionsGTE(30) >= 2; }},
    // v3.8.18: 填补fame 60-85区间覆盖间隙——中等偏上但无突出属性
    {name:'朝中名宦', desc:'朝中名宦。你在这盘棋里不算赢家，却也没有输。洪武朝的风云变幻中，你凭借能力和谨慎站稳了脚跟。同僚敬重你，皇帝信任你，百姓记得你。你没有成为改变历史的人，但历史因为你的存在而少了几分残酷。百年之后，《明史》或许不会为你立传，但在那些你经手的公文、你庇护过的同僚、你治理过的城池里，你的痕迹一直都在。',
     check: function(){ return a.fame >= 60 && a.fame < 85 && a.wisdom >= 50 && a.wisdom < 70 && a.power >= 30 && a.power < 85 && a.people >= 40 && a.people < 85 && GameState.attributes.bond >= 35 && GameState.attributes.bond < 60; }},
    {name:'\u906e\u81ed\u4e07\u5e74', desc:'\u4e07\u4eba\u5524\u9a82\uff0c\u5978\u4f5e\u4e4b\u540d\u3002\u4f60\u7684\u540d\u5b57\u6210\u4e86\u8d2a\u5b98\u6c61\u540f\u7684\u4ee3\u540d\u8bcd\uff0c\u7559\u4e0b\u5343\u53e4\u9a82\u540d\u3002\u4f60\u7684\u5e9c\u90b8\u91cc\u5806\u6ee1\u4e86\u94f6\u5b50\u548c\u7ee2\u7ef8\uff0c\u4f46\u6bcf\u4e2a\u4eba\u770b\u5230\u4f60\u90fd\u7ed5\u7740\u8d70\u3002\u4f60\u7684\u540d\u5b57\u88ab\u5199\u8fdb\u4e86\u300a\u59e5\u81e3\u4f20\u300b\uff0c\u4e0e\u5386\u4ee3\u5978\u81e3\u5e76\u5217\u3002\u540e\u4eba\u8bfb\u5230\u4f60\u7684\u6545\u4e8b\uff0c\u4f1a\u5578\u7136\u53d1\u7b11\uff0c\u7136\u540e\u8b66\u9192\u81ea\u5df1\u4e0d\u8981\u6210\u4e3a\u8fd9\u6837\u7684\u4eba\u3002',
     check: function(){ return a.fame <= 25 && a.power >= 50 && GameState.attributes.bond <= 25; }},
    {name:'\u4e71\u4e16\u9690\u8005', desc:'\u5f52\u9690\u6797\u6cc9\uff0c\u4e0d\u95ee\u671d\u5803\u3002\u4f60\u653e\u5f03\u4e86\u529f\u540d\u5bcc\u8d35\uff0c\u5728\u5c71\u6c34\u95f4\u627e\u5230\u4e86\u5185\u5fc3\u7684\u5b81\u9759\u3002\u4f60\u7684\u5c0f\u5c4b\u5750\u843d\u5728\u5c71\u811a\u4e0b\uff0c\u95e8\u524d\u6709\u4e00\u4e1b\u7aff\u3001\u4e00\u5f20\u7434\u3002\u5076\u5c14\u6709\u8fc7\u8def\u7684\u6e14\u7fc1\u6765\u6263\u95e8\uff0c\u4f60\u4fbf\u4e0e\u4ed6\u5bf9\u996e\u51e0\u676f\u3002\u671d\u5802\u4e0a\u7684\u98ce\u4e91\u518d\u4e5f\u4e0e\u4f60\u65e0\u5173\u3002\u4f60\u662f\u6d2a\u6b66\u671d\u6700\u4e0d\u8d77\u773c\u7684\u4eba\uff0c\u4e5f\u662f\u552f\u4e00\u771f\u6b63\u81ea\u7531\u7684\u4eba\u3002',
     check: function(){ return a.power <= 20 && a.fame >= 40 && a.wisdom >= 55 && a.people >= 40; }},
    // v3.8.2: 新增fame中间地带结局（填补25-40与40-60之间的空白）
    {name:'乡望素著', desc:'十里八乡，交口称颂。你虽未名动天下，却在乡里间留下了极好的名声。百姓记得你的善举，同僚记得你的为人。你为官一任便造福一方，虽无惊天动地的功业，却在每一个到过的地方留下了温度。这份平凡的尊重，或许比庙堂上的功名更持久——因为功名会被遗忘，而人心的记忆最长。',
     check: function(){ return a.fame >= 25 && a.fame < 40 && a.people >= 45 && a.wisdom >= 35 && a.bond >= 30; }},
    {name:'名满天下', desc:'天下士人谈及当世人物，无人不知你的名字。你未必权倾一时，却以才学与品行赢得了广泛的敬重。你的文章被人传抄，你的品行被人效仿，你的判断被人信赖。这份声望不靠权位维系，而是来自你走过的每一步、做过的每一个决定。百年之后，人们或许记不清洪武朝的宰相是谁，但会记得你的名字。',
     check: function(){ return a.fame >= 40 && a.fame < 60 && a.wisdom >= 50 && a.people >= 40 && a.bond >= 35; }},
    // v3.8.17: 瘦身"全身而退"描述——去掉家族相关措辞（子孙安全/家族延续），家庭维度由传承结局负责
    {name:'\u5168\u8eab\u800c\u9000', desc:'\u5e73\u6de1\u662f\u798f\uff0c\u5584\u7ec8\u3002\u4f60\u6ca1\u6709\u5efa\u4e0b\u4e0d\u4e16\u529f\u4e1a\uff0c\u4f46\u5e73\u5e73\u5b89\u5b89\u5ea6\u8fc7\u4e86\u8fd9\u4e2a\u6ce1\u8840\u65f6\u4ee3\u3002\u5728\u6d2a\u6b66\u671d\uff0c\u80fd\u6d3b\u7740\u79bb\u5f00\u5c31\u662f\u6700\u5927\u7684\u80dc\u5229\u3002\u591a\u5c11\u663e\u8d6b\u7684\u540d\u81e3\u6ca1\u80fd\u505a\u5230\u8fd9\u4e00\u70b9\u2014\u2014\u4ed6\u4eec\u7684\u540d\u5b57\u88ab\u62b9\u53bb\uff0c\u4ed6\u4eec\u7684\u5bb6\u65cf\u88ab\u6e05\u7b97\u3002\u800c\u4f60\uff0c\u5e73\u5e73\u65e0\u5947\u5730\u6d3b\u4e86\u4e0b\u6765\u3002',
     check: function(){ return a.power >= 30 && a.power <= 60 && ef >= -10 && allFactionsGTE(-30) && allFactionsLTE(40) && GameState.attributes.bond >= 50; }},
    // v3.8.18: 英年早逝——放宽条件对齐预警阈值，加变体叙事
    {name:'英年早逝',
     desc: (function(){
       if (a.power >= 30 || a.wisdom >= 50) {
         return '壮志未酬，赍志而殁。你有过抱负，也有过机会——但洪武朝的风暴太大了，你还没来得及施展就已经被吞没。你倒下时，朝堂上没有人为你停步，奏章里你的名字很快被下一个名字覆盖。但这个时代记得你挣扎过的痕迹，哪怕那痕迹只是公文堆里一道被驳回的奏疏。';
       } else {
         return '赍志而殁，无声无息。你没能在这个波澜壮阔的时代留下自己的印记，便在默默无闻中走到了终点。你的名字没有出现在任何重要的历史文件中，你的面孔没有被任何人画下。你活过、努力过、挣扎过，但这个时代太大了，大到足以吞没一个普通人的一切。你的故事，就是无数个没有故事的人的故事。';
       }
     })(),
     check: function(){ return a.power <= 20 && GameState.attributes.bond <= 25 && a.people <= 30 && a.fame <= 25; }},
    // v3.8.17 P1-5修复：传承结局已拆出到独立的 getLegacyEnding()，不再与通用结局竞争优先级
    // 通用结局列表现在只包含事业/庙堂维度的结局
    // 同时瘦身"全身而退"描述：去掉家族相关措辞，家庭维度由传承结局负责
  ];
  // v3.8.18: 动态兜底"洪武落幕"——根据属性生成3种变体叙事
  var fallbackDesc;
  if (a.power >= 40 && a.power >= a.fame && a.power >= a.wisdom) {
    fallbackDesc = '你手握权柄却未名动天下。洪武朝的棋盘上，你是那些默默运转的齿轮之一——没有显赫的名声，没有惊天的手笔，但在那些你经手的政务、你协调的纷争、你维持的秩序里，帝国因为你的存在而多稳了一分。你没有成为史书上浓墨重彩的一笔，但洪武朝的每一天，都有你留下的痕迹。';
  } else if (ef <= -10) {
    fallbackDesc = '帝王的猜忌像一柄悬在头顶的刀，你在这柄刀下走了几十年。圣眷早已不复当年，同僚们渐渐疏远了你，奏疏石沉大海，召对日渐稀少。你还在这朝堂上，但已经没有人记得你曾经被信任过。洪武三十一年，太祖驾崩。对你而言，那柄悬了半辈子的刀，终于落下了——只是落下的不是刀刃，而是无尽的疲惫。';
  } else {
    fallbackDesc = '洪武三十一年，太祖驾崩。建文帝即位，改元建文。你的洪武仕途在此画上句号——没有惊天动地的功业，也没有身败名裂的悲剧。你在一个最残酷的时代平平安安地走完了全程，这本身就已经是难得的运气。身后功过，留与青史。';
  }
  endings.push({name:'\u6d2a\u6b66\u843d\u5e55', desc: fallbackDesc,
    check: function(){ return true; }});
  for (var i = 0; i < endings.length; i++) {
    if (endings[i].check()) return endings[i];
  }
  return null;
}

// ========== v3.8.17 P1-5: 传承结局系统（双维度——家庭/门楣） ==========
// 从 getCommonEnding 独立出来，与事业结局并行输出
// 优先级：隐藏结局(独占) > 出身专属+传承 > 通用+传承 > 兜底
function getLegacyEnding() {
  if (!GameState.family) return null;
  var f = GameState.family;
  var bg = GameState.character.background;
  var ft = GameState.familyTrust || 50;
  var trustTier = ft >= 60 ? 'high' : (ft >= 30 ? 'mid' : 'low');

  // v3.8.21修复：族灭型死亡（CRISIS_EVENTS type 0）
  if (GameState.deathCountdownType === 0 && GameState.deathCountdown <= 0) {
    return { name: '满门抄斩', desc: '满门抄斩，鸡犬不留。你的家族在这场政治风暴中被连根拔起——妻子、儿女、老幼，无一幸免。百年之后，没有人记得你的家族曾经存在过。在这个时代，有些姓氏注定要从大地上被抹去。' };
  }

  // 家族兴旺：3+在世子女，至少1个已婚或有孙辈
  var livingChildren = f.children.filter(function(c){ return c.status === '在世'; });
  var hasGrandchild = GameState.lifeEventsTriggered.indexOf('grandchild') >= 0;
  var hasChildMarried = GameState.lifeEventsTriggered.indexOf('child_marriage') >= 0;
  if (livingChildren.length >= 3 && (hasGrandchild || hasChildMarried)) {
    // v3.11.0d: 出身×信任度 差异化描述
    if (bg === '淮西老将之后') {
      if (trustTier === 'high') {
        return { name: '家族兴旺', desc: '子孙满堂，刀剑入库。你在凤阳老家置下的几亩薄田，如今已成了儿孙绕膝的庄园。曾经的淮西老兄弟偶尔来信，说起当年鄱阳湖的血战，你只是笑笑。你的孩子们不一定要上战场了——这恰恰是你当年拼命的意义。' };
      } else if (trustTier === 'mid') {
        return { name: '家族兴旺', desc: '子孙满堂，但家里的酒桌上总空着一个位子。孩子们敬畏你，却不太敢靠近。你建起了一个家族，但没能建起一个家。' };
      } else {
        return { name: '家族兴旺', desc: '儿孙们逢年过节会来行礼，但没人愿意多留。你保住了家族的壳，但壳里的温度早就散了。有时候你想：当年那些切割、那些自保，到底保住了什么？' };
      }
    } else if (bg === '浙东寒门书生') {
      if (trustTier === 'high') {
        return { name: '家族兴旺', desc: '你的孩子们在书香中长大，孙子们开始参加科考。寒门不再寒了。乡间老屋的墙上挂着你父亲写的对联，墨迹已经泛黄，但每个经过的人都会多看一眼。' };
      } else if (trustTier === 'mid') {
        return { name: '家族兴旺', desc: '子孙们读了书，有的考取了功名，有的还在苦读。家族在缓慢地上升，但你和孩子们之间总有一层说不清的东西——也许是父亲太忙，也许是那些年在朝堂上学到的算计，不知不觉也带回了家。' };
      } else {
        return { name: '家族兴旺', desc: '你的孩子们成了读书人，但他们看你的眼神里有审视。他们读了太多关于忠孝节义的文章，然后在回家时默默对比你的行为。知识给了他们判断力，也给了你一面不舒服的镜子。' };
      }
    } else if (bg === '应天府商贾之子') {
      if (trustTier === 'high') {
        return { name: '家族兴旺', desc: '账本传到了第三代。秦淮河畔的铺子还在，但招牌已经换了——不再是你的名字，而是你儿子的。婉清和母亲当年缝在棉衣夹层里的暗账，如今成了正经的商号总账。从恐惧到从容，这个家用了三十年。' };
      } else if (trustTier === 'mid') {
        return { name: '家族兴旺', desc: '铺子还在，账还在算，但家里的饭桌上越来越安静。你给了子孙财富，但没给他们一个可以放松的家。' };
      } else {
        return { name: '家族兴旺', desc: '银子还在，铺子还在，但婉清看你的眼神变了。当年那些选择——放弃铺子保人、还是切割亲人自保——她都没忘。商人的账本记得很清楚，家里的账也算得很清楚。' };
      }
    } else if (bg === '落魄前元官员之后') {
      if (trustTier === 'high') {
        return { name: '家族兴旺', desc: '这家人终于不用再藏了。你的孩子们生在新地方、长在新地方，说着流利的官话，交着不看出身的朋友。母亲那只锁了二十多年的木箱，被你女儿打开了——里面的锦袍已经褪色，但她只是笑了笑说：「原来奶奶以前是这样的。」恐惧终于在这一代结束了。' };
      } else if (trustTier === 'mid') {
        return { name: '家族兴旺', desc: '孩子们不再像你们那样提心吊胆了，但母亲偶尔还是会从梦中惊醒。你保住了一家人，但没能完全保住他们的信任——那些年你在「保」和「舍」之间的犹豫，他们看在眼里。' };
      } else {
        return { name: '家族兴旺', desc: '你们活了下来，但「活下来」和「活得好」是两回事。妻子偶尔会提起当年你做的选择，语气平静，但你听得出来她没有忘。母亲的伪装传给了下一代——不是伪装身份，而是伪装没事。' };
      }
    }
    // 兜底（未匹配出身）
    return { name: '家族兴旺', desc: '子孙满堂，家道昌盛。你建立了一个完整的家族——孩子们都已成家立业，孙辈在堂前嬉戏。在这个命如草芥的洪武朝，你能把血脉延续下去，让家族开枝散叶，这本身就是一种胜利。百年之后，你的牌位会被子孙供奉，你的家训会被后人传诵。这比任何庙堂功名都更持久。' };
  }

  // 家道中落：所有家庭成员已死/离异
  var hasSpouse = f.spouse && (f.spouse.status === '在世');
  var hasChildren = f.children && f.children.filter(function(c){ return c.status === '在世'; }).length > 0;
  var hasParent = (f.parents.father && f.parents.father.status === '在世')
               || (f.parents.mother && f.parents.mother.status === '在世');
  var spouseDead = !f.spouse || f.spouse.status === '已故' || f.spouse.status === '离异';
  var allChildrenDead = f.children.length > 0 && f.children.every(function(c){ return c.status === '已故'; });
  var fatherDead = !f.parents.father || f.parents.father.status === '已故';
  var motherDead = !f.parents.mother || f.parents.mother.status === '已故';
  if (spouseDead && allChildrenDead && fatherDead && motherDead && (f.children.length > 0 || f.spouse)) {
    // v3.11.0d: 家道中落不分trust档，按出身差异化
    if (bg === '淮西老将之后') {
      return { name: '家道中落', desc: '淮西的刀放下了，但没有人接住。你的最后一个孩子在某个冬天走了，军中旧交的名字一个个从花名册上划去。凤阳老家的田地荒了，野草长得比人高。这个家族从战场上活了过来，却没能在和平中延续下去。' };
    } else if (bg === '浙东寒门书生') {
      return { name: '家道中落', desc: '书香断了。你父亲留下的那些旧书，在最后一次搬家时散尽了。乡间老屋的门锁了，再也没有人去开。一个教了一辈子书的老秀才的孙子，没能把书读下去——这也许是这个时代最安静也最残酷的结局。' };
    } else if (bg === '应天府商贾之子') {
      return { name: '家道中落', desc: '秦淮河畔的灯还在亮，但已经不是为你亮的了。铺子早就关了，账本被虫蛀了，陈三的后人也不知道去了哪里。一个商人家族的消亡，安静得像一笔烂账被核销——没有人记得，因为没有人记得。' };
    } else if (bg === '落魄前元官员之后') {
      return { name: '家道中落', desc: '恐惧最终赢了。从大都到南方，从伪装到暴露，从挣扎到放弃——这个家族走了六十年的路，最终回到了原点：没有人记得你们是谁，也没有人在乎你们曾经是谁。母亲那只木箱不知道被谁拿走了，里面的锦袍大概被当了三文钱。' };
    }
    return { name: '家道中落', desc: '家族凋零，门庭冷落。你眼睁睁看着至亲之人一个个离去——妻子、孩子、父母，都走在了你前面。你建立的家庭最终只剩你一人。这份孤独比任何政治失败都更沉重。当最后一个亲人离你而去时，你突然明白：在这个时代，拥有家庭和失去家庭，都是需要勇气的事。' };
  }

  // 孤身来去：无配偶、无子女、无在世父母（四条线统一）
  if (!hasSpouse && !hasChildren && !hasParent) {
    return { name: '孤身来去', desc: '来时无牵无挂，去时孑然一身。你没有留下子嗣，没有人为你续香火。在这个重视传宗接代的时代，你的选择或许会被视为遗憾。但你自己清楚——在这个随时可能族灭的洪武朝，不留下血脉，也许是对后代最大的保护。你的名字会随着你的离去而消散，仿佛从未存在过。这未必是坏事。' };
  }

  // 兜底：平淡传家——有家庭但没达到以上任何条件
  if (f.spouse || livingChildren.length > 0 || hasParent) {
    // v3.11.0d: 平淡传家按出身差异化
    if (bg === '淮西老将之后') {
      return { name: '平淡传家', desc: '凤阳的田地不大不小，够吃。儿孙们逢年过节来磕个头，坐一坐就走了。你偶尔在门口看他们远去，想起父亲说过的话：「刀放下容易，日子过下去难。」你做到了。' };
    } else if (bg === '浙东寒门书生') {
      return { name: '平淡传家', desc: '书还在读，课还在上。乡间老屋的墙上换了你写的新对联。没有大富大贵，也没有家破人亡。一个寒门能走到这一步，已经算是体面了。' };
    } else if (bg === '应天府商贾之子') {
      return { name: '平淡传家', desc: '铺子不大不小，账本一页一页翻。日子就这样过着，不好不坏。秦淮河上的灯火还是那么亮，你站在门口看了一会儿，然后转身回了账房。' };
    } else if (bg === '落魄前元官员之后') {
      return { name: '平淡传家', desc: '木箱还在，但不再锁了。锦袍偶尔拿出来晒一晒，孩子们知道那是奶奶的旧物，但已经不太害怕了。恐惧在慢慢消散，像大雾天里慢慢透出的一点光。不算明朗，但够走路。' };
    }
    return { name: '平淡传家', desc: '家族不大不小，平平淡淡延续了下去。没有显赫，也没有衰败，就像千千万万的洪武朝人家一样。日子一天天过，孩子慢慢长大，老人渐渐离去。你没能给家族带来惊天动地的荣耀，但也没有让它在你手中断绝。这份平凡，在洪武朝已经是难得的幸运。' };
  }

  return null;
}

// ========== v3.11.0d: 家庭叙事回响系统 — EA上下文注入 ==========
/**
 * 根据 familyCrisisOutcome 和 familyTrust 为 EA 注入家庭回响上下文
 * @param {string} eaId - EA的ID（如 'EA-HW-3', 'EA-QY-5'）
 * @returns {string} 家庭回响上下文字符串，无内容返回空字符串
 */
function getFamilyContextForEA(eaId) {
  var fco = GameState.familyCrisisOutcome;
  var ft = GameState.familyTrust || 50;
  if (!fco || Object.keys(fco).length === 0) return '';

  var parts = [];

  // 前元线：妻子相关EA检查crisis_hu_spouse_qianyuan的结果
  if (eaId.indexOf('QY') >= 0 && fco['crisis_hu_spouse_qianyuan']) {
    var outcome = fco['crisis_hu_spouse_qianyuan'];
    if (outcome === '保人') parts.push('【家庭回响】你曾连夜转移妻子保全了她。她对那次经历记忆深刻——信任你，但也更坚定了「不能一直躲」的信念。');
    else if (outcome === '自保') parts.push('【家庭回响】你曾让妻子与旧家族断绝来往。她没有原谅你。从此她在家里变得沉默，但眼神里的火没有灭。');
    else if (outcome === '两全') parts.push('【家庭回响】你曾贿赂锦衣卫让妻子的名字从名单消失。她不知道你做了什么，但那种被追查的恐惧让她更加焦躁。');
  }

  // 淮西线：妻子/父亲相关EA
  if (eaId.indexOf('HW') >= 0) {
    if (fco['crisis_hu_spouse']) {
      var o = fco['crisis_hu_spouse'];
      if (o === '保人') parts.push('【家庭回响】你曾变卖家产保全了妻子娘家。这份情义她记着，但娘家的「牵连」也成了你们之间一个不敢碰的话题。');
      else if (o === '自保') parts.push('【家庭回响】你曾休妻自保。（如妻子已离异则不再出场；如在世则说明后来复合，但裂痕永远在。）');
    }
    if (fco['crisis_li_father'] && fco['crisis_li_father'] === '自保') {
      parts.push('【家庭回响】你曾告发父亲以求自保。这件事只有你和锦衣卫知道。但你每次回家看到卧病的父亲，都觉得他在看着你。');
    }
  }

  // 书生线：老师/父亲相关EA
  if (eaId.indexOf('ZD') >= 0) {
    if (fco['crisis_hu_teacher'] && fco['crisis_hu_teacher'] === '自保') {
      parts.push('【家庭回响】你曾断绝了与恩师宋濂的来往。每当经筵上读到宋濂的文章，你都会不自觉地跳过他的名字。');
    }
    if (fco['crisis_li_father_scholar'] && fco['crisis_li_father_scholar'] === '自保') {
      parts.push('【家庭回响】你曾断绝了与父亲的来往记录。后来父亲来了京城，你们见了面，但没有提起那件事。有些裂痕不需要说出口——它就在那里。');
    }
  }

  // 商贾线：母亲/妻子相关EA
  if (eaId.indexOf('SG') >= 0) {
    if (fco['crisis_hu_mothers_merchant']) {
      var om = fco['crisis_hu_mothers_merchant'];
      if (om === '母媳守家') parts.push('【家庭回响】当年母亲和婉清联手撑住了家业。从那以后，婉清做生意的底气更足了，母亲也真正把她当成了自己人。');
      else if (om === '独扛') parts.push('【家庭回响】你当年选择独自扛下一切。母亲和婉清没有说什么，但你感觉得到——她们觉得被排斥在了家族决策之外。');
    }
  }

  // familyTrust总影响（通用）
  if (ft < 30) parts.push('【家庭氛围】家中气氛低沉。你的家人们彼此说话时都很小心，像是在走钢丝。');
  else if (ft >= 70) parts.push('【家庭氛围】家中气氛温暖。经历了这么多风暴，你的家人反而更紧密了。');

  return parts.join('\n');
}

function getHiddenEnding() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  // 墨史归一: 距离判定 (P1-5: 从硬阈值改为曼哈顿距离，大幅提升可达性)
  // 理想中心：factions各=25, power=60, people=60, wisdom=70, fame=60, bond=60, ef=35
  if (GameState.deathWarningCount <= 2) {
    var ideal = { power: 60, people: 60, wisdom: 70, fame: 60, bond: 60 };
    var factionIdeal = 25;
    var efIdeal = 35;
    // 归一化权重：属性满分100，阵营满分100，圣眷范围-50~100
    var dist = 0;
    // 属性维度（权重1.0）
    dist += Math.abs((a.power || 0) - ideal.power) / 100;
    dist += Math.abs((a.people || 0) - ideal.people) / 100;
    dist += Math.abs((a.wisdom || 0) - ideal.wisdom) / 100;
    dist += Math.abs((a.fame || 0) - ideal.fame) / 100;
    dist += Math.abs((a.bond || 0) - ideal.bond) / 100;
    // 阵营维度（权重0.8，稍低于属性）
    var factionKeys = ['huaixi', 'zhedong', 'jinchen', 'donggong', 'zhuwang'];
    for (var fi = 0; fi < factionKeys.length; fi++) {
      var fk = factionKeys[fi];
      dist += Math.abs((f[fk] || 0) - factionIdeal) / 100 * 0.8;
    }
    // 圣眷维度（权重1.2，因为圣眷波动更大）
    dist += Math.abs(ef - efIdeal) / 150 * 1.2;
    // 总维度数 = 5属性 + 5阵营 + 1圣眷 = 11
    // 最大可能距离约为11（每维度最大约1.0），阈值取20%即约2.2
    var maxDist = 11;
    var threshold = maxDist * 0.20;
    if (dist <= threshold) {
      return {name:'\u58a8\u53f2\u5f52\u4e00', desc:'\u5b8c\u7f8e\u5e73\u8861\uff0c\u4e07\u4e16\u592a\u5e73\u3002\u4f60\u5728\u6d2a\u6b66\u671d\u7684\u6bcf\u4e00\u6b65\u90fd\u8e29\u5728\u4e86\u6700\u5999\u7684\u4f4d\u7f6e\u2014\u2014\u4e0d\u5351\u4e0d\u4ea2\uff0c\u4e0d\u5371\u4e0d\u6024\u3002\u4f60\u4e0d\u662f\u6700\u6709\u6743\u7684\u4eba\uff0c\u4e0d\u662f\u6700\u6709\u540d\u7684\u4eba\uff0c\u4e0d\u662f\u6700\u53d7\u5ba0\u7684\u4eba\u2014\u2014\u4f46\u4f60\u662f\u552f\u4e00\u5728\u6bcf\u4e00\u4e2a\u7ef4\u5ea6\u4e0a\u90fd\u627e\u5230\u4e86\u5e73\u8861\u7684\u4eba\u3002\u6d2a\u6b66\u671d\u7684\u6bcf\u4e00\u573a\u98ce\u66b4\u90fd\u6ca1\u80fd\u51b2\u8d70\u4f60\uff0c\u56e0\u4e3a\u4f60\u4ece\u4e0d\u7ad9\u5728\u4efb\u4f55\u4e00\u4e2a\u6781\u7aef\u3002\u8fd9\u662f\u6700\u96be\u8fbe\u6210\u7684\u7ed3\u5c40\uff0c\u4e5f\u662f\u6700\u5b8c\u7f8e\u7684\u4e00\u4e2a\u2014\u2014\u5b83\u8bc1\u660e\u4e86\uff1a\u5728\u66b4\u529b\u7684\u65f6\u4ee3\uff0c\u6e29\u548c\u4e5f\u662f\u4e00\u79cd\u529b\u91cf\u3002'};
    }
  }
  // 靖难先声: 诸王线 (书生除外)
  if (f.zhuwang >= 60 && a.power >= 55 && a.wisdom >= 75 && ef <= 20 &&
      GameState.character.background !== '\u6d59\u4e1c\u5bd2\u95e8\u4e66\u751f') {
    return {name:'\u9756\u96be\u5148\u58f0', desc:'\u9884\u89c1\u672a\u6765\u3002\u4f60\u4e0e\u71d5\u738b\u6731\u68e3\u7684\u5173\u7cfb\u65e5\u76ca\u6df1\u539a\uff0c\u4f60\u9690\u7ea6\u611f\u5230\u4e00\u573a\u66f4\u5927\u7684\u98ce\u66b4\u6b63\u5728\u915d\u917f\u3002\u6731\u5143\u7490\u9a7e\u5d29\u540e\uff0c\u5efa\u6587\u5e1d\u5fc5\u5c06\u524a\u85e9\uff0c\u71d5\u738b\u5fc5\u5c06\u53cd\u6297\uff0c\u4e00\u573a\u6539\u671d\u6362\u4ee3\u7684\u6218\u4e89\u5df2\u7ecf\u65e0\u6cd5\u907f\u514d\u2014\u2014\u800c\u4f60\uff0c\u5df2\u7ecf\u7ad9\u5728\u4e86\u6b63\u786e\u7684\u4e00\u8fb9\u3002\u5f53\u9756\u96be\u4e4b\u5f79\u7684\u6218\u9f13\u6572\u54cd\u65f6\uff0c\u4f60\u4f1a\u662f\u7b2c\u4e00\u4e2a\u62e5\u7acb\u7684\u4eba\u3002\u4f60\u7684\u540d\u5b57\uff0c\u5c06\u88ab\u5199\u5728\u6c38\u4e50\u5927\u5e1d\u7684\u5f00\u56fd\u529f\u81e3\u540d\u5355\u4e0a\u3002'};
  }
  return null;
}


// v3.8.4: 出身专属结局代码化（12个结局，按出身×条件自动判定）

// v3.8.4b: 出身专属死亡结局（SP 11.3节：NOT alive(58) 的结局）
function getBackgroundDeathEnding(deathIdx) {
  var bg = GameState.character.background;
  var a = GameState.attributes, f = GameState.factions;
  // 前朝余孽：前元出身 + 族灭死(P1,idx=0) 或 党争死(P4,idx=3)
  if (bg === '落魄前元官员之后' && (deathIdx === 0 || deathIdx === 3)) {
    return { name: '前朝余孽', desc: '宿命难逃，因果循环。你终究没能逃脱身份的诅咒——前元的阴影如影随形，无论你怎么努力证明自己的忠诚，那个出身始终是悬在你头顶的刀。当清洗来临，你是最先被点名的人。你的故事成为了一个时代的注脚：关于身份如何决定命运，关于选择如何在历史的巨轮前显得无力。后人读到你的故事，会为你的不幸而叹息。' };
  }
  // 殉道者：浙东书生 + 文字狱死(P8,idx=7) 或 党争死(P4,idx=3) + 属性条件
  if (bg === '浙东寒门书生' && (deathIdx === 7 || deathIdx === 3)) {
    if (a.fame >= 75 && a.wisdom >= 55 && a.bond >= 70 && f.zhedong >= 60) {
      return { name: '殉道者', desc: '以死明志，千秋凛然。你因坚持自己的政治理念而遭难——也许是因为一封直言不讳的奏疏，也许是因为一首被曲解的诗，也许只是因为你不肯在权力面前低头。你的死激发了整个士大夫群体的觉醒。行刑那天，万人送行。后世提起你的名字，都会肃然起敬——你用生命证明了这个时代还有不屈的脊梁。' };
    }
  }
  return null;
}

function getBackgroundEnding() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  var bg = GameState.character.background;
  var endings = [];

  if (bg === '淮西武将之后') {
    endings = [
      {name:'封狼居胥', desc:'战功赫赫，威震边陲。你率军北伐，将蒙元残余势力彻底逐出塞外。大漠黄沙中，你的旗帜飘扬在长城之外。朝廷为你勒石记功，百姓夹道相迎。当你凯旋应天时，朱元璋亲自出城迎接——这是洪武朝武将能获得的最高荣耀。你的威名，将成为大明百年的边防基石。后世提起北伐名将，必以你为首。',
       check: function(){ return a.power >= 70 && a.people >= 50 && f.huaixi >= 30 && ef >= -10 && a.fame >= 60 && GameState.expeditionCount >= 2; }},
      {name:'卸甲归田', desc:'解甲还乡，田园终老。你看透了朝堂的刀光剑影，选择在壮年时急流勇退。凤阳老家的几亩薄田，成了你最后的归宿。你每日荷锄而出、戴月而归，偶尔与村中老者对弈品茶。曾经并肩作战的弟兄们，有些成了功臣，有些成了阶下囚。而你，在田间安然老去。这是你一生中最明智的决定。',
       check: function(){ return a.power <= 30 && a.people >= 45 && ef >= 20 && a.bond >= 40; }},
      {name:'武圣传人', desc:'以武入道，德艺双馨。你不仅是一员猛将，更将武学修为提升到了哲理的高度。你写的兵法被收入武库，你的武艺被编入操典，你的弟子遍布军中。后世武人尊你为宗师，你的武学思想影响了整个明朝的军事训练体系。你不只是会打仗的将军，更是会教人打仗的师傅。',
       check: function(){ return a.wisdom >= 65 && a.fame >= 60 && a.power >= 30 && a.power <= 55; }}
    ];
  } else if (bg === '浙东寒门书生') {
    endings = [
      {name:'一代大儒', desc:'文坛宗师，万世师表。你的学说开创了新的儒学流派，门生遍布天下。你的著作被后世学子奉为经典，你的思想影响了整个明代的学术走向。百年之后，你的牌位被请进了孔庙配殿——这是读书人能获得的最高荣誉。你证明了：在洪武朝这样的时代，笔比刀更持久。',
       check: function(){ return a.wisdom >= 80 && a.fame >= 80 && a.power <= 40 && f.zhedong >= 50 && a.bond >= 65; }},
      {name:'帝师', desc:'天子之师，辅弼良臣。你教导太子治国之道，你的政治理念通过太子影响了整个建文朝。太子对你执弟子礼甚恭，朝臣敬你如泰山北斗。虽然后来靖难再起，但你的思想已经深深嵌入了这个王朝的基因。你没能改变历史的走向，但你改变了历史的底色。后世论及建文之治，必以你为源。',
       check: function(){ return f.donggong >= 70 && a.wisdom >= 70 && ef >= 10 && a.fame >= 60 && a.bond >= 55; }},
    ];
  } else if (bg === '应天府商贾之子') {
    endings = [
      {name:'富甲一方', desc:'商道至尊，富可敌国。你建立了庞大的商业网络，从江南到塞外，从东海到南洋，处处都有你的商号。你的船队航行在海上丝绸之路，你的驼队穿越大漠戈壁。朱元璋虽然重农抑商，但你的财富实在太大了——大到连朝廷都不得不与你合作。你的财富传奇，成为后世商人的教科书。',
       check: function(){ return a.power <= 25 && a.people >= 50 && a.fame >= 40 && a.bond >= 35; }},
      {name:'财政名臣', desc:'理财高手，国用丰足。你主持的财政改革让大明国库充盈，百姓安居乐业。你设计的税法制度精密而务实，既照顾了朝廷的用度，又减轻了百姓的负担。朱元璋对你的才干赞不绝口，称你为国之管萧。你的税法制度被后世沿用百年，成为明代财政体系的基石。',
       check: function(){ return a.power >= 55 && a.people >= 55 && a.fame >= 60 && ef >= 20; }},
      {name:'两面三刀', desc:'灰色生存，左右逢源。你在各方势力之间游走，既不得罪权贵，也不放弃利益。你是朝堂上最滑溜的人——每一方都觉得你是他们的人，但没有人能真正抓住你的把柄。你没有留下美名，但你活了下来。在洪武朝，当多少名臣名将身首异处时，你安然善终——这本身就是一种胜利，虽然不是什么光彩的胜利。',
       check: function(){ return a.power >= 50 && countFactionsGTE(40) >= 2 && a.bond <= 35 && a.fame >= 30 && a.fame <= 55 && a.people <= 40; }}
    ];
  } else if (bg === '落魄前元官员之后') {
    endings = [
      {name:'天子近臣', desc:'孤独权臣，宠冠一时。你以过人的才干赢得了朱元璋的绝对信任，成为他最倚重的近臣。奏章先经你手，决策先问你的意见。但这份信任也意味着孤独——朝中无人敢与你交往，身后无人为你说话。你是朱元璋手里最锋利的刀，但刀是没有朋友的。你的结局取决于皇帝的心情，而皇帝的心情，从来没有人能预测。',
       check: function(){ return a.power >= 70 && f.jinchen >= 60 && ef >= 20 && a.wisdom >= 65 && a.bond <= 40 && f.huaixi <= 10 && f.zhedong <= 10 && f.donggong <= 10 && f.zhuwang <= 10; }},
      {name:'洗心革面', desc:'以绩洗名，脱胎换骨。你用实实在在的政绩证明了自己的价值，彻底洗刷了前朝旧臣的阴影。百姓爱戴你，同僚尊敬你，连天子也对你刮目相看。你证明了：出身不能决定命运，忠诚可以跨越朝代。当有人再提起你是前元旧臣之后时，人们会说：那是他祖先的事，他自己的功业，比多少洪武朝的元老都要扎实。',
       check: function(){ return a.people >= 80 && a.fame >= 70 && ef >= 30 && a.bond >= 60; }}
    ];
  }

  for (var i = 0; i < endings.length; i++) {
    if (endings[i].check()) return endings[i];
  }
  return null;
}

function resolveFinaleEnding() {
  // v3.8.17 P1-5: 双维度结局系统
  // 优先级: 隐藏(独占) > 出身专属+传承 > 通用+传承
  var hidden = getHiddenEnding();
  if (hidden) return { title: hidden.name, description: hidden.desc, legacy: null };

  // 事业结局（出身专属 > 通用）
  var bgEnding = getBackgroundEnding();
  var careerEnding = bgEnding || getCommonEnding();
  
  // 传承结局（独立维度——家庭/门楣）
  var legacyEnding = getLegacyEnding();
  
  if (careerEnding) {
    return { 
      title: careerEnding.name, 
      description: careerEnding.desc, 
      // v3.8.17: 传承结局作为第二维度
      legacy: legacyEnding ? { title: legacyEnding.name, description: legacyEnding.desc } : null
    };
  }
  return null;
}

// v3.8.6: 预判定结局——在终局回合发送给AI之前，用当前GameState预跑一遍结局判定
// 用于注入finale_hint，让AI写出与结局基调匹配的叙事
function predictFinaleEnding() {
  var ending = resolveFinaleEnding();
  if (ending) return ending;
  // resolveFinaleEnding 现在返回 { title, description, legacy }
  // legacy 为 null 或 { title, description }
  // 如果当前状态未命中任何结局，返回最接近的结局提示
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  // 简单启发式：根据最高属性/阵营给出倾向
  var hints = [];
  if (a.fame >= 85) hints.push('名望极高，可能走向"青史留名"');
  else if (a.fame >= 60) hints.push('名望较高，可能走向"朝中名宦"或"民心所向"');
  if (a.wisdom >= 75) hints.push('智慧突出，可能走向"智绝天下"或"帝师"');
  if (a.power >= 70) hints.push('权势显赫，可能走向"权倾朝野"或"封狼居胥"');
  if (a.people >= 70) hints.push('人脉深厚，可能走向"民心所向"或"富甲一方"');
  if (ef >= 40) hints.push('圣眷正隆，帝王恩宠未衰');
  if (ef <= -10) hints.push('圣眷衰微，帝王猜忌日深');
  if (hints.length > 0) return { title: '未定', description: '', hint: hints.join('；') };
  return { title: '未定', description: '', hint: '前路未明，一切皆有可能' };
}

// v3.8.6: 终局提示注入——生成给AI的finale_hint文本
function getFinaleHint() {
  var turn = GameState.turn;
  var year = GameState.year;
  var isDeathEnding = (GameState.deathCountdown > 0 && GameState.deathCountdownType > 0) ||
                      (GameState.deathWarning > 0 && GameState.deathWarningType > 0);
  // v3.10.0: 情感记忆回响——终局注入
  var echoHint = (typeof getEmotionalEchoForFinale === 'function') ? getEmotionalEchoForFinale() : '';
  var echoSuffix = echoHint ? '\n' + echoHint : '';
  // 在终局窗口（回合>=55 或 年份>=1393）注入提示
  if (turn >= 55 || year >= 1393) {
    var pred = predictFinaleEnding();
    // v3.8.17: 双维度结局提示——事业+传承
    var legacyHint = (pred.legacy && pred.legacy.title) ? '；门楣传承结局为「' + pred.legacy.title + '」（家族维度，叙事中需简要交代家族最终状态）' : '';
    if (pred.title && pred.title !== '未定') {
      if (isDeathEnding) {
        return '【终局将至】游戏即将进入最终回合。最可能的仕途结局是「' + pred.title + '」' + legacyHint + '。终局叙事必须做到：(1)本回合为死亡结局——叙事应聚焦于角色临终前的心理活动、一生回忆闪回、周围人物的反应与哀恸，**严禁直接描写死亡过程本身**（死因定性与临终场景由系统单独展示，重复会破坏体验）；(2)回顾本局关键抉择与转折；(3)在叙事最末尾另起一行写【墓志铭】后接2-3句对人物一生的个性化评价（系统会自动提取展示，不会混入叙事正文，总计不超过100字）。' + echoSuffix;
      } else {
        return '【终局将至】游戏即将进入最终回合。最可能的仕途结局是「' + pred.title + '」' + legacyHint + '。终局叙事必须做到：(1)明确交代人物最终归宿与人生收束；(2)同时交代家族/家庭的最终状态（传承维度）；(3)回顾本局关键抉择与转折；(4)在叙事最末尾另起一行写【墓志铭】后接2-3句对人物一生的个性化评价（系统会自动提取展示，不会混入叙事正文，总计不超过100字）；(5)【v3.12.1强制】若本回合为驾崩/人生终局回合，JSON状态块必须输出 ending 结局字段（对象格式：{"ending": {"title": "结局名", "description": "结局描述20-50字"}}），输出 ending 后不得再给选项。' + echoSuffix;
      }
    } else if (pred.hint) {
      if (isDeathEnding) {
        return '【终局将至】游戏即将进入最终回合。' + pred.hint + '。当前命运已濒临绝境，叙事应聚焦于角色临终前的心理活动、一生回忆闪回、周围人物的反应，**严禁直接描写死亡过程**（死因定性由系统单独展示）。终局叙事末尾另起一行写【墓志铭】后接2-3句个性化总结（系统自动提取展示）。' + echoSuffix;
      } else {
        return '【终局将至】游戏即将进入最终回合。' + pred.hint + '。终局叙事必须明确交代人物最终命运与归宿，并在叙事最末尾另起一行写【墓志铭】后接2-3句个性化总结（系统自动提取展示）。' + echoSuffix;
      }
    }
  }
  // 死亡倒计时最后一轮：强化死亡叙事指令（修改：聚焦心理/回忆，不写死亡过程）
  if (GameState.deathCountdown === 1 && GameState.deathCountdownType > 0) {
    var deathTypeIdx = GameState.deathCountdownType - 1;
    if (deathTypeIdx >= 0 && deathTypeIdx < DEATH_NAMES.length) {
      return '【命悬一线】死亡已不可避免——最可能的结局是「' + DEATH_NAMES[deathTypeIdx] + '」。本回合叙事必须聚焦于角色临终前的心理活动、走马灯式的回忆闪回、周围人物的反应与哀恸，写出大厦将倾的绝望感。**严禁直接描写死亡过程本身**——死因定性与临终场景由系统单独展示，重复描写会破坏体验。不要在叙事中写【墓志铭】标记——若角色确认死亡，系统会单独展示完整墓志铭。' + echoSuffix;
    }
  }
  return '';
}
// ========== v3.8 END ==========

// 按回合号硬判节奏，返回 { pacing, directive }；规则与 SP 第12.2节一致
function getRhythmDirective(turn, background) {
  const t = turn;
  let r = null;

  // 优先级1：锚点事件窗口内 → ⚡反转
  for (const a of HISTORY_ANCHORS) {
    if (t >= a.start && t <= a.end) {
      const finaleExtra = a.id === 9 ? `
【终局强制·最高优先级】本锚点是游戏终点。朱元璋必须在本窗口（第${a.start}-${a.end}回，${a.time}）内驾崩；驾崩发生当回合的 JSON 状态块**必须包含 ending 结局字段**（含 title 与 description，按第11章结局规则根据玩家五项数值/阵营/好感结算结局，叙事不少于500字）。铁律：①驾崩只允许发生一次，本窗口之后朱元璋不得再出现、不得再次驾崩；②时间不得越过1398年，严禁书写建文、永乐年间任何剧情；③玩家若亲近燕王，最多在结局余韵中以一句"燕王就藩北平，北地风云暗涌"收束，严禁展开靖难；④输出 ending 后不得再给选项。` : '';
      r = { pacing: '反转', directive:
`【节奏指令·硬控】本回合处于历史锚点「${a.name}」事件窗口（第${a.start}-${a.end}回，历史时间：${a.time}）——${a.desc}。
本回合节奏必须为⚡反转：叙事800-1200字，长短句交替、以有冲击力的场面开头，写出格局骤变；给3个选项，其中必须有1个让玩家直接面对该事件；事件须在窗口内迎来高潮，不得拖延到窗口之外。${finaleExtra}` };
      break;
    }
  }
  // 优先级2：锚点前1-3回合 → 🔥紧迫
  if (!r) {
    for (const a of HISTORY_ANCHORS) {
      const dist = a.start - t;
      if (dist >= 1 && dist <= 3) {
        r = { pacing: '紧迫', directive:
`【节奏指令·硬控】距离历史锚点「${a.name}」还有${dist}回（预计第${a.start}回爆发，历史时间：${a.time}）——${a.desc}。
本回合节奏必须为🔥紧迫：叙事800-1200字，短句为主（单句不超过20字），急促紧张、命悬一线；给3个选项，至少1个涉及该锚点相关人物或当前时局（布局、打探、伏笔均可）。**严禁直接点名该事件名称或暗示其结果**（例如：对「胡惟庸案」只能写"丞相府近日风声紧""中书省公文堆积异常""故旧密访频繁"，不能说"胡惟庸将被诛""谋反案发"等）。允许以当事人"当前在世的活跃状态"登场作伏笔（如胡惟庸仍在居中用权、郭桓仍在户部理事），但不得预言其结局。**严禁提前触发后续锚点事件**：当前尚未发生的锚点事件既不可描写为"案发"、也不可作为"被调查/被牵连"的对象（例如第 19 回合：胡惟庸案尚在酝酿→可以写"中书省风声紧"；但郭桓案是更远的未来锚点→严禁写"锦衣卫查郭桓"或"户部账目被翻查"等指向郭桓案的具体情节）。⏰本回合时间推进**1-2个月**（紧迫节奏也要推进时间，禁止原地踏步），year/month 须相应后移。` };
        break;
      }
    }
  }
  // 优先级3：锚点后1-2回合 → 🌊沉淀
  if (!r) {
    for (const a of HISTORY_ANCHORS) {
      const after = t - a.end;
      if (after >= 1 && after <= 2) {
        r = { pacing: '沉淀', directive:
`【节奏指令·硬控】历史锚点「${a.name}」刚落幕${after}回，本回合节奏必须为🌊沉淀：叙事300-500字，长句、深沉内敛，写事件余波与劫后余生；给3个选项，以善后、清算、自保、反思为主；时间**必须跳跃12-24个月**（"半年后/一年后/两年后"），事件余波快速翻篇，不可在同一事件内纠缠。` };
        break;
      }
    }
  }
  // 优先级4：无事件回合 → 根据距离下一锚点距离细分节奏
  if (!r) {
    // 找下一个锚点的距离
    var distToNext = 999;
    var nextAnchorName = '';
    for (var ni = 0; ni < HISTORY_ANCHORS.length; ni++) {
      var na = HISTORY_ANCHORS[ni];
      if (na.start > t && (na.start - t) < distToNext) {
        distToNext = na.start - t;
        nextAnchorName = na.name;
      }
    }
    // v3.8.15: 动态呼吸节点检测——锚点刚结束且距下一锚点较远时，日常回合加入"呼吸"基调
    var isBreathing = false;
    for (var bi = 0; bi < HISTORY_ANCHORS.length; bi++) {
      var afterBreath = t - HISTORY_ANCHORS[bi].end;
      if (afterBreath >= 3 && afterBreath <= 4 && distToNext >= 4) {
        isBreathing = true;
        break;
      }
    }

    // 空白期后段（距下一锚点1-3回合）→ 🍃缓冲（伏笔渐浓）
    if (distToNext >= 1 && distToNext <= 3) {
      r = { pacing: '缓冲', directive:
      `【节奏指令·硬控】本回合距下一历史节点「${nextAnchorName}」还有${distToNext}回合，节奏为🍃缓冲（暗流涌动）：叙事500-800字，中长句、从容细腻但暗藏不安，写坊间传闻、制度异常、人物处境变化；给4个选项（含至少1个涉及朝堂风向/官场暗流）；⏰时间推进**4-6个月**。本回合的核心任务是让下一节点的伏笔越来越浓——允许以当事人「当前在世的活跃状态」登场（但严禁点名未来事件名称或预言结局）。所有出场人物、机构、制度必须符合当前年份的真实历史。` };
    } else {
    // 空白期前/中段 → 📜日常（蒙太奇快进）
    var breathNote = isBreathing ? '（锚点事件刚落幕不久，百姓与官员都在喘息——叙事中融入战后/案后余韵、民间恢复、角色日常生活的温度，不必急于推进新危机）' : '（常规政务 + 时间快进）';
    r = { pacing: '日常', directive:
      `【节奏指令·硬控】本回合无历史锚点临近，节奏为📜日常${breathNote}：叙事500-900字，平稳扎实、生活化细节，岁月流转；给4个经营型选项——其中至少1个必须是**建设类**选项（发展人脉/积累财富/培养门生/经营产业等），这些选择会在后续大案期成为自保资源；⏰时间**必须推进6-12个月**，允许蒙太奇式快进（「半年过去」「年关将至」「次年春」「转眼间已是洪武X年」），本回合的核心任务是推进年份向下一个历史锚点靠拢。所有出场人物、机构、制度必须符合当前年份的真实历史。` };
    }
    // v3.6: warrior acceleration (preserved)
    if (background === '淮西武将之后') {
      var inA = HISTORY_ANCHORS.some(function(a){return turn>=a.start && turn<=a.end+2;});
      if (!inA && turn > 5) {
        r.directive += '\n\n【⏩武将加速】当前无直接关联武将的核心锚点，时间推进幅度翻倍至12-24个月，快速推进到蓝玉案等武将切身锚点。';
      }
    }
  }

  // 种子引爆例外 + 强制对齐 JSON
  r.directive += `\n\n【⚡强制·种子例外与JSON】`;
  r.directive += `①种子引爆：若本回合你判断 current_state.seeds 中某颗种子达到引爆时机，必须在JSON的 seeds_triggered 字段中写入该种子ID（如 "seeds_triggered": ["修撰日历"]），同时将节奏升级为反转并写出引爆后果及对应数值变化，种子引爆优先于历史节奏。种子存活超过8回合将自动引爆，超过5个则最早的自动引爆。**正面种子**（type含"正面"）引爆时不用升级为反转，在当前节奏内自然融入正面事件即可（如贵人相助、民心归附、知己相交等），写出温暖/积极的叙事段落。**v3.8.20家庭联动**：种子引爆时，若玩家有在世配偶/子女，须在叙事中追加1句家庭反应（如"妻子连夜收拾细软""孩子在私塾被人指指点点"）——不增加数值效果，只让引爆更立体（示例见SP 14b.6路径B）。`;
  r.directive += `②除此之外**必须严格按上述节奏执行，JSON 状态块中的 pacing 字段必须填写「${r.pacing}」，不可填写其他值**（前端会校验，填错则整个状态块被丢弃、数值回合全不推进）；`;
  r.directive += `③year/month 须与当前历史年份的推进逻辑一致（反转/紧迫回合参照正在发生或即将爆发的历史事件时间点；日常/沉淀回合只需保证年份单调递增，不得倒退）；`;
  // v3.8.12: 显式告知AI当前年份，防止叙事文字中的年份与JSON状态块不一致
  var currentYearName = getYearName(GameState.year) || ('洪武' + (GameState.year - 1367) + '年');
  r.directive += `\n\n【⚠️年份硬控】当前回合为第${GameState.turn}回，当前年份为「${currentYearName}（${GameState.year}年）」${GameState.month ? '，当前月份为' + GameState.month + '月' : ''}。**叙事文字中提到的当前年份必须与JSON状态块的year字段完全一致**，不得出现叙事写"洪武十年"而JSON写1380这种不一致。`;
  r.directive += `④JSON 必须放在 \`{ ... }\` 代码块内，且紧跟在三个选项之后，用 \`---\` 分隔。`;
  return r;
}

// v3.8.5: P1-C 阵营极端值衰减（绝对值>80时每回合向0回落3点）
var DECAY_THRESHOLD = 80;
var DECAY_AMOUNT = 3;
function applyFactionDecay() {
  var f = GameState.factions;
  var decayLog = [];
  for (var key in f) {
    if (f.hasOwnProperty(key)) {
      var val = f[key];
      if (Math.abs(val) > DECAY_THRESHOLD) {
        var decay = val > 0 ? -DECAY_AMOUNT : DECAY_AMOUNT;
        f[key] = val + decay;
        decayLog.push(key + (decay > 0 ? '+' : '') + decay);
      }
    }
  }
  GameState.factionDecayThisTurn = decayLog.length > 0 ? decayLog.join(', ') : null;
  if (GameState.factionDecayThisTurn) {
    console.log('[阵营衰减]', GameState.factionDecayThisTurn);
  }
}

// v3.8.5: P1-D 圣眷风险（朱元璋猜忌机制）
// v3.8.15修复：暴跌需有因果——权力或声望偏高才会招忌（赵一#13）
// v3.8.18修复：①所有区域均需诱因（消除"天威莫测"无条件暴跌）②加入连续暴跌冷却（3回合内不重复）③诱因扩展到阵营权势+近期清洗
function applyFavorRisk() {
  var ef = GameState.emperor_feeling;
  var consecutive = GameState.consecutiveHighEfTurns;
  var a = GameState.attributes;
  var f = GameState.factions;
  
  // 重置暴跌记录
  GameState.favorCrashThisTurn = null;
  
  // 连续暴跌冷却：如果近3回合内已暴跌过，不再触发（防止连续断崖）
  if (GameState.favorCrashRecentTurns > 0) {
    GameState.favorCrashRecentTurns--;
    return;
  }
  
  // "有功可忌"——多维诱因检测（不再只看属性，也看阵营权势和政治环境）
  var hasProvocation = (
    a.power >= 45 || a.fame >= 40 ||              // 个人权势：权力或声望突出
    f.huaixi >= 60 || f.zhedong >= 60 ||          // 阵营坐大：任一主要阵营好感极高（结党之嫌）
    GameState.factionPurged && (                   // 有过清洗→皇帝疑心持续加重
      GameState.factionPurged.jinchen ||
      GameState.factionPurged.donggong ||
      GameState.factionPurged.huaixi
    )
  );
  
  // 无诱因则不触发——朱元璋虽多疑，也不会无缘无故发怒
  if (!hasProvocation) return;
  
  // === P1-10: 渐进衰减模式 ===
  
  // 警戒区：ef 40~69，连续>=3回合高圣眷 + 有权势可忌，25%概率每回合衰减
  if (ef >= 40 && ef < 70 && consecutive >= 3) {
    if (Math.random() < 0.25) {
      var decay = -(Math.floor(Math.random() * 4) + 2); // -2~-5
      GameState.emperor_feeling = ef + decay;
      GameState.favorCrashThisTurn = '功高遭忌' + decay;
      GameState.favorCrashRecentTurns = 3;
      console.log('[圣眷衰减]', GameState.favorCrashThisTurn, 'power:', a.power, 'fame:', a.fame);
      return;
    }
  }
  
  // 极端危险区：ef>=80，50%概率每回合衰减（因果关联：权势越大衰减越多）
  if (ef >= 80) {
    if (Math.random() < 0.50) {
      var decay = -(Math.floor(Math.random() * 4) + 3); // -3~-6 基础衰减
      // 因果关联：权势极大或有强阵营时额外扣减
      if (a.power >= 60 || countFactionsGTE(60) >= 1) {
        decay -= (Math.floor(Math.random() * 8) + 8); // 额外-8~-15
      }
      GameState.emperor_feeling = ef + decay;
      GameState.favorCrashThisTurn = '宠极生变' + decay;
      GameState.favorCrashRecentTurns = 3;
      console.log('[圣眷衰减]', GameState.favorCrashThisTurn, 'ef:', ef, 'power:', a.power);
      return;
    }
  }
  
  // 危险区：ef 70~79，40%概率每回合衰减（因果关联：权势/声望越大衰减越多）
  if (ef >= 70 && ef < 80) {
    if (Math.random() < 0.40) {
      var decay = -(Math.floor(Math.random() * 4) + 5); // -5~-8 基础衰减
      // 因果关联：权势或声望突出时额外扣减
      if (a.power >= 60 || a.fame >= 50) {
        decay -= (Math.floor(Math.random() * 6) + 5); // 额外-5~-10
      }
      GameState.emperor_feeling = ef + decay;
      GameState.favorCrashThisTurn = '宠极生厌' + decay;
      GameState.favorCrashRecentTurns = 3;
      console.log('[圣眷衰减]', GameState.favorCrashThisTurn, 'power:', a.power, 'fame:', a.fame);
      return;
    }
  }
}


// ========== v3.9: 锚点顺序强制控制（简化版——仅精确短语匹配） ==========

// v3.12.2: 统一皇帝驾崩词表——死亡检测(detectEmperorDeath)、锚点校验(ANCHOR_EXACT_PHRASES[9])统一引用此常量，新增词条只改一处
var EMPEROR_EXPIRY_KEYWORDS = [
  '朱元璋驾崩', '太祖驾崩', '太祖崩', '皇上驾崩', '朱元璋病逝', '太祖晏驾',
  '龙驭上宾', '大行皇帝', '圣上殡天', '皇帝殡天',
  '殡天', '宾天', '山陵崩'
];

// v3.9精确短语表：每个锚点对应一组"不可能误判"的短语
// 原则：短语必须足够特异，在正常叙事中不可能偶然出现
var ANCHOR_EXACT_PHRASES = {
  2: ['胡惟庸谋反', '胡惟庸被诛', '胡惟庸伏诛', '胡惟庸赐死',
      '胡案爆发', '胡案牵连', '胡惟庸案发', '胡惟庸叛逆',
      '胡惟庸下狱处死', '胡惟庸被杀'],
  3: ['空印案发', '空印案爆发', '空印事发', '空白盖印案发',
      '空白印信案', '空印案查处', '空印案追查'],
  4: ['郭桓贪腐案', '郭桓案发', '郭桓案爆发', '郭桓贪腐被查',
      '郭桓案牵连', '郭恒案', '郭恒贪腐案', '郭恒被查'],
  5: ['李善长案爆发', '李善长被赐死', '李善长赐死', '李善长案发',
      '李善长事败', '李善长案株连', '李善长被杀'],
  6: ['太子病逝', '朱标病逝', '太子之死', '太子薨逝',
      '朱标之死', '太子驾崩', '朱标薨', '太子病故不治'],
  7: ['蓝玉谋反', '蓝玉被诛', '蓝玉伏诛', '蓝案爆发',
      '蓝玉案发', '蓝玉案牵连', '蓝玉族灭', '蓝玉被杀', '蓝玉赐死'],
  8: ['锦衣卫权力巅峰', '诏狱人满为患'],
  9: EMPEROR_EXPIRY_KEYWORDS
};

// v3.12.1: 终局驾崩检测——AI在终局叙事中已写"驾崩"但忘记输出 ending 字段时的兜底触发
// 仅在终局窗口（processAITurn 中 turn >= 55 判定）内启用，避免误伤早期叙事
// 覆盖场景：AI 在锚点9窗口内/前提前写驾崩、或输出格式缺失 ending，导致结局不触发、选项照常渲染
function detectEmperorDeath(text) {
  if (!text) return false;
  // 1) 皇帝驾崩专用短语——直接命中（v3.12.2: 统一引用 EMPEROR_EXPIRY_KEYWORDS，与锚点校验同源）
  var direct = EMPEROR_EXPIRY_KEYWORDS;
  for (var i = 0; i < direct.length; i++) {
    if (text.indexOf(direct[i]) >= 0) return true;
  }
  // 2) 裸"驾崩/晏驾"——排除"太子驾崩/朱标驾崩/储君晏驾"等历史回顾（朱标死于锚点6，终局窗口内只作回顾）
  var generic = ['驾崩', '晏驾'];
  for (var g = 0; g < generic.length; g++) {
    var idx = text.indexOf(generic[g]);
    while (idx >= 0) {
      var prev = text.substring(Math.max(0, idx - 4), idx);
      if (prev.indexOf('太子') < 0 && prev.indexOf('朱标') < 0 && prev.indexOf('储君') < 0 && prev.indexOf('先帝') < 0) {
        return true;
      }
      idx = text.indexOf(generic[g], idx + 1);
    }
  }
  return false;
}

// 获取当前允许的最大锚点ID（第一个未完成的锚点）
function getAllowedMaxAnchorId() {
  if (!GameState.completedAnchors) GameState.completedAnchors = [];
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (!GameState.completedAnchors.includes(a.id)) {
      return a.id; // 第一个未完成的锚点
    }
  }
  // 所有锚点都已完成
  return HISTORY_ANCHORS[HISTORY_ANCHORS.length - 1].id;
}

// 锚点完成检测（回合 > anchor.end + 2 时标记完成）
function checkAnchorCompletion() {
  if (!GameState.completedAnchors) GameState.completedAnchors = [];
  var turn = GameState.turn;
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (turn > a.end + 2 && !GameState.completedAnchors.includes(a.id)) {
      GameState.completedAnchors.push(a.id);
      console.log('[锚点完成] 第' + turn + '回合，锚点「' + a.name + '」(id=' + a.id + ') 已完成');
    }
  }
}

// v3.9 AI输出校验：仅精确短语匹配，零误杀原则
function validateAnchorOrder(rawOutput) {
  if (!GameState.completedAnchors) GameState.completedAnchors = [];
  var maxAllowedId = getAllowedMaxAnchorId();
  var violations = [];
  
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (a.id <= maxAllowedId) continue; // 已允许，跳过
    
    var phrases = ANCHOR_EXACT_PHRASES[a.id];
    if (!phrases) continue;
    
    for (var p = 0; p < phrases.length; p++) {
      if (rawOutput.includes(phrases[p])) {
        violations.push('严禁提及「' + a.name + '」（检测到精确短语"' + phrases[p] + '"，该锚点尚未允许触发）');
        break; // 同一锚点只报一次
      }
    }
  }
  
  return violations.length > 0 
    ? { valid: false, violations: violations } 
    : { valid: true };
}

// v3.9: 动态硬禁令——生成当前回合的具体禁止描写清单，注入 dynamic_rules
function getHardForbiddenList() {
  var maxAllowed = getAllowedMaxAnchorId();
  var forbidden = [];
  
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (a.id <= maxAllowed) continue; // 已允许，跳过
    
    // 查找绑定此锚点的NPC
    var linkedNPCs = [];
    for (var npcName in NPC_ANCHOR_LINK) {
      if (NPC_ANCHOR_LINK[npcName].boundAnchor === a.id) {
        linkedNPCs.push(npcName);
      }
    }
    
    if (linkedNPCs.length > 0) {
      forbidden.push(
        linkedNPCs.join('、') + '目前活跃在世，严禁描写其「' + a.name
        + '」相关情节（不得写其谋反/被查/被诛/下狱/赐死/牵连/案发/病逝，不得暗示其未来命运，不得用预言式笔法）'
      );
    } else {
      forbidden.push('严禁描写「' + a.name + '」事件（尚未发生）');
    }
  }
  
  if (!forbidden.length) return '';
  return '【本回合硬禁令·最高优先级·违反即驳回】\n' + forbidden.join('\n');
}

// ========== v3.9 END ==========

// ========== v3.8.14: 死人出场硬校验 ==========
// NPC出场互动关键词——检测到已故NPC名字附近出现这些词，说明AI让死人"活"了
var DEAD_NPC_INTERACTION_WORDS = [
  '去见', '去找', '拜访', '拜见', '看望', '探望', '来到', '走到',
  '对你说', '说道', '说：', '笑道', '叹道', '怒道', '答道', '问道',
  '前来', '来访', '到访', '造访', '求见', '有请',
  '坐在', '站着', '走来', '赶来', '现身', '出现',
  '正在', '刚刚', '立刻', '马上', '派人', '传来',
  '书信', '口信', '传话', '带来'
];
// 安全语境词——死人名字出现在这些语境中是合法的（回忆/追悼）
var DEAD_NPC_SAFE_WORDS = [
  '回忆', '回想', '想起', '追悼', '追思', '追念', '缅怀',
  '生前', '故人', '已故', '亡故', '遗言', '遗物', '遗志', '遗训',
  '墓地', '陵墓', '坟', '祭奠', '上香', '烧纸', '牌位', '灵位',
  '病逝', '去世', '仙逝', '逝世', '过世', '殁', '薨', '殉',
  '当年', '昔日', '从前', '那时', '那年', '旧事', '往事'
];

// 校验AI输出是否让已故NPC以活人身份出场
function validateDeadNPCs(rawOutput, year) {
  if (!year) return { valid: true };
  var deadList = getDeadNPCs(year);
  if (!deadList.length) return { valid: true };
  var violations = [];
  var WINDOW = 30; // 检测窗口（字符数）
  
  for (var i = 0; i < deadList.length; i++) {
    var npc = deadList[i];
    var name = npc.name;
    var idx = rawOutput.indexOf(name);
    while (idx !== -1) {
      // 找到名字出现位置，检查上下文
      var start = Math.max(0, idx - WINDOW);
      var end = Math.min(rawOutput.length, idx + name.length + WINDOW);
      var context = rawOutput.substring(start, end);
      
      // 检查是否有安全语境词
      var isSafe = false;
      for (var s = 0; s < DEAD_NPC_SAFE_WORDS.length; s++) {
        if (context.includes(DEAD_NPC_SAFE_WORDS[s])) {
          isSafe = true;
          break;
        }
      }
      
      if (!isSafe) {
        // 检查是否有互动关键词
        var interactionFound = null;
        for (var w = 0; w < DEAD_NPC_INTERACTION_WORDS.length; w++) {
          if (context.includes(DEAD_NPC_INTERACTION_WORDS[w])) {
            interactionFound = DEAD_NPC_INTERACTION_WORDS[w];
            break;
          }
        }
        if (interactionFound) {
          violations.push('已故人物「' + name + '」(卒于' + npc.deathYear + '年)以活人身份出场（检测到"'+ interactionFound +'"，上下文："...' + context.substring(Math.max(0, context.indexOf(interactionFound) - 8), context.indexOf(interactionFound) + interactionFound.length + 8) + '..."）');
          break; // 同一个NPC只报一次
        }
      }
      
      // 继续搜索下一个出现位置
      idx = rawOutput.indexOf(name, idx + name.length);
    }
  }
  
  return violations.length > 0
    ? { valid: false, violations: violations }
    : { valid: true };
}
// ========== v3.8.14 死人校验 END ==========

// v3.9.2: 已删除旧版 generateAnchorAchievement（v3.8.19最高属性版），保留下方评分版（v3.8.20）

// ========== v3.8.20: 家庭上下文注入 + 氛围系统 + 种子联动 ==========

// v3.8.20: 生成家庭上下文提示（注入给AI，让叙事有事实锚点）
function getFamilyContext() {
  if (!GameState.family) return '';
  var f = GameState.family;
  var parts = [];
  
  // 配偶
  if (f.spouse) {
    if (f.spouse.status === '已故') {
      parts.push('妻已故');
    } else {
      parts.push('妻' + (f.spouse.name || '') + '安在');
    }
  }
  
  // 子女（按年龄排序，计算实际年龄）
  if (f.children && f.children.length > 0) {
    var currentYear = GameState.year;
    var childDescs = [];
    for (var i = 0; i < f.children.length; i++) {
      var c = f.children[i];
      if (c.status !== '在世') continue;
      var age = currentYear - (c.birthYear || currentYear);
      if (age < 0) age = 0;
      var label = c.gender === '女' ? '女' : (c.order === 1 ? '长子' : c.order === 2 ? '次子' : '子');
      if (age <= 2) childDescs.push(label + '（' + age + '岁，尚在襁褓）');
      else if (age <= 6) childDescs.push(label + '（' + age + '岁，稚嫩年幼）');
      else if (age <= 14) childDescs.push(label + '（' + age + '岁，正当启蒙）');
      else childDescs.push(label + '（' + age + '岁，已渐成人）');
    }
    if (childDescs.length > 0) parts.push(childDescs.join('，'));
  }
  
  // 父母
  var parentParts = [];
  if (f.parents) {
    if (f.parents.father) {
      if (f.parents.father.status === '已故') {
        parentParts.push('父已故');
      } else {
        var fAge = GameState.character.baseAge + (GameState.year - 1375) + 25;
        parentParts.push('父' + (fAge > 65 ? '年迈' : '安在'));
      }
    }
    if (f.parents.mother) {
      if (f.parents.mother.status === '已故') {
        parentParts.push('母已故');
      } else {
        parentParts.push('母安在');
      }
    }
  }
  if (parentParts.length > 0) parts.push(parentParts.join('，'));
  
  if (parts.length === 0) return '';
  return '【家庭近况】' + parts.join('。') + '。';
}

// v3.8.20: 生成家庭氛围提示（让家庭细节基调跟随主线）
function getFamilyAtmosphere() {
  if (!GameState.family) return '';
  var f = GameState.family;
  var hasSpouse = f.spouse && f.spouse.status === '在世';
  var hasChildren = f.children && f.children.some(function(c){ return c.status === '在世'; });
  if (!hasSpouse && !hasChildren) return '';
  
  var hints = [];
  var ef = GameState.emperor_feeling;
  var pw = GameState.attributes.power;
  
  // 最危险组合：权势大但圣眷低
  if (pw >= 70 && ef < 20) {
    hints.push('权势虽盛但圣眷已衰，家中气氛凝重——妻子夜里常惊醒，问你"是不是要出事了"');
  } else if (ef <= -20) {
    hints.push('天威渐远，妻子欲言又止，家中人心惶惶');
  } else if (ef >= 50) {
    hints.push('圣眷正隆，家中颇为安定，妻子面有喜色');
  }
  
  if (GameState.deathWarning > 0 && hasSpouse) {
    hints.push('大祸将至的气息弥漫，妻子已多日不曾安睡');
  }
  
  if (pw >= 70 && GameState.deathCountdown === 0 && hasSpouse) {
    hints.push('府上访客渐多，妻子暗自忧虑——她懂得"功高震主"的道理');
  }
  
  if (GameState.currentFamilyCrisis && hasChildren) {
    hints.push('家中孩子感受到紧张气氛，不敢大声说话');
  }
  
  if (hints.length === 0) {
    hints.push('家中暂安，妻儿如常度日');
  }
  
  return '【家庭氛围】' + hints.join('；') + '。';
}

// v3.8.20: 家庭事件→正面种子联动（路径A）
// 日常家庭事件触发后，50%概率种一颗正面种子，10回合冷却
function plantFamilySeed(eventId) {
  var turn = GameState.turn;
  // 冷却检查：10回合内最多1次
  var recentFamilySeed = GameState.seeds.some(function(s) {
    return s.source === 'family' && (turn - s.planted_turn) < 10;
  });
  if (recentFamilySeed) return;
  
  // 50%概率
  if (Math.random() > 0.5) return;
  
  var type = null;
  if (eventId === 'child_education') type = '贵人提携';
  else if (eventId === 'child_marriage') type = '人心归附';
  else if (eventId === 'grandchild') type = '知己相交';
  else if (eventId === 'old_age_reflection') type = '声名渐起';
  
  if (!type) return;
  
  var template = SEED_TEMPLATES[type];
  if (!template) return;
  
  var seed = {
    id: 'family_' + type + '_' + turn,
    type: type,
    planted_turn: turn,
    trigger_turn: turn + template.latency[0] + Math.floor(Math.random() * (template.latency[1] - template.latency[0] + 1)),
    source: 'family',
    _pendingNotif: true
  };
  
  GameState.seeds.push(seed);
  console.log('[家庭种子] 种下正面种子「' + type + '」（来源：家庭事件' + eventId + '）回合', turn);
}


// ========== v3.8.19: 阶段性成就系统（锚点达成评价） ==========
// 触发时机：锚点完成后的第3个回合（turn === anchor.end + 3）
// 三档评价：卓越(≥60)/稳健(40-59)/幸存(<40)，对应奖励+3/+2/+1
// 防重复：通过 GameState.lastAnchorAchieved 记录已触发的锚点ID
function generateAnchorAchievement(turn) {
  // 检查是否是锚点完成后的缓冲回合
  var targetAnchor = null;
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (turn === a.end + 3) {
      targetAnchor = a;
      break;
    }
  }
  if (!targetAnchor) return null;
  
  // 防重复
  if (GameState.lastAnchorAchieved === targetAnchor.id) return null;
  GameState.lastAnchorAchieved = targetAnchor.id;
  
  // 计算评分（0-100）
  // 评分维度：属性健康度 + 圣眷安全度 + 阵营稳定性
  var a = GameState.attributes;
  var f = GameState.factions;
  var ef = GameState.emperor_feeling;
  var score = 0;
  
  // 1. 属性健康度（40分满分）
  // 综合评估：属性不极端（不全低也不全高），有一定积累
  var attrAvg = (a.power + a.people + a.wisdom + a.bond + a.fame) / 5;
  var attrScore = Math.min(40, Math.round(attrAvg * 0.4));
  
  // 2. 圣眷安全度（30分满分）
  // ef在20-50区间最佳（太低危险，太高也危险）
  var efScore = 0;
  if (ef >= 20 && ef <= 50) efScore = 30;
  else if (ef >= 10 && ef <= 60) efScore = 20;
  else if (ef >= 0 && ef <= 70) efScore = 15;
  else if (ef < -20) efScore = 5;
  else if (ef > 70) efScore = 10; // 太高也有风险
  else efScore = 8;
  
  // 3. 阵营稳定性（30分满分）
  // 评估：没有极端阵营（没有>=70或<=-50），整体均衡
  var factionStability = 0;
  var extremeCount = 0;
  for (var fk in f) {
    if (Math.abs(f[fk]) >= 70) extremeCount++;
    if (Math.abs(f[fk]) >= 50) factionStability -= 3;
    else if (Math.abs(f[fk]) <= 40) factionStability += 6;
  }
  factionStability = Math.max(0, Math.min(30, 30 + factionStability - extremeCount * 10));
  
  score = attrScore + efScore + factionStability;
  score = Math.max(0, Math.min(100, score));
  
  // 评价分档
  var tier, bonus, bonusLabel, text;
  if (score >= 60) {
    tier = '卓越';
    bonus = 3;
    bonusLabel = '全属性';
    text = '「' + targetAnchor.name + '」安然度过，表现卓越';
  } else if (score >= 40) {
    tier = '稳健';
    bonus = 2;
    bonusLabel = '随机属性';
    text = '「' + targetAnchor.name + '」平稳度过，应对稳健';
  } else {
    tier = '幸存';
    bonus = 1;
    bonusLabel = '随机属性';
    text = '「' + targetAnchor.name + '」险中求存，劫后余生';
  }
  
  // 应用奖励
  if (tier === '卓越') {
    // 全属性+3
    for (var ak in GameState.attributes) {
      GameState.attributes[ak] = Math.min(100, GameState.attributes[ak] + bonus);
    }
  } else {
    // 随机选2个属性+bonus
    var attrKeys = Object.keys(GameState.attributes);
    var shuffled = attrKeys.sort(function() { return 0.5 - Math.random(); });
    for (var ri = 0; ri < 2; ri++) {
      GameState.attributes[shuffled[ri]] = Math.min(100, GameState.attributes[shuffled[ri]] + bonus);
    }
  }
  
  console.log('[成就系统] 锚点「' + targetAnchor.name + '」达成评价：' + tier + '（' + score + '分）奖励：' + bonusLabel + '+' + bonus);
  
  // ===== v3.9.2: 成就持久化 =====
  var achRecord = {
    anchorId: targetAnchor.id,
    anchorName: targetAnchor.name,
    tier: tier,
    score: score,
    text: text,
    bonus: bonus,
    bonusLabel: bonusLabel,
    earnedTurn: GameState.turn
  };
  // 记录到本局 GameState
  if (!Array.isArray(GameState.achievements)) GameState.achievements = [];
  GameState.achievements.push(achRecord);
  // 跨局持久化：累积所有历史成就（新游戏也保留）
  try {
    var allAch = JSON.parse(localStorage.getItem('mingshi_all_achievements') || '[]');
    allAch.push(achRecord);
    localStorage.setItem('mingshi_all_achievements', JSON.stringify(allAch));
  } catch (e) { console.warn('[成就] localStorage写入失败:', e); }
  
  return { text: text, bonus: bonus, bonusLabel: bonusLabel, tier: tier, score: score };
}

// ========== P2-5: 家庭成员AI命名机制 ==========
function getFamilyNamingPrompt() {
  if (!GameState.family) return '';
  var unnamed = [];
  var f = GameState.family;
  if (f.spouse && !f.spouse.name) {
    unnamed.push('\u59bb\u5b50\uff08\u80cc\u666f\uff1a' + (f.spouse.background || '\u672a\u77e5') + '\uff09');
  }
  if (f.parents.father && f.parents.father.status === '\u5728\u4e16' && !f.parents.father.name) {
    unnamed.push('\u7236\u4eb2\uff08\u80cc\u666f\uff1a' + (f.parents.father.background || '\u672a\u77e5') + '\uff09');
  }
  if (f.parents.mother && f.parents.mother.status === '\u5728\u4e16' && !f.parents.mother.name) {
    var motherDesc = '\u6bcd\u4eb2';
    if (f.parents.mother.background) {
      motherDesc += '\uff08\u80cc\u666f\uff1a' + f.parents.mother.background + '\uff09';
    }
    unnamed.push(motherDesc);
  }
  for (var i = 0; i < f.children.length; i++) {
    if (!f.children[i].name) {
      unnamed.push('\u7b2c' + (i + 1) + '\u4e2a\u5b69\u5b50\uff08' + (f.children[i].gender || '?') + '\uff09');
    }
  }
  if (unnamed.length === 0) return '';
  return '\u3010\u5bb6\u5ead\u547d\u540d\u3011\u4ee5\u4e0b\u5bb6\u5ead\u6210\u5458\u5c1a\u672a\u547d\u540d\uff0c\u8bf7\u5728\u53d9\u4e8b\u4e2d\u81ea\u7136\u63d0\u53ca\u540d\u5b57\uff0c\u5e76\u5728JSON\u4e2d\u7528 family_name_updates \u5b57\u6bb5\u56de\u5199\uff1a' +
    '"family_name_updates": [{"target":"spouse","name":"\u5f20\u6c0f"},{"target":"child_0","name":"\u8d75\u660e"}]\u3002' +
    '\u547d\u540d\u987b\u7b26\u5408\u660e\u4ee3\u98ce\u683c\uff08\u5982\u5f20\u6c0f\u3001\u674e\u6c0f\u3001\u8d75\u660e\u3001\u8d75\u5a49\u7b49\uff09\uff0c\u4e0e\u5bb6\u5ead\u80cc\u666f\u5339\u914d\u3002\u9700\u8981\u547d\u540d\u7684\u6210\u5458\uff1a' + unnamed.join('\u3001');
}

function processFamilyNames(familyNameUpdates) {
  if (!familyNameUpdates || !Array.isArray(familyNameUpdates) || !GameState.family) return;
  var f = GameState.family;
  for (var i = 0; i < familyNameUpdates.length; i++) {
    var u = familyNameUpdates[i];
    if (u.target === 'spouse' && f.spouse) {
      f.spouse.name = u.name;
    } else if (u.target === 'father' && f.parents.father) {
      f.parents.father.name = u.name;
    } else if (u.target === 'mother' && f.parents.mother) {
      f.parents.mother.name = u.name;
    } else if (u.target && u.target.indexOf('child_') === 0) {
      var idx = parseInt(u.target.split('_')[1]);
      if (f.children[idx]) {
        f.children[idx].name = u.name;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// v3.9.0: 情感锚点系统 (Emotional Anchors)
// ═══════════════════════════════════════════════════════════════════

// 初始化情感记忆存储
if (typeof GameState.emotionalMemory === 'undefined') {
  GameState.emotionalMemory = [];
}

// ========== v3.14.0: 公共工具（P1-2 重复代码抽取） ==========
// ========== v3.15.0: 前元线分支过滤（P1：出身线EA扩展） ==========
// 当前回合是否为情感锚点（EA）触发回合（checkFamilyCrisis / checkLifeEvents / canTriggerCrisis 共用）
function isEATurn(turn) {
  var bg = GameState.character.background;
  var branch = (GameState.character || {}).qyBranch || null;
  if (typeof EMOTIONAL_ANCHORS === 'undefined' || !EMOTIONAL_ANCHORS[bg]) return false;
  var anchors = EMOTIONAL_ANCHORS[bg];
  for (var i = 0; i < anchors.length; i++) {
    if (anchors[i].triggerTurn === turn) {
      // v3.15.0: 前元线分支过滤——EA带branch字段且与当前分支不符时跳过
      // 无branch字段或branch==='shared'视为两分支共享；qyBranch未设置时（T8之前）不做过滤，行为与旧版一致
      if (anchors[i].branch && anchors[i].branch !== 'shared' && branch && anchors[i].branch !== branch) continue;
      return true;
    }
  }
  return false;
}

/**
 * 检测当前回合是否触发情感锚点，返回格式化指令供AI使用
 * 支持新旧两种格式：通过 matched.coreEvent/sceneDirective 判断新格式（导演指令模式）
 * @param {number} turn - 当前回合
 * @param {string} background - 玩家出身背景
 * @returns {string} 格式化指令，无匹配返回空字符串
 */
function getEmotionalAnchorDirective(turn, background) {
  if (typeof EMOTIONAL_ANCHORS === 'undefined' || !EMOTIONAL_ANCHORS[background]) return '';

  var anchors = EMOTIONAL_ANCHORS[background];
  var branch = (GameState.character || {}).qyBranch || null;
  var matched = null;
  for (var i = 0; i < anchors.length; i++) {
    if (anchors[i].triggerTurn === turn) {
      // v3.15.0: 前元线分支过滤（与 isEATurn 保持一致）
      if (anchors[i].branch && anchors[i].branch !== 'shared' && branch && anchors[i].branch !== branch) continue;
      matched = anchors[i];
      break;
    }
  }
  if (!matched) return '';

  // v3.14.0（P1-6）: EA 配置已全部收敛为内联对象（导演指令模式，含 coreEvent/sceneDirective），
  // 删除旧格式（完整剧本模式）分支，统一走 _buildDirectorDirective
  var result = _buildDirectorDirective(matched, turn);

  // v3.11.0d: 家庭叙事回响——为EA注入家庭危机选择上下文
  var familyCtx = getFamilyContextForEA(matched.id);
  if (familyCtx) {
    result += '\n\n' + familyCtx;
  }

  return result;
}

/**
 * 新格式：拼装导演指令文本
 */
function _buildDirectorDirective(matched, turn) {
  var lines = [];
  lines.push('═══════════════════════════════════════');
  lines.push('【情感锚点·' + matched.title + '】（导演指令模式）');
  lines.push('═══════════════════════════════════════');
  lines.push('');

  // 1. 核心事件
  lines.push('▌核心事件：' + matched.coreEvent);
  lines.push('▌情感弧线：' + matched.emotionalArc);
  lines.push('');

  // 2. 关键节拍
  lines.push('▌关键节拍（必须按此顺序出现）：');
  for (var b = 0; b < matched.keyBeats.length; b++) {
    lines.push('  ' + (b + 1) + '. ' + matched.keyBeats[b]);
  }
  lines.push('');

  // 3. 场景指令
  var sd = matched.sceneDirective;
  lines.push('▌场景指令：');
  lines.push('  地点：' + sd.location);
  lines.push('  时间：' + sd.time);
  lines.push('  氛围：' + sd.atmosphere);
  lines.push('  必须出现：' + sd.requiredElements.join('、'));
  if (sd.forbiddenPatterns && sd.forbiddenPatterns.length > 0) {
    lines.push('  禁用表达：' + sd.forbiddenPatterns.join('、'));
  }
  // v3.11.0b: 场景接续约束——强制AI保持时间线连贯
  lines.push('  ★接续约束：本场景必须紧接上回合叙事结尾的时间与情境，不得出现时间矛盾（如上回合白天回家，本回合不可变成晚归）');
  lines.push('');

  // 4. 角色指令
  var cd = matched.characterDirective;
  lines.push('▌角色指令：');
  var npcNames = Object.keys(cd);
  for (var n = 0; n < npcNames.length; n++) {
    var npcName = npcNames[n];
    var npcDir = cd[npcName];
    lines.push('  【' + npcName + '】');
    lines.push('    状态：' + npcDir.state);
    lines.push('    说话风格：' + npcDir.speechStyle);
    lines.push('    外貌/动作：' + npcDir.physicalDetails.join('，'));
  }
  lines.push('');

  // 5. 基调指令
  var td = matched.toneDirective;
  lines.push('▌基调指令：');
  lines.push('  ' + td.overall);
  lines.push('  技法：' + td.technique);
  lines.push('  节奏：' + td.pacing);
  lines.push('');

  // 6. 条件节拍（检查emotionalMemory判断哪些已触发）
  if (matched.conditionalBeats && matched.conditionalBeats.length > 0) {
    var anyTriggered = false;
    var beatLines = [];
    for (var cb = 0; cb < matched.conditionalBeats.length; cb++) {
      var beat = matched.conditionalBeats[cb];
      if (checkConditionalBeat(beat.condition)) {
        anyTriggered = true;
        beatLines.push('  ✓ [已触发] ' + beat.beat);
        beatLines.push('    设计意图：' + beat.implication);
      }
    }
    if (anyTriggered) {
      lines.push('▌条件节拍（根据玩家历史选择触发）：');
      for (var bl = 0; bl < beatLines.length; bl++) {
        lines.push(beatLines[bl]);
      }
      lines.push('');
    }
  }

  // 7. 选项方向
  lines.push('▌选项方向（你来生成具体文字，方向如下）：');
  for (var d = 0; d < matched.choiceDirections.length; d++) {
    var dir = matched.choiceDirections[d];
    lines.push('  ' + dir.label + '. 方向：' + dir.direction);
    lines.push('     情感：' + dir.emotionalNote);
    lines.push('     余波方向：' + dir.rippleHint);
  }
  lines.push('');

  // 8. 记忆模板
  if (matched.memoryTemplate) {
    lines.push('▌记忆提取（请在stateBlock.ea_memory_quote中填入关键引语）：');
    lines.push('  提取规则：' + matched.memoryTemplate.extractionRule);
    lines.push('');
  }

  // 9. 输出格式要求
  var labelStr = matched.choiceDirections.map(function(c) { return c.label; }).join('/');
  lines.push('▌输出要求（重要）：');
  lines.push('1. 根据以上指令自由创作场景、对话和叙事，不要机械复述指令内容');
  lines.push('2. 意象"' + matched.memoryItem + '"必须在场景中自然出现');
  lines.push('3. 叙事结束后，在stateBlock中输出以下字段：');
  lines.push('   - "ea_option_text": {"A": "选项A具体文字", "B": "选项B具体文字", "C": "选项C具体文字"}');
  lines.push('   - "ea_memory_quote": "从对话中提取的关键引语"');
  lines.push('   - "ea_ripple_text": {"A": "选A的余波", "B": "选B的余波", "C": "选C的余波"}');
  lines.push('   - "emotional_anchor_choice": "' + labelStr + '"之一');
  lines.push('4. 选项文字要简洁（每条≤30字），适合按钮展示');
  lines.push('');

  // 10. 设计意图
  if (matched.designNote) {
    lines.push('▌设计意图·仅供你理解精神：');
    lines.push(matched.designNote);
  }

  // 标记当前触发状态（新格式）
  GameState.currentEmotionalAnchor = {
    id: matched.id,
    turn: turn,
    npc: matched.requiredNPCs.join('、'),
    memoryItem: matched.memoryItem,
    choiceDirections: matched.choiceDirections,
    linksTo: matched.linksTo || null,
    isNewFormat: true
  };

  return lines.join('\n');
}


/**
 * 检查条件节拍是否满足
 * 条件格式：'EA-XX-N选Y'，如 'EA-HW-2选A'
 * @param {string} condition - 条件表达式
 * @returns {boolean}
 */
function checkConditionalBeat(condition) {
  if (!condition) return false;
  // v3.15.2-P2: 前元线分支表达式（branchChoice === "亲北" / qyBranch === "亲北"）→ 检查 QY-2 设置的 qyBranch
  var branchMatch = condition.match(/^(?:qyBranch|branchChoice)\s*===\s*["'](.+?)["']$/);
  if (branchMatch) {
    return !!(GameState.character && GameState.character.qyBranch === branchMatch[1]);
  }
  if (!GameState.emotionalMemory || GameState.emotionalMemory.length === 0) return false;
  // v3.15.2-P2: 正则放宽，兼容新EA id（EA-HW-NEW-F / EA-QY-NEW-GW2 / EA-HW-NEW-D）与旧id（EA-HW-10）
  var match = condition.match(/^(EA-[A-Z0-9]+(?:-[A-Z0-9]+)*)选([A-C])$/);
  if (!match) return false;
  var targetAnchorId = match[1];
  var targetChoice = match[2];
  for (var i = 0; i < GameState.emotionalMemory.length; i++) {
    var mem = GameState.emotionalMemory[i];
    if (mem.anchorId === targetAnchorId && mem.choice === targetChoice) {
      return true;
    }
  }
  return false;
}

/**
 * 记录玩家的情感锚点选择及其余波
 * @param {string} choiceLabel - 玩家选择的标签（A/B/C）
 */
function recordEmotionalChoice(choiceLabel) {
  if (!GameState.currentEmotionalAnchor) return;

  var anchor = GameState.currentEmotionalAnchor;

  // v3.14.0（P1-6）: EA 已全部收敛为新格式（导演指令模式），删除旧格式分支
  // 从GameState临时字段获取AI生成的数据
  var dirData = null;
  for (var i = 0; i < anchor.choiceDirections.length; i++) {
    if (anchor.choiceDirections[i].label === choiceLabel) {
      dirData = anchor.choiceDirections[i];
      break;
    }
  }
  // v3.15.0: 前元线分支选择——EA-QY-2（月夜）的选择设置 qyBranch（A=亲明/B=亲北/C=默认亲明）
  // 其他EA无branchChoice字段，dirData.branchChoice为undefined，不生效，向后兼容
  if (dirData && dirData.branchChoice) {
    if (!GameState.character.qyBranch) GameState.character.qyBranch = dirData.branchChoice;
    console.log('[情感锚点V2] 前元线分支设定：' + anchor.id + ' → ' + choiceLabel + ' → ' + dirData.branchChoice);
  }
  var aiRipple = (GameState._pendingEaRipple && GameState._pendingEaRipple[choiceLabel])
                 || (dirData ? dirData.rippleHint : '');
  var aiQuote = GameState._pendingEaMemoryQuote || '';

  if (!GameState.emotionalMemory) GameState.emotionalMemory = [];
  GameState.emotionalMemory.push({
    anchorId: anchor.id,
    turn: anchor.turn,
    npc: anchor.npc,
    choice: choiceLabel,
    ripple: aiRipple,
    memoryQuote: aiQuote,
    memoryItem: anchor.memoryItem,
    linksTo: anchor.linksTo,
    version: 2
  });
  console.log('[情感锚点V2] 记录：' + anchor.id + ' → ' + choiceLabel +
    ' | 余波：' + aiRipple + ' | 引语：' + aiQuote);

  // 清理临时字段
  GameState._pendingEaRipple = null;
  GameState._pendingEaMemoryQuote = null;
  GameState._pendingEaOptions = null;

  // v3.9.1: EA-HW-3"初为人父"特殊处理——同步更新family状态，防止child1重复触发
  if (anchor.id === 'EA-HW-3' && GameState.family) {
    // 标记child1为已触发，防止后续生活事件再触发"第一个孩子"
    if (GameState.lifeEventsTriggered.indexOf('child1') < 0) {
      GameState.lifeEventsTriggered.push('child1');
    }
    // 将孩子加入family.children
    var hasChild = GameState.family.children.some(function(c) { return c.order === 1; });
    if (!hasChild) {
      GameState.family.children.push({
        name: '', birthTurn: anchor.turn, birthYear: anchor.turn === 10 ? (GameState.year || 1380) : GameState.year,
        gender: Math.random() > 0.5 ? '男' : '女',
        status: '在世', order: 1,
        source: 'EA-HW-3'  // 标记来源，便于调试
      });
      console.log('[情感锚点] EA-HW-3同步：添加第一个孩子到family');
    }
  }

  // 清除当前触发状态
  GameState.currentEmotionalAnchor = null;
}

/**
 * 获取情感记忆摘要，用于后续叙事引用
 * @returns {string} 情感记忆摘要
 */
function getEmotionalMemorySummary() {
  if (!GameState.emotionalMemory || GameState.emotionalMemory.length === 0) return '';

  var lines = ['【情感记忆·你曾做出的选择】'];
  for (var i = 0; i < GameState.emotionalMemory.length; i++) {
    var m = GameState.emotionalMemory[i];
    lines.push('· 第' + m.turn + '回合·' + m.npc + '：' + m.ripple);
  }
  lines.push('');
  lines.push('在后续叙事中，请自然引用这些记忆——不要直接复述，而是通过细节、动作、对话回响。');
  return lines.join('\n');
}


// ========================================================================
// ========== v3.12.0 生死危机事件层 — Phase 1 MVP ========================
// ========================================================================

// ---------- 枚举常量 ----------
var HEALTH_LEVELS = ['健康', '受伤', '重伤', '濒死'];
var MENTAL_LEVELS = ['稳定', '焦虑', '崩溃边缘', '崩溃'];

// ---------- 调度器配置 ----------
var CRISIS_SCHEDULER = {
  windows: [
    { group: 1, eventIds: ['crisis_1', 'crisis_2'],         windowStart: 3,  windowEnd: 12, label: '早期·刘伯温之死前后' },
    { group: 2, eventIds: ['crisis_3', 'crisis_4'],         windowStart: 10, windowEnd: 20, label: '胡惟庸案前后' },
    { group: 3, eventIds: ['crisis_5', 'crisis_6'],         windowStart: 16, windowEnd: 26, label: '胡案收尾到空印案' },
    { group: 4, eventIds: ['crisis_7', 'crisis_8'],         windowStart: 23, windowEnd: 31, label: '空印案后到郭桓案' },
    { group: 5, eventIds: ['crisis_9', 'crisis_10'],        windowStart: 31, windowEnd: 37, label: '郭桓案后到李善长案' },
    { group: 6, eventIds: ['crisis_11', 'crisis_12'],       windowStart: 41, windowEnd: 49, label: '太子之死与蓝玉案' },
    { group: 7, eventIds: ['crisis_13', 'crisis_14', 'crisis_15'], windowStart: 49, windowEnd: 56, label: '蓝玉案后到终局前' },
    { group: 8, eventIds: ['crisis_finale'],                windowStart: 57, windowEnd: 60, label: '终局·帝王崩天命落', isFinale: true }
  ],
  constraints: {
    minIntervalBetweenCrisis: 3,
    minIntervalFromAnchor: 2,
    hardDeadline: 57,
    noCrisisAfter: 57
  }
};

// ---------- 前3个危机事件配置 ----------
var CRISIS_STORY_EVENTS = [
  // ===== crisis_1: 血溅庆功宴 =====
  {
    id: 'crisis_1',
    title: '血溅庆功宴',
    type: 'C',
    window: { start: 3, end: 8 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return true; },
    triggerProbability: 0.85,
    originVariants: {
      '淮西武将之后': { conflictDesc: '冲突双方是你的同袍，你被迫站队', npcName: '赵百户', relation: '淮西旧部' },
      '浙东寒门书生': { conflictDesc: '你是被羞辱的弱势方，锦衣卫在观察每个人的反应', npcName: '钱主事', relation: '浙东同僚' },
      '应天府商贾之子': { conflictDesc: '你的父亲在宴上被人当众嘲笑「商贾贱类」', npcName: '赵百户', relation: '淮西武将' },
      '落魄前元官员之后': { conflictDesc: '有人翻出你家的前朝旧事，锦衣卫的笔已经蘸好了墨', npcName: '钱主事', relation: '暗中窥探者' }
    },
    backgroundStory: '洪武五年秋，南京城外大校场。朝廷为平定蜀地的将士举办庆功宴，你作为低品级官员列席。宴席过半，两名淮西勋贵因座次之争发生口角。赵百户醉后掀桌，碎瓷片划破了钱主事的面颊。鲜血溅在御赐的宴席上。全场死寂。锦衣卫的暗哨已经在记录每个人的反应。',
    sceneDescription: '碎瓷上的血迹还未干涸，锦衣卫校尉的笔已经蘸好了墨。他看向你的眼神，像屠夫打量牲口。',
    narrativeDirective: '这是玩家第一次体验「被权力碾压」的感觉。无论选择什么，都要让玩家感受到——在这个世界里，不说话也可能有罪。',
    choices: [
      {
        id: 'A', label: '据实禀报——如实描述事件经过，不偏不倚',
        primaryAttr: 'wisdom', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '锦衣卫记录在案，两方都不满意但你保全了名声', effects: { fame: 3 } },
          normal: { desc: '双方都觉得你多事，但没有深究', effects: { fame: -2, power: -1 } },
          unfavorable: { desc: '双方都认为你「不识趣」，权势受损', effects: { power: -4, fame: -3 } }
        },
        tags: { '锦衣卫档案·多事': { permanent: true, affectsCrises: ['crisis_5', 'crisis_10'] } },
        healthImpact: null,
        mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '替赵百户圆场——声称是「同袍酒后嬉戏」',
        primaryAttr: 'power', threshold: 45, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '赵百户感激，权势提升', effects: { power: 4, huaixi: 5 } },
          normal: { desc: '圆场成功但锦衣卫起疑', effects: { power: 1, jinchen: -3 } },
          unfavorable: { desc: '锦衣卫认为你作伪证，记入黑名单', effects: { power: -5, jinchen: -5 } }
        },
        tags: { '淮西人情': { expiresAt: 20, affectsCrises: ['crisis_3'] } },
        healthImpact: null, mentalImpact: null
      },
      {
        id: 'C', label: '沉默不语——以「品级低微不敢妄言」推脱',
        primaryAttr: 'wisdom', threshold: 45, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '锦衣卫对你的谨慎印象深刻', effects: { wisdom: 2, fame: 1 } },
          normal: { desc: '上峰不满但未发作', effects: { fame: -1 } },
          unfavorable: { desc: '上峰当众斥责你「枉为朝廷命官」', effects: { fame: -4, bond: -2 } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    chainsTo: ['crisis_5', 'crisis_10'],
    chainEffect: function(gs, choiceId, outcome) {
      if (choiceId === 'A' && gs.crisisTags && gs.crisisTags['锦衣卫档案·多事']) {
        return { crisis_5: { difficultyMod: 1 }, crisis_10: { difficultyMod: 1 } };
      }
      return {};
    }
  },

  // ===== crisis_2: 老仆蒙冤 =====
  {
    id: 'crisis_2',
    title: '老仆蒙冤',
    type: 'A',
    window: { start: 4, end: 8 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: { type: 'originNPC', key: '老仆', states_alive: ['alive'] },
    triggerCondition: function(gs) { return gs.turn >= 4; },
    triggerProbability: 0.80,
    originVariants: {
      '淮西武将之后': { npcName: '赵福', relation: '跟了舅舅蓝玉三十年的老仆' },
      '浙东寒门书生': { npcName: '福伯', relation: '恩师宋濂介绍来的老家仆' },
      '应天府商贾之子': { npcName: '阿贵', relation: '老伙计陈三的徒弟' },
      '落魄前元官员之后': { npcName: '陈伯', relation: '母亲的前元旧仆' }
    },
    backgroundStory: '你收到消息时正在吃晚饭——家中年过六旬的老仆被锦衣卫抓走了。罪名骇人听闻：「私通倭寇，出卖海防水利图」。锦衣卫声称在老仆的包袱里搜出了一幅海防图。你知道老仆大字不识几个，根本画不出那种图。但锦衣卫不管——他们正在借刘伯温案的余波大索「浙东党」和「通倭嫌疑」。',
    sceneDescription: '诏狱的铁门在身后合上。黑暗中传来一个老人的呻吟——你认得那个声音，他叫你「少爷」叫了三十年。',
    narrativeDirective: '这是玩家第一次面对「亲密NPC可能真的会死」。必须让玩家感受到诏狱的恐怖和时间的紧迫。',
    countdownTurns: 5,
    countdownDescription: '老仆在诏狱中的状况逐回合恶化',
    countdownStates: [
      { turn: 0, desc: '被上夹棍，手指可能骨折' },
      { turn: 1, desc: '被灌辣椒水，昏迷' },
      { turn: 2, desc: '被威胁「不招就杀」，开始说胡话' },
      { turn: 3, desc: '被认定「拒不招供」，准备移交刑部' },
      { turn: 4, desc: '移交刑部，翻案概率降至10%' }
    ],
    choices: [
      {
        id: 'A', label: '动用一切人脉打探消息，找出是谁举报了老仆',
        primaryAttr: 'power', threshold: 40, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '发现是仇家构陷，找到证据翻案', effects: { power: -3, bond: 5 }, npcFate: '获释但终身残疾' },
          normal: { desc: '打探到部分信息，勉强翻案', effects: { power: -5 }, npcFate: '获释但断两根肋骨' },
          unfavorable: { desc: '打探行为被锦衣卫发现，自己也被列入嫌疑', effects: { power: -6, jinchen: -8 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null,
        mentalImpact: function(outcome) { return outcome === 'unfavorable' ? '崩溃边缘' : '焦虑'; }
      },
      {
        id: 'B', label: '买通看守送药送食，给老仆续命',
        primaryAttr: 'wisdom', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '老仆撑住没被屈打成招，争取到时间', effects: { wisdom: -2, bond: 3 }, npcFate: '获释但终身残疾' },
          normal: { desc: '看守收了钱但效果有限', effects: { power: -2 }, npcFate: '获释但重伤' },
          unfavorable: { desc: '看守是锦衣卫的人，被视为干扰办案', effects: { power: -5, jinchen: -5 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '直接递交保状——以「家仆清白」为由',
        primaryAttr: 'people', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '坦诚打动锦衣卫千户，同意暂缓', effects: { people: -3, fame: 3 }, npcFate: '获释但受伤' },
          normal: { desc: '保状被接受但从缓处理', effects: { people: -2 }, npcFate: '获释但受伤' },
          unfavorable: { desc: '保状被驳回，暴露了与嫌疑犯的关系', effects: { people: -4, jinchen: -5 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    npcDeathConsequence: {
      tag: '丧亲之痛', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及忠仆/老人/亲情的场景'
    },
    chainsTo: [],
    chainEffect: null
  },

  // ===== crisis_3: 站队之祸 =====
  {
    id: 'crisis_3',
    title: '站队之祸',
    type: 'C',
    window: { start: 10, end: 19 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: ['胡惟庸'],
    triggerCondition: function(gs) { return true; },
    triggerProbability: 0.75,
    originVariants: {
      '淮西武将之后': { conflictDesc: '胡惟庸是你的「淮西同乡」，他认为你天然应该站他这边' },
      '浙东寒门书生': { conflictDesc: '你是「浙东党」的嫌疑对象，胡惟庸怀疑你对他不利' },
      '应天府商贾之子': { conflictDesc: '胡惟庸看中了你家的财力，要你的家族「赞助」' },
      '落魄前元官员之后': { conflictDesc: '胡惟庸需要一个「不是淮西也不是浙东」的人表忠心' }
    },
    backgroundStory: '胡惟庸的幕僚在一家酒肆的雅间里摆了一桌酒。在座的还有六位和你品级相近的中低品官员。幕僚不紧不慢地说了三件事：胡丞相最近要举荐一批「干练之才」；需要各位在朝会上「共同呈递一份奏疏」；奏疏的内容不重要，重要的是——署名。签了名，你就是「胡党」的人。但你也听说——皇帝最近对胡惟庸的「结党」越来越不满。',
    sceneDescription: '笔尖悬在纸上。六双眼睛盯着你。胡惟庸幕僚的笑容像一把没出鞘的刀。',
    narrativeDirective: '这是第一个「政治站队」事件。核心恐怖不在于当下的选择，而在于你知道——胡惟庸迟早要倒。选对了或选错了，都是在定时炸弹上跳舞。',
    choices: [
      {
        id: 'A', label: '签名入伙——在奏疏上署名',
        primaryAttr: 'power', threshold: 0, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '胡党接纳你，权势大增', effects: { power: 5, huaixi: 3 } },
          normal: { desc: '签名成功，但锦衣卫记住了你的脸', effects: { power: 3, jinchen: -5 } },
          unfavorable: { desc: '签名后才发现这是个试探局，你被记入名单', effects: { power: -2, jinchen: -8 } }
        },
        tags: { '胡党嫌疑': { permanent: true, affectsCrises: ['crisis_4'] } },
        healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '装醉推脱——声称醉酒，拿不稳笔',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '幕僚冷笑但没追究，你获得「骑墙」空间', effects: { wisdom: 2 } },
          normal: { desc: '推脱成功但被冷眼相待', effects: { fame: -1 } },
          unfavorable: { desc: '幕僚当场泼了你一杯冷水「醒酒」，全场哄笑', effects: { fame: -4, power: -3 } }
        },
        tags: { '骑墙者': { expiresAt: 25, affectsCrises: ['crisis_4'] } },
        healthImpact: null, mentalImpact: function(outcome) { return outcome === 'unfavorable' ? '崩溃边缘' : null; }
      },
      {
        id: 'C', label: '当众拒绝——直言「此事不合体制」',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '你的刚正令其他官员暗暗敬佩', effects: { people: 3, fame: 3 } },
          normal: { desc: '拒绝被接受，但气氛冰冷', effects: { fame: 1, power: -2 } },
          unfavorable: { desc: '幕僚记下你的名字，列入「不合作」名单', effects: { power: -4, jinchen: -3 } }
        },
        tags: { '清流之名': { permanent: true } },
        healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: ['crisis_4'],
    chainEffect: function(gs, choiceId, outcome) {
      if (choiceId === 'A' && gs.crisisTags && gs.crisisTags['胡党嫌疑']) {
        return { crisis_4: { difficultyMod: 2 } };
      }
      return {};
    }
  },
// v3.13.0 生死危机 Phase 2 事件配置（crisis_4 ~ crisis_8）

  // ===== crisis_4: 逆党名册 =====
  {
    id: 'crisis_4',
    title: '逆党名册',
    type: 'B',
    window: { start: 16, end: 20 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 16; },
    triggerProbability: 0.80,
    originVariants: {
      '淮西武将之后': { conflictDesc: '名册上有你舅舅旧部的名字。锦衣卫千户的手指在那些名字上敲了敲——"这些人，你认识几个？"' },
      '浙东寒门书生': { conflictDesc: '你的同窗林彦曾出入胡府。缇骑冷笑："浙东来的，果然都是一个窝里的。"' },
      '应天府商贾之子': { conflictDesc: '你家给胡府送过礼的记录被翻了出来。审理官翻开账册，语气平淡："说说这些银子。"' },
      '落魄前元官员之后': { conflictDesc: '有人诬告你是「前元余孽+胡党」双重身份。审理官看着你的籍贯，久久没有说话。' }
    },
    backgroundStory: '洪武十三年，胡惟庸被诛的消息像一颗炸弹在应天府炸开。你是在下值回衙的路上听到消息的——街上已经没有了行人，所有人都在家里关门闭户。然后锦衣卫来了。为首的缇骑拿出一份名册——「逆党名册」。上面有你的名字。不是因为你做了什么，而是因为你在前些日子的酒局上露过面，或你的名字被某人攀咬上去。「奉旨拿人。」缇骑的声音平静得像在读菜单。你被带到诏狱的一间审讯室，面前坐着锦衣卫千户和一位审理官。「你与胡惟庸是何关系？」你知道这个问题的答案将决定你是活过这一回合，还是被拖进诏狱深处。',
    sceneDescription: '名册上你的名字墨迹未干。锦衣卫千户的手指点了点你的名字，笑了。',
    narrativeDirective: '这是玩家第一次直面死亡威胁。核心恐怖是「名册上为什么会有我」——体制杀人不问对错，只问名单。',
    choices: [
      {
        id: 'A', label: '坚决否认——「臣与胡惟庸素无往来，名册必有冤诬」',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '审理官查证后认为你只是被攀咬，释放但留案底', effects: { power: -2, fame: -1 }, tags: { '胡党嫌疑': { expiresAt: 22, affectsCrises: ['crisis_9'] } } },
          normal: { desc: '审理官将信将疑，释放但「胡党嫌疑」标签持续数回合', effects: { power: -3 }, tags: { '胡党嫌疑': { expiresAt: 24, affectsCrises: ['crisis_9'] } } },
          unfavorable: { desc: '审理官不信，你被关入诏狱受审，身体受损', effects: { power: -4, wisdom: -2 }, healthImpact: '轻伤', tags: { '胡党嫌疑': { expiresAt: 26, affectsCrises: ['crisis_9'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '供出他人——声称是某人拉你入伙，祸水东引',
        primaryAttr: 'power', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '你被认定为「从犯且主动交代」，降级罚俸', effects: { power: -2, fame: -3 }, tags: { '攀咬之名': { expiresAt: 24, affectsCrises: ['crisis_5'] } } },
          normal: { desc: '你供出的人被收监，但你从此背负「卖友求荣」之名', effects: { power: -1, bond: -4, fame: -2 }, tags: { '攀咬之名': { expiresAt: 26, affectsCrises: ['crisis_5'] } } },
          unfavorable: { desc: '你供出的人当面对质，你被判「首鼠两端」，挨了三十杖', effects: { power: -5, fame: -3 }, healthImpact: '轻伤' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '沉默不语——拒绝回答任何问题',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '审理官对你无可奈何，暂时收监但不加刑', effects: { fame: 2, wisdom: 1 } },
          normal: { desc: '你被收监两日，出来后风声已过', effects: { fame: -1 } },
          unfavorable: { desc: '被认定为「抗拒审讯」，上了夹棍', effects: { power: -3, wisdom: -2 }, healthImpact: '轻伤', mentalImpact: '崩溃边缘' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: ['crisis_9'],
    chainRequires: { '胡党嫌疑': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['胡党嫌疑']) {
        return { crisis_9: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_5: 牢狱中的同窗 =====
  {
    id: 'crisis_5',
    title: '牢狱中的同窗',
    type: 'D',
    window: { start: 16, end: 20 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: { type: 'originNPC', key: '同窗', states_alive: ['alive'] },
    triggerCondition: function(gs) { return gs.turn >= 16; },
    triggerProbability: 0.75,
    originVariants: {
      '淮西武将之后': { npcName: '周大哥', relation: '与你一同在军中长大的好友，因淮西勋贵身份被重点审查' },
      '浙东寒门书生': { npcName: '林彦', relation: '你的同窗，曾被胡惟庸征召入幕' },
      '应天府商贾之子': { npcName: '陈掌柜', relation: '你父亲的商业伙伴，手中握有你家的账簿' },
      '落魄前元官员之后': { npcName: '赵大哥', relation: '故交，他的前朝身份被翻了出来' }
    },
    backgroundStory: '你在诏狱外面的走廊里遇到了他——你曾经最亲近的朋友。三天前，他被锦衣卫带走，罪名是「胡党余孽」。他关在诏狱东厢——那是「重犯区」，进去的人十个里面能活着出来三个。你通过一个狱卒的关系得知，他目前还算完好，但审讯即将升级：后天就要用「脑箍」了。那是一种用铁圈箍住脑袋、逐渐收紧的刑罚，轻则永远头痛，重则颅骨碎裂。你有三天时间。问题是：你在逆党名册的事刚过，任何「异常行为」都会被锦衣卫重点关注。救他，可能把你自己也搭进去。',
    sceneDescription: '他隔着铁栅看你，嘴唇翕动。你读出口型——「别管我。」但他藏在背后的手在发抖。',
    narrativeDirective: '这是限时营救类事件。核心张力：救朋友可能把自己搭进去；不救，就看着他死。倒计时每回合都要在叙事中体现压迫感。',
    countdownTurns: 3,
    countdownDescription: '同窗在诏狱中的状况逐回合恶化，第3回合将上脑箍',
    countdownStates: [
      { turn: 0, desc: '同窗尚能撑住，但审讯在升级' },
      { turn: 1, desc: '同窗开始受刑，身体每况愈下' },
      { turn: 2, desc: '锦衣卫将用「脑箍」，不救则残废或死亡' }
    ],
    timeoutOutcome: {
      desc: '你未能及时营救。同窗在「脑箍」下颅骨受损，落下终身残疾——总算保住了性命，但你们从此天各一方。',
      npcFate: '致残流放',
      effects: { bond: -4 },
      npcState: 'disabled',
      tags: { '愧疚': { permanent: true, affectsCrises: [] } }
    },
    choices: [
      {
        id: 'A', label: '冒死劫狱——买通狱卒，趁换班将他带出',
        primaryAttr: 'wisdom', threshold: 65, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '两人逃脱，但从此被通缉，需要后续事件洗白', effects: { power: -3, bond: 6 }, npcFate: '逃脱·被通缉' },
          normal: { desc: '险些被发现，最终逃出但留下线索', effects: { power: -5, bond: 4 }, npcFate: '逃脱·被通缉' },
          unfavorable: { desc: '你也被关进去，两人一起受审', effects: { power: -5, wisdom: -2 }, npcFate: '双双入狱', healthImpact: '轻伤' }
        },
        tags: { '通缉在身': { expiresAt: 26, affectsCrises: ['crisis_6'] } }, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '通过正常渠道——找有权势的贵人写保状',
        primaryAttr: 'power', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '贵人出面，他获释但被流放边疆', effects: { power: -2, bond: 3 }, npcFate: '流放边疆' },
          normal: { desc: '贵人勉强出面，他被流放但路途险恶', effects: { power: -3 }, npcFate: '流放边疆' },
          unfavorable: { desc: '贵人不愿冒险，你的求助被锦衣卫记录在案', effects: { power: -4, jinchen: -4 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      },
      {
        id: 'C', label: '暗中传递消息——将翻案证据偷渡进牢中',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: { attr: 'people', threshold: 40 },
        outcomes: {
          favorable: { desc: '证据被审理官看到，他从轻处理（流放代替死刑）', effects: { bond: 5, wisdom: 1 }, npcFate: '流放边疆' },
          normal: { desc: '证据起了部分作用，他保住了性命但被判重刑', effects: { bond: 3 }, npcFate: '判刑入狱' },
          unfavorable: { desc: '证据被截获，你被认定为「串供」，自身难保', effects: { power: -5, bond: -3 }, npcFate: '未救出', healthImpact: '轻伤' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    npcDeathConsequence: {
      tag: '友人之死', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及故交、同窗、旧识的回忆场景'
    },
    chainsTo: [],
    chainEffect: null
  },

  // ===== crisis_6: 空印的代价 =====
  {
    id: 'crisis_6',
    title: '空印的代价',
    type: 'B',
    window: { start: 19, end: 23 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 19; },
    triggerProbability: 0.75,
    originVariants: {
      '淮西武将之后': { conflictDesc: '你衙署里也有「方便行事」的空印文书。上峰拍了拍你的肩："你是武人出身，经手的事少，想个办法。"' },
      '浙东寒门书生': { conflictDesc: '你的恩师曾告诉你「空印是官场惯例」。如今恩师已逝，无人能为你作证了。' },
      '应天府商贾之子': { conflictDesc: '你父亲的商号里有盖了官印的空白通关文牒。这笔生意，如今成了催命符。' },
      '落魄前元官员之后': { conflictDesc: '你母亲说「前朝也是这样做的」。可这是洪武朝，前朝的规矩救不了你。' }
    },
    backgroundStory: '你收到一份来自上级衙署的密函——措辞客气，但字里行间的意思很明确：朝廷正在追查「各衙署使用空白盖印文书」的问题。你的衙署里恰好有这种文书——用来「方便行事」的，紧急情况下先盖印后填写。这在官场是心照不宣的惯例，但皇帝的态度已经变了。上峰连夜把你叫去，脸色铁青：「你经手的那几份空印文书，现在必须处理掉。或者，你得想个办法证明，这些文书在你手里的时候，内容是填好了的。」说完他起身走了。你知道，他已经做好了把你推出去当替罪羊的准备。',
    sceneDescription: '那张盖着鲜红官印的白纸就在你案头。它在烛火下像一只睁开的眼睛。',
    narrativeDirective: '此事件让玩家体会「大家都这么做，但只有我倒霉」的荒诞。核心不是对错，而是「谁为惯例买单」。',
    choices: [
      {
        id: 'A', label: '销毁证据——连夜烧毁所有空印文书',
        primaryAttr: 'wisdom', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '证据消失，无人能证明你用过空印', effects: { wisdom: 1 } },
          normal: { desc: '文书烧了，但有人看到你深夜焚纸，议论纷纷', effects: { fame: -2 } },
          unfavorable: { desc: '有人看到你烧纸，或文书已被上级调走存档', effects: { power: -4, fame: -2 }, tags: { '惊弓之鸟': { expiresAt: 26, affectsCrises: ['crisis_9'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '补填内容——在所有空印文书上补填合理内容',
        primaryAttr: 'wisdom', threshold: 65, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '文书看起来完整合规，稽查没有发现问题', effects: { wisdom: 2 } },
          normal: { desc: '文书勉强过关，但书吏的眼神说明他起了疑心', effects: { fame: -1 } },
          unfavorable: { desc: '墨迹新旧不同，被有经验的书吏识破', effects: { power: -5, wisdom: -2 }, healthImpact: '轻伤', tags: { '空印嫌疑': { expiresAt: 30, affectsCrises: ['crisis_9'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '主动上报——向朝廷坦白「属下衙署确实存在空印惯例」',
        primaryAttr: 'people', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '你的坦诚被赏识，从轻处理，只罚俸三月', effects: { people: 3, fame: 2, power: -2 } },
          normal: { desc: '你被训诫一番，从轻发落', effects: { people: 1, power: -3 } },
          unfavorable: { desc: '你的上峰因此事被牵连，从此视你为叛徒', effects: { power: -5, bond: -3, jinchen: -3 }, tags: { '告发者': { permanent: true, affectsCrises: ['crisis_10'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: ['crisis_9'],
    chainRequires: { '空印嫌疑': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['空印嫌疑']) {
        return { crisis_9: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_7: 产婆之劫 =====
  {
    id: 'crisis_7',
    title: '产婆之劫',
    type: 'D',
    window: { start: 23, end: 26 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: { type: 'originNPC', key: '产婆', states_alive: ['alive'] },
    triggerCondition: function(gs) { return gs.turn >= 23; },
    triggerProbability: 0.78,
    originVariants: {
      '淮西武将之后': { npcName: '刘妈', relation: '你妻子张蕴真的陪嫁老妈子，怀着你家仆人的孩子，已经七个多月了' },
      '浙东寒门书生': { npcName: '刘妈', relation: '你妻子的乳母，替邻居写了一份保甲证明' },
      '应天府商贾之子': { npcName: '刘妈', relation: '你家老伙计陈三的儿媳，腹中胎儿七个月' },
      '落魄前元官员之后': { npcName: '刘妈', relation: '你母亲陈秀英的贴身仆人，知道太多旧事' }
    },
    backgroundStory: '空印案爆发后，应天府的衙门像被蝗虫扫过——一批官员被杀，一批被流放，剩下的都不敢做事。在这种混乱中，你家里一个跟了多年的产婆因为替邻居写了一份「保甲证明」（盖的是你家旧衙署废弃的印章），被人告发为「盗用官印」。锦衣卫来抓人的时候，她已经怀了七个多月的身孕。她被关进应天府大牢。牢里潮湿、拥挤、食物不足。一个怀孕七个月的女人撑不了太久。你有四天时间——四天后，案件将被「批量处理」，和空印案的其他犯人一起被判刑。',
    sceneDescription: '你透过牢门的缝隙看到她。她靠在墙角，一只手护着肚子，另一只手朝你伸出来。',
    narrativeDirective: '此事件与「家庭」情感线紧密相关。若母亲陈秀英的隐藏身份线推进到一定程度，会触发额外的身份危机（叙事中自然带出）。',
    countdownTurns: 4,
    countdownDescription: '刘妈在牢中的身体状况逐回合恶化，第4回合可能一尸两命',
    countdownStates: [
      { turn: 0, desc: '刘妈尚能撑住，但牢中环境恶劣' },
      { turn: 1, desc: '刘妈开始虚弱，有早产风险' },
      { turn: 2, desc: '刘妈病重，狱医束手无策' },
      { turn: 3, desc: '案件将被「批量处理」，不救则一尸两命' }
    ],
    timeoutOutcome: {
      desc: '你未能及时营救。刘妈在狱中早产，母子俱危——最终一尸两命。你永远忘不了牢门后那一声微弱的啼哭。',
      npcFate: '一尸两命',
      effects: { bond: -4, people: -2 },
      npcState: 'dead',
      tags: { '两条人命': { permanent: true, affectsCrises: [] } }
    },
    choices: [
      {
        id: 'A', label: '花钱疏通——用大量银两打点牢头和审理书吏',
        primaryAttr: 'power', threshold: 45, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '刘妈被「保外就医」，但花费巨大', effects: { power: -1, bond: 4 }, npcFate: '获救·家产受损' },
          normal: { desc: '刘妈被允许狱外生产，但银子花了不少', effects: { bond: 3 }, npcFate: '获救' },
          unfavorable: { desc: '牢头收钱不办事，或被上级发现', effects: { power: -4, bond: -2 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      },
      {
        id: 'B', label: '伪造证据——制造一份「此妇并不知情」的证明文件',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '审理书吏认可，刘妈无罪释放', effects: { wisdom: 1, bond: 4 }, npcFate: '获救' },
          normal: { desc: '证明被半信半疑地接受，刘妈获释但被罚银', effects: { bond: 3 }, npcFate: '获救' },
          unfavorable: { desc: '文件被识破，你被追加「伪造官文书」罪名', effects: { power: -5, wisdom: -2 }, npcFate: '未救出', healthImpact: '轻伤' }
        },
        tags: { '伪造文书': { expiresAt: 32, affectsCrises: ['crisis_9'] } }, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '直接劫狱——趁夜色潜入大牢将人带出',
        primaryAttr: 'power', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '救出刘妈，但你成为通缉犯', effects: { power: -3, bond: 5 }, npcFate: '获救·被通缉' },
          normal: { desc: '费尽周折救出刘妈，惊动了半个衙门', effects: { power: -4, bond: 4 }, npcFate: '获救·被通缉' },
          unfavorable: { desc: '被抓现行，你也被关进去', effects: { power: -5, bond: -3 }, npcFate: '双双入狱', healthImpact: '重伤' }
        },
        tags: { '通缉在身': { expiresAt: 34, affectsCrises: ['crisis_8'] } }, healthImpact: null, mentalImpact: '崩溃边缘'
      }
    ],
    npcDeathConsequence: {
      tag: '两条人命', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及孕妇、婴儿、家庭团圆的场景'
    },
    chainsTo: [],
    chainEffect: null
  },

  // ===== crisis_8: 账簿上的血 =====
  {
    id: 'crisis_8',
    title: '账簿上的血',
    type: 'B',
    window: { start: 27, end: 31 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 27; },
    triggerProbability: 0.75,
    originVariants: {
      '淮西武将之后': { conflictDesc: '你的上峰是武将转文官，账目一窍不通，只知道说「你看着办」。' },
      '浙东寒门书生': { conflictDesc: '你是衙署里唯一能看懂账的人——这既是本事，也是催命符。' },
      '应天府商贾之子': { conflictDesc: '你的商业训练让你一眼看出问题。八千两的亏空，你闭着眼都能算出来。' },
      '落魄前元官员之后': { conflictDesc: '你的前朝经验让你知道这种账目意味着什么——前朝，就是这么垮的。' }
    },
    backgroundStory: '郭桓案的风暴还没到你这级，但空气里已经有了血腥味。你的上峰把你叫到书房，关上门，推过来一摞账簿：「帮我看看，有没有问题。」你翻了半个时辰，心越来越沉——账目上有至少三处明显的亏空，总数高达八千两。这在洪武朝不是「贪污」的问题，是「掉脑袋」的问题。上峰看你的表情就知道你发现了。他没有说话，只是把账簿推回来，淡淡说了一句：「你知道该怎么做。」更糟的是——你下班走在路上，一个陌生人塞给你一张纸条：「有人知道你们衙署的账有问题。三天内把二千两送到某某地方，否则举报。」你被夹在上峰的贪污和匿名勒索之间，两头都是死路。',
    sceneDescription: '账簿上的墨字像蚂蚁一样爬动。每一笔亏空的数字，都是一条人命。',
    narrativeDirective: '此事件考验玩家的道德底线——做假账保全自己，还是举报保全良心。选择将决定郭桓案清算时的处境。',
    choices: [
      {
        id: 'A', label: '做平账目——帮上峰掩盖亏空',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '账目看起来天衣无缝，上峰感激', effects: { power: 3, bond: 3 }, tags: { '做账人': { permanent: true, affectsCrises: ['crisis_9'] } } },
          normal: { desc: '账目勉强做平，但你知道这迟早要爆', effects: { power: 2 }, tags: { '做账人': { permanent: true, affectsCrises: ['crisis_9'] } } },
          unfavorable: { desc: '做账的手法被后续的审计官识破，你作为「做账人」被首当其冲', effects: { power: -5, wisdom: -2 }, healthImpact: '轻伤', tags: { '做账人': { permanent: true, affectsCrises: ['crisis_9'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '匿名举报——向都察院递交密报',
        primaryAttr: 'people', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '上峰被查，你因「举报有功」被嘉奖', effects: { people: 4, fame: 3, power: 1 } },
          normal: { desc: '举报引起注意，但上峰暂时脱身', effects: { people: 2 } },
          unfavorable: { desc: '举报信被拦截，上峰发现是你干的', effects: { power: -5, bond: -4 }, tags: { '告发者': { permanent: true, affectsCrises: ['crisis_10'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '两头通吃——借上峰之手消除勒索者',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: { attr: 'power', threshold: 45 },
        outcomes: {
          favorable: { desc: '勒索者被上峰「处理」，你获得上峰信任', effects: { power: 3, bond: 2, wisdom: 1 } },
          normal: { desc: '勒索者被吓退，但上峰对你起了戒心', effects: { power: 1, bond: -1 } },
          unfavorable: { desc: '上峰认为你「两边不忠」，你成为弃子', effects: { power: -5, bond: -4 }, tags: { '两边不忠': { permanent: true, affectsCrises: ['crisis_9'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    chainsTo: ['crisis_9'],
    chainRequires: { '做账人': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['做账人']) {
        return { crisis_9: { difficultyMod: 2 } };
      }
      return {};
    }
  },
// v3.13.0 生死危机 Phase 2 事件配置（crisis_9 ~ crisis_15 + crisis_finale）

  // ===== crisis_9: 刑堂对峙 =====
  {
    id: 'crisis_9',
    title: '刑堂对峙',
    type: 'C',
    window: { start: 31, end: 34 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 31; },
    triggerProbability: 0.75,
    originVariants: {
      '淮西武将之后': { conflictDesc: '堂上审理官扫了你一眼："武将出身，账目不懂，倒是会推卸。"' },
      '浙东寒门书生': { conflictDesc: '你上峰供出你时，堂上几位审理官交换了一个了然的眼神——浙东党，果然靠不住。' },
      '应天府商贾之子': { conflictDesc: '堂外候审的官员里有你家的老主顾。他别过头去，假装不认识你。' },
      '落魄前元官员之后': { conflictDesc: '有人低声说："前朝余孽，果然会做假账。"声音不大，但满堂都听见了。' }
    },
    backgroundStory: '郭桓案的余波还没平息，你的上峰被牵连进去了。他为了自保，在审讯中把你供了出来：「那些账是我的下属做的，我只是奉命行事。」你被传唤到刑部大堂。这不是审判——这是表演。大堂里坐着三位审理官，旁边站着一排锦衣卫。你的上峰坐在被告席上，看到你进来，微微低下了头——不是愧疚，是害怕。审理官问了你三个问题，然后让你当堂和上峰对质。你的上峰矢口否认一切。审理官看着你，说了一句话：「你若说不出是谁指使的，那就是你自己的主意。」大堂里鸦雀无声。',
    sceneDescription: '你站在大堂中央。所有人的眼睛都盯着你。你的上峰低下了头——不是因为愧疚，而是因为你的回答将决定他是否把你一起拖下水。',
    narrativeDirective: '这是游戏中最「屈辱」的事件之一。它考验的不是战斗力，而是尊严——在权力面前，你愿意弯腰到什么程度？无论选择什么，都必须在大庭广众之下做出某种「丢脸」的行为。',
    choices: [
      {
        id: 'A', label: '据实指认上峰——当面说出他的名字和指令',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '上峰被定罪，你被从轻处理', effects: { fame: 3, power: 1 } },
          normal: { desc: '上峰被查但你也受了牵连，降一级', effects: { fame: 1, power: -2 } },
          unfavorable: { desc: '上峰有贵人保他，你反而成了「诬告」，当堂被斥', effects: { power: -5, fame: -3 }, tags: { '诬告之名': { permanent: true, affectsCrises: ['crisis_13'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '承担下来——「是属下自作主张」',
        primaryAttr: 'power', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '审理官认为你态度诚恳，从轻发落（降级罚俸）', effects: { power: -3, fame: -2, bond: 2 } },
          normal: { desc: '被降级罚俸，但保住了上峰的信任', effects: { power: -4, bond: 2 } },
          unfavorable: { desc: '被认为「刻意包庇」，加重处罚——当堂杖责四十', effects: { power: -5, bond: 1 }, healthImpact: '重伤' }
        },
        tags: {}, healthImpact: null, mentalImpact: '崩溃边缘'
      },
      {
        id: 'C', label: '当堂崩溃——假装晕厥或哭泣，拖延时间',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '审理被迫暂停，你获得两回合缓冲时间找人运作', effects: { wisdom: 1 }, tags: { '装疯卖傻': { expiresAt: 36, affectsCrises: ['crisis_10'] } } },
          normal: { desc: '堂上哗然，你被带下去醒神，但案子暂时搁置', effects: { fame: -2 } },
          unfavorable: { desc: '被拖出去泼冷水「醒神」，当众出丑', effects: { fame: -5, power: -2 }, mentalImpact: '崩溃边缘' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: ['crisis_13'],
    chainRequires: { '诬告之名': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['诬告之名']) {
        return { crisis_13: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_10: 恩师的末日 =====
  {
    id: 'crisis_10',
    title: '恩师的末日',
    type: 'A',
    window: { start: 35, end: 37 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: { type: 'originNPC', key: '恩师', states_alive: ['alive'] },
    triggerCondition: function(gs) { return gs.turn >= 35; },
    triggerProbability: 0.78,
    originVariants: {
      '淮西武将之后': { npcName: '老将军', relation: '你舅舅的旧交，一位退休的老将军' },
      '浙东寒门书生': { npcName: '恩师', relation: '年迈的翰林学士，教你读书识字的人' },
      '应天府商贾之子': { npcName: '老东家', relation: '你父亲的恩人，一位退隐的老商人' },
      '落魄前元官员之后': { npcName: '遗老', relation: '赵大哥的旧主，一位隐藏身份的前元遗老' }
    },
    backgroundStory: '李善长案像一把从天上落下来的铡刀——没有人知道它会砍在谁头上，但所有人都在发抖。你的恩师被卷进去了。罪名是「与李善长暗通书信，图谋不轨」。你知道这是假的——但你也知道，在洪武朝，真假不重要，重要的是有没有证据。而锦衣卫最擅长的就是「找到」证据。他被软禁在家中，等待审讯通知。你得到了一个消息：三日后，锦衣卫将上门「抄查」——抄查的结果几乎必然是「发现通逆证据」。你有三天时间。更复杂的是：有人悄悄告诉你，如果能在审讯前将一封「自辩书」递到某位正直大臣手中，再由他转呈皇帝，也许还有一线生机。但这位正直大臣自己也在漩涡边缘——帮你，可能连他自己也搭进去。',
    sceneDescription: '老人的手在抖。他把一封信递给你——「这是我最后的自辩。如果我死了，替我交出去。」',
    narrativeDirective: '这是四条出身线中情感冲击最大的事件之一。每条线的NPC不同，但情感核心相同——「你最爱戴的人要死了，你救不了」。',
    countdownTurns: 3,
    countdownDescription: '三日后锦衣卫上门抄查，恩师命悬一线',
    countdownStates: [
      { turn: 0, desc: '恩师被软禁家中，等待审讯通知' },
      { turn: 1, desc: '风声越来越紧，恩师开始整理后事' },
      { turn: 2, desc: '明日锦衣卫将上门「抄查」，这是最后的机会' }
    ],
    timeoutOutcome: {
      desc: '你未能及时营救。锦衣卫上门抄查，搜出「通逆证据」。恩师被拖入诏狱，数日后处死。你收到他最后的遗言：「吾道不孤，汝当自重。」',
      npcFate: '处死',
      effects: { bond: -4, wisdom: -2 },
      npcState: 'dead',
      tags: { '师恩断裂': { permanent: true, affectsCrises: [] } }
    },
    choices: [
      {
        id: 'A', label: '将自辩书送给正直大臣',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '大臣被打动，上奏求情，恩师被从轻处理（流放）', effects: { power: -2, bond: 5 }, npcFate: '流放' },
          normal: { desc: '大臣犹豫后转呈，恩师保住性命但被流放', effects: { power: -3, bond: 4 }, npcFate: '流放' },
          unfavorable: { desc: '大臣被牵连，恩师和你都被列入嫌疑名单', effects: { power: -5, bond: -3 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '销毁所有往来书信——断绝证据链',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '锦衣卫抄查后一无所获，恩师被训诫后放回', effects: { wisdom: 2, bond: 4 }, npcFate: '获救' },
          normal: { desc: '大部分书信被销毁，恩师被罚俸闭门思过', effects: { bond: 3 }, npcFate: '获救·受罚' },
          unfavorable: { desc: '书信已被锦衣卫提前复制，抄查照旧进行', effects: { power: -4, bond: -3 }, npcFate: '未救出' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '放弃营救，暗中转移恩师的家眷',
        primaryAttr: 'power', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '恩师被捕（流放），但家眷安全，血脉得以保全', effects: { power: -2, bond: -3 }, npcFate: '被捕·家眷保全' },
          normal: { desc: '恩师被捕，家眷在混乱中走散了大半', effects: { power: -3, bond: -4 }, npcFate: '被捕' },
          unfavorable: { desc: '转移家眷时被锦衣卫发现，你也被牵连', effects: { power: -5, bond: -4 }, npcFate: '被捕·牵连' }
        },
        tags: { '保全血脉': { permanent: true, affectsCrises: ['crisis_finale'] } }, healthImpact: null, mentalImpact: '崩溃边缘'
      }
    ],
    npcDeathConsequence: {
      tag: '师恩断裂', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及师长、老人、传承的场景'
    },
    chainsTo: [],
    chainEffect: null
  },

  // ===== crisis_11: 太子薨前的密信 =====
  {
    id: 'crisis_11',
    title: '太子薨前的密信',
    type: 'A',
    window: { start: 41, end: 43 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: ['朱标'],
    triggerCondition: function(gs) { return gs.turn >= 41; },
    triggerProbability: 0.85,
    originVariants: {
      '淮西武将之后': { conflictDesc: '太子身边的太监认得你舅舅蓝玉——他多看了你两眼，目光意味深长。' },
      '浙东寒门书生': { conflictDesc: '你整理文书时发现太子的字迹——一笔一划，还是当年的风骨。' },
      '应天府商贾之子': { conflictDesc: '密信中提到的商路与税银，你一眼看出其中利害。' },
      '落魄前元官员之后': { conflictDesc: '太子密信里的用词，让你想起父亲书房里那些不敢示人的手稿。' }
    },
    backgroundStory: '太子朱标病重的消息在宫中传开了。你奉命参与东宫的一次紧急会议——太子的心腹太监召集了几个低品级官员，要求你们「整理东宫近五年的重要文书并封存」。你在整理过程中发现了一叠密信——是太子与几位边将的私人通信。信中讨论了「如果朝局有变」的应对方案。这些信如果被朱元璋看到，会引发另一场大清洗。如果被其他皇子看到，会成为夺嫡的把柄。太监盯着你：「这些信，你看到了？」你点了点头。太监沉默了很久，然后说了一句话：「太子殿下说——这些东西，该烧就烧。但如果有人觉得应该留下来……他也不会怪你。」他在试探你。',
    sceneDescription: '密信在你手中。烛火在你面前。太监的眼睛在暗处发亮。',
    narrativeDirective: '本事件核心不是「救NPC」，而是「在太子之死前做出政治判断」。太子之死是不可避免的历史事实，但你的选择将影响蓝玉案和朱元璋驾崩时的处境。',
    choices: [
      {
        id: 'A', label: '烧掉密信——遵从太子的暗示',
        primaryAttr: 'wisdom', threshold: 0, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '密信消失，你获得「守密者」之名。太子死后，这些信的内容成为悬案', effects: { bond: 2 }, tags: { '守密者': { permanent: true, affectsCrises: ['crisis_12'] } } },
          normal: { desc: '密信付之一炬，太监微微点头', effects: {}, tags: { '守密者': { permanent: true, affectsCrises: ['crisis_12'] } } },
          unfavorable: { desc: '烧信时火星溅到你手上，你记住了那份灼痛', effects: { wisdom: -1 }, tags: { '守密者': { permanent: true, affectsCrises: ['crisis_12'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      },
      {
        id: 'B', label: '保留密信——偷偷藏起最重要的几封',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '密信被保留，成为后续政治博弈的筹码', effects: { wisdom: 3, power: 2 }, tags: { '东宫密信': { permanent: true, affectsCrises: ['crisis_12', 'crisis_finale'] } } },
          normal: { desc: '你藏起了一封，但心里始终不踏实', effects: { wisdom: 1 }, tags: { '东宫密信': { permanent: true, affectsCrises: ['crisis_12', 'crisis_finale'] } } },
          unfavorable: { desc: '被太监发现，你被认定为「窃夺东宫机密」', effects: { power: -5, jinchen: -5 }, tags: { '窃密嫌疑': { permanent: true, affectsCrises: ['crisis_13'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '上报皇帝——将密信呈给朱元璋',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '朱元璋沉默良久，说「你做得对」。你获得「忠臣」之名，但从此被所有同情太子的人视为叛徒', effects: { power: 3, jinchen: 5, donggong: -5 }, tags: { '忠臣': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          normal: { desc: '朱元璋收下密信，未置可否', effects: { power: 2, donggong: -3 }, tags: { '忠臣': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          unfavorable: { desc: '朱元璋勃然大怒，怀疑你与边将勾连，你被罚俸三月', effects: { power: -4, donggong: -5 }, tags: { '忠臣': { permanent: true, affectsCrises: ['crisis_finale'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    chainsTo: ['crisis_12'],
    chainRequires: { '东宫密信': { present: true, difficultyMod: -1 } },
    chainEffect: function(gs, choiceId, outcome) {
      // 持有「守密者」标签时，crisis_12（舅舅血路）中可获得太子旧部帮助（难度降低）
      if (gs.crisisTags && gs.crisisTags['守密者']) {
        return { crisis_12: { difficultyMod: -1 } };
      }
      if (gs.crisisTags && gs.crisisTags['东宫密信']) {
        return { crisis_12: { difficultyMod: -1 } };
      }
      return {};
    }
  },

  // ===== crisis_12: 舅舅的血路 =====
  {
    id: 'crisis_12',
    title: '舅舅的血路',
    type: 'D',
    window: { start: 46, end: 49 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: [{ name: '蓝玉', allowStates: ['alive', 'escaped'] }],
    triggerCondition: function(gs) { return gs.turn >= 46; },
    triggerProbability: 0.85,
    originVariants: {
      '淮西武将之后': { conflictDesc: '蓝玉是你的亲舅舅。消息传来时你正在擦拭你母亲留给你的那把短刀。', npcName: '蓝玉', relation: '亲舅舅' },
      '浙东寒门书生': { conflictDesc: '你通过太子旧部得知了蓝玉被监视的消息。你与蓝玉并无深交，但你知道——淮西勋贵的末日，也是所有官员的末日。', npcName: '蓝玉', relation: '太子旧部提及的勋贵' },
      '应天府商贾之子': { conflictDesc: '你家的商路上发现了锦衣卫的暗探。蓝玉的案子，先刮到的是生意人的头上。', npcName: '蓝玉', relation: '商路涉及的勋贵' },
      '落魄前元官员之后': { conflictDesc: '赵大哥的旧主与蓝玉有旧交。消息传到你耳中时，你已经嗅到了大清洗的味道。', npcName: '蓝玉', relation: '旧交之友' }
    },
    backgroundStory: '消息是半夜传来的。你舅舅蓝玉被锦衣卫秘密监视了。你通过内线得知：锦衣卫已经在他的府中搜出了「谋反证据」——几封来历不明的书信和一把刻了铭文的私刀。你知道这些证据是栽赃的。但在洪武二十六年，「知道」没有用。你有一个窗口——锦衣卫在正式告发之前有三天的「取证期」，这段时间内证据还没有呈给皇帝。如果你能在这三天内将关键证据销毁或替换，你舅舅可能还有一线生机。但你更清楚一个残酷的事实：朱元璋要杀的人，从来没有人救得了。你面对的不是锦衣卫，是皇帝本人。',
    sceneDescription: '夜风里传来更鼓。三天。你只有三天。三天后，你的舅舅将像胡惟庸一样被拖进诏狱——然后，不会再出来。',
    narrativeDirective: '这是淮西武将出身线的终极考验。蓝玉是主角的舅舅——他的死是主角整个出身线的终结。历史惯性：蓝玉的命运不可改变，但可以改变他是被杀、流放还是出逃。',
    countdownTurns: 3,
    countdownDescription: '锦衣卫取证期仅三天，三天后证据将呈给皇帝',
    countdownStates: [
      { turn: 0, desc: '锦衣卫正在取证，证据尚未呈递' },
      { turn: 1, desc: '风声日紧，蓝玉府外暗探增多' },
      { turn: 2, desc: '明日证据将呈给皇帝，这是最后的机会' }
    ],
    timeoutOutcome: {
      desc: '你未能及时行动。证据被呈给皇帝，蓝玉以「谋反」罪名被诛，株连九族。你眼睁睁看着淮西勋贵的最后一点血脉被碾碎。',
      npcFate: '被诛',
      effects: { power: -4, bond: -5 },
      npcState: 'dead',
      tags: { '蓝党余波': { permanent: true, affectsCrises: ['crisis_13'] } }
    },
    choices: [
      {
        id: 'A', label: '销毁证据——潜入蓝玉府中，在锦衣卫之前销毁「谋反证据」',
        primaryAttr: 'wisdom', threshold: 65, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '证据被毁，锦衣卫暂时失去告发依据', effects: { wisdom: 2, bond: 4 }, npcFate: '暂保·证据已毁' },
          normal: { desc: '大部分证据被毁，但锦衣卫留了后手', effects: { bond: 3 }, npcFate: '暂保' },
          unfavorable: { desc: '你被锦衣卫当场抓住，成为「蓝党同谋」', effects: { power: -6, bond: -3 }, npcFate: '蓝玉被诛·你受牵连', healthImpact: '重伤' }
        },
        tags: {}, healthImpact: null, mentalImpact: '崩溃边缘'
      },
      {
        id: 'B', label: '劝舅舅逃跑——连夜劝他携家出逃',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '蓝玉出逃（从此成为通缉犯），你保住了他的命', effects: { power: -4, bond: 5 }, npcFate: '出逃', npcState: 'escaped' },
          normal: { desc: '蓝玉犹豫后带着少数亲信出逃', effects: { power: -5, bond: 4 }, npcFate: '出逃', npcState: 'escaped' },
          unfavorable: { desc: '蓝玉拒绝相信——「我堂堂凉国公，皇帝能拿我怎样？」', effects: { bond: -3 }, npcFate: '蓝玉被诛' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '联络其他勋贵——联合与蓝玉关系密切的家族共同上书求情',
        primaryAttr: 'power', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '联名书暂时阻止了锦衣卫的行动，蓝玉被流放', effects: { power: 2, bond: 4 }, npcFate: '流放' },
          normal: { desc: '联名书起了作用，蓝玉从死刑改为流放', effects: { power: 1, bond: 3 }, npcFate: '流放' },
          unfavorable: { desc: '联名的家族被逐一清洗，你也成为目标', effects: { power: -6, bond: -3 }, tags: { '蓝党余波': { permanent: true, affectsCrises: ['crisis_13'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    npcDeathConsequence: {
      tag: '蓝党余波', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及淮西勋贵、舅舅、军旅旧事的场景'
    },
    chainsTo: ['crisis_13'],
    chainRequires: { '蓝党余波': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['蓝党余波']) {
        return { crisis_13: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_13: 审讯风暴 =====
  {
    id: 'crisis_13',
    title: '审讯风暴',
    type: 'C',
    window: { start: 49, end: 51 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 49; },
    triggerProbability: 0.85,
    originVariants: {
      '淮西武将之后': { conflictDesc: '审讯你的是锦衣卫指挥蒋瓛。他认得你——「蓝玉的外甥，好大的胆子。」' },
      '浙东寒门书生': { conflictDesc: '供词里你的名字出现了三次。蒋瓛念到你名字时，特意抬了抬眼皮。' },
      '应天府商贾之子': { conflictDesc: '有人供出你「出资资助蓝玉家眷」。蒋瓛敲了敲案上的银票。' },
      '落魄前元官员之后': { conflictDesc: '蒋瓛翻着你的籍贯卷宗，忽然笑了：「前朝的官，明朝的贼，你这一家子倒是齐全。」' }
    },
    backgroundStory: '你被押进了锦衣卫诏狱最深处的审讯室。你面前坐着锦衣卫指挥蒋瓛——蓝玉案的总负责人。他的案头摊着一份供词，是某个已经被折磨得精神崩溃的小官写的。供词里，你的名字出现了三次。「你认识蓝玉吗？」蒋瓛问。你知道这个问题的答案。你当然认识——但「认识」和「同谋」之间的距离，在这间审讯室里，比一张纸还薄。蒋瓛拍了拍案上的供词：「这个人说，你参加过蓝玉的秘密聚会。你说呢？」他没有等你回答，就对旁边的锦衣卫说了一句话：「先打二十。打完再问。」你被按在地上。这是你的身体和意志的直接考验。',
    sceneDescription: '第一杖落下来的时候，你听到自己骨头碎裂的声音。第二杖。你开始数了——还有十八杖。',
    narrativeDirective: '这是游戏中肉体痛苦最强烈的事件。玩家将通过文字「感受」廷杖的每一击。蓝玉案中「八十天，一万五千人」——审讯的核心不是查明真相，而是滚动株连。',
    choices: [
      {
        id: 'A', label: '咬牙硬扛——一声不吭',
        primaryAttr: 'power', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '二十杖后你还能站起来，蒋瓛反而犹豫了', effects: { fame: 3, power: 1 }, healthImpact: '轻伤' },
          normal: { desc: '你挨完二十杖，勉强保住尊严', effects: { fame: 1 }, healthImpact: '重伤' },
          unfavorable: { desc: '你在第十杖时昏厥，被泼水后继续打', effects: { power: -4, fame: -2 }, healthImpact: '重伤', mentalImpact: '崩溃边缘' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      },
      {
        id: 'B', label: '部分招供——承认「认识但非同谋」，供出一个无足轻重的人名',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '蒋瓛认为你「态度诚恳」，停止用刑', effects: { power: -2, wisdom: 1 }, healthImpact: '轻伤' },
          normal: { desc: '你招了一个名字，挨了十杖后被放回', effects: { power: -3, fame: -1 }, healthImpact: '轻伤' },
          unfavorable: { desc: '你供出的人当场对质，你被加刑', effects: { power: -5, fame: -3 }, healthImpact: '重伤', tags: { '攀咬之名': { permanent: true, affectsCrises: ['crisis_15'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '全部招供——承认一切（包括你没有做过的事）',
        primaryAttr: 'wisdom', threshold: 30, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '你活下来了，但被剥夺所有官职，你供出的人因此被杀', effects: { power: -8, fame: -5, bond: -3 }, tags: { '招供者': { permanent: true, affectsCrises: ['crisis_15'] } } },
          normal: { desc: '你被革职为民，蒋瓛满意地合上了供词', effects: { power: -7, fame: -4 }, tags: { '招供者': { permanent: true, affectsCrises: ['crisis_15'] } } },
          unfavorable: { desc: '你招了，但蒋瓛觉得你还藏着东西，继续用刑', effects: { power: -5, wisdom: -3 }, healthImpact: '重伤', mentalImpact: '崩溃' }
        },
        tags: {}, healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: ['crisis_15'],
    chainRequires: { '招供者': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['招供者']) {
        return { crisis_15: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_14: 缇骑在门外 =====
  {
    id: 'crisis_14',
    title: '缇骑在门外',
    type: 'C',
    window: { start: 52, end: 54 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 52; },
    triggerProbability: 0.78,
    originVariants: {
      '淮西武将之后': { conflictDesc: '你家院墙外的泥地上有新鲜的脚印——不止一个。' },
      '浙东寒门书生': { conflictDesc: '你写给友人的信被拆开后又重新封上了，封口的蜡有不同的纹路。' },
      '应天府商贾之子': { conflictDesc: '你家对面新开的铺子，掌柜的账本上记的却全是进出你家的时辰。' },
      '落魄前元官员之后': { conflictDesc: '你家仆人出门买菜时总有人「恰好」在同一家铺子。三十年了，这种盯梢你认得出来。' }
    },
    backgroundStory: '洪武朝已经快走到尽头了。三十年的恐怖统治，让每个人都变成了惊弓之鸟。你发现自己被监视了。起初是错觉——街上总有人在远处跟着你，你家对面的铺子换了新租客，你家仆人出门买菜时总有人「恰好」在同一家铺子买东西。然后你发现了证据——你家院墙外的泥地上有新鲜的脚印，你写给友人的信被拆开后又重新封上了。你的家里有一个锦衣卫的暗桩。你不知道是谁——是那个新来的厨子？还是跟了你五年的老仆人？还是你的邻居？但你知道，你的每一句话、每一个动作、每一封书信，都被记录在案，呈到了锦衣卫的案头。你活在一个你自己家里的监狱中。',
    sceneDescription: '你对着镜子说话——因为你知道，隔壁有人在听。你的每一个字都是说给锦衣卫听的。',
    narrativeDirective: '此事件的恐怖感来自于「日常中的窒息」——不是突然被抓走，而是慢慢发现自己活在一个监控世界里。这种恐惧比任何酷刑都更令人绝望。',
    choices: [
      {
        id: 'A', label: '找出暗桩——通过精心设计的「信息陷阱」锁定暗桩身份',
        primaryAttr: 'wisdom', threshold: 60, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '找到暗桩并将其控制，从此你的情报渠道反而多了一条', effects: { wisdom: 2, power: 2 }, tags: { '谍中谍': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          normal: { desc: '你确认了暗桩身份，但没有打草惊蛇', effects: { wisdom: 1 }, tags: { '谍中谍': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          unfavorable: { desc: '陷阱被识破，暗桩转移，你的怀疑加剧了锦衣卫对你的关注', effects: { power: -4, wisdom: -2 }, tags: { '被盯上': { expiresAt: 58, affectsCrises: ['crisis_finale'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '反向利用——通过暗桩向锦衣卫传递精心编造的假情报',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '锦衣卫被误导，对你的关注度下降', effects: { wisdom: 2, power: 1 } },
          normal: { desc: '假情报起了作用，但你知道这只能维持一时', effects: { wisdom: 1 } },
          unfavorable: { desc: '假情报被锦衣卫识破，你的处境更加危险', effects: { power: -5, jinchen: -5 }, tags: { '被盯上': { expiresAt: 58, affectsCrises: ['crisis_finale'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '彻底断联——切断所有对外联系，不再写任何敏感信息',
        primaryAttr: 'wisdom', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '安全但孤立——你在最后几个回合中几乎是一个「隐形人」', effects: { power: -2, fame: -2 } },
          normal: { desc: '你不再写信、不再会客，日子变得安静而压抑', effects: { fame: -1 } },
          unfavorable: { desc: '彻底断联让你失去了所有消息渠道，包括保命的那些', effects: { power: -3, wisdom: -2 } }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      }
    ],
    chainsTo: [],
    chainEffect: null
  },

  // ===== crisis_15: 诏狱深处 =====
  {
    id: 'crisis_15',
    title: '诏狱深处',
    type: 'D',
    window: { start: 54, end: 56 },
    minIntervalFromLastCrisis: 3,
    minIntervalFromAnchor: 2,
    requiredNPCs: { type: 'originNPC', key: '至亲', states_alive: ['alive'] },
    triggerCondition: function(gs) { return gs.turn >= 54; },
    triggerProbability: 0.85,
    originVariants: {
      '淮西武将之后': { npcName: '妻子张蕴真', relation: '你的发妻，因一句「如今的日子还不如刚打天下那会儿」被举报' },
      '浙东寒门书生': { npcName: '母亲', relation: '你的母亲，因在邻家闲谈时说了句犯忌的话' },
      '应天府商贾之子': { npcName: '老父亲', relation: '你的父亲，因生意场上的一句抱怨被暗探听到' },
      '落魄前元官员之后': { npcName: '母亲陈秀英', relation: '你的母亲——她的前朝身份，终于被人翻了出来' }
    },
    backgroundStory: '你收到了一个消息——你最重要的至亲被锦衣卫抓了。罪名是「诽谤朝廷」——据说是你的至亲在和邻居闲聊时说了一句「如今的日子还不如前元/还不如太祖刚打天下那会儿」。这句话被锦衣卫的暗探听到了。在洪武朝，「诽谤朝廷」可以轻至杖责为民，也可以重至——死。你的至亲被关在诏狱最深处。锦衣卫给你的暗示很明确：「交出一百两黄金，案子可以『从轻』处理。」或者——「把你手中这些年积攒的那些案卷交出来，我们当什么都没发生过。」你在诏狱外站了很久。黄金，你凑得出来。案卷，你这些年也确实暗中保存了一些——那些能证明某些冤案的证据。但交出去，那些冤死的人就永远没有翻案的机会了。',
    sceneDescription: '诏狱的墙壁在滴水。你至亲的声音从墙后面传来——微弱，但还在。「别交……别把那些东西给他们……」',
    narrativeDirective: '这是游戏中最「道德两难」的事件。三个选择分别代表：金钱（物质代价）、良心（精神代价）、自由（生命代价）。没有正确答案。',
    countdownTurns: 3,
    countdownDescription: '你的至亲在诏狱中撑不了太久，每回合都在受刑',
    countdownStates: [
      { turn: 0, desc: '至亲已被打十杖，但始终没有招供' },
      { turn: 1, desc: '至亲开始说胡话，身体撑不住了' },
      { turn: 2, desc: '锦衣卫下了最后通牒——明日不来，就按「诽谤朝廷」处死' }
    ],
    timeoutOutcome: {
      desc: '你未能及时行动。你的至亲在诏狱中被折磨致死。临死前，她/他只留给你一句话：「好好活着。」',
      npcFate: '处死',
      effects: { bond: -6, wisdom: -2 },
      npcState: 'dead',
      tags: { '至亲之死': { permanent: true, affectsCrises: ['crisis_finale'] } }
    },
    choices: [
      {
        id: 'A', label: '交出一百两黄金赎人',
        primaryAttr: 'power', threshold: 0, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '至亲获释，但你倾家荡产。在终局中缺少经济资源', effects: { power: -4, bond: 4 }, npcFate: '获释·倾家荡产', tags: { '倾家荡产': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          normal: { desc: '至亲获释，你掏空了家底', effects: { power: -3, bond: 3 }, npcFate: '获释' },
          unfavorable: { desc: '你交了黄金，但锦衣卫食言，只放回一具伤痕累累的身体', effects: { power: -4, bond: -2 }, npcFate: '获释·重伤' }
        },
        tags: {}, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'B', label: '交出案卷换取自由',
        primaryAttr: 'wisdom', threshold: 0, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '至亲获释，案卷被锦衣卫销毁。你获得「背弃者」之名', effects: { bond: 3, fame: -3 }, npcFate: '获释', tags: { '背弃者': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          normal: { desc: '至亲获释，但你亲手烧掉了那些冤案的证据', effects: { bond: 3, wisdom: -2 }, npcFate: '获释', tags: { '背弃者': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          unfavorable: { desc: '案卷被销毁，但锦衣卫以「知情不报」为由仍拘押了你的至亲', effects: { power: -4, bond: -3 }, npcFate: '未获释', tags: { '背弃者': { permanent: true, affectsCrises: ['crisis_finale'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '崩溃边缘'
      },
      {
        id: 'C', label: '自首顶罪——向锦衣卫自首，替至亲顶罪',
        primaryAttr: 'wisdom', threshold: 65, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '至亲获释，你被关入诏狱。你在狱中撑过了最后的回合，带着满身伤痕走出诏狱', effects: { bond: 6, fame: 3 }, npcFate: '至亲获释·你入狱', healthImpact: '重伤', tags: { '顶罪者': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          normal: { desc: '至亲获释，你在狱中受尽折磨，但总算活了下来', effects: { bond: 5 }, npcFate: '至亲获释·你入狱', healthImpact: '重伤', tags: { '顶罪者': { permanent: true, affectsCrises: ['crisis_finale'] } } },
          unfavorable: { desc: '至亲获释，但你在狱中被打成重伤，几乎没能活着出来', effects: { bond: 4, power: -4 }, npcFate: '至亲获释·你重伤', healthImpact: '濒死', tags: { '顶罪者': { permanent: true, affectsCrises: ['crisis_finale'] } } }
        },
        tags: {}, healthImpact: null, mentalImpact: '崩溃边缘'
      }
    ],
    npcDeathConsequence: {
      tag: '至亲之死', permanent: true,
      effectOnWisdom: -5,
      narrativeImpact: '所有涉及亲人、家庭、临终嘱托的场景'
    },
    chainsTo: ['crisis_finale'],
    chainRequires: { '至亲之死': { present: true, difficultyMod: 2 } },
    chainEffect: function(gs, choiceId, outcome) {
      if (gs.crisisTags && gs.crisisTags['至亲之死']) {
        return { crisis_finale: { difficultyMod: 2 } };
      }
      return {};
    }
  },

  // ===== crisis_finale: 帝王崩·天命落（终局） =====
  {
    id: 'crisis_finale',
    title: '帝王崩·天命落',
    type: 'B',
    isFinale: true,
    window: { start: 57, end: 60 },
    minIntervalFromLastCrisis: 0,
    minIntervalFromAnchor: 0,
    requiredNPCs: null,
    triggerCondition: function(gs) { return gs.turn >= 57; },
    triggerProbability: 1.0,
    originVariants: {
      '淮西武将之后': {
        conflictDesc: '淮西旧部已被清洗大半，你是硕果仅存的几家之一。燕王派人密信招揽——跟，还是不跟？',
        keyNPC: '蓝玉已死，军中旧交或死或贬，孤立无援'
      },
      '浙东寒门书生': {
        conflictDesc: '东宫派（方孝孺等人）拉你入幕，但你知道建文帝削藩必激起兵变',
        keyNPC: '方孝孺、黄子澄等书生意气，但不懂军事'
      },
      '应天府商贾之子': {
        conflictDesc: '商路依赖朝廷稳定，但燕王控制北方商道——两边下注还是选边？',
        keyNPC: '父亲年迈，家族产业是筹码也是软肋'
      },
      '落魄前元官员之后': {
        conflictDesc: '前朝旧事早已被遗忘，但新政权对「身份可疑」者更加敏感',
        keyNPC: '母亲的秘密可能在权力真空中被翻出'
      }
    },
    backgroundStory: '洪武三十一年，闰五月初十。皇帝驾崩了。消息在黎明前传遍了应天府。钟声响起——不是朝会的钟声，而是那种你从未听过的、缓慢而沉重的丧钟。你站在衙署的院子里，看着天色从黑变灰。你知道，一个时代结束了。但你更知道，真正的危险才刚刚开始。皇帝的遗诏——「皇太孙即位」——还没有公开宣读。在这段真空期里，整个应天府的权力格局像一盘被打翻的棋。你收到了三封信：第一封来自锦衣卫的某位千户——「识时务者为俊杰。把你知道的交出来，新朝需要你这样的人。」第二封来自一位藩王的使者——「殿下记得你在东宫时的选择。站在正确的一边，你将得到一切。」第三封来自你的至亲——「快走。别回头。」你在洪武朝活了三十年。你经历了九场风暴，在诏狱里挨过杖，在刑堂上低过头，在权力面前弯过腰。现在，最后的十字路口在你面前展开。你必须选择——你要成为什么样的人？',
    sceneDescription: '丧钟在响。三封信在你手中。你站在时代的门槛上。身后是三十年的血与火，前方是未知的深渊。',
    narrativeDirective: '终局危机——整个60回合的总清算。这不是一个简单的判定，而是对你三十年宦海生涯的最终审判。天命值可在关键节点消耗，扭转一次致命判定。',
    phases: [
      { turn: 57, title: '国丧', desc: '朱元璋驾崩，遗诏宣读。满城缟素之中，你的第一反应是什么？' },
      { turn: 58, title: '站队', desc: '各方势力开始拉拢，你必须表明立场——锦衣卫、藩王、至亲，三封信摆在你面前。' },
      { turn: 59, title: '暗涌', desc: '削藩风声渐起，你收到密报——有人在清点你的家产。' },
      { turn: 60, title: '天命落', desc: '最终结局结算。你的选择决定了家族的命运。' }
    ],
    choices: [
      {
        id: 'A', label: '留在应天府，拥立皇太孙（正统路线）',
        primaryAttr: 'people', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '结局A+：你保全了名节，新朝百姓拥戴', effects: { people: 5, fame: 4 } },
          normal: { desc: '结局A：你保全了名节，但在新朝中未必有好的前途', effects: { people: 3, fame: 2 } },
          unfavorable: { desc: '结局A-：你留在应天府，但站错了队，在新朝中被边缘化', effects: { power: -3, fame: 1 } }
        },
        tags: { '拥立东宫': { permanent: true, affectsCrises: [] } }, healthImpact: null, mentalImpact: null
      },
      {
        id: 'B', label: '交出所有筹码，投靠新主（实用主义路线）',
        primaryAttr: 'power', threshold: 50, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '结局B+：新朝权贵，但良心受谴', effects: { power: 5, fame: -3 } },
          normal: { desc: '结局B：被边缘化的老臣', effects: { power: 3, fame: -2 } },
          unfavorable: { desc: '结局B-：你投靠的人自身难保，你也被连累', effects: { power: -4, bond: -3 } }
        },
        tags: { '投靠新主': { permanent: true, affectsCrises: [] } }, healthImpact: null, mentalImpact: '焦虑'
      },
      {
        id: 'C', label: '趁乱出逃，远离应天府（自由路线）',
        primaryAttr: 'wisdom', threshold: 55, secondaryCheck: null,
        outcomes: {
          favorable: { desc: '结局C+：你成功隐居，安享余年', effects: { wisdom: 3, bond: 2 } },
          normal: { desc: '结局C：流亡，颠沛流离', effects: { wisdom: 2, power: -2 } },
          unfavorable: { desc: '结局C-：你在出逃路上被盘查扣留', effects: { power: -4, wisdom: -2 } }
        },
        tags: { '出逃': { permanent: true, affectsCrises: [] } }, healthImpact: null, mentalImpact: null
      }
    ],
    chainsTo: [],
    chainEffect: null
  },
];

// 快速索引：id → event object
var _crisisEventMap = {};
(function() {
  for (var i = 0; i < CRISIS_STORY_EVENTS.length; i++) {
    _crisisEventMap[CRISIS_STORY_EVENTS[i].id] = CRISIS_STORY_EVENTS[i];
  }
})();

// ---------- canTriggerCrisis() ----------
function canTriggerCrisis(turn) {
  // 条件1：冷却期（距上次危机至少3回合）
  if (GameState.lastCrisisTurn > 0 && (turn - GameState.lastCrisisTurn) < CRISIS_SCHEDULER.constraints.minIntervalBetweenCrisis) {
    return false;
  }
  // 条件2：距上次锚点至少2回合
  if (GameState.lastAnchorTurn > 0 && (turn - GameState.lastAnchorTurn) < CRISIS_SCHEDULER.constraints.minIntervalFromAnchor) {
    return false;
  }
  // 条件3：当前不在锚点窗口内
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    var a = HISTORY_ANCHORS[i];
    if (turn >= a.start && turn <= a.end) return false;
  }
  // 条件4：不在锚点前1回合（紧迫节奏期）
  for (var i = 0; i < HISTORY_ANCHORS.length; i++) {
    if (HISTORY_ANCHORS[i].start - turn === 1) return false;
  }
  // 条件5：当前回合不能有EA正在触发（v3.14.0: 统一走 isEATurn，P1-2）
  if (isEATurn(turn)) return false;
  // 条件6：pacing不为紧迫/反转/沉淀
  var pacing = GameState.pacing;
  if (pacing === '紧迫' || pacing === '反转' || pacing === '沉淀') return false;

  return true;
}

// ---------- isCrisisNPCAlive() ----------
function isCrisisNPCAlive(evt, turn) {
  if (!evt.requiredNPCs) return true;
  var reqs = evt.requiredNPCs;

  // 格式：出身线NPC检查
  if (reqs.type === 'originNPC') {
    var npcState = GameState.originNPCState[reqs.key];
    if (!npcState) return true; // 未记录=默认存活
    return reqs.states_alive.indexOf(npcState) !== -1;
  }

  // 格式：字符串数组或对象数组
  for (var i = 0; i < reqs.length; i++) {
    var req = reqs[i];
    var npcName, allowStates;
    if (typeof req === 'string') {
      npcName = req;
      allowStates = null;
    } else {
      npcName = req.name;
      allowStates = req.allowStates || null;
    }

    // 优先级1: npcCrisisState
    if (GameState.npcCrisisState[npcName]) {
      var cs = GameState.npcCrisisState[npcName];
      if (cs === 'dead') return false;
      if (allowStates && allowStates.indexOf(cs) === -1) return false;
      continue;
    }
    // 优先级2: NPC_BIRTH_DEATH
    if (typeof NPC_BIRTH_DEATH !== 'undefined' && NPC_BIRTH_DEATH[npcName]) {
      var npcInfo = NPC_BIRTH_DEATH[npcName];
      if (npcInfo.death) {
        var deathTurn = _crisisYearToTurn(npcInfo.death);
        if (turn > deathTurn) return false;
      }
    }
  }
  return true;
}

// 辅助：年份→回合号（v3.14.0 改为统一查 ANCHOR_TURN_TABLE，P1-3）
// 说明：旧实现曾用 (year-1373)*2.85 线性近似，对胡惟庸1380→T20（应为12-15）、
//   朱标1392→T54（应为43-44）、蓝玉1393→T57（应为47-49）均产生误判，
//   导致 isCrisisNPCAlive 在这些NPC死后仍判定存活。v3.13.0 改为锚点对插值，
//   v3.14.0 将锚点对收敛为统一常量 ANCHOR_TURN_TABLE，行为不变。
function _crisisYearToTurn(year) {
  return yearToTurn(year);
}

// ---------- getEligibleEvents() ----------
function getEligibleEvents(turn) {
  var eligible = [];
  for (var w = 0; w < CRISIS_SCHEDULER.windows.length; w++) {
    var win = CRISIS_SCHEDULER.windows[w];
    if (turn < win.windowStart || turn > win.windowEnd) continue;
    for (var e = 0; e < win.eventIds.length; e++) {
      var evtId = win.eventIds[e];
      var evt = _crisisEventMap[evtId];
      if (!evt) continue;
      // v3.13.0：事件自身精确窗口（若配置则按回合过滤）
      if (evt.window && (turn < evt.window.start || turn > evt.window.end)) continue;
      // 已触发跳过
      if (GameState.crisisEventsTriggered.indexOf(evt.id) !== -1) continue;
      // 自定义条件
      if (evt.triggerCondition && !evt.triggerCondition(GameState)) continue;
      // NPC存活
      if (!isCrisisNPCAlive(evt, turn)) continue;
      eligible.push(evt);
    }
    // v3.13.0：移除“找到合格即 break”，遍历全部 group 收集，
    // 使重叠窗口（如 crisis_4/5 同窗口、crisis_13/14 相邻）都能正确进入调度
  }
  return eligible;
}

// ---------- activateCrisisEvent() ----------
function activateCrisisEvent(evt) {
  var turn = GameState.turn;
  GameState.crisisEventsTriggered.push(evt.id);
  GameState.lastCrisisTurn = turn;
  GameState.activeCrisisEvent = {
    eventId: evt.id,
    data: evt,
    startTurn: turn,
    countdown: evt.countdownTurns || 0,
    choices: evt.choices
  };
  // v3.13.0 限时倒计时初始化
  if (evt.countdownTurns) {
    if (!GameState.crisisTimers) GameState.crisisTimers = {};
    GameState.crisisTimers[evt.id] = {
      remaining: evt.countdownTurns,
      total: evt.countdownTurns,
      startTurn: turn,
      lastDecrementTurn: turn,
      states: evt.countdownStates || null,
      currentStateIndex: 0
    };
  }
  console.log('[生死危机] 触发「' + evt.title + '」(id=' + evt.id + ') at T' + turn);
  return GameState.activeCrisisEvent;
}

// ---------- checkCrisisStoryEvent() ----------
function checkCrisisStoryEvent() {
  var turn = GameState.turn;
  // v3.13.0：终局窗口（T57-60）内强制触发 crisis_finale，
  // 不再调度新常规危机事件（HISTORY_ANCHORS[8] = 朱元璋驾崩锚点，start = 第57回）
  if (turn >= HISTORY_ANCHORS[8].start) {
    var finaleTriggered = GameState.crisisEventsTriggered &&
      GameState.crisisEventsTriggered.indexOf('crisis_finale') !== -1;
    if (!finaleTriggered && !GameState.activeCrisisEvent) {
      skipRemainingCrisisEvents();
      var finaleEvt = _crisisEventMap['crisis_finale'];
      if (finaleEvt) return activateCrisisEvent(finaleEvt);
    }
    return null;
  }
  // 当前有活跃危机
  if (GameState.activeCrisisEvent) return null;
  // 冷却+屏蔽
  if (!canTriggerCrisis(turn)) return null;
  // 获取合格事件
  var eligible = getEligibleEvents(turn);
  if (eligible.length === 0) return null;
  // 概率触发 + 窗口末尾保底（越接近窗口末尾概率越高）+ 连锁标签修正
  for (var i = 0; i < eligible.length; i++) {
    var evt = eligible[i];
    var baseProb = evt.triggerProbability || 0.75;
    // 窗口末尾概率递增
    var distToEnd = evt.window.end - turn;
    var windowSize = evt.window.end - evt.window.start + 1;
    var endBonus = (windowSize > 1) ? (1 - distToEnd / windowSize) * 0.3 : 0;
    var finalProb = Math.min(1.0, baseProb + endBonus);
    // v3.13.0：chainRequires 已持有所需标签 → 触发概率提升（难度修正见 resolveCrisisJudgment）
    if (evt.chainRequires) {
      var hasReq = true;
      for (var reqTag in evt.chainRequires) {
        if (evt.chainRequires.hasOwnProperty(reqTag)) {
          var req = evt.chainRequires[reqTag];
          var tagInfo = GameState.crisisTags && GameState.crisisTags[reqTag];
          var tagPresent = tagInfo && (tagInfo.permanent || (tagInfo.expiresAt && GameState.turn <= tagInfo.expiresAt));
          if (req.present === true && !tagPresent) { hasReq = false; break; }
          if (req.present === false && tagPresent) { hasReq = false; break; }
        }
      }
      if (hasReq) finalProb = Math.min(1.0, finalProb + 0.25);
    }
    // 窗口最后一回合100%触发
    if (distToEnd === 0) finalProb = 1.0;
    if (Math.random() < finalProb) {
      return activateCrisisEvent(evt);
    }
  }
  return null;
}

// ---------- skipRemainingCrisisEvents() ----------
// v3.13.0：终局启动时，将尚未触发的常规危机事件标记为已跳过，
// 避免终局后调度死锁；记录被跳过的 id 供叙事补丁读取
function skipRemainingCrisisEvents() {
  if (!GameState.crisisEventsTriggered) GameState.crisisEventsTriggered = [];
  var skipped = [];
  for (var i = 0; i < CRISIS_STORY_EVENTS.length; i++) {
    var evt = CRISIS_STORY_EVENTS[i];
    if (evt.isFinale) continue;
    if (GameState.crisisEventsTriggered.indexOf(evt.id) === -1) {
      GameState.crisisEventsTriggered.push(evt.id);
      skipped.push(evt.id);
    }
  }
  if (skipped.length > 0) {
    console.log('[生死危机] 终局启动，跳过未触发的常规危机事件：' + skipped.join(', '));
    if (!GameState.crisisSkippedEvents) GameState.crisisSkippedEvents = [];
    GameState.crisisSkippedEvents = GameState.crisisSkippedEvents.concat(skipped);
  }
  return skipped;
}

// ---------- crisisTimerTick() ----------
// v3.13.0 限时倒计时机制：每回合推进时递减活跃危机的倒计时；
// 递减到 0 仍未解决 → 执行 timeoutOutcome 并结束该事件
function crisisTimerTick() {
  if (!GameState.crisisTimers) return false;
  var turn = GameState.turn;
  var expired = [];
  for (var eventId in GameState.crisisTimers) {
    if (!GameState.crisisTimers.hasOwnProperty(eventId)) continue;
    var timer = GameState.crisisTimers[eventId];
    if (!timer || timer.remaining <= 0) continue;
    // 同一回合内只递减一次（防重复调用）
    if (timer.lastDecrementTurn === turn) continue;
    timer.remaining -= 1;
    timer.lastDecrementTurn = turn;
    // 推进 countdownStates 状态索引（供叙事注入读取当前阶段）
    if (timer.states && timer.total) {
      var elapsed = timer.total - timer.remaining;
      timer.currentStateIndex = Math.min(timer.states.length - 1, elapsed);
    }
    if (timer.remaining <= 0) {
      expired.push(eventId);
    } else {
      console.log('[生死危机] 限时倒计时：' + eventId + ' 剩余 ' + timer.remaining + ' 回合');
    }
  }
  // 处理超时后果
  for (var i = 0; i < expired.length; i++) {
    var expiredId = expired[i];
    var t = GameState.crisisTimers[expiredId];
    var evt = _crisisEventMap[expiredId];
    console.log('[生死危机] 限时倒计时结束：' + expiredId + ' 超时');
    if (evt && evt.timeoutOutcome) {
      var to = evt.timeoutOutcome;
      if (to.effects) {
        for (var key in to.effects) {
          if (to.effects.hasOwnProperty(key)) {
            if (GameState.attributes[key] !== undefined) {
              GameState.attributes[key] = Math.max(0, Math.min(100, GameState.attributes[key] + to.effects[key]));
            } else if (GameState.factions[key] !== undefined) {
              GameState.factions[key] = Math.max(-100, Math.min(100, GameState.factions[key] + to.effects[key]));
            }
          }
        }
      }
      if (to.healthImpact) applyHealthImpact(to.healthImpact);
      if (to.mentalImpact) applyMentalStateImpact(to.mentalImpact);
      if (to.tags) {
        for (var tagName in to.tags) {
          if (to.tags.hasOwnProperty(tagName)) {
            var tagData = to.tags[tagName];
            GameState.crisisTags[tagName] = {
              turn: turn,
              expiresAt: tagData.expiresAt || null,
              permanent: tagData.permanent || false,
              affectsCrises: tagData.affectsCrises || []
            };
          }
        }
      }
      if (to.npcFate && evt.requiredNPCs && evt.requiredNPCs.type === 'originNPC') {
        GameState.originNPCState[evt.requiredNPCs.key] = 'dead';
        if (evt.npcDeathConsequence) {
          var nc = evt.npcDeathConsequence;
          GameState.crisisTags[nc.tag] = { turn: turn, permanent: true, affectsCrises: [] };
          if (nc.effectOnWisdom) {
            GameState.attributes.wisdom = Math.max(0, GameState.attributes.wisdom + nc.effectOnWisdom);
          }
        }
      }
    }
    // 结束该事件（若仍处于活跃状态）
    if (GameState.activeCrisisEvent && GameState.activeCrisisEvent.eventId === expiredId) {
      if (GameState.crisisEventsCompleted.indexOf(expiredId) === -1) {
        GameState.crisisEventsCompleted.push(expiredId);
      }
      GameState.activeCrisisEvent = null;
      GameState.crisisJudgmentPending = false;
    }
    delete GameState.crisisTimers[expiredId];
  }
  return expired.length > 0;
}

// ---------- applyHealthImpact() ----------
function applyHealthImpact(impact) {
  var currentIdx = HEALTH_LEVELS.indexOf(GameState.health);
  if (currentIdx === -1) currentIdx = 0;
  var delta = 0;
  switch (impact) {
    case '轻伤': delta = 1; break;
    case '重伤': delta = 2; break;
    case '濒死': delta = 3; break;
    case '休养恢复': delta = -1; break;
    case '充分恢复': delta = -2; break;
    default: delta = 0;
  }
  var newIdx = Math.max(0, Math.min(HEALTH_LEVELS.length - 1, currentIdx + delta));
  var oldHealth = GameState.health;
  GameState.health = HEALTH_LEVELS[newIdx];
  if (delta > 0) GameState.permanentBodyDamage += delta * 2;
  console.log('[health] ' + oldHealth + ' → ' + GameState.health + ' (impact: ' + impact + ')');
  return { from: oldHealth, to: GameState.health };
}

// ---------- applyMentalStateImpact() ----------
function applyMentalStateImpact(impact) {
  if (typeof impact === 'function') return { from: GameState.mentalState, to: GameState.mentalState };
  if (!impact) return { from: GameState.mentalState, to: GameState.mentalState };
  var currentIdx = MENTAL_LEVELS.indexOf(GameState.mentalState);
  if (currentIdx === -1) currentIdx = 0;
  var delta = 0;
  switch (impact) {
    case '焦虑': delta = 1; break;
    case '崩溃边缘': delta = 2; break;
    case '崩溃': delta = 3; break;
    case '沉淀恢复': delta = -1; break;
    case '充分恢复': delta = -2; break;
    default: delta = 0;
  }
  var newIdx = Math.max(0, Math.min(MENTAL_LEVELS.length - 1, currentIdx + delta));
  var oldState = GameState.mentalState;
  GameState.mentalState = MENTAL_LEVELS[newIdx];
  if (delta > 0) GameState.permanentMentalDamage += delta * 2;
  console.log('[mentalState] ' + oldState + ' → ' + GameState.mentalState + ' (impact: ' + impact + ')');
  return { from: oldState, to: GameState.mentalState };
}

// ---------- resolveCrisisJudgment() ----------
function resolveCrisisJudgment(choiceId) {
  var crisis = GameState.activeCrisisEvent;
  if (!crisis) return null;
  var evt = crisis.data;
  var choice = null;
  for (var i = 0; i < evt.choices.length; i++) {
    if (evt.choices[i].id === choiceId) { choice = evt.choices[i]; break; }
  }
  if (!choice) return null;

  // 属性判定
  var attrVal = GameState.attributes[choice.primaryAttr] || 50;
  // 永久伤害惩罚
  if (choice.primaryAttr === 'power' || choice.primaryAttr === 'people' || choice.primaryAttr === 'bond') {
    attrVal = Math.max(0, attrVal - Math.floor(GameState.permanentBodyDamage / 2));
  }
  var threshold = choice.threshold || 50;
  var diff = attrVal - threshold;

  // 标签修正
  var tagMod = 0;
  if (evt.chainEffect && typeof evt.chainEffect === 'function') {
    // 已有标签增加难度
    for (var tag in GameState.crisisTags) {
      if (GameState.crisisTags[tag] && GameState.crisisTags[tag].affectsCrises) {
        if (GameState.crisisTags[tag].affectsCrises.indexOf(evt.id) !== -1) {
          tagMod -= 5;
        }
      }
    }
  }
  // v3.13.0 跨事件连锁难度修正：chainRequires 已持有所需标签 → 难度提升
  if (evt.chainRequires) {
    for (var reqTag in evt.chainRequires) {
      if (evt.chainRequires.hasOwnProperty(reqTag)) {
        var req = evt.chainRequires[reqTag];
        var tagInfo = GameState.crisisTags && GameState.crisisTags[reqTag];
        var tagPresent = tagInfo && (tagInfo.permanent || (tagInfo.expiresAt && GameState.turn <= tagInfo.expiresAt));
        if (req.present === true && tagPresent && req.difficultyMod) {
          tagMod -= req.difficultyMod;
        }
        if (req.present === false && !tagPresent && req.difficultyMod) {
          tagMod -= req.difficultyMod;
        }
      }
    }
  }
  diff += tagMod;

  // 概率池判定
  var pool, result;
  if (diff >= 10) {
    pool = 'favorable';
    result = Math.random() < 0.70 ? 'favorable' : 'normal';
  } else if (diff >= -10) {
    pool = 'normal';
    result = Math.random() < 0.50 ? 'favorable' : 'unfavorable';
  } else {
    pool = 'unfavorable';
    result = Math.random() < 0.25 ? 'favorable' : 'unfavorable';
  }

  var outcome = choice.outcomes[result] || choice.outcomes.normal;
  var effects = outcome.effects || {};

  // 应用属性效果
  for (var key in effects) {
    if (effects.hasOwnProperty(key)) {
      if (GameState.attributes[key] !== undefined) {
        GameState.attributes[key] = Math.max(0, Math.min(100, GameState.attributes[key] + effects[key]));
      } else if (GameState.factions[key] !== undefined) {
        GameState.factions[key] = Math.max(-100, Math.min(100, GameState.factions[key] + effects[key]));
      }
    }
  }

  // 应用健康/精神状态效果
  if (choice.healthImpact) applyHealthImpact(choice.healthImpact);
  var mentalImp = choice.mentalImpact;
  if (typeof mentalImp === 'function') mentalImp = mentalImp(result);
  if (mentalImp) applyMentalStateImpact(mentalImp);

  // 应用标签
  if (choice.tags) {
    for (var tagName in choice.tags) {
      if (choice.tags.hasOwnProperty(tagName)) {
        var tagData = choice.tags[tagName];
        GameState.crisisTags[tagName] = {
          turn: GameState.turn,
          expiresAt: tagData.expiresAt || null,
          permanent: tagData.permanent || false,
          affectsCrises: tagData.affectsCrises || []
        };
      }
    }
  }

  // NPC命运
  var npcFate = outcome.npcFate || null;
  if (npcFate && evt.requiredNPCs && evt.requiredNPCs.type === 'originNPC') {
    if (npcFate.indexOf('未救出') !== -1) {
      GameState.originNPCState[evt.requiredNPCs.key] = 'dead';
      // NPC死亡后果
      if (evt.npcDeathConsequence) {
        var nc = evt.npcDeathConsequence;
        GameState.crisisTags[nc.tag] = { turn: GameState.turn, permanent: true, affectsCrises: [] };
        if (nc.effectOnWisdom) {
          GameState.attributes.wisdom = Math.max(0, GameState.attributes.wisdom + nc.effectOnWisdom);
        }
      }
    } else {
      GameState.originNPCState[evt.requiredNPCs.key] = 'rescued';
    }
  }

  // v3.13.0 终局危机特殊处理：不立即结束，记录选择并推进阶段（4阶段持续叙事）
  if (evt.isFinale) {
    if (!GameState.crisisFinaleChoices) GameState.crisisFinaleChoices = [];
    GameState.crisisFinaleChoices.push({
      turn: GameState.turn,
      phase: GameState.crisisFinalePhase || 0,
      choiceId: choiceId,
      choiceLabel: choice.label,
      result: result,
      outcomeDesc: outcome.desc || ''
    });
    if (GameState.crisisFinalePhase === undefined) GameState.crisisFinalePhase = 0;
    // T57-59 推进阶段并保留 activeCrisisEvent（每回合继续危机叙事）；
    // T60 为最终回合，完成事件释放给 ending 结算
    if (GameState.turn < 60) {
      GameState.crisisFinalePhase += 1;
      GameState.crisisJudgmentPending = false;
    } else {
      GameState.crisisEventsCompleted.push(evt.id);
      GameState.activeCrisisEvent = null;
      GameState.crisisJudgmentPending = false;
    }
    console.log('[生死危机] 终局「' + evt.title + '」阶段' + GameState.crisisFinalePhase + ' 选择=' + choiceId);
  } else {
    // 完成危机事件
    GameState.crisisEventsCompleted.push(evt.id);
    GameState.activeCrisisEvent = null;
    GameState.crisisJudgmentPending = false;
  }

  console.log('[生死危机] 完成「' + evt.title + '」选择=' + choiceId + ' 池=' + pool + ' 结果=' + result);

  return {
    eventId: evt.id,
    eventTitle: evt.title,
    choiceId: choiceId,
    choiceLabel: choice.label,
    pool: pool,
    result: result,
    outcome: outcome,
    effects: effects,
    npcFate: npcFate,
    healthChange: GameState.health,
    mentalChange: GameState.mentalState
  };
}

// ---------- spendFatePoint() ----------
function spendFatePoint(crisisId, reason) {
  if (GameState.fatePoints <= 0) return { spent: false, reason: '天命值不足' };
  GameState.fatePoints -= 1;
  GameState.fatePointsSpent.push({ turn: GameState.turn, eventId: crisisId, reason: reason || '' });
  console.log('[天命值] 消耗1点，剩余' + GameState.fatePoints + '点');
  return { spent: true, remaining: GameState.fatePoints };
}

// ---------- naturalRecoveryCheck() ----------
function naturalRecoveryCheck() {
  if (GameState.turn % 5 !== 0) return;
  var pacing = GameState.pacing;
  if (pacing === '缓冲' || pacing === '日常' || pacing === '沉淀') {
    if (GameState.health !== '健康' && GameState.attributes.bond >= 30) {
      applyHealthImpact('休养恢复');
    }
    if (GameState.mentalState !== '稳定' && pacing !== '紧迫') {
      applyMentalStateImpact('沉淀恢复');
    }
  }
}

// ---------- migrateGameState() ----------
function migrateGameState(gs) {
  if (gs.health === undefined) gs.health = '健康';
  if (gs.mentalState === undefined) gs.mentalState = '稳定';
  if (gs.fatePoints === undefined) gs.fatePoints = 0;
  if (gs.fatePointsEarned === undefined) gs.fatePointsEarned = [];
  if (gs.fatePointsSpent === undefined) gs.fatePointsSpent = [];
  if (gs.crisisEventsTriggered === undefined) gs.crisisEventsTriggered = [];
  if (gs.crisisEventsCompleted === undefined) gs.crisisEventsCompleted = [];
  if (gs.lastCrisisTurn === undefined) gs.lastCrisisTurn = 0;
  if (gs.lastAnchorTurn === undefined) gs.lastAnchorTurn = 0;
  if (gs.activeCrisisEvent === undefined) gs.activeCrisisEvent = null;
  if (gs.crisisJudgmentPending === undefined) gs.crisisJudgmentPending = false;
  if (gs.crisisTags === undefined) gs.crisisTags = {};
  if (gs.permanentBodyDamage === undefined) gs.permanentBodyDamage = 0;
  if (gs.permanentMentalDamage === undefined) gs.permanentMentalDamage = 0;
  if (gs.npcCrisisState === undefined) gs.npcCrisisState = {};
  if (gs.originNPCState === undefined) gs.originNPCState = {};
  // v3.13.0 生死危机 Phase 2 字段
  if (gs.crisisTimers === undefined) gs.crisisTimers = {};
  if (gs.crisisFinalePhase === undefined) gs.crisisFinalePhase = 0;
  if (gs.crisisFinaleChoices === undefined) gs.crisisFinaleChoices = [];
  if (gs.crisisSkippedEvents === undefined) gs.crisisSkippedEvents = [];
  return gs;
}
// ========== END v3.12.0 生死危机事件层 ==========
