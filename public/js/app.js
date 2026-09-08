// ========== v3.12.2 第一阶段修复：调试日志降级封装 + 轻量提示 ==========
// 调试日志：window.DEBUG_MODE 为 true 时输出，生产环境默认关闭
const log = {
  debug: function () {
    if (window.DEBUG_MODE) console.log.apply(console, arguments);
  }
};

// 轻量 Toast 提示：非阻断式，自动消失（用于自动存档失败等低危提示）
function showToast(msg) {
  try {
    var t = document.createElement('div');
    t.className = 'v3122-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:56px;transform:translateX(-50%);background:rgba(16,42,67,.92);color:#F8F6F0;padding:8px 18px;border-radius:6px;font-size:13px;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  } catch (e) { /* 提示失败不影响主流程 */ }
}

// ========== v3.8.17 上下文优化 Phase 1：历史分层压缩 ==========
// 三级衰减：L1热区(最近4回合全文) → L2温区(5-8回合摘要) → L3冷区(9+回合一行)
// 将 chatHistory 从 ~135K tokens 压缩至 ~45K tokens（-67%）

function compressHistory() {
  const HOT = 8;    // 最近4回合(8条消息)：叙事全文保留
  const WARM = 16;  // 第5-8回合(9-16条消息)：段落摘要
  // 第9+回合(17+条消息)：一行摘要
  // v3.14.1 新增：热区内「非最新」user 消息也压缩为 L2
  // 理由：user 消息中的每回合指令（rhythm_directive/dynamic_rules/recent_plot 等）只对当时回合有效，
  //       进入历史后是纯冗余；保留 current_state+player_action 已足够衔接剧情与角色状态演变

  for (let i = 0; i < chatHistory.length; i++) {
    const msg = chatHistory[i];
    const age = chatHistory.length - i; // 距最新消息的距离

    if (age > WARM) {
      // L3 冷区：一行摘要
      if (msg._compressedTier) continue; // v3.14.1: 已压缩（任意层级）跳过——修复 tier=3 被重复压缩导致内容退化（'【第?回合】'）的幂等性 bug
      msg.content = compressToLine(msg);
      msg._compressedTier = 3;
    } else if (age > HOT) {
      // L2 温区：段落摘要
      if (msg._compressedTier) continue; // 已压缩（温或冷），跳过
      msg.content = compressToSummary(msg);
      msg._compressedTier = 2;
    } else if (msg.role === 'user' && age > 2 && msg._compressedTier !== 2) {
      // v3.14.1 热区 user 压缩：保留最新1条 user（当前回合注入指令）全文，更早的 user 压缩为 L2
      msg.content = compressToSummary(msg);
      msg._compressedTier = 2;
    }
    // L1 热区：assistant 叙事全文保留（衔接连贯性）
  }

  // 调试日志：追踪压缩效果
  var totalChars = 0;
  for (var j = 0; j < chatHistory.length; j++) totalChars += (chatHistory[j].content || '').length;
  console.log('[上下文优化] chatHistory: ' + chatHistory.length + '条消息, 总字符=' + totalChars + ' (≈' + Math.round(totalChars/1.5) + ' tokens)');
}

// L3 压缩：从消息中提取一行极简摘要
function compressToLine(msg) {
  if (msg.role === 'user') {
    // 已温压缩的user消息：content是JSON字符串（含current_state）
    if (msg._compressedTier === 2) {
      try {
        var parsed = JSON.parse(msg.content);
        if (parsed.current_state) {
          return JSON.stringify({
            _compressed: true,
            content: '【第' + (parsed.current_state.turn || '?') + '回合】' + (parsed.player_action || '').slice(0, 80)
          });
        }
      } catch(e) {}
    }
    // 原始user消息：content是完整contextPayload JSON
    try {
      var p = JSON.parse(msg.content);
      var turn = p.current_state ? p.current_state.turn : '?';
      var action = p.player_action || '';
      return JSON.stringify({
        _compressed: true,
        content: '【第' + turn + '回合】玩家行动：' + action.slice(0, 80)
      });
    } catch(e) { return msg.content; }
  } else {
    // assistant消息：提取首行叙事+玩家选择
    var text = msg.content || '';
    var firstLine = text.split('\n')[0].slice(0, 100);
    var choiceMatch = text.match(/▸\s*(.+?)(?:\n|$)/);
    var choice = choiceMatch ? choiceMatch[1].slice(0, 60) : '';
    return JSON.stringify({
      _compressed: true,
      content: '叙事：' + firstLine + (choice ? '。选择：' + choice : '')
    });
  }
}

// L2 压缩：保留核心状态+叙事摘要，丢弃冗余数据
function compressToSummary(msg) {
  if (msg.role === 'user') {
    try {
      var p = JSON.parse(msg.content);
      // 保留：current_state(角色状态)、player_action(玩家行动)、rhythm(节奏)
      // 丢弃：recent_plot(每回合DOM重新抓取)、dynamic_rules(每回合重算)、
      //       character_canon(只在turn≤5重要)、retry_constraint(一次性)
      var compressed = {
        _compressed: true,
        current_state: p.current_state,
        player_action: p.player_action,
        rhythm: p.rhythm_directive ? p.rhythm_directive.slice(0, 100) : undefined
      };
      return JSON.stringify(compressed);
    } catch(e) { return msg.content; }
  } else {
    // AI回复：保留叙事前300字 + JSON状态块（AI丢弃的选项信息不影响后续）
    var text = msg.content || '';
    var narrative = text.slice(0, 300);
    var jsonMatch = text.match(/```json\n[\s\S]*?\n```/);
    var stateBlock = jsonMatch ? jsonMatch[0] : '';
    return JSON.stringify({
      _compressed: true,
      content: '【摘要】' + narrative + '\n' + stateBlock
    });
  }
}

// ========== STREAMING API CALL ==========
// 调用后端代理，流式接收 AI 回复，逐字显示在 streamTarget 元素中
// v3.9: 增加 buffered 参数，支持缓冲模式（不写入DOM，只累积文本）
async function streamBotAPI(userMessage, streamTarget, options) {
  var buffered = options && options.buffered; // 是否缓冲模式
  // v3.8.15修复：每回合重置争议文字标记，只检测本回合AI是否标记了争议文字（E）
  GameState.wroteControversialText = false;
  // 前端节奏引擎：按即将生成的回合号硬判节奏（历史锚点不再依赖AI自觉）
  const rhythm = getRhythmDirective(getNextTurn(), GameState.character.background);
  // 构造当前回合的上下文消息
  const contextPayload = {
    rhythm_directive: rhythm.directive,
    // v3.14.1: 身世铁律低频注入——前5回合每回合注入（开局定型），之后每10回合刷新一次（防长局遗忘），
    // 减少每回合重复发送固定身世文本（~150字符/回合）；角色姓名/出身/官职仍通过 current_state 每回合提供
    character_canon: (GameState.character.intro && (GameState.turn <= 5 || GameState.turn % 10 === 0))
      ? `【角色身世·铁律】以下角色身世小传是玩家开局时确认过的正史设定，任何叙事涉及角色姓名、籍贯、家庭、早年经历、出身时，必须与之严格一致，不得改写、不得新增矛盾设定、不得重新介绍角色身世：\n${GameState.character.intro}`
      : undefined,
    recent_plot: collectRecentPlot(8),
    recent_choices: collectRecentChoices(),
    // v3.8.21: 叙事反重复——提取最近3轮叙事关键句传给AI
    recent_narrative_phrases: collectRecentNarrativePhrases(),
    current_state: {
      turn: GameState.turn,
      year: GameState.year,
      month: GameState.month,
      pacing: GameState.pacing,
      character: {
        name: GameState.character.name,
        age: GameState.character.age,
        background: GameState.character.background,
        position: GameState.character.position,
        rank: GameState.character.rank
      },
      attributes: GameState.attributes,
      factions: GameState.factions,
      emperor_feeling: GameState.emperor_feeling,
      seeds: GameState.seeds,
      seeds_triggered: GameState.seeds_triggered,
      // v3.8.15: 家庭状态（生活事件系统 P2-G）
      family: GameState.family || undefined
    },
    // v3.6：动态规则扩展
    dynamic_rules: {
      alive_npcs: getAliveNPCs(GameState.year),
      institutions: getAllowedInstitutions(GameState.year),
      anchor_info: getAnchorHints(getNextTurn()),
      // v3.8.18: 锚点弹性烈度分级——告诉AI当前锚点的叙事烈度等级
      anchor_intensity: (function(){
        var ai = getCurrentAnchorIntensity();
        if (!ai) return '';
        var labels = ['', '旁观者', '被波及', '刀锋上'];
        var descs = ['', '你与此事关联较浅，以旁观者视角 witnessing 即可，叙事基调安全克制', '你被事件波及但尚有脱身余地，叙事应有紧迫感和两难抉择', '你深度卷入风暴核心，叙事必须在刀锋上跳舞，每一步都可能致命'];
        return '【锚点烈度】' + ai.anchor_name + ' — 烈度' + ai.intensity + '（' + labels[ai.intensity] + '）：' + descs[ai.intensity];
      })(),
      background_anchor_hint: getBackgroundAnchorHint(GameState.character.background, getNextTurn()),
      ending_conditions: getEndingConditions(GameState.character.background),
      path_reminder: getBackgroundPathReminder(GameState.character.background, getNextTurn()),
      surveillance_hint: getSurveillanceHint(GameState.year, getNextTurn(), GameState.character.background),
      branch_focus: getBranchFocus(getNextTurn(), GameState.character.background),
      // v3.8.20: 家庭上下文注入（事实锚点+氛围基调）
      family_context: (function(){
        if (!GameState.family) return '';
        var parts = [];
        var ctx = getFamilyContext();
        if (ctx) parts.push(ctx);
        var atm = getFamilyAtmosphere();
        if (atm) parts.push(atm);
        // 政治联姻提示：子女达婚龄时提醒AI
        if (GameState.family.children) {
          var cy = GameState.year;
          for (var ci = 0; ci < GameState.family.children.length; ci++) {
            var ch = GameState.family.children[ci];
            if (ch.status === '在世') {
              var chAge = cy - (ch.birthYear || cy);
              if (chAge >= 14 && chAge <= 22) {
                parts.push('（子女已达婚龄，可适当融入议亲相关叙事）');
                break;
              }
            }
          }
        }
        if (parts.length === 0) return '';
        return parts.join('\n') + '\n叙事中须融入1句与上述家庭状况相符的细节——具体内容由你自由发挥，但须符合角色年龄和当前年份。';
      })(),
      // v3.9: 动态硬禁令——明确列出本回合严禁描写的具体人物+事件
      hard_forbidden: (typeof getHardForbiddenList === 'function') ? getHardForbiddenList() : '',
      // v3.8.23: 家庭成员命名指令（P2-5）
      family_naming: (typeof getFamilyNamingPrompt === 'function') ? getFamilyNamingPrompt() : '',
      death_warning: (function(){ var w = checkDeathWarning(); return w.length ? '【死亡预警】' + w.join('、') + '——命运已在悬崖边缘，叙事中必须埋下明显的危险信号' : ''; })(),
      // P0-2: 危机事件注入
      crisis: (function(){
        var cType = 0, countdown = 0, type = '';
        if (GameState.deathWarning > 0 && GameState.deathWarningType > 0) { cType = GameState.deathWarningType; countdown = 1; type = 'warning'; }
        else if (GameState.deathCountdown > 0 && GameState.deathCountdownType > 0) { cType = GameState.deathCountdownType; countdown = GameState.deathCountdown; type = 'countdown'; }
        if (cType === 0 || typeof CRISIS_EVENTS === 'undefined' || !CRISIS_EVENTS[cType]) return undefined;
        var evt = CRISIS_EVENTS[cType];
        var rescue = (typeof RESCUE_OPTIONS !== 'undefined') ? RESCUE_OPTIONS[cType] : null;
        return {
          active: true,
          type: type,
          title: evt.title,
          description: evt.desc,
          remaining: countdown,
          directive: evt.directive,
          rescueDirections: rescue ? rescue.directions : []
        };
      })(),
      // P0-2: 降级后叙事标记
      degradationActive: GameState.degradationActive || false,
      degradationType: GameState.degradationType || 0,
      faction_decay: (function(){ return GameState.factionDecayThisTurn ? '【阵营衰减】上回合因阵营关系过度深入（绝对值>80），自然回落：' + GameState.factionDecayThisTurn + '。叙事中可体现"树大招风""功高遭忌后关系微妙疏远"等意象，但不可直接提及数值' : ''; })(),
      favor_crash: (function(){ return GameState.favorCrashThisTurn ? '【圣眷暴跌】' + GameState.favorCrashThisTurn + '——朱元璋猜忌加深，圣眷骤降。叙事中必须体现"帝王心术""天威难测""昨日恩宠今日猜忌"等紧张意象，可描写朝臣态度转变、皇帝冷淡等细节' : ''; })(),
      // v3.9.0: 情感锚点注入
      emotional_anchor: (typeof getEmotionalAnchorDirective === 'function') ? getEmotionalAnchorDirective(getNextTurn(), GameState.character.background) : '',
      // v3.9.0: 情感记忆摘要（让玩家过去的选择影响后续叙事）
      emotional_memory: (typeof getEmotionalMemorySummary === 'function') ? getEmotionalMemorySummary() : '',
      // v3.8.15: 生活事件注入（P2-G Phase 1）
      life_event: (function(){
        var le = GameState.currentLifeEvent;
        if (!le) return '';
        var familySummary = '';
        if (GameState.family) {
          var f = GameState.family;
          var parts = [];
          if (f.spouse && f.spouse.status === '在世') parts.push('妻' + (f.spouse.name ? '(' + f.spouse.name + ')' : ''));
          var livingChildren = f.children.filter(function(c){ return c.status === '在世'; });
          if (livingChildren.length > 0) parts.push(livingChildren.length + '个子女');
          if (f.parents.father && f.parents.father.status === '在世') parts.push('父');
          if (f.parents.mother && f.parents.mother.status === '在世') parts.push('母');
          if (parts.length > 0) familySummary = '（家庭成员：' + parts.join('、') + '）';
        }
        return '【生活事件·' + le.category + '】本回合触发了家庭生活事件。' + familySummary + '\n叙事要求：在正常叙事间隙自然穿插本事件的段落——' + le.narrative + '\n注意：这是生活细节，不要喧宾夺主，控制在3-5句内，融入整体叙事节奏中。';
      })(),
      // v3.8.16 Phase 2: 书生婚姻选择注入
      marriage_choice: (function(){
        var mc = GameState.pendingMarriageChoice;
        if (!mc || !mc.proposals) return '';
        // v3.8.17 P3-2修复：3回合超时机制——AI未能正确处理则自动清空，避免每回合重复注入
        if (mc.turn && GameState.turn - mc.turn > 3) {
          GameState.pendingMarriageChoice = null;
          return '';
        }
        var proposalsText = mc.proposals.map(function(p, i) {
          return String.fromCharCode(65 + i) + '. ' + p.name + '——' + p.desc;
        }).join('\n');
        return '【婚姻抉择】有人上门提亲，你需要选择联姻对象。请将以下选项融入本回合的选项中：\n' + proposalsText + '\n玩家选择后，请在state block中标记"marriage_choice": "A"/"B"/"C"以便前端处理。';
      })(),
      // v3.8.16 Phase 3: 家庭牵连危机注入
      family_crisis: (function(){
        var fc = GameState.currentFamilyCrisis;
        if (!fc) return '';
        // v3.8.17 P0-1修复：去掉结局标签（保人/自保/两全），避免AI知道选项性质后暗示最优解
        var choicesText = fc.choices.map(function(c, i) {
          return String.fromCharCode(65 + i) + '. ' + c.text;
        }).join('\n');
        return '【家庭危机·' + fc.title + '】' + fc.desc + '\n请将以下抉择融入本回合的选项中：\n' + choicesText + '\n玩家选择后，请在state block中标记"family_crisis_choice": "A"/"B"/"C"以便前端处理。这是政治与家庭的交叉点，叙事应体现角色在亲情与自保之间的煎熬。';
      })(),
      // v3.8.17 P2-3修复：家庭危机选择长期影响注入——让AI在后续叙事中引用过往抉择
      family_crisis_outcome: (function(){
        var fco = GameState.familyCrisisOutcome;
        if (!fco || Object.keys(fco).length === 0) return '';
        var parts = [];
        for (var cid in fco) {
          if (fco.hasOwnProperty(cid)) {
            if (fco[cid] === '保人') parts.push('你曾拼尽全力保全了家人——但被保全之人如今成了你的政治弱点，有人以此要挟');
            else if (fco[cid] === '自保') parts.push('你曾冷酷地切割了亲情以求自保——这份心狠手辣的名声在同僚间悄然传开，有人敬你果决，有人惧你无情');
            else if (fco[cid] === '两全') parts.push('你曾试图两全其美——但隐患并未真正消除，暗中的安排随时可能再次暴露');
            else if (fco[cid] === '逃亡') parts.push('你曾携家出逃——那段颠沛流离的日子在记忆中挥之不去');
          }
        }
        if (parts.length === 0) return '';
        return '【家庭危机余波】过往抉择的长期影响：' + parts.join('；') + '。叙事中可自然体现这些后果——NPC态度变化、旧事重提、隐患爆发等。';
      })(),
      // v3.8.6: 终局/死亡叙事提示注入
      finale_hint: getFinaleHint(),
      origin_lock: (function(){
        if (GameState.turn > 5) return '';
        var of = ORIGIN_FACTION_MAP[GameState.character.background];
        if (!of) return '';
        var fl = FACTION_LABELS[of] || of;
        var bg = GameState.character.background;
        var actionHint = '';
        if (bg === '淮西武将之后' || bg === '浙东寒门书生') {
          actionHint = '对本出身玩家，"决裂"选项意味着与出身阵营主动切割（如：公开弹劾淮西/浙东同僚、拒绝旧部拉拢、向皇帝告发旧交等），选择后该阵营大幅下降；';
        } else {
          actionHint = '对本出身玩家，"投靠"选项意味着主动融入/靠近近臣圈子（如：结交近臣门路、进献投名状、主动承担近臣交代的差事等），选择后近臣阵营大幅回升；';
        }
        return '【出身锁定·前' + (6 - GameState.turn) + '回合】' + bg + '的出身偏向阵营「' + fl + '」当前变化幅度减半（初始关系更稳固）。' + actionHint + '你必须在3个选项中安排至少1个与出身阵营关系重大转变的选项（用叙事语言包装，不要出现"决裂""数值"等游戏术语）。当玩家选择该选项时，你必须在state block的changes中加入"faction_break": true标记，以便前端取消减半。';
      })(),
      // ========== v3.12.0 生死危机事件层注入 ==========
      crisis_story: (function(){
        var evt = GameState.activeCrisisEvent;
        if (!evt) return '';
        var data = evt.data;
        var bg = GameState.character.background;
        var originVariant = data.originVariants ? data.originVariants[bg] : null;
        var timer = GameState.crisisTimers ? GameState.crisisTimers[evt.eventId] : null;
        var countdownState = null;
        if (timer && timer.states && timer.currentStateIndex !== undefined) {
          countdownState = timer.states[timer.currentStateIndex] || null;
        }
        return JSON.stringify({
          eventId: evt.eventId,
          title: data.title,
          type: data.type,
          background: data.backgroundStory || '',
          originVariant: originVariant,
          scene: data.sceneDescription || '',
          choices: data.choices.map(function(c) { return { id: c.id, label: c.label }; }),
          countdown: timer ? timer.remaining : (evt.countdown || null),
          countdownTotal: evt.countdownTurns || null,
          countdownState: countdownState,
          countdownDesc: data.countdownDescription || '',
          isFinale: !!data.isFinale,
          finalePhase: GameState.crisisFinalePhase || 0,
          finaleChoices: GameState.crisisFinaleChoices || [],
          tags: GameState.crisisTags || {},
          directive: data.narrativeDirective || '',
          choiceMarkProtocol: '玩家做出选择后，你必须在 state block 的 changes 中加入 "crisis_choice": "A"/"B"/"C"（对应上方 choices 数组中的 id），其余判定与后果由前端硬判定系统执行，你只需在叙事正文中呈现选择后的场景；若本回合玩家尚未做出选择，不要输出该标记。'
        });
      })(),
      crisis_judgment: (function(){
        if (!GameState.crisisJudgmentPending) return '';
        var j = GameState._lastCrisisJudgment;
        if (!j) return '';
        return JSON.stringify({
          eventId: j.eventId, result: j.result, pool: j.pool,
          outcome: j.outcome, effects: j.effects, npcFate: j.npcFate,
          fatePointSpent: j.fatePointSpent || null
        });
      })(),
      visible_state: (function(){
        var parts = [];
        if (GameState.health !== '健康') parts.push('身体状况：' + GameState.health);
        if (GameState.mentalState !== '稳定') parts.push('精神状态：' + GameState.mentalState);
        if (GameState.fatePoints > 0) parts.push('命运庇护：' + GameState.fatePoints + '层');
        if (GameState.permanentBodyDamage > 0) parts.push('旧伤累积：' + GameState.permanentBodyDamage);
        if (GameState.permanentMentalDamage > 0) parts.push('心魔累积：' + GameState.permanentMentalDamage);
        var activeTags = [];
        for (var tag in GameState.crisisTags) {
          if (GameState.crisisTags.hasOwnProperty(tag)) {
            var t = GameState.crisisTags[tag];
            if (t.permanent || (!t.expiresAt || t.expiresAt > GameState.turn)) activeTags.push(tag);
          }
        }
        if (activeTags.length > 0) parts.push('身上标签：' + activeTags.join('、'));
        return parts.length > 0 ? parts.join('\n') : '';
      })(),
      fate_point_prompt: (function(){
        if (GameState.activeCrisisEvent && GameState.fatePoints > 0) {
          return '玩家当前有' + GameState.fatePoints + '点天命值。可在叙事中暗示"命运的丝线似乎还可以偏转"，让玩家知道可以消耗天命值扭转败局。';
        }
        return '';
      })(),
      low_attribute_narrative: (function(){
        var a = GameState.attributes;
        var hints = [];
        if (a.power < 20) hints.push('权势极低：上级轻视你、忽视你的意见。叙事中体现"人微言轻"的处境。');
        if (a.people < 20) hints.push('民心极低：百姓/下属不信任你。叙事中体现"说话没人听"的困境。');
        if (a.wisdom < 20) hints.push('智谋极低：判断力差。叙事中体现"后知后觉""被人当枪使"。');
        if (a.bond < 20) hints.push('情义极低：孤家寡人。叙事中体现"独来独往""无人照应"。');
        if (a.fame < 20) hints.push('声望极低：默默无闻。叙事中体现"没人认识你"。');
        return hints.length > 0 ? hints.join('\n') : '';
      })()
    },
    player_action: userMessage,
    // v3.11.0f: 选择回应铁律——强制AI在叙事开头回应玩家上一选择（仅非首轮生效）
    choice_ack_required: (userMessage && userMessage.length < 200) ? '【选择回应·铁律】玩家刚刚选择了：「' + userMessage + '」。你的叙事必须在前1-3句内明确回应这个选择——交代行动的后果、走向或发现。严禁跳过选择直接开启无关剧情。即使行动暂无结果，也要交代"你去了但..."或"你做了X，注意到..."。' : undefined
  };
  
  // v3.8.15: 上下文已读取currentLifeEvent，清空以备下次触发
  GameState.currentLifeEvent = null;
  // v3.8.16: 上下文已读取pendingMarriageChoice和currentFamilyCrisis，但不清空——等玩家选择后在applyChanges中清空
  
  // v3.8.23 P2-1: 请求体瘦身 — 清理dynamic_rules中的空值字段
  if (contextPayload.dynamic_rules) {
    Object.keys(contextPayload.dynamic_rules).forEach(function(key) {
      var val = contextPayload.dynamic_rules[key];
      if (val === '' || val === null || val === undefined) {
        delete contextPayload.dynamic_rules[key];
      }
    });
  }
  
  // v3.9: 如果有重试约束（上次违规信息），追加到上下文中
  if (options && options.retry_constraint && options.retry_constraint.length > 0) {
    contextPayload.retry_constraint = 
      '【上次输出违规·必须修正】你上次的回复中包含了尚未发生的历史事件描写：' 
      + options.retry_constraint.join('；') 
      + '。本次回复必须严格避免上述内容。记住：这些事件在当前年份尚未发生，你只能描写当前的日常政务、人际关系和生活场景。';
  }

  // 把当前玩家行动加入历史
  chatHistory.push({
    role: 'user',
    content: JSON.stringify(contextPayload)
  });

  // 控制历史长度：保留最近 30 条消息（约 15 回合），防止超出上下文窗口
  // 每回合 = 1条 user + 1条 assistant，30条 ≈ 15 回合
  const MAX_HISTORY = 30;
  // v3.14.1: 压缩时序修复——发送前同步压缩，保证 trimmedHistory 已压缩（原 requestIdleCallback 异步调度
  // 与 slice(-MAX_HISTORY) 存在竞态：本回合请求可能在压缩完成前发出，导致热区全量 JSON 直接发送）
  // compressHistory 为 O(n) 且已压缩消息有 _compressedTier 标记跳过，实际每次只处理新增 1-2 条，开销 <10ms
  compressHistory();
  const trimmedHistory = chatHistory.slice(-MAX_HISTORY);

  // v3.14.1 性能埋点：测量请求 payload 与各环节耗时（F12 Console 可查）
  var perfPayloadChars = 0;
  for (var pi = 0; pi < trimmedHistory.length; pi++) {
    perfPayloadChars += (trimmedHistory[pi].content || '').length;
  }
  var t_reqStart = Date.now();
  var t_firstChunk = 0;
  console.log('[perf] 回合' + GameState.turn + ' 请求 payload: ' + trimmedHistory.length + '条消息, ' + perfPayloadChars + '字符 ≈' + Math.round(perfPayloadChars / 1.5) + ' tokens');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s 超时（flash 模型响应较慢）

  let fullText = '';
  let lastScrollTime = 0;
  let userScrolling = false; // 检测用户是否在主动滚动

  // 监听用户滚动事件
  const scrollHandler = () => {
    userScrolling = true;
  };
  window.addEventListener('wheel', scrollHandler, { passive: true });
  window.addEventListener('touchmove', scrollHandler, { passive: true });

  try {
    const resp = await fetch(BOT_CONFIG.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: trimmedHistory }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      let errMsg = `服务器错误 (${resp.status})`;
      try {
        const errData = await resp.json();
        errMsg = errData.error || errData.detail || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    // 读取流式响应
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let dividerFound = false; // v3.8.25 hotfix: 分隔符出现后锁定显示，防止结构化数据闪现

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      // v3.14.1 性能埋点：首 chunk 到达时间 = 首 token 延迟（用户感知的「开始出字」等待）
      if (!t_firstChunk) {
        t_firstChunk = Date.now();
        console.log('[perf] 首 chunk 到达: ' + (t_firstChunk - t_reqStart) + 'ms');
      }

      // v3.8.23 P1-1 + v3.8.25 hotfix: 流式增量解析 — 分隔符出现后锁定显示
      if (streamTarget && !buffered) {
        const dividerRe = /\n[ \t]*(?:[-]{2,6}|[—]{2,6}|[-—]{2,6})[ \t]*\n/;
        if (!dividerFound) {
          if (dividerRe.test(fullText)) {
            // 分隔符刚出现，锁定显示，只显示叙事部分
            dividerFound = true;
            const dividerMatch = fullText.match(dividerRe);
            let displayText = fullText.substring(0, dividerMatch.index);
            displayText = displayText
              .replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?(?:`{3,4}|$)/gi, '')
              .replace(/\{\s*[\s\S]*?(?:\}\s*(?:,?\s*\n|\s*$))/gm, '')
              .trim();
            streamTarget.textContent = displayText;
          } else {
            // 分隔符未出现，检查chunk安全性
            const needsFullRescan = /[`{]/.test(chunk) || /\n[-—]/.test(chunk);
            if (needsFullRescan) {
              let displayText = fullText;
              const dividerMatch = fullText.match(dividerRe);
              if (dividerMatch) {
                dividerFound = true;
                displayText = fullText.substring(0, dividerMatch.index);
              }
              displayText = displayText
                .replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?(?:`{3,4}|$)/gi, '')
                .replace(/\{\s*[\s\S]*?(?:\}\s*(?:,?\s*\n|\s*$))/gm, '')
                .trim();
              streamTarget.textContent = displayText;
            } else {
              // 安全追加：纯叙事文字
              streamTarget.textContent += chunk;
            }
          }
        }
        // dividerFound=true 时不更新显示，保持干净的叙事文本
        // 节流滚动：每 150ms 最多滚一次
        const now = Date.now();
        if (now - lastScrollTime > 150 && !userScrolling) {
          scrollToBottom();
          lastScrollTime = now;
        }
      }
    }

    // 清理滚动监听器
    window.removeEventListener('wheel', scrollHandler);
    window.removeEventListener('touchmove', scrollHandler);

    // v3.14.1 性能埋点：完整响应耗时
    console.log('[perf] 完整响应: ' + (Date.now() - t_reqStart) + 'ms, 输出 ' + (fullText || '').length + '字符');

    // 把 AI 回复加入历史
    if (fullText.trim()) {
      chatHistory.push({ role: 'assistant', content: fullText.trim() });
      // v3.8.17 上下文优化 Phase 2：更新前情提要滚动摘要
      if (typeof updatePlotSummary === 'function') updatePlotSummary();
    }

    return fullText;
  } catch (err) {
    clearTimeout(timeoutId);
    // 清理滚动监听器
    window.removeEventListener('wheel', scrollHandler);
    window.removeEventListener('touchmove', scrollHandler);
    // 失败时回滚刚加入的 user 消息
    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
      chatHistory.pop();
    }
    if (err.name === 'AbortError') {
      throw new Error('请求超时，墨史官似乎陷入了沉思……请重试');
    }
    throw err;
  }
}

// ========== TURN PROCESSOR ==========
// v3.9: 增加自动重试机制——AI输出先缓冲，校验通过才展示给玩家
async function processAITurn(userChoice) {
  // v3.14.1 性能埋点：选择后处理总耗时
  var t_turnStart = Date.now();
  // 前端节奏引擎：本回合目标节奏（在叙事上屏/回合推进前计算，回合号准确）
  const engineRhythm = getRhythmDirective(getNextTurn());
  
  var MAX_RETRIES = 2;
  var retryCount = 0;
  var lastViolations = null;
  var rawOutput = null;
  var parsed = null;
  
  while (retryCount <= MAX_RETRIES) {
    // 显示等待提示（首次显示"墨史官挥毫"，重试时显示"墨史官重新构思"）
    var streamArea = document.createElement('div');
    streamArea.className = 'stream-area';
    const streamText = document.createElement('div');
    streamText.className = 'stream-text';
    
    if (retryCount === 0) {
      // v3.8.22 P0: 骨架屏——首token到达前展示
      streamText.innerHTML = '<span class="stream-cursor"></span>' +
        '<div class="skeleton-narrative">' +
        '<div class="skeleton-line"></div><div class="skeleton-line"></div>' +
        '<div class="skeleton-line"></div><div class="skeleton-line"></div>' +
        '<div class="skeleton-line"></div></div>';
    } else {
      var retryMessages = [
        '墨史官搁笔沉思，似有不妥……',
        '墨史官摇头叹气，重新铺纸……'
      ];
      streamText.textContent = retryMessages[Math.min(retryCount - 1, retryMessages.length - 1)];
    }
    
    streamArea.appendChild(streamText);
    gameContainer.appendChild(streamArea);
    scrollToBottom();

    // 缓冲模式调用AI（不写入DOM）
    try {
      var options = { buffered: false }; // v3.8.22 P0: 取消缓冲，真流式上屏
      // 如果有上次违规信息，追加到上下文中
      if (lastViolations && lastViolations.length > 0) {
        options.retry_constraint = lastViolations;
      }
      rawOutput = await streamBotAPI(userChoice, streamText, options);
    } catch (err) {
      console.error('API error:', err);
      streamArea.remove();
      showError(`墨史官执笔踟蹰……（${err.message}）`, userChoice);
      return;
    }

    // 移除等待提示
    streamArea.remove();

    // v3.14.1 性能埋点：AI 完整回复耗时（含可能的校验重试）
    console.log('[perf] AI 回复完成: ' + (Date.now() - t_turnStart) + 'ms (重试次数=' + retryCount + ')');

    if (!rawOutput || !rawOutput.trim()) {
      showError('墨史官的回复为空，请重试。', userChoice);
      return;
    }

    // 解析完整输出
    parsed = parseAIOutput(rawOutput);

    if (!parsed.narrative) {
      showError('墨史官的回复格式有误，请重试。', userChoice);
      return;
    }

    // v3.9: 锚点顺序校验（简化版——仅精确短语匹配）
    var anchorValidation = { valid: true };
    if (typeof validateAnchorOrder === 'function') {
      anchorValidation = validateAnchorOrder(rawOutput);
    }
    
    // v3.8.14: 死人出场校验
    var deadValidation = { valid: true };
    if (typeof validateDeadNPCs === 'function') {
      deadValidation = validateDeadNPCs(rawOutput, GameState.year);
    }

    // 判断是否通过校验
    if (anchorValidation.valid && deadValidation.valid) {
      // ✅ 通过校验，跳出循环
      break;
    }
    
    // ❌ 校验失败
    retryCount++;
    lastViolations = [];
    if (!anchorValidation.valid) {
      console.warn('[锚点顺序违规·第' + retryCount + '次重试]', anchorValidation.violations);
      lastViolations = lastViolations.concat(anchorValidation.violations);
    }
    if (!deadValidation.valid) {
      console.warn('[死人出场违规·第' + retryCount + '次重试]', deadValidation.violations);
      lastViolations = lastViolations.concat(deadValidation.violations);
    }
    
    if (retryCount > MAX_RETRIES) {
      // 重试耗尽：显示降级提示
      console.warn('[重试耗尽] 使用降级策略');
      showRetryExhausted();
      return;
    }
  }

  // 判断是否为驳回（SP v3.1：rejected=true 时数值不变、回合不推进、时间不流逝）
  const isRejected = parsed.stateBlock &&
    (parsed.stateBlock.rejected === true || parsed.stateBlock.rejected === 'true');

  // ===== 时间/回合硬校验（驳回时全部跳过）=====
  let clamped = false; // 本回合是否触发了钳制（若AI时间没推进，视为原地踏步）
  if (parsed.stateBlock && !isRejected) {
    const sb = parsed.stateBlock;
    const gYear = GameState.year, gMonth = GameState.month;
    // turn：只允许等于"即将生成的回合号"（与节奏引擎 getNextTurn 一致：开局为1，之后递增），其余钳制
    const nextTurn = getNextTurn();
    const sbTurn = parseInt(sb.turn, 10);
    GameState.turn = (Number.isFinite(sbTurn) && sbTurn === nextTurn) ? sbTurn : nextTurn;
    // year/month：只许前进不许倒退，上限洪武三十一年(1398)；月份非法则钳
    let y = parseInt(sb.year, 10), m = parseInt(sb.month, 10);
    if (!Number.isFinite(y)) y = gYear;
    if (!Number.isFinite(m) || m < 1 || m > 12) m = gMonth;
    if (y < gYear || (y === gYear && m < gMonth)) { y = gYear; m = gMonth; clamped = true; }
    if (y > 1398) { y = 1398; m = 6; }
    
    // v3.8.9: 锚点强制年份同步——确保NPC死亡判定与锚点事件一致
    // 检查当前回合是否处于某个锚点窗口内，如果是则强制同步年份
    if (typeof HISTORY_ANCHORS !== 'undefined') {
      for (var ai = 0; ai < HISTORY_ANCHORS.length; ai++) {
        var anchor = HISTORY_ANCHORS[ai];
        if (GameState.turn >= anchor.start && GameState.turn <= anchor.end) {
          // 当前回合在锚点窗口内，强制同步年份
          if (anchor.year && y < anchor.year) {
            y = anchor.year;
            m = 1; // 锚点年份的起始月份
            console.log('[锚点同步] 第' + GameState.turn + '回合进入锚点「' + anchor.name + '」窗口，强制年份同步至' + anchor.year + '年');
          }
          break;
        }
      }
    }
    
    GameState.year = y;
    GameState.month = m;
    // 角色年龄：前端按年份差硬算，不采信AI（开局1375年=baseAge）
    if (!GameState.character.baseAge) GameState.character.baseAge = GameState.character.age || 22;
    GameState.character.age = GameState.character.baseAge + (y - 1375);
  }

  // 回合信息（驳回时不显示新回合标记，因为时间没有推进）
  let finalPacing = engineRhythm.pacing;
  if (parsed.stateBlock && !isRejected) {
    const sb = parsed.stateBlock;
    // 种子引爆例外：AI 自报「反转」而引擎不是反转时，采信 AI（历史锚点节奏仍以引擎为准）
    if (sb.pacing === '反转' && engineRhythm.pacing !== '反转') finalPacing = '反转';
    const yearName = getYearName(GameState.year);
    const monthNames = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
    addTurnInfo(`${yearName} · ${monthNames[GameState.month - 1]}月 · 第${GameState.turn}回`);
    applyPacing(finalPacing);
  }

  // v3.8.12: 年份一致性修正——锚点同步可能修改了GameState.year，但AI叙事文字中的年份可能仍是旧值
  // 将叙事中所有"洪武X年"替换为正确的年份名称，确保情节文字与底部栏位一致
  let fixedNarrative = parsed.narrative || '';
  if (fixedNarrative && GameState.year) {
    const correctYearName = getYearName(GameState.year);
    // 替换"洪武X年"格式（X可以是数字或中文数字）
    fixedNarrative = fixedNarrative.replace(/洪武[一二三四五六七八九十百零廿\d]+年/g, correctYearName);
    // 同时替换纯数字年份如"1375年""1380年"等（4位数字+年）
    fixedNarrative = fixedNarrative.replace(/\d{4}年/g, correctYearName);
  }

  // v3.12.1: 叙事中隐藏【墓志铭】段落——结局卡片（showEnding）统一展示，避免叙事与结局卡片重复
  // 注意：showEnding 仍使用原始 parsed.narrative 提取墓志铭续句，不受此处影响
  var displayNarrative = fixedNarrative.replace(/【墓志铭】[\s\S]*$/, '').trim();
  if (!displayNarrative) displayNarrative = fixedNarrative;

  // 渲染叙事（驳回时使用特殊样式）
  const narrativeHTML = narrativeToHTML(displayNarrative);
  const narrativeEl = renderNarrative(narrativeHTML);
  if (isRejected) {
    const textEl = narrativeEl.querySelector('.narrative-text');
    if (textEl) textEl.classList.add('rejected');
  }
  gameContainer.appendChild(narrativeEl);
  scrollToBottom();

  // 应用状态变更（驳回时跳过：不更新数值、不推进回合、不存档）
  if (!isRejected) {
    // v3.14.1: 等待叙事淡入动画完成，兜底400ms（原1000ms——动画实际0.8s，且applyChanges只更新数值/存档，
    // 不依赖叙事DOM，过早触发无副作用；减少每回合选择后 ~600ms 人为等待）
    await new Promise(r => {
      const narrativeText = narrativeEl.querySelector('.narrative-text');
      if (narrativeText) {
        const onEnd = () => { narrativeText.removeEventListener('animationend', onEnd); r(); };
        narrativeText.addEventListener('animationend', onEnd);
        setTimeout(r, 400); // 安全兜底
      } else {
        r();
      }
    });
    if (parsed.stateBlock) {
      const sb = parsed.stateBlock;
      // turn/year/month/age 已在前面硬校验钳制，此处不再采信AI
      GameState.pacing = finalPacing; // 节奏硬控：存档/状态面板同步最终判定值（历史锚点引擎为准，种子引爆例外）
      if (sb.character) {
        // v3.8.12: 升职权力保底加成——记录旧品级，用于判定是否升职
        const oldRank = GameState.character.rank;
        if (sb.character.position) GameState.character.position = sb.character.position;
        if (sb.character.rank !== undefined) GameState.character.rank = sb.character.rank;
        // 升职判定：品级数字减小=升职（1=正一品最高，9=正九品最低，0=未入流）
        // 从0→非0 或 高数字→低数字 视为升职
        const newRank = GameState.character.rank;
        let promotionSteps = 0;
        if (oldRank === 0 && newRank > 0) {
          promotionSteps = 1; // 从未入流到有品级，算1步
        } else if (oldRank > 0 && newRank > 0 && newRank < oldRank) {
          promotionSteps = oldRank - newRank;
        }
        if (promotionSteps > 0 && sb.changes && sb.changes.attributes) {
          // 每步升职至少+3权势，最低+5保底
          const minPowerBoost = Math.max(5, promotionSteps * 3);
          const currentPowerDelta = sb.changes.attributes.power || 0;
          if (currentPowerDelta < minPowerBoost) {
            sb.changes.attributes.power = minPowerBoost;
            console.log(`[升职加成] 品级 ${oldRank}→${newRank}（${promotionSteps}步），权势保底+${minPowerBoost}（AI原值${currentPowerDelta}）`);
          }
        }
      }
      if (sb.changes) {
        log.debug('[DEBUG] parsed stateBlock.changes:', JSON.stringify(sb.changes));
        applyChanges(sb.changes, parsed.narrative || '');
      }
      // v3.11.0: 导演指令模式——提取AI生成的EA字段存入GameState临时变量
      if (GameState.currentEmotionalAnchor && GameState.currentEmotionalAnchor.isNewFormat) {
        if (sb.ea_option_text) {
          GameState._pendingEaOptions = sb.ea_option_text;
        }
        if (sb.ea_memory_quote) {
          GameState._pendingEaMemoryQuote = sb.ea_memory_quote;
        }
        if (sb.ea_ripple_text) {
          GameState._pendingEaRipple = sb.ea_ripple_text;
        }
        console.log('[EA-V2] 提取AI字段：options=' + !!sb.ea_option_text +
          ' quote=' + !!sb.ea_memory_quote + ' ripple=' + !!sb.ea_ripple_text);
      }
      // v3.8.23: 家庭成员命名处理（P2-5）——从AI输出提取名字回写GameState
      if (typeof processFamilyNames === 'function' && sb.family_name_updates) {
        processFamilyNames(sb.family_name_updates);
      }
      // v3.8: 死亡追踪更新 + 即时死亡判定
      updateDeathTracking(parsed.narrative || '');
      var deathIdx = checkDeath();
      if (deathIdx >= 0) {
        GameState.deathWarningCount++;
        autoSave();
        // v3.8.4b: 检查出身专属死亡结局（前朝余孽/殉道者）
        var bgDeathEnding = getBackgroundDeathEnding(deathIdx);
        if (bgDeathEnding) {
          showEnding(
            { title: '【' + bgDeathEnding.name + '】', description: bgDeathEnding.desc },
            parsed.narrative
          );
        } else {
          showEnding(
            { title: '【' + DEATH_NAMES[deathIdx] + '】', description: DEATH_DESCS[deathIdx] },
            parsed.narrative
          );
        }
        return;
      }
      // v3.11.0e: 提前更新pendingChoices，确保autoSave快照一致性
      // 此时parsed.choices已可用，先做初步更新；完整选项逻辑（EA覆盖/出身策略）在后续执行
      if (parsed && Array.isArray(parsed.choices) && parsed.choices.length > 0) {
        GameState.pendingChoices = parsed.choices.slice(0, 3);
      }
      autoSave();
      // v3.8.10: 回合结束后检测锚点完成
      if (typeof checkAnchorCompletion === 'function') {
        checkAnchorCompletion();
      }
    }
  }

  // 结局判定：AI主动给ending，或到达终局硬边界（第60回合 / 年份越过1398）时强制截断
  const atFinaleBoundary = !isRejected && (GameState.turn >= 60 || GameState.year >= 1398);
  if (!isRejected && parsed.stateBlock && parsed.stateBlock.ending) {
    showEnding(parsed.stateBlock.ending, parsed.narrative);
    return;
  }
  if (atFinaleBoundary) {
    // v3.8: 代码化结局判定（隐藏 > 通用 > 兜底）
    var finalEnding = resolveFinaleEnding();
    if (finalEnding) {
      showEnding(finalEnding, parsed.narrative);
    } else {
      showEnding(
        { title: '洪武落幕', description: '洪武三十一年，太祖驾崩。建文帝即位，改元建文。你的洪武仕途在此画上句号——身后功过，留与青史。' },
        parsed.narrative
      );
    }
    return;
  }

  // v3.12.1: 终局兜底——AI已写"驾崩"叙事但未输出 ending 字段时强制结算
  // 场景：AI在锚点9窗口内/前提前写驾崩（或输出缺失ending字段），turn/year未达硬边界，
  // 导致结局不触发、选项照常渲染——用户会看到"墓志铭文字+三个选项"却没有结局卡片
  // 判定窗口：锚点9（朱元璋驾崩，57-60回）前2回合起启用，即 turn >= 55
  // v3.14.0（P1-3）：直接读锚点表，消除魔法数字 55；锚点表不可用时兜底 55
  var finaleWindowStart = 55;
  if (typeof HISTORY_ANCHORS !== 'undefined' && HISTORY_ANCHORS.length >= 9) {
    finaleWindowStart = HISTORY_ANCHORS[8].start - 2;
  }
  if (!isRejected && GameState.turn >= finaleWindowStart
      && typeof detectEmperorDeath === 'function'
      && detectEmperorDeath(rawOutput)
      && !(parsed.stateBlock && parsed.stateBlock.ending)) {
    var finaleEnding = resolveFinaleEnding();
    if (!finaleEnding) {
      finaleEnding = {
        title: '洪武落幕',
        description: '洪武三十一年，太祖驾崩。建文帝即位，改元建文。你的洪武仕途在此画上句号——身后功过，留与青史。'
      };
    }
    showEnding(finaleEnding, parsed.narrative);
    return;
  }

  // v3.8.11: gameOver 守卫——结局已触发则不再渲染选项
  if (GameState.gameOver) return;

  // 渲染选项（驳回时给出重新选择的提示）
  // v3.8.22 P0: 等两帧确保DOM更新完毕再渲染选项
  await new Promise(r => {
    requestAnimationFrame(() => requestAnimationFrame(r));
  });
  // 部分选项修复：解析器提取到了 1-2 个选项时，保留它们并补充默认项到 3 个；
  // 完全没提取到时才回退到默认四项
  const DEFAULT_CHOICES = ['继续前行', '另作打算', '静观其变', '自由行动：（输入你想做的任何事）'];
  let choices;
  if (parsed.choices.length >= 3) {
    choices = parsed.choices;
  } else if (parsed.choices.length >= 1) {
    // 保留 AI 已写出的部分选项，补齐到 3 个
    choices = parsed.choices.slice(0, 3);
    const filler = DEFAULT_CHOICES.slice(0, 3 - choices.length);
    choices = choices.concat(filler);
  } else {
    choices = DEFAULT_CHOICES;
  }

  // v3.11.0: 导演指令模式——EA回合使用AI生成的选项文字替换默认choices
  if (GameState.currentEmotionalAnchor && GameState.currentEmotionalAnchor.isNewFormat
      && GameState._pendingEaOptions) {
    var eaOpts = GameState._pendingEaOptions;
    var eaChoices = [];
    var dirs = GameState.currentEmotionalAnchor.choiceDirections;
    for (var ei2 = 0; ei2 < dirs.length; ei2++) {
      var lbl = dirs[ei2].label;
      var txt = eaOpts[lbl] || dirs[ei2].direction; // fallback到direction
      eaChoices.push(txt);
    }
    if (eaChoices.length >= 2) {
      choices = eaChoices;
    }
  }

  // v3.10.0: P1-1 出身策略注入——确保每回合至少1个出身特色选项
  if (typeof ORIGIN_STRATEGIES !== 'undefined' && GameState.character.background) {
    var bg = GameState.character.background;
    var strategy = ORIGIN_STRATEGIES[bg];
    if (strategy) {
      // 检查AI选项是否已包含出身特色内容（通过关键词匹配）
      var hasOriginOption = false;
      var allKeywords = [];
      for (var ti = 0; ti < strategy.templates.length; ti++) {
        var kws = strategy.templates[ti].keywords;
        for (var ki = 0; ki < kws.length; ki++) {
          if (allKeywords.indexOf(kws[ki]) < 0) allKeywords.push(kws[ki]);
        }
      }
      // 只检查前3个固定选项（不含自由行动）
      for (var ci = 0; ci < Math.min(choices.length, 3); ci++) {
        var choiceText = choices[ci] || '';
        if (choiceText.indexOf('自由行动') >= 0) continue;
        for (var ki = 0; ki < allKeywords.length; ki++) {
          if (choiceText.indexOf(allKeywords[ki]) >= 0) {
            hasOriginOption = true;
            break;
          }
        }
        if (hasOriginOption) break;
      }
      // 若无出身特色选项，将第3个选项替换为出身策略选项（保留AI前2个选项）
      if (!hasOriginOption) {
        var templates = strategy.templates;
        var pickIdx = Math.floor(Math.random() * templates.length);
        var originText = templates[pickIdx].text;
        // 替换第3个选项（索引2），如果第3个是自由行动则替换第2个（索引1）
        var replaceIdx = (choices.length >= 3 && choices[2] && choices[2].indexOf('自由行动') < 0) ? 2 : 1;
        if (replaceIdx < choices.length) {
          choices[replaceIdx] = originText;
        }
      }
    }
  }

  // v3.8.11: 存档当前选项用于断点恢复
  GameState.pendingChoices = choices.slice();
  // v3.11.0b: 选项更新后立即重新存档，修复退出重进显示上一回合选项的bug
  autoSave();

  // P0-2: 危机回合——替换为自救选项
  var isRescueTurn = (GameState.deathCountdown > 0 || GameState.deathWarning > 0)
                     && !GameState.rescueAttempted
                     && (GameState.deathCountdownType > 0 || GameState.deathWarningType > 0);
  var crisisType = GameState.deathCountdownType || GameState.deathWarningType;

  if (isRescueTurn && parsed.stateBlock && parsed.stateBlock.rescueOptions && parsed.stateBlock.rescueOptions.length > 0) {
    choices = parsed.stateBlock.rescueOptions.slice(0, 3);
    GameState.pendingChoices = choices.slice();

    const choicesArea = renderChoices(choices, (choice, idx) => {
      addDivider();
      var note = document.createElement('div');
      note.className = 'history-choice-made';
      note.textContent = '\u25B8 ' + choice;
      gameContainer.appendChild(note);

      // 标记已尝试自救
      GameState.rescueAttempted = true;

      // 执行自救判定
      var rescueResult = attemptRescue(crisisType);

      if (rescueResult.success) {
        // 自救成功：清除危机
        GameState.deathCountdown = 0;
        GameState.deathCountdownType = 0;
        GameState.deathWarning = 0;
        GameState.deathWarningType = 0;
        showRescueJudgment(true);
      } else {
        // 自救失败
        showRescueJudgment(false);
        var downgradeResult = attemptDowngrade(crisisType);
        if (downgradeResult.canDowngrade) {
          // 降级而非死亡
          GameState.degradationActive = true;
          GameState.degradationType = crisisType;
          // 应用降级效果
          if (downgradeResult.effects) applyChanges(downgradeResult.effects);
          // 清除危机
          GameState.deathCountdown = 0;
          GameState.deathCountdownType = 0;
          GameState.deathWarning = 0;
          GameState.deathWarningType = 0;
          // 延迟显示降级弹窗（等判定动画播完）
          setTimeout(function() { showDegradationWarning(downgradeResult); }, 2500);
        } else {
          // 真正的死亡——下一回合checkDeath会触发
          // 清除预警，让下一回合的checkDeath返回真正的死亡
          GameState.deathWarning = 0;
          GameState.deathWarningType = 0;
        }
      }

      processAITurn(choice);
    });

    // 添加危机横幅样式
    choicesArea.classList.add(GameState.deathWarning > 0 ? 'crisis-warning-active' : 'crisis-active');
    choicesArea.classList.add('rescue-choices-area');
    // 给每个按钮加上rescue-btn样式
    choicesArea.querySelectorAll('.choice-btn').forEach(function(btn) { btn.classList.add('rescue-btn'); });

    gameContainer.appendChild(choicesArea);
    scrollToBottom();
    return; // 不走常规选项渲染
  }

  const choicesArea = renderChoices(choices, (choice) => {
    addDivider();
    // 记录玩家的选择
    const note = document.createElement('div');
    note.className = 'history-choice-made';
    note.textContent = `▸ ${choice}`;
    gameContainer.appendChild(note);
    // v3.9.0 / v3.11.0: 情感锚点选择记录（兼容新旧格式）
    if (GameState.currentEmotionalAnchor && typeof recordEmotionalChoice === 'function') {
      var anchor = GameState.currentEmotionalAnchor;
      if (anchor.isNewFormat && GameState._pendingEaOptions) {
        // 新格式：通过AI生成的选项文字匹配label
        var eaOpts = GameState._pendingEaOptions;
        for (var di = 0; di < anchor.choiceDirections.length; di++) {
          var dirLabel = anchor.choiceDirections[di].label;
          var dirText = eaOpts[dirLabel] || '';
          if (choice === dirText || choice.indexOf(dirText) !== -1 || dirText.indexOf(choice) !== -1) {
            recordEmotionalChoice(dirLabel);
            break;
          }
        }
      } else if (anchor.choices && anchor.choices.length > 0) {
        // 旧格式：通过config.js中的固定text匹配label
        for (var ei = 0; ei < anchor.choices.length; ei++) {
          if (anchor.choices[ei].text === choice || choice.indexOf(anchor.choices[ei].text) !== -1) {
            recordEmotionalChoice(anchor.choices[ei].label);
            break;
          }
        }
      } else if (anchor.choiceDirections && anchor.choiceDirections.length > 0) {
        // 新格式但_pendingEaOptions未就绪：按choiceDirections顺序取第一个可用
        recordEmotionalChoice(anchor.choiceDirections[0].label);
      }
    }
    // 下一回合计发给 AI（驳回后的选择仍然作为新的行动输入）
    processAITurn(choice);
  });

  if (isRejected) {
    choicesArea.classList.add('rejected-hint');
  }

  gameContainer.appendChild(choicesArea);

  // ========== v3.8.20: 自由行动引导提示 ==========
  if (typeof getActionHint === 'function') {
    var actionHint = getActionHint();
    if (actionHint) {
      var hintEl = document.createElement('div');
      hintEl.style.cssText = 'text-align:center;color:#a89070;font-size:0.82em;margin:0.3rem 0 0.8rem;font-style:italic;opacity:0.8;';
      hintEl.textContent = '💡 ' + actionHint;
      gameContainer.appendChild(hintEl);
    }
  }

  scrollToBottom();
}

function showError(msg, retryChoice) {
  const div = document.createElement('div');
  div.className = 'input-screen';
  const retryAttr = retryChoice != null
    ? `onclick="this.closest('.input-screen').remove();processAITurn(${JSON.stringify(retryChoice).replace(/"/g,'&quot;')})"`
    : `onclick="this.closest('.input-screen').remove()"`;
  div.innerHTML = `
    <h2>墨笔滞涩</h2>
    <p class="subtitle">${msg}</p>
    <button class="confirm-btn" ${retryAttr}>再 试</button>
  `;
  gameContainer.appendChild(div);
  scrollToBottom();
}

// v3.9: 重试耗尽时的降级策略——显示"历史迷雾"过渡文字
function showRetryExhausted() {
  var fallbackTexts = [
    '时局纷乱，消息真假难辨。你在衙署中埋首文书，外头的风声暂时平息了一些。',
    '连日来案牍劳形，你难得清闲一日。街市上人来人往，似乎一切如常。',
    '驿道上尘土飞扬，信使匆匆而过。你隐约感到朝中有些异动，但尚无确切消息。'
  ];
  var fallback = fallbackTexts[Math.floor(Math.random() * fallbackTexts.length)];
  
  // 创建叙事区域显示过渡文字
  var narrativeArea = document.createElement('div');
  narrativeArea.className = 'narrative-area';
  var narrativeText = document.createElement('div');
  narrativeText.className = 'narrative-text';
  narrativeText.innerHTML = '<p>' + fallback + '</p>';
  narrativeArea.appendChild(narrativeText);
  gameContainer.appendChild(narrativeArea);
  scrollToBottom();
  
  // 回合正常推进（但叙事内容是过渡文字）
  GameState.turn++;
  addTurnInfo(getYearName(GameState.year) + ' · 第' + GameState.turn + '回');
  autoSave();
  
  // 显示选项
  var DEFAULT_CHOICES = ['继续前行', '另作打算', '静观其变', '自由行动：（输入你想做的任何事）'];
  var choices = DEFAULT_CHOICES.slice(0, 3);
  renderChoices(choices);
}

// v3.8.11: 异步生成个性化墓志铭——确保所有结局路径都有完整墓志铭
async function fetchEpitaphAsync(ending, deathIdx) {
  var epitaphEl = document.getElementById('epitaph-card');
  if (!epitaphEl) return;

  try {
    var a = GameState.attributes, f = GameState.factions;
    var bg = GameState.character.background || '未知';
    var pos = GameState.character.position || '未入流';
    var turn = GameState.turn, year = GameState.year;

    // 确定死因/结局
    var fate = '';
    if (deathIdx >= 0 && deathIdx < DEATH_NAMES.length) {
      fate = '死因：' + DEATH_NAMES[deathIdx];
    } else {
      fate = '结局：' + (ending.title || '').replace(/[\[\]【】]/g, '');
    }

    // 找出最强阵营
    var maxF = '', maxV = -999;
    for (var k in f) { if (f[k] > maxV) { maxV = f[k]; maxF = k; } }
    var factionLabels = {huaixi:'淮西',zhedong:'浙东',donggong:'东宫',zhuwang:'诸王',jinchen:'近臣'};

    var prompt = '请为以下洪武朝人物写一段墓志铭续句（紧接底色之后），要求2-3句，不超过60字，文风古雅凝练。\n'
      + '【人物信息】出身：' + bg + '，最终官职：' + pos + '，在位' + turn + '回合（至洪武' + year + '年）\n'
      + '【' + fate + '】\n'
      + '【属性】权术' + a.power + ' 人脉' + a.people + ' 智慧' + a.wisdom + ' 君臣' + a.bond + ' 名望' + a.fame + '\n'
      + '【阵营倾向】最强：' + (factionLabels[maxF]||maxF) + '(' + maxV + ')，圣眷：' + (GameState.emperor_feeling > 0 ? '+' : '') + GameState.emperor_feeling + '\n'
      + '【底色】' + (epitaphEl.textContent || '').replace(/[—⏳正在镌刻墓志铭…]/g, '').trim() + '\n'
      + '请直接写出续句内容，不要加【墓志铭】标记，不要解释，只输出墓志铭文字。';

    var resp = await fetch(BOT_CONFIG.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: '你是一位精通古典碑铭的文人，擅长为逝者撰写精炼的墓志铭。只输出墓志铭正文，不输出任何其他内容。' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var text = await resp.text();
    // 提取 JSON 中的 content
    var aiText = '';
    try {
      var data = JSON.parse(text);
      aiText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } catch(_) {
      aiText = text.trim();
    }
    aiText = aiText.replace(/【墓志铭】/g, '').trim();
    if (aiText.length > 100) aiText = aiText.substring(0, 100) + '…';

    // 更新墓志铭卡片
    if (aiText && epitaphEl) {
      var loadingEl = epitaphEl.querySelector('.epitaph-loading');
      if (loadingEl) loadingEl.remove();
      epitaphEl.innerHTML += '<br>' + aiText.replace(/\n/g, '<br>');
    }
  } catch(e) {
    console.warn('[Epitaph] 生成失败:', e);
    var loadingEl = document.querySelector('.epitaph-loading');
    if (loadingEl) loadingEl.textContent = '';
  }
}

function showEnding(ending, narrative) {
  // v3.8.11: 游戏终止标记——阻止选项渲染
  GameState.gameOver = true;
  // v3.12.1: 防御性归一化——兼容字符串/数组/空对象等异常 ending 格式（AI输出不稳定）
  if (!ending || typeof ending !== 'object' || Array.isArray(ending)) {
    var fallbackTitle = (typeof ending === 'string' && ending) ? ending : '';
    ending = {
      title: fallbackTitle || '洪武落幕',
      description: fallbackTitle
        ? ''
        : '洪武三十一年，太祖驾崩。建文帝即位，改元建文。你的洪武仕途在此画上句号——身后功过，留与青史。'
    };
  }
  if (!ending.title) ending.title = '洪武落幕';
  if (!ending.description) ending.description = '';
  const div = document.createElement('div');
  div.className = 'input-screen';
  // v3.8.6: 结局卡片展示AI叙事 + 代码评价
  // v3.8.6: 提取AI写的墓志铭续句
  var aiEpitaph = '';
  if (narrative) {
    var match = narrative.match(/【墓志铭】([\s\S]*?)$/);
    if (match) {
      aiEpitaph = match[1].trim();
      narrative = narrative.replace(/【墓志铭】[\s\S]*$/, '').trim();
    }
  }
  // v3.8.6: 查找墓志铭底色
  var epitaphBase = '';
  var dIdx = -1;
  if (typeof GameState.deathCountdownType === 'number' && GameState.deathCountdownType > 0) dIdx = GameState.deathCountdownType - 1;
  if (dIdx >= 0 && dIdx < DEATH_NAMES.length) {
    epitaphBase = EPITAPHS[DEATH_NAMES[dIdx]] || '';
  } else {
    var tn = (ending.title || '').replace(/[\[\]【】]/g, '');
    if (EPITAPHS[tn]) epitaphBase = EPITAPHS[tn];
  }
  // v3.8.11: 墓志铭始终渲染——有AI续写直接显示，否则异步生成
  var epitaphHtml = '';
  if (epitaphBase) {
    var template = '<div class="ending-epitaph" id="epitaph-card">\u2014\u2014 ' + epitaphBase;
    if (aiEpitaph) {
      template += '<br>' + aiEpitaph.replace(/\n/g, '<br>');
    } else if (typeof generateDynamicEpitaph === 'function') {
      // v3.10.0: 动态墓志铭保底——AI未提供续写时，代码根据玩家一生行为生成
      var dynamicEpitaph = generateDynamicEpitaph(ending.title || '');
      template += '<br>' + dynamicEpitaph;
    } else {
      template += '<br><span class="epitaph-loading">⏳ 正在镌刻墓志铭…</span>';
    }
    template += '</div>';
    epitaphHtml = template;
  }
  // v3.8.21修复：不再在结局卡片里重复渲染narrative（叙事已在上方正常显示）
  // 保留narrative参数仅用于提取墓志铭（见上方逻辑）
  // v3.8.17: 双维度结局——事业+传承
  var legacyHtml = '';
  if (ending.legacy && ending.legacy.title) {
    legacyHtml = '<div class="ending-legacy">'
      + '<h3 class="ending-legacy-title">◆ 门楣兴衰 ◆</h3>'
      + '<p class="ending-legacy-name">' + ending.legacy.title + '</p>'
      + '<p class="ending-legacy-desc">' + ending.legacy.description + '</p>'
      + '</div>';
  }
  // v3.8.23: 一生回顾数据面板（P2-3）
  var lifeReviewHtml = '';
  if (typeof generateLifeReview === 'function' && typeof renderLifeReviewPanel === 'function') {
    var review = generateLifeReview();
    lifeReviewHtml = renderLifeReviewPanel(review);
  }
  div.innerHTML = `
    <h2 class="ending-title">◆ 仕途终局 ◆</h2>
    <h3 class="ending-career-name">${ending.title || '终章'}</h3>
    <p class="ending-verdict">${ending.description || '你的故事到此结束。'}</p>
    ${legacyHtml}
    ${lifeReviewHtml}
    ${epitaphHtml}
    <button class="confirm-btn" onclick="location.reload()">重新开始</button>
  `;
  // v3.12.3 P1-5: 终局展示样式已迁移至 styles.css（.ending-title / .ending-career-name / .ending-legacy-* / .ending-verdict / .ending-epitaph / .epitaph-loading）
  gameContainer.appendChild(div);
  scrollToBottom();

  // v3.8.11: 如果AI没写墓志铭续句，异步生成个性化墓志铭
  if (epitaphBase && !aiEpitaph) {
    fetchEpitaphAsync(ending, dIdx);
  }
}

// ========== MAIN GAME LOOP (supports demo + live) ==========
async function enterGameLoop() {
  clearContainer();

  if (BOT_CONFIG.mode === 'live') {
    // === LIVE MODE ===
    chatHistory = []; // 重置对话历史
    // First turn: send character intro as context
    const initialContext = `【角色创建已完成，跳过第十七章首轮格式。玩家角色已确定，身世小传玩家已在开局界面读过，即上文 character_canon 字段】

请严格按照第十七章的输出格式，直接输出第一回合的完整内容：
1. 叙事段落（400-600字·**首回合蒙太奇**）：本回合允许用蒙太奇手法快进"从小传入仕（约洪武初年）到洪武八年春"的数年铺垫。先用 2-3 句话从小传结尾处接续（角色到任/当差），然后用 2-3 句话概括这数年间的关键变化（官职升降/人际聚散/某次危机），最后落点到**洪武八年春**——一个让角色嗅到"太师刘基病重"风声的清晨或午后，窗外有具体可感的场景。可以引用小传中的人物与细节（如父亲遗言、家世处境、舅舅蓝玉），但禁止复述、重写或扩写小传本身，禁止重新介绍角色身世
2. ---分隔符
3. 3个选项+1个自由行动（用「」包裹），围绕"刘基病重"消息的初步反应（打探/观望/拜访等）
4. ---分隔符
5. JSON状态块（turn:1, year:1375, month:3, pacing:紧迫, 数值变化体现数年积累：权势+5~10, 人脉+5~10, 其他可微增；year/month 为蒙太奇结束点，之后进入刘基事件的紧迫窗口）

不要问名字、不要问出身，角色已确定。直接开始叙事。`;

    await processAITurn(initialContext);
  } else {
    // === DEMO MODE ===
    await showLoading(1000);

    for (let i = 0; i < DEMO_TURNS.length; i++) {
      const turn = DEMO_TURNS[i];

      const yearName = getYearName(turn.state.year);
      const monthNames = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
      addTurnInfo(`${yearName} · ${monthNames[turn.state.month - 1]}月 · 第${turn.state.turn}回`);
      applyPacing(turn.state.pacing);

      await showLoading(800 + Math.random() * 600);

      const narrativeHTML = narrativeToHTML(turn.text);
      gameContainer.appendChild(renderNarrative(narrativeHTML));
      scrollToBottom();

      await new Promise(r => setTimeout(r, 600));
      GameState.turn = turn.state.turn;
      GameState.year = turn.state.year;
      GameState.month = turn.state.month;
      if (turn.state.character) {
        GameState.character.position = turn.state.character.position;
        GameState.character.rank = turn.state.character.rank;
      }
      applyChanges(turn.state.changes);
      autoSave();

      // v3.8.22 P0: 等两帧确保DOM更新
      await new Promise(r => {
        requestAnimationFrame(() => requestAnimationFrame(r));
      });

      if (i === DEMO_TURNS.length - 1) {
        const choicesArea = renderChoices(turn.choices, (choice) => {
          addDivider();
          if (BOT_CONFIG.mode === 'live') {
            processAITurn(choice);
          } else {
            const endDiv = document.createElement('div');
            endDiv.className = 'input-screen';
            endDiv.innerHTML = `
              <h2>演示到此</h2>
              <p class="subtitle">这是一个前端原型的交互演示。<br>在实际游戏中，你的选择会发送给墨史官（AI），<br>由AI生成下一段叙事。<br><br>感谢体验「墨史 · 大明」。</p>
              <button class="confirm-btn" onclick="location.reload()">重新开始</button>
            `;
            gameContainer.appendChild(endDiv);
            scrollToBottom();
          }
        });
        gameContainer.appendChild(choicesArea);
      } else {
        const choicesArea = renderChoices(turn.choices, () => {});
        gameContainer.appendChild(choicesArea);
        await new Promise(r => setTimeout(r, 2000));
        const firstBtn = choicesArea.querySelector('.choice-btn');
        if (firstBtn) firstBtn.click();
        addDivider();
      }

      scrollToBottom();
    }
  }
}

// ========== SAVE / LOAD SYSTEM ==========
const SAVE_KEY = 'moshi_daming_saves';
const AUTOSAVE_KEY = 'moshi_daming_autosave';
const SAVE_VERSION = 1;
let modalMode = 'save'; // 'save' or 'load'

function getSaves() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return [null, null, null];
    const data = JSON.parse(raw);
    return data.slots || [null, null, null];
  } catch (e) {
    return [null, null, null];
  }
}

function writeSaves(slots) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    version: SAVE_VERSION,
    slots
  }));
}

function getAutoSave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearAutoSave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

function saveToSlot(slotIndex) {
  try {
    // 若该档位已有存档，先确认覆盖
    const slots = getSaves();
    const existing = slots[slotIndex];
    if (existing && existing.timestamp) {
      const ok = confirm(`第 ${slotIndex + 1} 档已有存档（${formatTime(existing.timestamp)}），是否覆盖？`);
      if (!ok) return;
    }
    // 基本校验：GameState 必须至少有角色名才能存档
    if (!GameState.character.name) {
      alert('角色尚未命名，无法存档');
      return;
    }
    const snapshot = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      gameState: JSON.parse(JSON.stringify(GameState)),
      narrativeHistory: collectNarrativeHistory()
    };
    slots[slotIndex] = snapshot;
    writeSaves(slots);
    // 重新渲染槽位，覆盖存档后立即刷新显示
    renderModalSlots();

    // 视觉确认：边框闪绿
    const slotEl = document.querySelector(`[data-slot="${slotIndex}"]`);
    if (slotEl) {
      const original = slotEl.style.borderColor;
      const originalShadow = slotEl.style.boxShadow;
      slotEl.style.borderColor = '#27ae60';
      slotEl.style.boxShadow = '0 0 12px rgba(39,174,96,0.25)';
      setTimeout(() => {
        slotEl.style.borderColor = original;
        slotEl.style.boxShadow = originalShadow;
      }, 900);
    }
  } catch (err) {
    console.error('saveToSlot failed:', err);
    alert('存档失败：' + (err.message || err));
  }
}

function loadFromSlot(slotIndex) {
  try {
    const slots = getSaves();
    const save = slots[slotIndex];
    if (!save || !save.gameState) {
      alert('该档位存档损坏或为空');
      return;
    }
    closeModal();
    applySnapshot(save);
    // 读档后立刻同步 autosave，防止下次进入首页加载的是旧自动档
    autoSave();
  } catch (err) {
    console.error('loadFromSlot failed:', err);
    alert('读档失败：' + (err.message || err));
  }
}

function deleteSlot(slotIndex) {
  if (!confirm(`确定删除第 ${slotIndex + 1} 档？此操作不可恢复。`)) return;
  try {
    const slots = getSaves();
    slots[slotIndex] = null;
    writeSaves(slots);
    renderModalSlots();
  } catch (err) {
    console.error('deleteSlot failed:', err);
    alert('删除失败：' + (err.message || err));
  }
}

function collectNarrativeHistory() {
  const blocks = [];
  const children = gameContainer.children;
  for (const child of children) {
    if (child.classList.contains('turn-info')) {
      blocks.push({ type: 'turn-info', text: child.textContent });
    } else if (child.classList.contains('narrative-area')) {
      const textEl = child.querySelector('.narrative-text');
      blocks.push({ type: 'narrative', html: textEl ? textEl.innerHTML : '' });
    } else if (child.classList.contains('ink-divider')) {
      blocks.push({ type: 'divider' });
    }
  }
  return blocks;
}

function formatTime(ts) {
  if (!ts || !isFinite(ts)) return '未知时间';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '未知时间';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderModalSlots() {
  const container = document.getElementById('modalSlots');
  if (!container) return;
  const slots = getSaves();
  let html = '';

  for (let i = 0; i < 3; i++) {
    const save = slots[i];
    // 无存档
    if (!save || !save.gameState) {
      html += `
        <div class="save-slot empty" data-slot="${i}">
          <div class="slot-num" style="text-align:center;margin-bottom:0;">第 ${i + 1} 档 · 空</div>
          ${modalMode === 'save'
            ? `<div class="slot-actions" style="justify-content:center;">
                 <button class="slot-btn" onclick="event.stopPropagation();saveToSlot(${i})">存入此档</button>
               </div>`
            : `<div class="slot-actions" style="justify-content:center;color:var(--ink-faint);font-size:0.9rem;">空档</div>`}
        </div>`;
      continue;
    }
    // 有存档
    const gs = save.gameState;
    const yearName = getYearName(gs.year) || `洪武${gs.year - 1367}年`;
    const charName = (gs.character && gs.character.name) ? gs.character.name : '未命名';
    const charBg = (gs.character && gs.character.background) ? gs.character.background : '—';
    const charPos = (gs.character && gs.character.position) ? gs.character.position : '未入流';
    html += `
      <div class="save-slot" data-slot="${i}">
        <div class="slot-header">
          <span class="slot-num">第 ${i + 1} 档</span>
          <span class="slot-time">${formatTime(save.timestamp)}</span>
        </div>
        <div class="slot-info">
          <span>👤 ${charName}</span>
          <span>🎭 ${charBg}</span><br>
          <span>📅 ${yearName} · 第${gs.turn || '?'}回</span>
          <span>🏷️ ${charPos}</span>
        </div>
        <div class="slot-actions">
          ${modalMode === 'save'
            ? `<button class="slot-btn" onclick="event.stopPropagation();saveToSlot(${i})">覆盖存档</button>`
            : `<button class="slot-btn" onclick="event.stopPropagation();loadFromSlot(${i})">读取进度</button>`}
          <button class="slot-btn danger" onclick="event.stopPropagation();deleteSlot(${i})">删除</button>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

function openSaveModal() {
  modalMode = 'save';
  document.getElementById('modalTitle').textContent = '存 档';
  document.getElementById('modalSubtitle').textContent = '选择一个档位保存当前进度';
  renderModalSlots();
  document.getElementById('saveModal').classList.add('active');
}

function openLoadModal() {
  modalMode = 'load';
  document.getElementById('modalTitle').textContent = '读 档';
  document.getElementById('modalSubtitle').textContent = '选择一个档位继续游戏';
  renderModalSlots();
  document.getElementById('saveModal').classList.add('active');
}

function closeModal() {
  document.getElementById('saveModal').classList.remove('active');
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('saveModal')) closeModal();
}

function saveSnapshot() {
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    gameState: JSON.parse(JSON.stringify(GameState)),
    narrativeHistory: collectNarrativeHistory()
  };
}

function applySnapshot(save) {
  if (!save || !save.gameState) return;
  const gs = save.gameState;

  // ========== v3.14.0（P0-6）: 存档自动恢复机制 ==========
  // 1) 用 DEFAULT_GAME_STATE 模板重置全部字段：新增字段自动获得默认值，
  //    不再需要逐字段手动维护恢复逻辑（修复"恢复后 crisisTags 等字段丢失"类问题）
  // 2) 用存档值整体覆盖：存档是 GameState 的完整快照（JSON.stringify），
  //    读档后状态与存档时刻一致
  // 3) 嵌套对象深合并 + 旧存档格式兼容（缺子键时补默认值）
  // 4) 保留 migrateGameState 处理字段类型变化等复杂迁移
  const base = (typeof DEFAULT_GAME_STATE !== 'undefined')
    ? JSON.parse(JSON.stringify(DEFAULT_GAME_STATE))
    : {};

  // 1) 模板重置（所有已定义字段回到默认值）
  for (const k in base) {
    if (Object.prototype.hasOwnProperty.call(base, k)) GameState[k] = base[k];
  }
  // 2) 存档值覆盖（跳过一次性运行时内部字段，避免旧存档残留通知复活）
  for (const k in gs) {
    if (!Object.prototype.hasOwnProperty.call(gs, k) || gs[k] === undefined) continue;
    if (k.charAt(0) === '_' && k !== '_pendingEaOptions' && k !== '_pendingEaMemoryQuote' && k !== '_pendingEaRipple') continue;
    GameState[k] = gs[k];
  }
  // 3) 嵌套对象深合并（旧存档缺子键时补默认值）
  GameState.character = { ...(base.character || {}), ...(gs.character || {}) };
  GameState.attributes = { ...(base.attributes || {}), ...(gs.attributes || {}) };
  GameState.factions = { ...(base.factions || {}), ...(gs.factions || {}) };
  // 种子格式兼容：旧版存盘种子为字符串，统一转为对象格式
  GameState.seeds = Array.isArray(gs.seeds) ? gs.seeds.map(function(s) {
    return typeof s === 'string' ? { id: s, planted_turn: 1 } : s;
  }) : (Array.isArray(base.seeds) ? [...base.seeds] : []);
  // 数组字段类型兜底（防旧存档异常值破坏遍历逻辑）
  const ARRAY_FIELDS = ['seeds_triggered', 'completedAnchors', 'pendingChoices', 'lifeEventsTriggered',
    'fatePointsEarned', 'fatePointsSpent', 'crisisEventsTriggered', 'crisisEventsCompleted', 'achievements',
    'crisisFinaleChoices', 'crisisSkippedEvents', 'emotionalMemory'];
  for (const f of ARRAY_FIELDS) {
    if (!Array.isArray(GameState[f])) GameState[f] = [];
  }
  // v3.11.0b: EA导演指令模式临时变量（修复退出重进后EA上下文丢失）
  GameState._pendingEaOptions = gs._pendingEaOptions || null;
  GameState._pendingEaMemoryQuote = gs._pendingEaMemoryQuote || null;
  GameState._pendingEaRipple = gs._pendingEaRipple || null;
  // v3.8.16: 当前生活事件不落档，读档后硬重置（原逻辑保留）
  GameState.currentLifeEvent = null;
  // 4) 复杂迁移（字段类型变化等，保留原有迁移逻辑）
  if (typeof migrateGameState === 'function') migrateGameState(GameState);

  updateStatusPanel();
  clearContainer();
  if (save.narrativeHistory && save.narrativeHistory.length > 0) {
    for (const block of save.narrativeHistory) {
      if (block.type === 'turn-info') addTurnInfo(block.text);
      else if (block.type === 'narrative') gameContainer.appendChild(renderNarrative(block.html, false));
      else if (block.type === 'divider') addDivider();
    }
    // v3.8.11: 断点恢复——有效存档选项直接重选，否则让AI生成新回合
    addDivider();
    const DEFAULT_CHOICE_TEXTS = ['继续前行', '另作打算', '静观其变', '自由行动：（输入你想做的任何事）'];
    const hasValidSavedChoices = Array.isArray(GameState.pendingChoices)
      && GameState.pendingChoices.length > 0
      && !GameState.pendingChoices.every(function(c) { return DEFAULT_CHOICE_TEXTS.indexOf(c) >= 0; });

    if (hasValidSavedChoices) {
      const savedChoices = GameState.pendingChoices;
      const resumeHint = document.createElement('div');
      resumeHint.style.cssText = 'text-align:center;color:#a89070;font-size:0.85em;margin:0.5rem 0 1rem;';
      resumeHint.textContent = '— 上次中断于此，请选择 —';
      gameContainer.appendChild(resumeHint);
      const choicesArea = renderChoices(savedChoices, (choice) => {
        resumeHint.remove();
        choicesArea.remove();
        const note = document.createElement('div');
        note.className = 'history-choice-made';
        note.textContent = '\u25b8 ' + choice;
        gameContainer.appendChild(note);
        processAITurn(choice);
      });
      gameContainer.appendChild(choicesArea);
    } else {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'choice-btn';
      resumeBtn.textContent = '继续前行';
      resumeBtn.style.margin = '1rem auto';
      resumeBtn.style.display = 'block';
      resumeBtn.style.opacity = '1';
      resumeBtn.style.transform = 'none';
      resumeBtn.style.animation = 'none';
      resumeBtn.addEventListener('click', () => {
        resumeBtn.remove();
        const yearName = getYearName(GameState.year);
        const monthNames = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
        const context = `玩家选择继续。当前状态：第${GameState.turn}回，${yearName}${monthNames[GameState.month-1]}月。请严格依据 character_canon（角色身世铁律）与 recent_plot（前情提要）衔接剧情，生成下一回合的叙事和新选项；身世细节以 character_canon 为准，不得自行改编。`;
        processAITurn(context);
      });
      gameContainer.appendChild(resumeBtn);
    }
    scrollToBottom();
  }
}

// Auto-save after each turn (separate key)
// v3.12.2: try-catch 保护——自动存档失败不阻断回合流程，仅 warn + 轻量提示
function autoSave() {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveSnapshot()));
  } catch (err) {
    console.warn('自动存档失败:', err);
    showToast('自动存档失败（存储不可用）');
  }
}

function loadAutoSave() {
  try {
    const save = getAutoSave();
    if (!save || !save.gameState) return false;
    closeModal();
    applySnapshot(save);
    return true;
  } catch (err) {
    console.error('loadAutoSave failed:', err);
    return false;
  }
}

// ========== INIT ==========
// v3.12.3 P0-5: 开局显式重置终局相关字段
// gameOver 仅在 showEnding 中置 true、原无重置入口，旧逻辑依赖 location.reload() 重建整个 JS 环境；
// 此处显式重置，保证未来改为不刷新页面重开时终局状态不残留。
function resetFinaleState() {
  GameState.gameOver = false;
  GameState.ending = null;            // 运行时动态字段（showEnding 局部参数），防御性清空
  GameState.completedAnchors = [];
  GameState.lastAnchorAchieved = 0;
  GameState.pendingChoices = null;    // 终局回合若有未决选项，一并清理
}

document.addEventListener('DOMContentLoaded', () => {
  resetFinaleState();
  startGame();
});
