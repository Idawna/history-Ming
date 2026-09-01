// ========== JSON 鲁棒解析器 ==========
function tryParseJSON(raw) {
  if (!raw) return null;
  const s = typeof raw === 'string' ? raw : String(raw);

  // 策略1：找最外层 {} 块
  const start = s.indexOf('{');
  if (start >= 0) {
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
      candidate = candidate
        .replace(/\u201c/g, '"').replace(/\u201d/g, '"')
        .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
        .replace(/\uff1a/g, ':').replace(/\uff0c/g, ',')
        .replace(/\u3002/g, '.').replace(/\s+/g, ' ').trim();
      try {
        const obj = JSON.parse(candidate);
        if (obj && typeof obj === 'object' &&
            ('turn' in obj || 'pacing' in obj || 'year' in obj || 'changes' in obj || 'initializing' in obj)) {
          return obj;
        }
      } catch (_) {}
    }
  }

  // 策略2：找代码块
  const codeRe = /`{3,4}\s*(?:json)?\s*([\s\S]*?)`{3,4}/i;
  const m = s.match(codeRe);
  if (m) {
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj === 'object' &&
          ('turn' in obj || 'pacing' in obj || 'year' in obj || 'changes' in obj || 'initializing' in obj)) {
        return obj;
      }
    } catch (_) {}
  }

  return null;
}

// ========== 分隔符检测 ==========
// 匹配各种 --- 变体：纯短横、中文破折号、混合、前后有空行/空格
// 返回分割后的 sections 数组
function splitByDividers(text) {
  // 先尝试标准 \n---\n
  // 放宽：支持 2-6 个短横、中文破折号、前后允许空格和空行
  const dividerRe = /\n[ \t]*(?:[-]{2,6}|[—]{2,6}|[-—]{2,6})[ \t]*\n/g;
  const parts = text.split(dividerRe);
  // 过滤空白段
  return parts;
}

// ========== 叙事文本净化 ==========
function sanitizeNarrative(raw) {
  if (!raw) return raw;
  let t = raw;
  // 1. 去掉 ```json ... ``` 代码块（多行）
  t = t.replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?`{3,4}/gi, '');
  // 2. 去掉残留的 markdown 反引号
  t = t.replace(/`{3,4}\s*/g, '').replace(/`{1,2}/g, '');
  // 3. 去掉多行 JSON 块：从独立一行的 { 到独立一行的 }
  t = t.replace(/^\s*\{[\s\S]*?\}\s*$/gm, '');
  // 4. 去掉单行 { ... } 残余（如 { "turn": 2 }）
  t = t.replace(/\{[^{}]{1,200}\}/g, function(match) {
    // 只移除看起来像 JSON 的（含冒号或引号）
    if (/["':]/.test(match)) return '';
    return match;
  });
  // 5. 清理连续空行
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

// ========== 选项行检测 ==========
// 匹配各种选项格式：
// 1. 「选项」 / 1.「选项」 / 1. 「选项」
// 1、选项 / 1.选项
// 甲、选项 / 甲.选项
// 自由行动：xxx / 4. 自由行动：xxx
function isChoiceLine(line) {
  if (!line || !line.trim()) return false;
  const t = line.trim();
  // 数字编号：1. xxx / 1、xxx / 1.xxx（可选括号包裹）
  if (/^\d+[\.、．\s]\s*[「『【（(]?\s*.+[」』】）)]?\s*$/.test(t)) return true;
  // 中文编号：甲、乙、丙 / 甲. 乙.
  if (/^[甲乙丙丁戊][\.、．\s]\s*[「『【（(]?.+[」』】）)]?\s*$/.test(t)) return true;
  // 纯文字选项（含「」包裹，无编号）—— 仅在明确有括号时匹配
  if (/^[「『【].+[」』】]\s*$/.test(t)) return true;
  return false;
}

// ========== 从选项行提取文本 ==========
function extractChoiceText(line) {
  let t = line.trim();
  // 去掉编号前缀：1. / 1、/ 甲、/ 甲. 等
  t = t.replace(/^\d+[\.、．\s]\s*/, '');
  t = t.replace(/^[甲乙丙丁戊][\.、．\s]\s*/, '');
  // 去掉括号包裹
  t = t.replace(/^[「『【（(]\s*/, '').replace(/\s*[」』】）)]$/, '');
  return t.trim();
}

// ========== PARSE AI OUTPUT ==========
function parseAIOutput(text) {
  if (!text || !text.trim()) return { narrative: '', choices: [], stateBlock: null };

  let narrative = '';
  let choices = [];
  let stateBlock = null;

  // Step 1: 尝试用分隔符分割
  const sections = splitByDividers(text);

  if (sections.length >= 3) {
    // 标准三段式：叙事 / 选项 / 状态
    narrative = sanitizeNarrative(sections[0].trim());
    const choicesText = sections[1].trim();
    const stateText = sections[sections.length - 1].trim();

    // 解析选项
    const choiceLines = choicesText.split('\n').filter(l => l.trim());
    choiceLines.forEach(line => {
      if (isChoiceLine(line)) {
        choices.push(extractChoiceText(line));
      }
    });

    // 解析 JSON
    stateBlock = tryParseJSON(stateText);
  }

  // Step 2: 如果分隔符失败或选项为空，走 fallback
  if (choices.length === 0) {
    // 先从全文提取 JSON
    stateBlock = tryParseJSON(text);

    // 从全文中移除 JSON 块（代码块 + 裸 JSON），得到"纯净"文本
    let cleanText = text;
    // 移除代码块
    cleanText = cleanText.replace(/`{3,4}\s*(?:json)?\s*[\s\S]*?`{3,4}/gi, '');
    // 移除多行 JSON（从 { 到匹配的最外层 }）
    if (stateBlock) {
      const jsonStr = JSON.stringify(stateBlock);
      // 找到 JSON 在文本中的位置并移除
      const jsonStart = cleanText.indexOf('{');
      if (jsonStart >= 0) {
        let depth = 0, jsonEnd = -1;
        let inStr = false, esc = false;
        for (let i = jsonStart; i < cleanText.length; i++) {
          const ch = cleanText[i];
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"' || ch === "'") { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
        }
        if (jsonEnd > jsonStart) {
          cleanText = cleanText.slice(0, jsonStart) + cleanText.slice(jsonEnd + 1);
        }
      }
    }
    // 再移除可能残留的 { ... } 块
    cleanText = cleanText.replace(/^\s*\{[^{}]*\}\s*$/gm, '');
    cleanText = cleanText.replace(/\{[^{}]{1,200}\}/g, function(match) {
      if (/["':]/.test(match)) return '';
      return match;
    });
    cleanText = cleanText.replace(/`{3,4}\s*/g, '').replace(/`{1,2}/g, '');

    // 从清理后的文本中提取选项
    const lines = cleanText.split('\n');
    const choiceLineIndices = [];

    // 从末尾倒序查找连续选项行
    let inChoices = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue; // 跳过空行

      if (isChoiceLine(line)) {
        if (!inChoices) inChoices = true;
        choiceLineIndices.unshift(i);
      } else if (inChoices) {
        break; // 遇到非选项行停止
      }
    }

    // 提取选项文本并从叙事中移除
    if (choiceLineIndices.length >= 1) {
      // 用 Set 标记要移除的行
      const removeSet = new Set(choiceLineIndices);
      choiceLineIndices.forEach(idx => {
        choices.push(extractChoiceText(lines[idx]));
      });
      // 重建叙事文本（移除选项行和相关提示行）
      const narrativeLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (removeSet.has(i)) continue;
        // 也移除"你可以选择"之类的提示行
        const t = lines[i].trim();
        if (/^(你可以|请选择|你将|行动|选择)[：:：]?\s*$/.test(t)) continue;
        narrativeLines.push(lines[i]);
      }
      narrative = narrativeLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    } else {
      // 完全没找到选项
      narrative = sanitizeNarrative(cleanText.trim());
    }
  }

  // Step 3: 最终兜底 —— 如果仍然没有叙事，用原文
  if (!narrative && text) {
    narrative = sanitizeNarrative(text.trim());
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
        showFreeActionInput(area, callback, choice);
      } else {
        area.querySelectorAll('.choice-btn').forEach(b => {
          b.disabled = true;
          b.style.opacity = '0.4';
          b.style.pointerEvents = 'none';
        });
        btn.style.opacity = '1';
        btn.style.boxShadow = '-3px 0 0 var(--cinnabar)';
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