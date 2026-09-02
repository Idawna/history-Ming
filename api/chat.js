// Vercel Serverless Function: /api/chat
// 直连大模型 API（OpenAI 兼容格式），流式返回，隐藏 API Key
//
// 环境变量（在 Vercel 项目设置中配置）：
//   LLM_API_KEY    - 大模型 API Key（必填）
//   LLM_API_BASE   - API 地址（可选，默认 https://api.deepseek.com）
//   LLM_MODEL      - 模型名（可选，默认 deepseek-chat）
//
// 支持任何 OpenAI 兼容的 API：DeepSeek / 豆包 / 通义千问 / OpenAI 等
// 切换模型只需改环境变量，代码不用动。

import fs from 'fs';
import path from 'path';

export const config = {
  maxDuration: 60,
};

// 启动时读取 System Prompt（冷启动时读一次，实例复用时缓存）
let SYSTEM_PROMPT = null;
function getSystemPrompt() {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT;
  try {
    const promptPath = path.join(process.cwd(), 'api', 'system-prompt.txt');
    SYSTEM_PROMPT = fs.readFileSync(promptPath, 'utf-8');
  } catch (e) {
    console.error('Failed to read system prompt:', e);
    SYSTEM_PROMPT = '';
  }
  return SYSTEM_PROMPT;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 模型切换：设置 LLM_PROVIDER=deepseek|qwen 即可快速切换
  const PROVIDER = process.env.LLM_PROVIDER || 'deepseek';
  const PROVIDERS = {
    deepseek: { apiBase: 'https://api.deepseek.com', model: 'deepseek-chat' },
    qwen:     { apiBase: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-plus' },
  };
  const cfg = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;
  // API Key 按 provider 读取，如 QWEN_API_KEY / DEEPSEEK_API_KEY，回退到 LLM_API_KEY
  const API_KEY = process.env[`${PROVIDER.toUpperCase()}_API_KEY`] || process.env.LLM_API_KEY;
  const API_BASE = process.env.LLM_API_BASE || cfg.apiBase;
  const MODEL = process.env.LLM_MODEL || cfg.model;

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
    res.setHeader('Cache-Control': 'no-cache, no-transform');
    res.setHeader('Connection': 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

    const reader = llmResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，留到下次

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            // 直接把文本片段透传给前端
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
}
