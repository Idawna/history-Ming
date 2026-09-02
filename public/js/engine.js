// ========== LIVE MODE: CALL BOT API VIA PROXY ==========
// 收集最近 n 段叙事的纯文本，作为"前情提要"随每回合下发
// 作用：①读档后 chatHistory 清空，AI 靠这个衔接剧情 ②长局历史被裁剪后也不会忘身世
function collectRecentPlot(n) {
  const texts = [];
  const areas = gameContainer.querySelectorAll('.narrative-area .narrative-text');
  for (let i = areas.length - 1; i >= 0 && texts.length < n; i--) {
    const t = areas[i].textContent.trim();
    if (t) texts.unshift(t);
  }
  if (!texts.length) return undefined;
  return '【前情提要】以下是玩家屏幕上已发生的最近剧情，必须无缝衔接、保持连贯，但严禁重复其中已写过的场景、事件、措辞与桥段（不得把同一件事再写一遍、不得让玩家原地经历相似情节）：\n' + texts.join('\n');
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

// 1. 获取当前在世NPC列表（v3.9：信息隔离——对绑定未来锚点的NPC附加禁止指令）
// v3.8.15修正：刘伯温之死是锚点事件1，必须等锚点完成后才算死亡
function getAliveNPCs(year) {
  const alive = [];
  const dead = [];
  for (const [name, info] of Object.entries(NPC_BIRTH_DEATH)) {
    var isDead = year >= info.death;
    // 特殊处理：刘伯温之死是锚点事件1，必须等锚点完成后才算死亡
    if (name === '刘伯温' || name === '刘基') {
      if (!GameState.completedAnchors || !GameState.completedAnchors.includes(1)) {
        isDead = false; // 锚点1未完成，刘伯温不算死亡
      }
    }
    // P0-1: 毛骧特殊处理——1382年前锦衣卫不存在，毛骧不出场
    if (name === '毛骧' && year < 1382) {
      isDead = true; // 未出场，不显示
    }
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
// v3.8.15修正：刘伯温之死是锚点事件1，必须等锚点完成后才算死亡
function getDeadNPCs(year) {
  var dead = [];
  for (var name in NPC_BIRTH_DEATH) {
    var info = NPC_BIRTH_DEATH[name];
    var isDead = year >= info.death;
    // 特殊处理：刘伯温之死是锚点事件1，必须等锚点完成后才算死亡
    if (name === '刘伯温' || name === '刘基') {
      if (!GameState.completedAnchors || !GameState.completedAnchors.includes(1)) {
        isDead = false; // 锚点1未完成，刘伯温不算死亡
      }
    }
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


// ========== v3.6: background-anchor mapping, ending paths, surveillance ==========

// v3.8.10-fix A4: 出身锚点提示表重建为 1-9 全键，与 HISTORY_ANCHORS id 严格对应
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
      return '\u3010' + a.name + '\u00b7\u4f60\u7684\u5207\u8eab\u89d2\u5ea6\u3011' + h + '\uff08\u4f60\u7684\u6838\u5fc3\u5229\u76ca\uff1a' + m.core_interest + '\u3002\u9009\u9879\u5fc5\u987b\u4ece\u6b64\u89d2\u5ea6\u5207\u5165\uff0c\u81f3\u5c111\u4e2a\u9009\u9879\u76f4\u63a5\u5173\u8054\u6b64\u5229\u76ca\uff09';
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
  // === 隐藏结局 ===
  '墨史归一': '完美平衡，万世太平。',
  '靖难先声': '预见未来，择木而栖。'
};

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
        GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
        GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
          GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
            GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
            GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
        GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
        GameState.rescueAttempted = false; GameState.rescueSucceeded = false;
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
  // P0-1: 近臣监控压力——jinchen <= -60时每5回合种下"被盯上"种子
  if (GameState.factions.jinchen <= -60 && turn % 5 === 0) {
    var watchedSeed = {
      id: '被盯上_' + turn,
      type: '把柄暴露',
      planted_turn: turn,
      trigger_turn: turn + 4,
      effect: { attributes: { power: -5, wisdom: -3 }, emperor_feeling: -8 }
    };
    // 避免重复种入
    if (!GameState.seeds.some(function(s) { return s.id === watchedSeed.id; })) {
      GameState.seeds.push(watchedSeed);
      console.log('[近臣监控] 种下"被盯上"种子，回合', turn);
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
    {name:'\u906e\u81ed\u4e07\u5e74', desc:'\u4e07\u4eba\u5524\u9a82\uff0c\u5978\u4f5e\u4e4b\u540d\u3002\u4f60\u7684\u540d\u5b57\u6210\u4e86\u8d2a\u5b98\u6c61\u540f\u7684\u4ee3\u540d\u8bcd\uff0c\u7559\u4e0b\u5343\u53e4\u9a82\u540d\u3002\u4f60\u7684\u5e9c\u90b8\u91cc\u5806\u6ee1\u4e86\u94f6\u5b50\u548c\u7ee2\u7ef8\uff0c\u4f46\u6bcf\u4e2a\u4eba\u770b\u5230\u4f60\u90fd\u7ed5\u7740\u8d70\u3002\u4f60\u7684\u540d\u5b57\u88ab\u5199\u8fdb\u4e86\u300a\u59e5\u81e3\u4f20\u300b\uff0c\u4e0e\u5386\u4ee3\u5978\u81e3\u5e76\u5217\u3002\u540e\u4eba\u8bfb\u5230\u4f60\u7684\u6545\u4e8b\uff0c\u4f1a\u5578\u7136\u53d1\u7b11\uff0c\u7136\u540e\u8b66\u9192\u81ea\u5df1\u4e0d\u8981\u6210\u4e3a\u8fd9\u6837\u7684\u4eba\u3002',
     check: function(){ return a.fame <= 25 && a.power >= 50 && GameState.attributes.bond <= 25; }},
    {name:'\u4e71\u4e16\u9690\u8005', desc:'\u5f52\u9690\u6797\u6cc9\uff0c\u4e0d\u95ee\u671d\u5803\u3002\u4f60\u653e\u5f03\u4e86\u529f\u540d\u5bcc\u8d35\uff0c\u5728\u5c71\u6c34\u95f4\u627e\u5230\u4e86\u5185\u5fc3\u7684\u5b81\u9759\u3002\u4f60\u7684\u5c0f\u5c4b\u5750\u843d\u5728\u5c71\u811a\u4e0b\uff0c\u95e8\u524d\u6709\u4e00\u4e1b\u7aff\u3001\u4e00\u5f20\u7434\u3002\u5076\u5c14\u6709\u8fc7\u8def\u7684\u6e14\u7fc1\u6765\u6263\u95e8\uff0c\u4f60\u4fbf\u4e0e\u4ed6\u5bf9\u996e\u51e0\u676f\u3002\u671d\u5802\u4e0a\u7684\u98ce\u4e91\u518d\u4e5f\u4e0e\u4f60\u65e0\u5173\u3002\u4f60\u662f\u6d2a\u6b66\u671d\u6700\u4e0d\u8d77\u773c\u7684\u4eba\uff0c\u4e5f\u662f\u552f\u4e00\u771f\u6b63\u81ea\u7531\u7684\u4eba\u3002',
     check: function(){ return a.power <= 20 && a.fame >= 40 && a.wisdom >= 55 && a.people >= 40; }},
    // v3.8.2: 新增fame中间地带结局（填补25-40与40-60之间的空白）
    {name:'乡望素著', desc:'十里八乡，交口称颂。你虽未名动天下，却在乡里间留下了极好的名声。百姓记得你的善举，同僚记得你的为人。你为官一任便造福一方，虽无惊天动地的功业，却在每一个到过的地方留下了温度。这份平凡的尊重，或许比庙堂上的功名更持久——因为功名会被遗忘，而人心的记忆最长。',
     check: function(){ return a.fame >= 25 && a.fame < 40 && a.people >= 45 && a.wisdom >= 35 && a.bond >= 30; }},
    {name:'名满天下', desc:'天下士人谈及当世人物，无人不知你的名字。你未必权倾一时，却以才学与品行赢得了广泛的敬重。你的文章被人传抄，你的品行被人效仿，你的判断被人信赖。这份声望不靠权位维系，而是来自你走过的每一步、做过的每一个决定。百年之后，人们或许记不清洪武朝的宰相是谁，但会记得你的名字。',
     check: function(){ return a.fame >= 40 && a.fame < 60 && a.wisdom >= 50 && a.people >= 40 && a.bond >= 35; }},
    {name:'\u5168\u8eab\u800c\u9000', desc:'\u5e73\u6de1\u662f\u798f\uff0c\u5584\u7ec8\u3002\u4f60\u6ca1\u6709\u5efa\u4e0b\u4e0d\u4e16\u529f\u4e1a\uff0c\u4f46\u5e73\u5e73\u5b89\u5b89\u5ea6\u8fc7\u4e86\u8fd9\u4e2a\u6ce1\u8840\u65f6\u4ee3\u3002\u5728\u6d2a\u6b66\u671d\uff0c\u80fd\u6d3b\u7740\u79bb\u5f00\u5c31\u662f\u6700\u5927\u7684\u80dc\u5229\u3002\u4f60\u7684\u4e00\u751f\u6ca1\u6709\u60ca\u5929\u52a8\u5730\u7684\u4e8b\u8ff9\uff0c\u4f46\u4f60\u7684\u5b50\u5b59\u5b89\u5168\u3001\u5bb6\u65cf\u5ef6\u7eed\u3002\u591a\u5c11\u663e\u8d6b\u7684\u540d\u81e3\u6ca1\u80fd\u505a\u5230\u8fd9\u4e00\u70b9\u3002\u4f60\u7684\u6545\u4e8b\u4e0d\u4f1a\u88ab\u5199\u8fdb\u53f2\u518c\uff0c\u4f46\u4f60\u7684\u540e\u4eba\u4f1a\u8bb0\u5f97\u4f60\u3002',
     check: function(){ return a.power >= 30 && a.power <= 60 && ef >= -10 && allFactionsGTE(-30) && allFactionsLTE(40) && GameState.attributes.bond >= 50; }},
    // v3.8.1: 英年早逝——非暴力死亡，壮志未酬
    {name:'英年早逝', desc:'壮志未酬，赍志而殁。你没能在这个波澜壮阔的时代留下自己的印记，便在默默无闻中走到了终点。你的名字没有出现在任何重要的历史文件中，你的面孔没有被任何人画下。你活过、努力过、挣扎过，但这个时代太大了，大到足以吞没一个普通人的一切。你的故事，就是无数个没有故事的人的故事。',
     check: function(){ return a.power <= 15 && GameState.attributes.bond <= 20 && a.people <= 25 && a.fame <= 20; }}
  ];
  for (var i = 0; i < endings.length; i++) {
    if (endings[i].check()) return endings[i];
  }
  return null;
}

function getHiddenEnding() {
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  // 墨史归一: 完美平衡 (P2-D: 放宽区间，从"不可能"变为"极难但可达")
  if (allFactionsGTE(5) && allFactionsLTE(50) &&
      a.power >= 40 && a.power <= 80 && a.people >= 40 && a.people <= 80 &&
      a.wisdom >= 65 && a.fame >= 40 && a.fame <= 80 && a.bond >= 40 && a.bond <= 80 &&
      ef >= 15 && ef <= 55 && GameState.deathWarningCount <= 2) {
    return {name:'\u58a8\u53f2\u5f52\u4e00', desc:'\u5b8c\u7f8e\u5e73\u8861\uff0c\u4e07\u4e16\u592a\u5e73\u3002\u4f60\u5728\u6d2a\u6b66\u671d\u7684\u6bcf\u4e00\u6b65\u90fd\u8e29\u5728\u4e86\u6700\u5999\u7684\u4f4d\u7f6e\u2014\u2014\u4e0d\u5351\u4e0d\u4ea2\uff0c\u4e0d\u5371\u4e0d\u6024\u3002\u4f60\u4e0d\u662f\u6700\u6709\u6743\u7684\u4eba\uff0c\u4e0d\u662f\u6700\u6709\u540d\u7684\u4eba\uff0c\u4e0d\u662f\u6700\u53d7\u5ba0\u7684\u4eba\u2014\u2014\u4f46\u4f60\u662f\u552f\u4e00\u5728\u6bcf\u4e00\u4e2a\u7ef4\u5ea6\u4e0a\u90fd\u627e\u5230\u4e86\u5e73\u8861\u7684\u4eba\u3002\u6d2a\u6b66\u671d\u7684\u6bcf\u4e00\u573a\u98ce\u66b4\u90fd\u6ca1\u80fd\u51b2\u8d70\u4f60\uff0c\u56e0\u4e3a\u4f60\u4ece\u4e0d\u7ad9\u5728\u4efb\u4f55\u4e00\u4e2a\u6781\u7aef\u3002\u8fd9\u662f\u6700\u96be\u8fbe\u6210\u7684\u7ed3\u5c40\uff0c\u4e5f\u662f\u6700\u5b8c\u7f8e\u7684\u4e00\u4e2a\u2014\u2014\u5b83\u8bc1\u660e\u4e86\uff1a\u5728\u66b4\u529b\u7684\u65f6\u4ee3\uff0c\u6e29\u548c\u4e5f\u662f\u4e00\u79cd\u529b\u91cf\u3002'};
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
  // 优先级: 隐藏 > 出身专属(v3.8.4代码化) > 通用 > 兜底
  var hidden = getHiddenEnding();
  if (hidden) return { title: hidden.name, description: hidden.desc };
  // v3.8.4: 出身专属结局代码化
  var bgEnding = getBackgroundEnding();
  if (bgEnding) return { title: bgEnding.name, description: bgEnding.desc };
  var common = getCommonEnding();
  if (common) return { title: common.name, description: common.desc };
  return null;
}

// v3.8.6: 预判定结局——在终局回合发送给AI之前，用当前GameState预跑一遍结局判定
// 用于注入finale_hint，让AI写出与结局基调匹配的叙事
function predictFinaleEnding() {
  var ending = resolveFinaleEnding();
  if (ending) return ending;
  // 如果当前状态未命中任何结局，返回最接近的结局提示
  var a = GameState.attributes, f = GameState.factions, ef = GameState.emperor_feeling;
  // 简单启发式：根据最高属性/阵营给出倾向
  var hints = [];
  if (a.fame >= 70) hints.push('名望较高，可能走向"青史留名"或"名满天下"');
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
  // 在终局窗口（回合>=55 或 年份>=1393）注入提示
  if (turn >= 55 || year >= 1393) {
    var pred = predictFinaleEnding();
    if (pred.title && pred.title !== '未定') {
      if (isDeathEnding) {
        return '【终局将至】游戏即将进入最终回合。最可能的结局是「' + pred.title + '」。终局叙事必须做到：(1)本回合为死亡结局——叙事应聚焦于角色临终前的心理活动、一生回忆闪回、周围人物的反应与哀恸，**严禁直接描写死亡过程本身**（死因定性与临终场景由系统单独展示，重复会破坏体验）；(2)回顾本局关键抉择与转折；(3)在叙事最末尾另起一行写【墓志铭】后接2-3句对人物一生的个性化评价（系统会自动提取展示，不会混入叙事正文，总计不超过100字）。';
      } else {
        return '【终局将至】游戏即将进入最终回合。最可能的结局是「' + pred.title + '」。终局叙事必须做到：(1)明确交代人物最终归宿与人生收束；(2)回顾本局关键抉择与转折；(3)在叙事最末尾另起一行写【墓志铭】后接2-3句对人物一生的个性化评价（系统会自动提取展示，不会混入叙事正文，总计不超过100字）。';
      }
    } else if (pred.hint) {
      if (isDeathEnding) {
        return '【终局将至】游戏即将进入最终回合。' + pred.hint + '。当前命运已濒临绝境，叙事应聚焦于角色临终前的心理活动、一生回忆闪回、周围人物的反应，**严禁直接描写死亡过程**（死因定性由系统单独展示）。终局叙事末尾另起一行写【墓志铭】后接2-3句个性化总结（系统自动提取展示）。';
      } else {
        return '【终局将至】游戏即将进入最终回合。' + pred.hint + '。终局叙事必须明确交代人物最终命运与归宿，并在叙事最末尾另起一行写【墓志铭】后接2-3句个性化总结（系统自动提取展示）。';
      }
    }
  }
  // 死亡倒计时最后一轮：强化死亡叙事指令（修改：聚焦心理/回忆，不写死亡过程）
  if (GameState.deathCountdown === 1 && GameState.deathCountdownType > 0) {
    var deathTypeIdx = GameState.deathCountdownType - 1;
    if (deathTypeIdx >= 0 && deathTypeIdx < DEATH_NAMES.length) {
      return '【命悬一线】死亡已不可避免——最可能的结局是「' + DEATH_NAMES[deathTypeIdx] + '」。本回合叙事必须聚焦于角色临终前的心理活动、走马灯式的回忆闪回、周围人物的反应与哀恸，写出大厦将倾的绝望感。**严禁直接描写死亡过程本身**——死因定性与临终场景由系统单独展示，重复描写会破坏体验。不要在叙事中写【墓志铭】标记——若角色确认死亡，系统会单独展示完整墓志铭。';
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
    // 空白期后段（距下一锚点1-3回合）→ 🍃缓冲（伏笔渐浓）
    if (distToNext >= 1 && distToNext <= 3) {
      r = { pacing: '缓冲', directive:
      `【节奏指令·硬控】本回合距下一历史节点「${nextAnchorName}」还有${distToNext}回合，节奏为🍃缓冲（暗流涌动）：叙事500-800字，中长句、从容细腻但暗藏不安，写坊间传闻、制度异常、人物处境变化；给4个选项（含至少1个涉及朝堂风向/官场暗流）；⏰时间推进**4-6个月**。本回合的核心任务是让下一节点的伏笔越来越浓——允许以当事人「当前在世的活跃状态」登场（但严禁点名未来事件名称或预言结局）。所有出场人物、机构、制度必须符合当前年份的真实历史。` };
    } else {
    // 空白期前/中段 → 📜日常（蒙太奇快进）
    r = { pacing: '日常', directive:
      `【节奏指令·硬控】本回合无历史锚点临近，节奏为📜日常（常规政务 + 时间快进）：叙事400-700字，平稳扎实、生活化细节，岁月流转；给4个经营型选项（探索/社交/官场/经营均可）；⏰时间**必须推进6-12个月**，允许蒙太奇式快进（「半年过去」「年关将至」「次年春」「转眼间已是洪武X年」），本回合的核心任务是推进年份向下一个历史锚点靠拢。所有出场人物、机构、制度必须符合当前年份的真实历史。` };
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
  r.directive += `①种子引爆：若本回合你判断 current_state.seeds 中某颗种子达到引爆时机，必须在JSON的 seeds_triggered 字段中写入该种子ID（如 "seeds_triggered": ["修撰日历"]），同时将节奏升级为反转并写出引爆后果及对应数值变化，种子引爆优先于历史节奏。种子存活超过8回合将自动引爆，超过5个则最早的自动引爆。`;
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
function applyFavorRisk() {
  var ef = GameState.emperor_feeling;
  var consecutive = GameState.consecutiveHighEfTurns;
  
  // 重置暴跌记录
  GameState.favorCrashThisTurn = null;
  
  // 警戒区：ef 40~69，连续≥3回合，10%概率暴跌
  if (ef >= 40 && ef < 70 && consecutive >= 3) {
    if (Math.random() < 0.10) {
      var crash = -(Math.floor(Math.random() * 11) + 10); // -10~-20
      GameState.emperor_feeling = ef + crash;
      GameState.favorCrashThisTurn = '功高遭忌' + crash;
      console.log('[圣眷暴跌]', GameState.favorCrashThisTurn);
      return;
    }
  }
  
  // 危险区：ef≥70，每回合20%概率暴跌
  if (ef >= 70) {
    if (Math.random() < 0.20) {
      var crash = -(Math.floor(Math.random() * 11) + 20); // -20~-30
      GameState.emperor_feeling = ef + crash;
      GameState.favorCrashThisTurn = '宠极生厌' + crash;
      console.log('[圣眷暴跌]', GameState.favorCrashThisTurn);
      return;
    }
  }
}


// ========== v3.9: 锚点顺序强制控制（简化版——仅精确短语匹配） ==========

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
  9: ['朱元璋驾崩', '太祖驾崩', '太祖崩', '皇上驾崩',
      '朱元璋病逝', '太祖晏驾']
};

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
