/**
 * 墨史·大明 — 后端 API 代理 (Express)
 * 
 * 直连大模型 API（OpenAI 兼容格式），流式返回，隐藏 API Key
 * 同时托管前端静态文件
 * 
 * 环境变量（在腾讯云 CloudBase 服务设置中配置）：
 *   LLM_API_KEY    - 大模型 API Key（必填）
 *   LLM_API_BASE   - API 地址（可选，默认 https://api.deepseek.com）
 *   LLM_MODEL      - 模型名（可选，默认 deepseek-chat）
 * 
 * 支持任何 OpenAI 兼容的 API：DeepSeek / 豆包 / 通义千问 / OpenAI 等
 * 切换模型只需改环境变量，代码不用动。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

// 启动时读取 System Prompt（冷启动时读一次，实例复用时缓存）
let SYSTEM_PROMPT = null;
function getSystemPrompt() {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT;
  try {
    const promptPath = path.join(__dirname, 'api', 'system-prompt.txt');
    SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf-8');
  } catch (e) {
    console.error('Failed to read system prompt:', e);
    SYSTEM_PROMPT = '';
  }
  return SYSTEM_PROMPT;
}

// 预加载 System Prompt
getSystemPrompt();

// ========== API 路由 ==========

app.post('/api/chat', async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const API_KEY = process.env.LLM_API_KEY;
  const API_BASE = process.env.LLM_API_BASE || 'https://api.deepseek.com';
  const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

  if (!API_KEY) {
    return res.status(500).json({ error: '服务器未配置 LLM_API_KEY' });
  }

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '缺少 messages 参数' });
  }

  // 组装完整消息：System Prompt + 前端传来的对话历史
  const fullMessages = [
    { role: 'system', content: getSystemPrompt() },
    ...messages.map(m => ({
      role: m.role || 'user',
      content: m.content || '',
    })),
  ];

  try {
    const llmResponse = await fetch(`${API_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error('LLM API error:', llmResponse.status, errText);
      return res.status(502).json({
        error: `AI 服务返回错误 (${llmResponse.status})`,
        detail: errText.slice(0, 500),
      });
    }

    // 设置 SSE（Server-Sent Events）流式响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = llmResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(delta);
          }
        } catch (e) {
          // 忽略解析失败的心跳行等
        }
      }
    }

    res.end();
  } catch (err) {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '服务器内部错误', detail: err.message });
    } else {
      res.end();
    }
  }
});

app.options('/api/chat', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// ========== 静态文件服务 ==========
app.use(express.static(path.join(__dirname, 'public')));

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== 启动服务器 ==========
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`墨史·大明 server running on port ${PORT}`);
});
