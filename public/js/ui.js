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

  // Attributes
  const attrContainer = document.getElementById('attrRows');
  attrContainer.innerHTML = '';
  for (const [key, label] of Object.entries(ATTR_LABELS)) {
    const val = Math.max(0, Math.min(100, GameState.attributes[key]));
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.innerHTML = `
      <span class="attr-label">${label}</span>
      <div class="attr-bar-wrap">
        <div class="attr-bar ${key}" style="width:${val}%"></div>
      </div>
      <span class="attr-value">${val}</span>
    `;
    attrContainer.appendChild(row);
  }

  // Factions
  const factionContainer = document.getElementById('factionRows');
  factionContainer.innerHTML = '';
  for (const [key, label] of Object.entries(FACTION_LABELS)) {
    const val = Math.max(-100, Math.min(100, GameState.factions[key]));
    const pct = (val + 100) / 2; // map -100~100 to 0~100
    const color = FACTION_COLORS[key];
    const isPositive = val >= 0;
    const barLeft = isPositive ? '50%' : `${pct}%`;
    const barWidth = `${Math.abs(val) / 2}%`;
    const row = document.createElement('div');
    row.className = 'faction-row';
    row.innerHTML = `
      <span class="faction-label">${label}</span>
      <div class="faction-bar-container">
        <div class="faction-bar-center"></div>
        <div class="faction-bar-fill" style="left:${barLeft};width:${barWidth};background:${color}"></div>
      </div>
      <span class="faction-value" style="color:${color}">${val > 0 ? '+' : ''}${val}</span>
    `;
    factionContainer.appendChild(row);
  }

  // Emperor
  const empVal = Math.max(-100, Math.min(100, GameState.emperor_feeling));
  const empPct = (empVal + 100) / 2;
  const empPositive = empVal >= 0;
  const empBar = document.getElementById('emperorBar');
  empBar.style.left = empPositive ? '50%' : `${empPct}%`;
  empBar.style.width = `${Math.abs(empVal) / 2}%`;
  document.getElementById('emperorValue').textContent = `${empVal > 0 ? '+' : ''}${empVal}`;
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
  const container = floatingChanges;
  container.innerHTML = '';

  const items = [];

  // Attribute changes
  if (changes.attributes) {
    for (const [key, delta] of Object.entries(changes.attributes)) {
      if (delta !== 0) {
        items.push({
          text: `${delta > 0 ? '+' : ''}${delta} ${ATTR_LABELS[key] || key}`,
          type: delta > 0 ? 'positive' : 'negative'
        });
      }
    }
  }

  // Faction changes
  if (changes.factions) {
    for (const [key, delta] of Object.entries(changes.factions)) {
      if (delta !== 0) {
        items.push({
          text: `${delta > 0 ? '+' : ''}${delta} ${FACTION_LABELS[key] || key}`,
          type: delta > 0 ? 'positive' : 'negative'
        });
      }
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

// ========== APPLY STATE CHANGES ==========
// v3.8.2: 新增跷跷板机制柔性化 + wisdom安全网 + ef正向收益
function applyChanges(changes) {
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
  if (changes.seeds) {
    GameState.seeds.push(...changes.seeds);
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

  updateStatusPanel();
  showFloatingChanges(changes);
  // ef加成单独飘字提示
  if (Object.keys(efBonus).length > 0) showFloatingChanges({ attributes: efBonus });
}

