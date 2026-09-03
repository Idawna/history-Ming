// ========== DOM REFS ==========
const gameContainer = document.getElementById('gameContainer');
const statusPanel   = document.getElementById('statusPanel');
const floatingChanges = document.getElementById('floatingChanges');

// ========== STATUS PANEL ==========
let panelExpanded = false;

function toggleStatusPanel() {
  panelExpanded = !panelExpanded;
  statusPanel.classList.toggle('expanded', panelExpanded);
}

function updateStatusPanel() {
  const yearStr = getYearName(GameState.year);
  const pacingIcon = PACING_ICONS[GameState.pacing] || '📜';
  document.getElementById('statusYear').textContent = yearStr;
  document.getElementById('statusPacing').textContent = `${pacingIcon} ${GameState.pacing}`;
  document.getElementById('statusPosition').textContent = GameState.character.position;

  // ========== P0-1: 属性区域改造（5条→2条复合指标） ==========
  const attrContainer = document.getElementById('attrRows');
  attrContainer.innerHTML = '';
  for (const display of DISPLAY_ATTRS) {
    const val = Math.max(0, Math.min(100, display.formula(GameState.attributes)));
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.innerHTML = `
      <span class="attr-label">${display.label}</span>
      <div class="attr-bar-wrap">
        <div class="attr-bar ${display.key}" style="width:${val}%"></div>
      </div>
      <span class="attr-value">${val}</span>
    `;
    attrContainer.appendChild(row);
  }
  // 智谋隐藏提示（仅当wisdom有变化时通过叙事体现，不显示数值）

  // ========== P0-1: 阵营区域改造（5条→2条跷跷板+近臣独立） ==========
  const factionContainer = document.getElementById('factionRows');
  factionContainer.innerHTML = '';
  
  // 跷跷板阵营：朝堂格局 + 储位之争
  for (const display of DISPLAY_FACTIONS) {
    const leftVal = Math.max(-100, Math.min(100, GameState.factions[display.leftKey]));
    const rightVal = Math.max(-100, Math.min(100, GameState.factions[display.rightKey]));
    // 跷跷板值 = 左值 - 右值，归一化到 -100~100
    const seeSaw = Math.max(-100, Math.min(100, leftVal - rightVal));
    const pct = (seeSaw + 100) / 2; // 0~100
    const isLeftDominant = seeSaw >= 0;
    
    const row = document.createElement('div');
    row.className = 'faction-row seesaw-row';
    row.innerHTML = `
      <span class="faction-label seesaw-label" style="color:${display.leftColor}">${display.leftLabel}</span>
      <div class="faction-bar-container seesaw-container">
        <div class="faction-bar-center"></div>
        <div class="faction-bar-fill" style="left:${isLeftDominant ? `${50 - Math.abs(seeSaw)/2}%` : '50%'};width:${Math.abs(seeSaw)/2}%;background:${isLeftDominant ? display.leftColor : display.rightColor}"></div>
      </div>
      <span class="faction-label seesaw-label" style="color:${display.rightColor}">${display.rightLabel}</span>
    `;
    factionContainer.appendChild(row);
  }
  
  // 近臣独立展示（根据年份判断代言人）
  const jinchenRow = document.createElement('div');
  jinchenRow.className = 'faction-row';
  const jcVal = Math.max(-100, Math.min(100, GameState.factions.jinchen));
  const jcPct = (jcVal + 100) / 2;
  const jcPositive = jcVal >= 0;
  // 根据年份判断代言人：1382年前=宋濂，1382年后=毛骧
  const jinchenNPC = GameState.year >= 1382 ? '毛骧' : '宋濂';
  const jcBarLeft = jcPositive ? '50%' : `${jcPct}%`;
  const jcBarWidth = `${Math.abs(jcVal) / 2}%`;
  jinchenRow.innerHTML = `
    <span class="faction-label">${jinchenNPC}</span>
    <div class="faction-bar-container">
      <div class="faction-bar-center"></div>
      <div class="faction-bar-fill" style="left:${jcBarLeft};width:${jcBarWidth};background:var(--jinchen)"></div>
    </div>
    <span class="faction-value" style="color:var(--jinchen)">${jcVal > 0 ? '+' : ''}${jcVal}</span>
  `;
  factionContainer.appendChild(jinchenRow);

  // Emperor
  const empVal = Math.max(-100, Math.min(100, GameState.emperor_feeling));
  const empPct = (empVal + 100) / 2;
  const empPositive = empVal >= 0;
  const empBar = document.getElementById('emperorBar');
  empBar.style.left = empPositive ? '50%' : `${empPct}%`;
  empBar.style.width = `${Math.abs(empVal) / 2}%`;
  document.getElementById('emperorValue').textContent = `${empVal > 0 ? '+' : ''}${empVal}`;

  // P0-2: 危机徽章更新
  updateCrisisBadge();
  
  // v3.8.18 P0-2: 伏笔区域更新
  renderSeedHints();
}

// ========== P0-2: 危机徽章 ==========
function updateCrisisBadge() {
  var badge = document.getElementById('statusCrisis');
  if (!badge) return;

  // 优先级：预警 > 倒计时 > 缓冲提示 > 隐藏
  if (GameState.deathWarning > 0 && GameState.deathWarningType > 0) {
    var evt = (typeof CRISIS_EVENTS !== 'undefined') ? CRISIS_EVENTS[GameState.deathWarningType] : null;
    badge.textContent = '\u26A0 ' + (evt ? evt.title : '危机') + '（警告）';
    badge.className = 'status-crisis-badge crisis-warning';
    badge.style.display = '';
    return;
  }

  if (GameState.deathCountdown > 0 && GameState.deathCountdownType > 0) {
    var evt2 = (typeof CRISIS_EVENTS !== 'undefined') ? CRISIS_EVENTS[GameState.deathCountdownType] : null;
    var remaining = GameState.deathCountdown;
    var label = remaining === 1 ? '命悬一线' : '剩余' + remaining + '回合';
    badge.textContent = '\u2620 ' + (evt2 ? evt2.title : '死劫') + '（' + label + '）';
    badge.className = 'status-crisis-badge crisis-countdown';
    badge.style.display = '';
    return;
  }

  if (GameState.crisisBufferActive) {
    badge.textContent = '\uD83D\uDEE1 有人暗中相救';
    badge.className = 'status-crisis-badge crisis-buffer';
    badge.style.display = '';
    return;
  }

  badge.style.display = 'none';
}

// v3.8.18 P0-2: 伏笔区域——种子可见性提示
function renderSeedHints() {
  var container = document.getElementById('seedHints');
  if (!container) return;
  container.innerHTML = '';
  var seeds = GameState.seeds || [];
  var negativeSeeds = seeds.filter(function(s) { return !s.positive; });
  var positiveSeeds = seeds.filter(function(s) { return s.positive; });
  
  // 总数<=1不显示（保持神秘感）
  if (seeds.length <= 1) {
    var seedSection = document.getElementById('seedSection');
    if (seedSection) seedSection.style.display = 'none';
    return;
  }
  
  // 总数=2显示"暗流涌动"
  if (seeds.length === 2) {
    var hint = document.createElement('span');
    hint.className = 'seed-hint-group';
    hint.textContent = '暗流涌动 ×2';
    container.appendChild(hint);
  } else {
    // 总数>=3显示叙事化标签
    var SEED_LABELS = {
      '政治炸弹': { icon: '📜', label: '旧账未清' },
      '把柄暴露': { icon: '👁', label: '暗处有眼' },
      '谣言传播': { icon: '🗣', label: '流言未息' },
      '盟友反水': { icon: '🎭', label: '人心难测' },
      '人情债':   { icon: '🤝', label: '恩情未还' }
    };
    var grouped = {};
    negativeSeeds.forEach(function(s) {
      var type = s.type || '政治炸弹';
      if (!grouped[type]) grouped[type] = 0;
      grouped[type]++;
    });
    for (var type in grouped) {
      var info = SEED_LABELS[type] || { icon: '📌', label: '伏笔' };
      var el = document.createElement('span');
      el.className = 'seed-hint';
      el.textContent = info.icon + ' ' + info.label + (grouped[type] > 1 ? ' ×' + grouped[type] : '');
      container.appendChild(el);
    }
  }
  
  // 正面种子显示为机缘暗藏
  if (positiveSeeds.length > 0) {
    var posEl = document.createElement('span');
    posEl.className = 'seed-hint seed-hint-positive';
    posEl.textContent = '✨ 机缘暗藏 ×' + positiveSeeds.length;
    container.appendChild(posEl);
  }
  
  // 控制section显示/隐藏
  var seedSection = document.getElementById('seedSection');
  if (seedSection) {
    seedSection.style.display = (container.children.length > 0) ? '' : 'none';
  }
}

// ========== P0-2: 自救判定动画 ==========
function showRescueJudgment(success) {
  var overlay = document.createElement('div');
  overlay.className = 'rescue-judgment-overlay';

  var phrases = success
    ? ['天不绝你', '绝处逢生', '命不该绝', '峰回路转']
    : ['大势已去', '天意难违', '在劫难逃', '无力回天'];
  var text = phrases[Math.floor(Math.random() * phrases.length)];

  overlay.innerHTML =
    '<div class="rescue-judgment-text">' + text + '</div>' +
    '<div class="rescue-judgment-result ' + (success ? 'rescue-success' : 'rescue-failure') + '">' +
      (success ? '▸ 自救成功' : '▸ 自救失败') +
    '</div>';

  document.body.appendChild(overlay);

  setTimeout(function() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.5s ease';
    setTimeout(function() { overlay.remove(); }, 500);
  }, 2200);
}

// ========== P0-2: 降级警告弹窗 ==========
function showDegradationWarning(downgradeResult) {
  var crisisType = GameState.degradationType || GameState.deathCountdownType || GameState.deathWarningType;
  var title = (typeof DEGRADATION_TITLES !== 'undefined' && DEGRADATION_TITLES[crisisType]) ? DEGRADATION_TITLES[crisisType] : '劫后余生';
  var narrative = (typeof DEGRADATION_NARRATIVES !== 'undefined' && DEGRADATION_NARRATIVES[crisisType]) ? DEGRADATION_NARRATIVES[crisisType] : '你侥幸逃过一劫，但代价惨重。';
  var footnotes = (typeof DEGRADATION_FOOTNOTES !== 'undefined') ? DEGRADATION_FOOTNOTES : ['活着，就是最大的胜利。'];
  var footnote = footnotes[Math.floor(Math.random() * footnotes.length)];

  // 属性变化列表
  var effectsHtml = '';
  if (downgradeResult.effects) {
    var eff = downgradeResult.effects;
    effectsHtml = '<div class="degradation-effects">';
    for (var key in eff) {
      var val = eff[key];
      if (val === 0) continue;
      var isEF = (key === 'emperor_feeling');
      var label = isEF ? '圣眷' : ((typeof ATTR_LABELS !== 'undefined' && ATTR_LABELS[key]) || key);
      var cls = val > 0 ? 'positive' : 'negative';
      var sign = val > 0 ? '+' : '';
      effectsHtml += '<div class="degradation-effect-item">' +
        '<span>' + label + '</span>' +
        '<span class="effect-value ' + cls + '">' + sign + val + '</span>' +
        '</div>';
    }
    effectsHtml += '</div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'degradation-overlay';
  overlay.innerHTML =
    '<div class="degradation-warning-title">你差点死了</div>' +
    '<div class="degradation-subtitle">—— ' + title + ' ——</div>' +
    '<div class="degradation-card">' +
      '<div class="degradation-card-title">' + title + '</div>' +
      '<div class="degradation-card-desc">' + narrative + '</div>' +
      effectsHtml +
    '</div>' +
    '<button class="degradation-continue-btn" onclick="this.parentElement.remove()">继续前行</button>' +
    '<div class="degradation-footnote">' + footnote + '</div>';

  document.body.appendChild(overlay);
}

// ========== PACING VISUAL ==========
function applyPacing(pacing) {
  const app = document.getElementById('app');
  // Remove old pacing classes
  app.className = '';
  if (pacing && pacing !== '日常') {
    app.classList.add(`pacing-${pacing}`);
  }
  GameState.pacing = pacing || '日常';
  updateStatusPanel();
}

// ========== FLOATING NOTIFICATIONS ==========
function showFloatingChanges(changes) {
  console.log('[DEBUG] showFloatingChanges called with:', JSON.stringify(changes, null, 2));
  const container = floatingChanges;
  container.innerHTML = '';

  const items = [];

  // ========== P0-1: 属性变化改造（加权转换后显示复合指标） ==========
  if (changes.attributes) {
    const attrs = changes.attributes;

    // 官运变化 = power×0.6 + fame×0.4
    const careerDelta = Math.round((attrs.power || 0) * 0.6 + (attrs.fame || 0) * 0.4);
    if (careerDelta !== 0) {
      items.push({
        text: `${careerDelta > 0 ? '+' : ''}${careerDelta} 官运`,
        type: careerDelta > 0 ? 'positive' : 'negative'
      });
    }

    // 人心变化 = people×0.5 + bond×0.5
    const heartsDelta = Math.round((attrs.people || 0) * 0.5 + (attrs.bond || 0) * 0.5);
    if (heartsDelta !== 0) {
      items.push({
        text: `${heartsDelta > 0 ? '+' : ''}${heartsDelta} 人心`,
        type: heartsDelta > 0 ? 'positive' : 'negative'
      });
    }

    // 智谋变化 → 不显示（由AI叙事体现）
    // wisdom delta 被忽略，不生成浮动通知
  }

  // ========== P0-1: 阵营变化改造（跷跷板聚合显示） ==========
  if (changes.factions) {
    const factions = changes.factions;

    // 朝堂格局 = 淮西 - 浙东
    const courtDelta = (factions.huaixi || 0) - (factions.zhedong || 0);
    if (courtDelta !== 0) {
      const label = courtDelta > 0 ? '淮西占优' : '浙东占优';
      items.push({
        text: `${courtDelta > 0 ? '+' : ''}${courtDelta} 朝堂·${label}`,
        type: 'neutral'
      });
    }

    // 储位之争 = 东宫 - 诸王
    const successionDelta = (factions.donggong || 0) - (factions.zhuwang || 0);
    if (successionDelta !== 0) {
      const label = successionDelta > 0 ? '东宫占优' : '诸王占优';
      items.push({
        text: `${successionDelta > 0 ? '+' : ''}${successionDelta} 储位·${label}`,
        type: 'neutral'
      });
    }

    // 近臣单独显示
    if (factions.jinchen && factions.jinchen !== 0) {
      items.push({
        text: `${factions.jinchen > 0 ? '+' : ''}${factions.jinchen} 近臣`,
        type: factions.jinchen > 0 ? 'positive' : 'negative'
      });
    }
  }

  // Emperor change
  if (changes.emperor_feeling && changes.emperor_feeling !== 0) {
    items.push({
      text: `${changes.emperor_feeling > 0 ? '+' : ''}${changes.emperor_feeling} 天子圣眷`,
      type: changes.emperor_feeling > 0 ? 'positive' : 'negative'
    });
  }

  items.forEach((item, i) => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = `float-notify ${item.type}`;
      el.textContent = item.text;
      container.appendChild(el);
      // Remove after animation
      setTimeout(() => el.remove(), 2800);
    }, i * 150);
  });
}

// ========== SEED SYSTEM HELPERS ==========
// 根据种子 ID 推断类型（兼容 AI 不返回 type 的情况）
function _inferSeedType(seedId) {
  if (!seedId) return '政治炸弹';
  // 根据关键词推断
  if (seedId.includes('弹劾') || seedId.includes('奏疏') || seedId.includes('旧账')) return '政治炸弹';
  if (seedId.includes('人情') || seedId.includes('回报') || seedId.includes('恩')) return '人情债';
  if (seedId.includes('把柄') || seedId.includes('证据') || seedId.includes('贪腐')) return '把柄暴露';
  if (seedId.includes('谣言') || seedId.includes('流言') || seedId.includes('传闻')) return '谣言传播';
  if (seedId.includes('反水') || seedId.includes('背叛') || seedId.includes('出卖')) return '盟友反水';
  // 默认随机分配
  var types = SEED_TYPES;
  return types[Math.floor(Math.random() * types.length)];
}

// 根据模板随机生成种子效果
function _rollSeedEffect(seedType) {
  var template = SEED_TEMPLATES[seedType];
  if (!template) return { attributes: {}, factions: null };
  
  var effect = { attributes: {}, factions: null, emperor_feeling: 0 };
  var tpl = template.effect;
  
  // 属性效果
  if (tpl.attributes) {
    for (var attr in tpl.attributes) {
      var range = tpl.attributes[attr];
      var roll = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
      effect.attributes[attr] = roll;
    }
  }
  
  // 圣眷效果
  if (tpl.emperor_feeling) {
    var efRange = tpl.emperor_feeling;
    effect.emperor_feeling = efRange[0] + Math.floor(Math.random() * (efRange[1] - efRange[0] + 1));
  }
  
  // 阵营效果（动态计算：针对玩家最高阵营）
  if (tpl.factions === null) {
    // 政治炸弹/谣言传播/盟友反水：针对玩家最高阵营造成负面影响
    var maxFaction = null, maxVal = -Infinity;
    for (var fk in GameState.factions) {
      if (Math.abs(GameState.factions[fk]) > maxVal) {
        maxVal = Math.abs(GameState.factions[fk]);
        maxFaction = fk;
      }
    }
    if (maxFaction && maxVal > 20) {
      // 阵营效果：-5 到 -15（针对最高阵营）
      effect.factions = {};
      effect.factions[maxFaction] = -(5 + Math.floor(Math.random() * 11));
    }
  } else if (tpl.factions) {
    effect.factions = {};
    for (var fk2 in tpl.factions) {
      var fRange = tpl.factions[fk2];
      effect.factions[fk2] = fRange[0] + Math.floor(Math.random() * (fRange[1] - fRange[0] + 1));
    }
  }
  
  return effect;
}

// 获取种子引爆概率（含出身修正）
function _getSeedTriggerRate(seedType) {
  var template = SEED_TEMPLATES[seedType];
  if (!template) return 0.5;
  
  var rate = template.triggerRate;
  var origin = GameState.character.background;
  
  // 出身修正
  if (template.originMod && template.originMod[origin]) {
    rate += template.originMod[origin];
  }
  
  return Math.max(0.1, Math.min(1.0, rate)); // 限制在 10%-100%
}

// 应用多个种子效果（处理叠加）
// v3.8.18: _applySeedEffects() 重写（P1-3全局叠加乘数 + 正面种子faction_boost）
function _applySeedEffects(seeds) {
  var totalEffect = { attributes: {}, emperor_feeling: 0, factions: {} };
  
  // v3.8.18 P1-3: 全局叠加乘数（基于总种子数，不区分类型）
  var totalSeeds = seeds.length;
  var globalMultiplier = 1 + (totalSeeds - 1) * 0.2; // 1个×1.0, 2个×1.2, 3个×1.4...
  
  for (var j = 0; j < seeds.length; j++) {
    var seed = seeds[j];
    var effect = seed.effect;
    var stackMultiplier = globalMultiplier;
    
    // 属性效果
    if (effect.attributes) {
      for (var ak in effect.attributes) {
        totalEffect.attributes[ak] = (totalEffect.attributes[ak] || 0) + Math.round(effect.attributes[ak] * stackMultiplier);
      }
    }
    
    // 圣眷效果（负面种子的emperor_feeling + 正面种子的emperor_feeling）
    if (effect.emperor_feeling) {
      totalEffect.emperor_feeling += Math.round(effect.emperor_feeling * stackMultiplier);
    }
    
    // 阵营效果（负面种子）
    if (effect.factions) {
      for (var fk in effect.factions) {
        totalEffect.factions[fk] = (totalEffect.factions[fk] || 0) + Math.round(effect.factions[fk] * stackMultiplier);
      }
    }
    
    // v3.8.18: 正面种子 faction_boost（民心归附：所有阵营+N）
    if (seed.positive && effect.faction_boost) {
      var fb = Math.round(effect.faction_boost * stackMultiplier);
      for (var fbk in GameState.factions) {
        totalEffect.factions[fbk] = (totalEffect.factions[fbk] || 0) + fb;
      }
    }
  }
  
  // 实际应用到 GameState
  for (var ak2 in totalEffect.attributes) {
    var key = ak2;
    var val = totalEffect.attributes[ak2];
    if (GameState.attributes[key] !== undefined) {
      GameState.attributes[key] = Math.max(0, Math.min(100, GameState.attributes[key] + val));
    }
  }
  if (totalEffect.emperor_feeling) {
    GameState.emperor_feeling = Math.max(-100, Math.min(100, GameState.emperor_feeling + totalEffect.emperor_feeling));
  }
  for (var fk2 in totalEffect.factions) {
    if (GameState.factions[fk2] !== undefined) {
      GameState.factions[fk2] = Math.max(-100, Math.min(100, GameState.factions[fk2] + totalEffect.factions[fk2]));
    }
  }
  
  console.log('[种子效果] 应用:', JSON.stringify(totalEffect), '乘数:', globalMultiplier.toFixed(1));
  return totalEffect;
}

// ========== APPLY STATE CHANGES ==========
// v3.8.2: 新增跷跷板机制柔性化 + wisdom安全网 + ef正向收益
function applyChanges(changes, narrative) {
  console.log('[DEBUG] applyChanges received:', JSON.stringify(changes, null, 2));
  // ========== P1-E: 单回合数值变化上限校验 ==========
  // SP规定：普通变化±15，紧迫±25
  if (changes.attributes) {
    const MAX_NORMAL = 15;
    const MAX_URGENT = 25;
    const isUrgent = (GameState.pacing === '紧迫');
    const maxDelta = isUrgent ? MAX_URGENT : MAX_NORMAL;
    
    for (const key of Object.keys(changes.attributes)) {
      const val = changes.attributes[key];
      if (val > maxDelta) {
        changes.attributes[key] = maxDelta;
        console.log(`[上限校验] ${key} 原值${val}，截断为${maxDelta}（${isUrgent ? '紧迫' : '普通'}模式）`);
      } else if (val < -maxDelta) {
        changes.attributes[key] = -maxDelta;
        console.log(`[上限校验] ${key} 原值${val}，截断为${-maxDelta}（${isUrgent ? '紧迫' : '普通'}模式）`);
      }
    }
  }
  // 阵营变化上限：±10（紧迫±15）
  if (changes.factions) {
    const MAX_FACTION_NORMAL = 10;
    const MAX_FACTION_URGENT = 15;
    const isUrgent = (GameState.pacing === '紧迫');
    const maxFactionDelta = isUrgent ? MAX_FACTION_URGENT : MAX_FACTION_NORMAL;
    
    for (const key of Object.keys(changes.factions)) {
      const val = changes.factions[key];
      if (val > maxFactionDelta) {
        changes.factions[key] = maxFactionDelta;
        console.log(`[上限校验] 阵营${key} 原值${val}，截断为${maxFactionDelta}`);
      } else if (val < -maxFactionDelta) {
        changes.factions[key] = -maxFactionDelta;
        console.log(`[上限校验] 阵营${key} 原值${val}，截断为${-maxFactionDelta}`);
      }
    }
  }
  // 圣眷变化上限：±15（紧迫±20）
  if (changes.emperor_feeling !== undefined) {
    const MAX_EF_NORMAL = 15;
    const MAX_EF_URGENT = 20;
    const isUrgent = (GameState.pacing === '紧迫');
    const maxEfDelta = isUrgent ? MAX_EF_URGENT : MAX_EF_NORMAL;
    const efVal = changes.emperor_feeling;
    
    if (efVal > maxEfDelta) {
      changes.emperor_feeling = maxEfDelta;
      console.log(`[上限校验] 圣眷原值${efVal}，截断为${maxEfDelta}`);
    } else if (efVal < -maxEfDelta) {
      changes.emperor_feeling = -maxEfDelta;
      console.log(`[上限校验] 圣眷原值${efVal}，截断为${-maxEfDelta}`);
    }
  }

  // ========== P2-A: 出身偏向锁定（方案C） ==========
  // 前5回合内，出身偏向阵营变化幅度减半
  // 如果 AI 标记了 faction_break（玩家选择了"决裂/投靠"选项），则不减半
  if (GameState.turn <= 5 && changes.factions && !changes.faction_break) {
    const originFaction = ORIGIN_FACTION_MAP[GameState.character.background];
    if (originFaction && changes.factions[originFaction] !== undefined) {
      const original = changes.factions[originFaction];
      // 向零取整：+7→+3, -8→-4
      changes.factions[originFaction] = Math.sign(original) * Math.floor(Math.abs(original) / 2);
      console.log('[出身锁定] 第' + GameState.turn + '回合，' + originFaction + '变化 ' + original + ' → ' + changes.factions[originFaction] + '（减半）');
    }
  }
  if (changes.faction_break) {
    console.log('[出身锁定] 玩家选择决裂/投靠选项，跳过减半（faction_break=true）');
    delete changes.faction_break; // 清理，防止传入后续逻辑
  }

  // ========== v3.8.19: 建设类行动触发正面种子（P1-5节奏曲线改进） ==========
  // 当AI标记 action_category 为"建设"时，100%种植对应正面种子
  if (changes.action_category) {
    console.log('[行动分类] AI标记本回合行动类型: ' + changes.action_category);
    if (typeof plantBuildingSeed === 'function') {
      plantBuildingSeed(GameState.turn, changes.action_category);
    }
    delete changes.action_category; // 清理，防止传入后续逻辑
  }

  // ========== 方案A：每回合代价检查 ==========
  // 确保至少有一个负向属性变化（防止AI生成全正向选项）
  if (changes.attributes) {
    const attrValues = Object.values(changes.attributes);
    const allNonNegative = attrValues.every(v => v >= 0);
    const hasPositive = attrValues.some(v => v > 0);
    
    // 如果所有属性变化都是正向或零，且至少有一个正向，强制添加一个惩罚
    if (allNonNegative && hasPositive) {
      const attrKeys = Object.keys(changes.attributes);
      const penaltyKey = attrKeys[Math.floor(Math.random() * attrKeys.length)];
      const penalty = -(Math.floor(Math.random() * 3) + 1); // -1 到 -3
      changes.attributes[penaltyKey] = penalty;
      console.log(`[代价检查] 本回合全正向，强制添加惩罚: ${penaltyKey} ${penalty}`);
    }
  }

  // ========== 应用属性变化 ==========
  if (changes.attributes) {
    for (const [key, delta] of Object.entries(changes.attributes)) {
      if (GameState.attributes[key] !== undefined) {
        GameState.attributes[key] = Math.max(0, Math.min(100, GameState.attributes[key] + delta));
      }
    }
  }

  // ========== 方案B：长期均衡约束 ==========
  // 追踪每个属性的历史变化方向，连续5回合只升不降则触发回落
  if (changes.attributes && GameState.attributeHistory) {
    const MAX_HISTORY = 5;
    const PENALTY_THRESHOLD = 5; // 连续5回合只升不降
    const PENALTY_AMOUNT = 4; // 回落4点
    
    for (const key of Object.keys(GameState.attributes)) {
      const delta = changes.attributes[key] || 0;
      const direction = delta > 0 ? 1 : (delta < 0 ? -1 : 0);
      
      // 记录历史
      if (!GameState.attributeHistory[key]) GameState.attributeHistory[key] = [];
      GameState.attributeHistory[key].push(direction);
      
      // 只保留最近 MAX_HISTORY 条记录
      if (GameState.attributeHistory[key].length > MAX_HISTORY) {
        GameState.attributeHistory[key] = GameState.attributeHistory[key].slice(-MAX_HISTORY);
      }
      
      // 检查是否连续5回合都是正向（1）
      const history = GameState.attributeHistory[key];
      if (history.length >= PENALTY_THRESHOLD) {
        const recentHistory = history.slice(-PENALTY_THRESHOLD);
        const allPositive = recentHistory.every(d => d === 1);
        
        if (allPositive) {
          // 触发回落事件
          const penalty = PENALTY_AMOUNT + Math.floor(Math.random() * 2); // 4-5点
          GameState.attributes[key] = Math.max(0, GameState.attributes[key] - penalty);
          console.log(`[均衡约束] ${key} 连续${PENALTY_THRESHOLD}回合上升，触发回落: -${penalty}`);
          
          // 重置历史，防止连续触发
          GameState.attributeHistory[key] = [];
        }
      }
    }
  }

  // v3.8.2: 跷跷板机制柔性化（SP 5.1 代码实现）
  // 淮西↔浙东、东宫↔诸王 为对立阵营，一方变化时另一方自动反向半值
  const seesawPairs = [['huaixi', 'zhedong'], ['donggong', 'zhuwang']];
  if (changes.factions) {
    for (const [key, delta] of Object.entries(changes.factions)) {
      if (GameState.factions[key] !== undefined) {
        GameState.factions[key] = Math.max(-100, Math.min(100, GameState.factions[key] + delta));
        // 跷跷板：对立阵营反向变化 delta/2（向下取整，符号取反）
        for (const pair of seesawPairs) {
          let opposite = null;
          if (pair[0] === key) opposite = pair[1];
          else if (pair[1] === key) opposite = pair[0];
          if (opposite !== null && delta !== 0) {
            const counterDelta = -Math.sign(delta) * Math.max(1, Math.floor(Math.abs(delta) / 2));
            GameState.factions[opposite] = Math.max(-100, Math.min(100, GameState.factions[opposite] + counterDelta));
          }
        }
      }
    }
  }

  // v3.8.4: wisdom安全网增强——强度随wisdom值递增（防止wisdom只升不降）
  if (changes.attributes && changes.attributes.wisdom > 0) {
    const w = GameState.attributes.wisdom;
    let sapProb = 0.3, sapMin = 1, sapMax = 3;
    if (w >= 80) { sapProb = 0.7; sapMin = 3; sapMax = 5; }
    else if (w >= 60) { sapProb = 0.5; sapMin = 2; sapMax = 4; }
    if (Math.random() < sapProb) {
      const penalty = Math.floor(Math.random() * (sapMax - sapMin + 1)) + sapMin;
      GameState.attributes.wisdom = Math.max(0, GameState.attributes.wisdom - penalty);
    }
  }

  if (changes.emperor_feeling !== undefined) {
    GameState.emperor_feeling = Math.max(-100, Math.min(100, GameState.emperor_feeling + changes.emperor_feeling));
  }
  
  // P2-B 代码化：种子系统完整实现
  // 1. 新种子入库（存储完整对象，含类型、预计引爆回合、效果）
  if (changes.seeds && changes.seeds.length > 0) {
    for (var si = 0; si < changes.seeds.length; si++) {
      var seedInput = changes.seeds[si];
      var seedId = typeof seedInput === 'string' ? seedInput : seedInput.id;
      var seedType = (typeof seedInput === 'object' && seedInput.type) ? seedInput.type : _inferSeedType(seedId);
      
      if (seedId && GameState.seeds.every(function(s) { return s.id !== seedId; })) {
        var template = SEED_TEMPLATES[seedType] || SEED_TEMPLATES['政治炸弹']; // 默认类型
        var latency = template.latency;
        var latencyRoll = latency[0] + Math.floor(Math.random() * (latency[1] - latency[0] + 1));
        var effect = _rollSeedEffect(seedType);
        
        GameState.seeds.push({
          id: seedId,
          type: seedType,
          planted_turn: GameState.turn,
          trigger_turn: GameState.turn + latencyRoll,
          effect: effect
        });
        console.log('[种子] 新种下:', seedId, '类型:', seedType, '预计引爆回合:', GameState.turn + latencyRoll);
        
        // v3.8.18 P0-1: 伴随种植——每个负面种子有40%概率伴生一个正面种子
        if (seedType && seedType.indexOf('正面') !== 0) {
          if (Math.random() < 0.4) {
            var positiveType = POSITIVE_SEED_TYPES[Math.floor(Math.random() * POSITIVE_SEED_TYPES.length)];
            var positiveLatency = 2 + Math.floor(Math.random() * 3); // 2-4回合后触发
            GameState.seeds.push({
              id: positiveType.id + '_companion_' + GameState.turn,
              type: positiveType.type,
              planted_turn: GameState.turn,
              trigger_turn: GameState.turn + positiveLatency,
              effect: JSON.parse(JSON.stringify(positiveType.effect)),
              desc: positiveType.desc,
              positive: true
            });
            console.log('[伴随种植] 负面种子伴生正面种子:', positiveType.id);
          }
        }
      }
    }
  }
  
  // 2. 检查种子引爆（AI主动 + 种子解除 + 到期必爆 + 上限溢出）
  var seedsToTrigger = [];
  var now = GameState.turn;
  
  // 2a. AI 主动引爆
  if (changes.seeds_triggered && changes.seeds_triggered.length > 0) {
    for (var ti = 0; ti < changes.seeds_triggered.length; ti++) {
      var trigId = changes.seeds_triggered[ti];
      var idx = GameState.seeds.findIndex(function(s) { return s.id === trigId; });
      if (idx >= 0) {
        seedsToTrigger.push(GameState.seeds[idx]);
        GameState.seeds.splice(idx, 1);
        console.log('[种子引爆] AI触发:', trigId);
      }
    }
  }
  
  // 2a-2. v3.8.18 P0-3: 种子解除（AI叙事驱动）
  if (changes.seeds_defused && changes.seeds_defused.length > 0) {
    for (var dfi = 0; dfi < changes.seeds_defused.length; dfi++) {
      var defuseId = changes.seeds_defused[dfi];
      var defuseIdx = GameState.seeds.findIndex(function(s) { return s.id === defuseId; });
      if (defuseIdx >= 0) {
        console.log('[种子解除] 已解除:', defuseId);
        GameState.seeds.splice(defuseIdx, 1);
      }
    }
  }
  
  // 2b. v3.8.18 P1-1: 到期必爆（移除概率，now >= trigger_turn 直接引爆）
  for (var di = GameState.seeds.length - 1; di >= 0; di--) {
    var seed = GameState.seeds[di];
    if (now >= seed.trigger_turn) {
      seedsToTrigger.push(seed);
      GameState.seeds.splice(di, 1);
      console.log('[种子引爆] 到期必爆:', seed.id);
    }
  }
  
  // 2c. 上限溢出（最早的自动引爆）
  var MAX_SEEDS = 5;
  while (GameState.seeds.length > MAX_SEEDS) {
    var oldest = GameState.seeds.shift();
    seedsToTrigger.push(oldest);
    console.log('[种子引爆] 上限溢出:', oldest.id);
  }
  
  // 3. 应用种子效果
  if (seedsToTrigger.length > 0) {
    var seedEffects = _applySeedEffects(seedsToTrigger);
    // 把种子效果合并到 changes 中，让后续逻辑（飘字等）处理
    if (seedEffects.attributes) {
      for (var ak in seedEffects.attributes) {
        if (changes.attributes && changes.attributes[ak] !== undefined) {
          changes.attributes[ak] += seedEffects.attributes[ak];
        } else if (changes.attributes) {
          changes.attributes[ak] = seedEffects.attributes[ak];
        }
      }
    }
    if (seedEffects.emperor_feeling && changes.emperor_feeling !== undefined) {
      changes.emperor_feeling += seedEffects.emperor_feeling;
    } else if (seedEffects.emperor_feeling) {
      changes.emperor_feeling = seedEffects.emperor_feeling;
    }
    if (seedEffects.factions) {
      for (var fk in seedEffects.factions) {
        if (changes.factions && changes.factions[fk] !== undefined) {
          changes.factions[fk] += seedEffects.factions[fk];
        } else if (changes.factions) {
          changes.factions[fk] = seedEffects.factions[fk];
        }
      }
    }
    // 记录到 seeds_triggered
    for (var sti = 0; sti < seedsToTrigger.length; sti++) {
      GameState.seeds_triggered.push(seedsToTrigger[sti].id);
    }
  }

  // v3.8.2: 死亡倒计时递减（每回合调用一次）
  if (typeof tickDeathCountdown === 'function') tickDeathCountdown();

  // v3.8.2: ef正向收益——高圣眷带来随机属性/声望加成
  const ef = GameState.emperor_feeling;
  var efBonus = {};
  if (ef >= 20 && Math.random() < 0.15) {
    var w = Math.floor(Math.random() * 3) + 1;
    GameState.attributes.wisdom = Math.min(100, GameState.attributes.wisdom + w);
    efBonus.wisdom = w;
  }
  if (ef >= 50 && Math.random() < 0.2) {
    var keys = ['power', 'people', 'fame'];
    var rk = keys[Math.floor(Math.random() * keys.length)];
    var rb = Math.floor(Math.random() * 3) + 1;
    GameState.attributes[rk] = Math.min(100, GameState.attributes[rk] + rb);
    efBonus[rk] = rb;
  }
  if (ef >= 80 && Math.random() < 0.25) {
    var fkeys = Object.keys(GameState.factions);
    var fk = fkeys[Math.floor(Math.random() * fkeys.length)];
    var fb = Math.floor(Math.random() * 3) + 1;
    GameState.factions[fk] = Math.min(100, GameState.factions[fk] + fb);
  }

  // P2-C: AI 标记争议文字（文字狱风险）+ 关键词兜底
  if (changes.controversial_text === true) {
    GameState.wroteControversialText = true;
    console.log('[文字狱] AI 标记本回合存在争议文字');
  } else if (narrative && !GameState.wroteControversialText) {
    if (/上疏.*諫|直言.*进谏|触怒.*龙颜|犯颜|奏疏.*激烈|文字.*获罪|争议.*文字/i.test(narrative)) {
      GameState.wroteControversialText = true;
      console.log('[文字狱-兜底] 叙事关键词触发: 争议文字');
    }
  }

  // P2-E: AI 标记出征事件（封狼居胥需要出征≥2次）+ 关键词兜底
  if (changes.expedition === true) {
    GameState.expeditionCount++;
    console.log('[出征] 第 ' + GameState.expeditionCount + ' 次出征');
  } else if (narrative && GameState.expeditionCount < 3) {
    if (/率军北伐|出征.*塞外|北伐.*出征|远征.*大漠|率师.*北征|凯旋.*回朝|出征.*蒙元/i.test(narrative)) {
      GameState.expeditionCount++;
      console.log('[出征-兜底] 叙事关键词触发: 第 ' + GameState.expeditionCount + ' 次出征');
    }
  }

  // ========== v3.8.16 Phase 2: 婚姻选择处理 ==========
  if (changes.marriage_choice && GameState.pendingMarriageChoice) {
    var choiceIdx = changes.marriage_choice.charCodeAt(0) - 65; // A=0, B=1, C=2
    var proposals = GameState.pendingMarriageChoice.proposals;
    if (choiceIdx >= 0 && choiceIdx < proposals.length) {
      var selected = proposals[choiceIdx];
      console.log('[婚姻选择] 玩家选择：' + selected.name);
      // 应用联姻效果
      if (selected.factionEffect) {
        for (var feKey in selected.factionEffect) {
          var feVal = selected.factionEffect[feKey];
          if (GameState.attributes[feKey] !== undefined) {
            GameState.attributes[feKey] = Math.max(0, Math.min(100, GameState.attributes[feKey] + feVal));
          } else if (GameState.factions[feKey] !== undefined) {
            GameState.factions[feKey] = Math.max(-100, Math.min(100, GameState.factions[feKey] + feVal));
          }
        }
      }
      // 更新家庭数据：添加妻子
      if (!GameState.family) GameState.family = { spouse: null, children: [], parents: { father: null, mother: null }, siblings: [] };
      GameState.family.spouse = {
        name: '',
        relation: '妻',
        background: selected.name,
        status: '在世',
        marriedTurn: GameState.turn
      };
      console.log('[婚姻] 妻子已添加：' + selected.name);
    }
    // 清空待选状态
    GameState.pendingMarriageChoice = null;
  }

  // ========== v3.8.16 Phase 3: 家庭危机选择处理 ==========
  if (changes.family_crisis_choice && GameState.currentFamilyCrisis) {
    var crisisChoiceIdx = changes.family_crisis_choice.charCodeAt(0) - 65;
    var crisis = GameState.currentFamilyCrisis;
    if (crisisChoiceIdx >= 0 && crisisChoiceIdx < crisis.choices.length) {
      var selectedChoice = crisis.choices[crisisChoiceIdx];
      console.log('[家庭危机] 玩家选择：' + selectedChoice.text + '（' + selectedChoice.outcome + '）');
      // 应用选择效果
      if (selectedChoice.effects) {
        for (var ceKey in selectedChoice.effects) {
          var ceVal = selectedChoice.effects[ceKey];
          if (GameState.attributes[ceKey] !== undefined) {
            GameState.attributes[ceKey] = Math.max(0, Math.min(100, GameState.attributes[ceKey] + ceVal));
          }
        }
      }
      // 记录选择结果
      if (!GameState.familyCrisisOutcome) GameState.familyCrisisOutcome = {};
      GameState.familyCrisisOutcome[crisis.id] = selectedChoice.outcome;
      // 根据选择结果更新家庭数据
      if (selectedChoice.outcome === '自保' || selectedChoice.outcome === '逃亡') {
        // 自保/逃亡结局可能导致家庭成员状态变化
        if (crisis.target === 'spouse' && selectedChoice.outcome === '自保') {
          // 休妻切割
          if (GameState.family.spouse) {
            GameState.family.spouse.status = '离异';
            console.log('[家庭危机] 妻子已离异');
          }
        }
      }
    }
    // 清空当前危机状态
    GameState.currentFamilyCrisis = null;
  }

  updateStatusPanel();
  showFloatingChanges(changes);
  // ef加成单独飘字提示
  if (Object.keys(efBonus).length > 0) showFloatingChanges({ attributes: efBonus });
}

