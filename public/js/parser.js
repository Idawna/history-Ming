// ========== JSON 鲁棒解析器 ==========
// 从任意文本中尝试提取并解析最外层的 JSON 对象，兼容多种 AI 输出风格：
// ① ```json ... ``` 代码块（含/不含 json 标签、含/不含多余反引号）
// ② 直接以 { 开头的纯 JSON
// ③ JSON 前后/中间混了文字、中文标点、空行等噪声
// ④ 多层嵌套、跨多行、缩进不一
function tryParseJSON(raw) {
  if (!raw) return null;
  const s = typeof raw === 'string' ? raw : String(raw);

  // 策略1：找最外层 {} 块（从首个 { 到对应的 }）
  const start = s.indexOf('{');
  if (start >= 0) {
    // 从 start 开始找匹配的 }，处理嵌套
    let depth = 0, end = -1;
    let inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"' || ch === "'") { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end > start) {
      let candidate = s.slice(start, end + 1);
      // 清理常见 AI 噪声：中文引号→英文引号、全角冒号/逗号→半角、多余空白
      candidate = candidate
        .replace(/\u201c/g, '"').replace(/\u201d/g, '"')  // 中文双引号
        .replace(/\u2018/g, "'").replace(/\u2019/g, "'")  // 中文单引号
        .replace(/\uff1a/g, ':')    // 全角冒号
        .replace(/\uff0c/g, ',')    // 全角逗号
        .replace(/\u3002/g, '.')    // 中文句号（字符串外不处理，但整体替换一般无害）
        .replace(/\s+/g, ' ')       // 合并空白
        .trim();
      try {
        const obj = JSON.parse(candidate);
        // 基本校验：必须包含 turn 或 pacing 等状态字段之一，否则可能是别的 JSON
        if (obj && typeof obj === 'object' &&
            ('turn' in obj || 'pacing' in obj || 'year' in obj || 'changes' in obj)) {
          return obj;
        }
      } catch (_) { /* 继续尝试其他策略 */ }
    }
  }

  // 策略2：找 ``` 或 ```` 代码块，再从中提取 JSON
  const codeRe = /`{3,4}\s*(?:json)?\s*([\s\S]*?)`{3,4}/i;
  const m = s.match(codeRe);
  if (m) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj === 'object' &&
          ('turn' in obj || 'pacing' in obj || 'year' in obj || 'changes' in obj)) {
        return obj;
      }
    } catch (_) {}
  }

  return null;
}

// ========== 叙事文本净化 ==========
// AI 返回整段 text 中可能混入未解析的 JSON 块/代码块，从显示中剔除
function sanitizeNarrative(raw) {
  if (!raw) return raw;
  let t = raw;
  // 去掉 ```json ... ``` 代码块
  t = t.replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?`{3,4}/gi, '');
  // 去掉残留的 markdown 标记：```、`、```
  t = t.replace(/`{3,4}\s*/g, '').replace(/`{1,2}/g, '');
  // 去掉孤立的 { ... } 块（未被解析器捕获的）
  t = t.replace(/\{[\s\S]*?\}\s*$/gm, '');
  // 清理首尾空白与连续空行
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

// ========== PARSE AI OUTPUT ==========
function parseAIOutput(text) {
  // Split by --- dividers
  const sections = text.split(/\n---\n/);

  let narrative = '';
  let choices = [];
  let stateBlock = null;

  if (sections.length >= 3) {
    narrative = sanitizeNarrative(sections[0].trim());
    const choicesText = sections[1].trim();
    const stateText = sections[2].trim();

    // Parse choices
    const choiceLines = choicesText.split('\n').filter(l => l.trim());
    choiceLines.forEach(line => {
      const match = line.match(/^\d+\.\s*[「『]?(.+?)[」』]?\s*$/) ||
                    line.match(/^\d+\.\s*(.+)$/);
      if (match) {
        let text = match[1].trim();
        // Remove brackets if present
        text = text.replace(/^[「『]/, '').replace(/[」』]$/, '');
        choices.push(text);
      }
    });

    // Parse JSON state block：兼容多种代码块写法（```json、```、````、无代码块直接大括号开头）
    stateBlock = tryParseJSON(stateText);
  } else {
    // Fallback: 没有正确分隔，尝试从全文（含JSON散落）中提取选项+状态
    // 先尝试从整段 text 中提取 JSON（有些 AI 把 JSON 放在末尾不分割）
    stateBlock = tryParseJSON(text);
    narrative = sanitizeNarrative(text.trim());
    
    // 尝试从叙事文本中提取选项（匹配 1. xxx 格式）
    const lines = narrative.split('\n');
    const narrativeLines = [];
    const choiceLines = [];
    let inChoices = false;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // 检测是否是选项格式（1. xxx, 2. xxx 等）
      const isChoice = /^\d+\.\s*[「『]?(.+?)[」』]?\s*$/.test(line) ||
                      /^\d+\.\s*(.+)$/.test(line);
      
      if (isChoice && !inChoices) {
        inChoices = true;
      }
      
      if (inChoices && isChoice) {
        choiceLines.unshift(line);
      } else if (inChoices) {
        // 遇到非选项行，停止提取
        break;
      }
    }
    
    // 如果提取到选项，从叙事中移除（即使只有 1-2 个也保留，不强制要求 3 个）
    if (choiceLines.length >= 1) {
      choiceLines.forEach(line => {
        const match = line.match(/^\d+\.\s*[「『]?(.+?)[」』]?\s*$/) ||
                      line.match(/^\d+\.\s*(.+)$/);
        if (match) {
          let choiceText = match[1].trim();
          choiceText = choiceText.replace(/^[「『]/, '').replace(/[」』]$/, '');
          choices.push(choiceText);
        }
        // 从叙事中移除这一行
        narrative = narrative.replace(line, '');
      });
      narrative = narrative.trim();
    }
  }

  return { narrative, choices, stateBlock };
}

// ========== RENDER NARRATIVE ==========
function renderNarrative(html, animate = true) {
  const div = document.createElement('div');
  div.className = 'narrative-area';

  const textDiv = document.createElement('div');
  textDiv.className = 'narrative-text';
  if (!animate) {
    textDiv.style.opacity = '1';
    textDiv.style.transform = 'none';
    textDiv.style.animation = 'none';
  }
  textDiv.innerHTML = html;

  div.appendChild(textDiv);
  
  // 兜底：强制触发重排并确保可见性（修复移动端动画偶尔不生效的问题）
  setTimeout(() => {
    if (window.getComputedStyle(textDiv).opacity === '0') {
      textDiv.style.opacity = '1';
      textDiv.style.transform = 'translateY(0)';
    }
  }, 100);
  
  return div;
}

function narrativeToHTML(text) {
  const paragraphs = text.split('\n').filter(l => l.trim());
  return paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
}

// ========== RENDER CHOICES ==========
function renderChoices(choices, callback) {
  const area = document.createElement('div');
  area.className = 'choices-area';

  const labels = ['甲', '乙', '丙', '丁'];

  choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    const isFree = choice.includes('自由行动') || choice.includes('自由');

    if (isFree) {
      btn.className = 'choice-btn free-action';
      btn.innerHTML = `<span class="choice-index">${labels[i] || i+1}</span><span class="choice-text">${choice}</span>`;
    } else {
      btn.className = 'choice-btn';
      btn.innerHTML = `<span class="choice-index">${labels[i] || i+1}</span><span class="choice-text">${choice}</span>`;
    }

    btn.addEventListener('click', () => {
      if (isFree) {
        // Show free action input
        showFreeActionInput(area, callback, choice);
      } else {
        // Disable all buttons
        area.querySelectorAll('.choice-btn').forEach(b => {
          b.disabled = true;
          b.style.opacity = '0.4';
          b.style.pointerEvents = 'none';
        });
        btn.style.opacity = '1';
        btn.style.boxShadow = '-3px 0 0 var(--cinnabar)';
        // Show "chosen" note
        const note = document.createElement('div');
        note.className = 'history-choice-made';
        note.textContent = `▸ ${choice}`;
        area.appendChild(note);
        callback(choice);
      }
    });

    area.appendChild(btn);
  });

  return area;
}

function showFreeActionInput(area, callback, placeholder) {
  let inputArea = area.querySelector('.free-action-input-area');
  if (inputArea) {
    inputArea.classList.add('active');
    inputArea.querySelector('input').focus();
    return;
  }

  inputArea = document.createElement('div');
  inputArea.className = 'free-action-input-area active';
  inputArea.innerHTML = `
    <input type="text" class="free-action-input" placeholder="输入你想做的任何事…" />
    <button class="send-btn">发送</button>
  `;

  area.appendChild(inputArea);
  const input = inputArea.querySelector('input');
  const sendBtn = inputArea.querySelector('.send-btn');
  input.focus();

  const submit = () => {
    const val = input.value.trim();
    if (!val) return;
    inputArea.classList.remove('active');
    // Disable all
    area.querySelectorAll('.choice-btn').forEach(b => {
      b.disabled = true;
      b.style.opacity = '0.4';
      b.style.pointerEvents = 'none';
    });
    const note = document.createElement('div');
    note.className = 'history-choice-made';
    note.textContent = `▸ 自由行动：${val}`;
    area.appendChild(note);
    callback(val);
  };

  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

