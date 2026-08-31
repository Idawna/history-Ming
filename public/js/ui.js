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
function applyChanges(changes) {
  if (changes.attributes) {
    for (const [key, delta] of Object.entries(changes.attributes)) {
      if (GameState.attributes[key] !== undefined) {
        GameState.attributes[key] = Math.max(0, Math.min(100, GameState.attributes[key] + delta));
      }
    }
  }
  if (changes.factions) {
    for (const [key, delta] of Object.entries(changes.factions)) {
      if (GameState.factions[key] !== undefined) {
        GameState.factions[key] = Math.max(-100, Math.min(100, GameState.factions[key] + delta));
      }
    }
  }
  if (changes.emperor_feeling !== undefined) {
    GameState.emperor_feeling = Math.max(-100, Math.min(100, GameState.emperor_feeling + changes.emperor_feeling));
  }
  if (changes.seeds) {
    GameState.seeds.push(...changes.seeds);
  }

  updateStatusPanel();
  showFloatingChanges(changes);
}

