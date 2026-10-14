// 直接测试中国 GLM 网关是否可达（不经 NestJS）。在 Windows/Mac（tailnet 内）运行：
//   node scripts/test-llm-gateway.mjs
// 读取仓库根 .env 的 CN_LLM_BASE_URL / CN_LLM_API_KEY / CN_LLM_MODEL
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
const base = (env.CN_LLM_BASE_URL || '').replace(/\/$/, '');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CN_LLM_API_KEY}` };

console.log('base:', base, 'model:', env.CN_LLM_MODEL);
let t = Date.now();
const models = await fetch(`${base}/models`, { headers }).then((r) => r.json());
console.log('models:', (models.data || []).map((m) => m.id), `${Date.now() - t}ms`);

t = Date.now();
const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: env.CN_LLM_MODEL,
    messages: [{ role: 'user', content: '次の中国語を自然な日本語の商品説明に翻訳してください：高品質ステンレス製の保温ボトル、500ml、12時間保温。' }],
    max_tokens: 300,
    reasoning_effort: 'low',
  }),
}).then((r) => r.json());
console.log('reply:', res.choices?.[0]?.message?.content ?? res, `${Date.now() - t}ms`);
console.log('usage:', res.usage);
