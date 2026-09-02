// ========== STREAMING API CALL ==========
// 调用后端代理，流式接收 AI 回复，逐字显示在 streamTarget 元素中
async function streamBotAPI(userMessage, streamTarget) {
  // 前端节奏引擎：按即将生成的回合号硬判节奏（历史锚点不再依赖AI自觉）
  const rhythm = getRhythmDirective(getNextTurn(), GameState.character.background);
  // 构造当前回合的上下文消息
  const contextPayload = {
    rhythm_directive: rhythm.directive,
    character_canon: GameState.character.intro
      ? `【角色身世·铁律】以下角色身世小传是玩家开局时确认过的正史设定，任何叙事涉及角色姓名、籍贯、家庭、早年经历、出身时，必须与之严格一致，不得改写、不得新增矛盾设定、不得重新介绍角色身世：\n${GameState.character.intro}`
      : undefined,
    recent_plot: collectRecentPlot(8),
    recent_choices: collectRecentChoices(),
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
      seeds_triggered: GameState.seeds_triggered
    },
    // v3.6：动态规则扩展
    dynamic_rules: {
      alive_npcs: getAliveNPCs(GameState.year),
      institutions: getAllowedInstitutions(GameState.year),
      anchor_info: getAnchorHints(getNextTurn()),
      background_anchor_hint: getBackgroundAnchorHint(GameState.character.background, getNextTurn()),
      ending_conditions: getEndingConditions(GameState.character.background),
      path_reminder: getBackgroundPathReminder(GameState.character.background, getNextTurn()),
      surveillance_hint: getSurveillanceHint(GameState.year, getNextTurn(), GameState.character.background),
      branch_focus: getBranchFocus(getNextTurn(), GameState.character.background),
      death_warning: (function(){ var w = checkDeathWarning(); return w.length ? '【死亡预警】' + w.join('、') + '——命运已在悬崖边缘，叙事中必须埋下明显的危险信号' : ''; })(),
      faction_decay: (function(){ return GameState.factionDecayThisTurn ? '【阵营衰减】上回合因阵营关系过度深入（绝对值>80），自然回落：' + GameState.factionDecayThisTurn + '。叙事中可体现"树大招风""功高遭忌后关系微妙疏远"等意象，但不可直接提及数值' : ''; })(),
      favor_crash: (function(){ return GameState.favorCrashThisTurn ? '【圣眷暴跌】' + GameState.favorCrashThisTurn + '——朱元璋猜忌加深，圣眷骤降。叙事中必须体现"帝王心术""天威难测""昨日恩宠今日猜忌"等紧张意象，可描写朝臣态度转变、皇帝冷淡等细节' : ''; })(),
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
      })()
    },
    player_action: userMessage
  };

  // 把当前玩家行动加入历史
  chatHistory.push({
    role: 'user',
    content: JSON.stringify(contextPayload)
  });

  // 控制历史长度：保留最近 30 条消息（约 15 回合），防止超出上下文窗口
  // 每回合 = 1条 user + 1条 assistant，30条 ≈ 15 回合
  const MAX_HISTORY = 30;
  const trimmedHistory = chatHistory.slice(-MAX_HISTORY);

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      // 实时更新流式显示区域（过滤掉选项和状态数据，只显示叙事部分）
      if (streamTarget) {
        // 检测 --- 分隔符，只显示分隔符之前的叙事文本
        let displayText = fullText;
        const dividerRe = /\n[ \t]*(?:[-]{2,6}|[—]{2,6}|[-—]{2,6})[ \t]*\n/;
        const dividerMatch = fullText.match(dividerRe);
        if (dividerMatch) displayText = fullText.substring(0, dividerMatch.index);
        // 流式阶段也过滤掉可能出现的 JSON 代码块残影
        displayText = displayText
          .replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?(?:`{3,4}|$)/gi, '')
          .replace(/\{\s*[\s\S]*?(?:\}\s*(?:,?\s*\n|\s*$))/gm, '')
          .trim();
        streamTarget.textContent = displayText;
        // 节流滚动：每 150ms 最多滚一次，避免性能问题；用户主动滚动时暂停自动滚动
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

    // 把 AI 回复加入历史
    if (fullText.trim()) {
      chatHistory.push({ role: 'assistant', content: fullText.trim() });
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
async function processAITurn(userChoice) {
  // 前端节奏引擎：本回合目标节奏（在叙事上屏/回合推进前计算，回合号准确）
  const engineRhythm = getRhythmDirective(getNextTurn());
  // 创建流式输出区域
  const streamArea = document.createElement('div');
  streamArea.className = 'stream-area';
  const streamText = document.createElement('div');
  streamText.className = 'stream-text';
  streamText.innerHTML = '<span class="stream-cursor"></span>';
  streamArea.appendChild(streamText);
  gameContainer.appendChild(streamArea);
  scrollToBottom();

  // 流式接收 AI 回复
  let rawOutput;
  try {
    rawOutput = await streamBotAPI(userChoice, streamText);
  } catch (err) {
    console.error('API error:', err);
    streamArea.remove();
    showError(`墨史官执笔踟蹰……（${err.message}）`, userChoice);
    return;
  }

  // 流式结束，移除流式区域
  streamArea.remove();

  if (!rawOutput || !rawOutput.trim()) {
    showError('墨史官的回复为空，请重试。', userChoice);
    return;
  }

  // 解析完整输出
  const parsed = parseAIOutput(rawOutput);

  if (!parsed.narrative) {
    showError('墨史官的回复格式有误，请重试。', userChoice);
    return;
  }

  // v3.8.10: 锚点顺序校验——检测AI输出是否包含未允许锚点的关键词
  if (typeof validateAnchorOrder === 'function') {
    var anchorValidation = validateAnchorOrder(rawOutput);
    if (!anchorValidation.valid) {
      console.warn('[锚点顺序违规]', anchorValidation.violations);
      // 强制驳回：创建 stateBlock 并设置 rejected=true
      if (!parsed.stateBlock) parsed.stateBlock = {};
      parsed.stateBlock.rejected = true;
      parsed.stateBlock.rejected_reason = '锚点顺序违规：' + anchorValidation.violations.join('；');
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

  // 渲染叙事（驳回时使用特殊样式）
  const narrativeHTML = narrativeToHTML(fixedNarrative);
  const narrativeEl = renderNarrative(narrativeHTML);
  if (isRejected) {
    const textEl = narrativeEl.querySelector('.narrative-text');
    if (textEl) textEl.classList.add('rejected');
  }
  gameContainer.appendChild(narrativeEl);
  scrollToBottom();

  // 应用状态变更（驳回时跳过：不更新数值、不推进回合、不存档）
  if (!isRejected) {
    await new Promise(r => setTimeout(r, 500));
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
        console.log('[DEBUG] parsed stateBlock.changes:', JSON.stringify(sb.changes));
        applyChanges(sb.changes);
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

  // v3.8.11: gameOver 守卫——结局已触发则不再渲染选项
  if (GameState.gameOver) return;

  // 渲染选项（驳回时给出重新选择的提示）
  await new Promise(r => setTimeout(r, isRejected ? 200 : 400));
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

  // v3.8.11: 存档当前选项用于断点恢复
  GameState.pendingChoices = choices.slice();

  const choicesArea = renderChoices(choices, (choice) => {
    addDivider();
    // 记录玩家的选择
    const note = document.createElement('div');
    note.className = 'history-choice-made';
    note.textContent = `▸ ${choice}`;
    gameContainer.appendChild(note);
    // 下一回合计发给 AI（驳回后的选择仍然作为新的行动输入）
    processAITurn(choice);
  });

  if (isRejected) {
    choicesArea.classList.add('rejected-hint');
  }

  gameContainer.appendChild(choicesArea);
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
    } else {
      template += '<br><span class="epitaph-loading">⏳ 正在镌刻墓志铭…</span>';
    }
    template += '</div>';
    epitaphHtml = template;
  }
  const narrativeHtml = narrative
    ? `<div class="ending-narrative">${narrative.replace(/\n/g, '<br>')}</div>`
    : '';
  div.innerHTML = `
    <h2 class="ending-title">${ending.title || '终章'}</h2>
    ${narrativeHtml}
    <p class="ending-verdict">${ending.description || '你的故事到此结束。'}</p>
    ${epitaphHtml}
    <button class="confirm-btn" onclick="location.reload()">重新开始</button>
  `;
  // Add styles for ending display
  const style = document.createElement('style');
  style.textContent = `
    .ending-title { font-size: 1.6em; margin-bottom: 0.5em; color: #d4a574; text-align: center; }
    .ending-narrative {
      max-height: 40vh; overflow-y: auto; padding: 1em;
      background: rgba(255,255,255,0.05); border-radius: 8px;
      margin: 0.8em 0; font-size: 0.95em; line-height: 1.8;
      color: #ccc; text-align: left; white-space: pre-wrap;
    }
    .ending-verdict {
      font-style: italic; color: #a89070; text-align: center;
      margin: 1em 0; padding: 0 1em; line-height: 1.6;
    }
    .ending-epitaph {
      text-align: center; color: #d4c4a0; font-size: 1.0em;
      margin: 1.5em auto 0.8em; padding: 1.2em 1.5em;
      background: linear-gradient(135deg, rgba(60,45,30,0.6), rgba(40,30,20,0.8));
      border: 1px solid rgba(196,168,130,0.35);
      border-radius: 4px;
      box-shadow: inset 0 0 20px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2);
      line-height: 2; letter-spacing: 0.1em;
      font-family: "Noto Serif SC", "Source Han Serif SC", "STSong", serif;
      position: relative;
      max-width: 400px;
    }
    .ending-epitaph::before {
      content: '\u2014\u00A0\u2014';
      display: block;
      color: rgba(196,168,130,0.5);
      font-size: 0.85em;
      margin-bottom: 0.5em;
      letter-spacing: 0.3em;
    }
    .epitaph-loading {
      display: inline-block;
      color: rgba(196,168,130,0.5);
      font-size: 0.85em;
      animation: epitaphPulse 1.5s ease-in-out infinite;
    }
    @keyframes epitaphPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  `;
  div.appendChild(style);
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
    const initialContext = `【角色创建已完成，跳过第16.3节首轮格式。玩家角色已确定，身世小传玩家已在开局界面读过，即上文 character_canon 字段】

请严格按照第16.1节的输出格式，直接输出第一回合的完整内容：
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

      await new Promise(r => setTimeout(r, 400));

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
  // 基础容错：确保 gs 的嵌套对象存在
  if (!gs.character) gs.character = { name: '', age: 22, background: '', position: '未入流', rank: 0 };
  if (!gs.attributes) gs.attributes = { power: 20, people: 30, wisdom: 40, bond: 50, fame: 10 };
  if (!gs.factions) gs.factions = { huaixi: 0, zhedong: 0, donggong: 0, zhuwang: 0, jinchen: 0 };
  if (!Array.isArray(gs.seeds)) gs.seeds = [];
  if (!Array.isArray(gs.seeds_triggered)) gs.seeds_triggered = [];

  // 重置 GameState 再合并（避免上一局的残留字段污染）
  GameState.turn = gs.turn || 1;
  GameState.year = gs.year || 1375;
  GameState.month = gs.month || 1;
  GameState.pacing = gs.pacing || '日常';
  GameState.emperor_feeling = gs.emperor_feeling || 0;

  // 浅层合并嵌套对象
  GameState.character = { ...GameState.character, ...gs.character };
  GameState.attributes = { ...gs.attributes };
  GameState.factions = { ...gs.factions };
  // 种子格式兼容：旧版存盘种子为字符串，统一转为对象格式
  GameState.seeds = gs.seeds.map(function(s) {
    return typeof s === 'string' ? { id: s, planted_turn: 1 } : s;
  });
  GameState.seeds_triggered = [...gs.seeds_triggered];
  // v3.8.10: 恢复已完成锚点列表（兼容旧存档）
  GameState.completedAnchors = Array.isArray(gs.completedAnchors) ? [...gs.completedAnchors] : [];

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
function autoSave() {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saveSnapshot()));
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
document.addEventListener('DOMContentLoaded', () => {
  startGame();
});
