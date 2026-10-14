import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@japan-erp/database';
import { maskPii, unmaskPii } from './pii-masker';
import {
  buildProviders,
  buildRoutingPolicy,
  DataClass,
  ProviderConfig,
  RoutingPolicy,
} from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** public: 公開情報のみ / internal: 社内情報 / pii: 顧客個人情報を含む */
  dataClass: DataClass;
  /** 監査ログ用（listing_copy / customer_reply / daily_report ...） */
  taskType: string;
  /** 正規表現で拾えない既知の個人情報（顧客名など）。pii のときだけ使う */
  knownPii?: string[];
  /** JSON 出力を強制 */
  json?: boolean;
  reasoning?: 'low' | 'high' | 'max';
  temperature?: number;
  maxTokens?: number;
  /** 明示的に Provider を指定（テスト用）。pii なら external 指定は拒否 */
  provider?: string;
  tenantId?: string;
}

export interface ChatResponse {
  content: string;
  provider: string;
  model: string;
  masked: boolean;
  usage: { promptTokens: number; completionTokens: number };
  latencyMs: number;
}

@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly providers: Record<string, ProviderConfig>;
  private readonly policy: RoutingPolicy;

  constructor(private readonly config: ConfigService) {
    this.providers = buildProviders(config);
    this.policy = buildRoutingPolicy(config);
    this.logger.log(
      `providers=[${Object.keys(this.providers).join(',')}] default=${this.policy.defaultProvider} pii=${this.policy.piiProvider}`,
    );
  }

  listProviders() {
    return Object.values(this.providers).map((p) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      model: p.model,
      locality: p.locality,
      configured: Boolean(p.baseUrl),
    }));
  }

  /** GET /models で疎通確認 */
  async healthCheck(name: string) {
    const p = this.providers[name];
    if (!p) return { name, ok: false, error: 'not configured' };
    const started = Date.now();
    try {
      const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/models`, {
        headers: this.headers(p),
        signal: AbortSignal.timeout(10000),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string }> };
      return {
        name,
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - started,
        models: body.data?.map((m) => m.id).slice(0, 20),
      };
    } catch (e) {
      return { name, ok: false, latencyMs: Date.now() - started, error: String(e) };
    }
  }

  /**
   * データ分類に基づいてルーティングし、必要なら假名化して呼び出す。
   */
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { providerName, mask } = this.resolveRoute(req);
    const chain = [providerName, ...this.policy.fallbacks.filter((f) => f !== providerName)];

    let lastError: unknown;
    for (const name of chain) {
      const p = this.providers[name];
      if (!p) continue;
      // pii は external へ生データを送らない（假名化なしの fallback は拒否）
      if (req.dataClass === 'pii' && p.locality === 'external' && !mask) continue;

      try {
        return await this.callProvider(p, req, mask);
      } catch (e) {
        lastError = e;
        this.logger.warn(`provider ${name} failed: ${String(e)}`);
      }
    }
    throw new ServiceUnavailableException(`All LLM providers failed: ${String(lastError)}`);
  }

  private resolveRoute(req: ChatRequest): { providerName: string; mask: boolean } {
    if (req.dataClass !== 'pii') {
      return { providerName: req.provider ?? this.policy.defaultProvider, mask: false };
    }
    const target = req.provider ?? this.policy.piiProvider;
    if (target.startsWith('masked-')) {
      return { providerName: target.slice('masked-'.length), mask: true };
    }
    const p = this.providers[target];
    if (p && p.locality === 'external') {
      // 設定ミス防止：pii を external にそのまま送る設定は假名化に倒す
      this.logger.warn(`LLM_PII_PROVIDER=${target} is external; forcing masking`);
      return { providerName: target, mask: true };
    }
    return { providerName: target, mask: false };
  }

  private async callProvider(
    p: ProviderConfig,
    req: ChatRequest,
    mask: boolean,
  ): Promise<ChatResponse> {
    let messages = req.messages;
    let map: Record<string, string> = {};
    let maskedCounts: Record<string, number> = {};

    if (mask) {
      const merged: Record<string, string> = {};
      messages = req.messages.map((m) => {
        const r = maskPii(m.content, req.knownPii);
        Object.assign(merged, r.map);
        for (const [k, v] of Object.entries(r.counts)) {
          maskedCounts[k] = (maskedCounts[k] ?? 0) + v;
        }
        return { ...m, content: r.text };
      });
      map = merged;
      if (Object.keys(map).length) {
        messages = [
          {
            role: 'system',
            content:
              '文中の <NAME_n> <PHONE_n> <ADDRESS_n> などは個人情報の占位符です。そのまま変更せずに出力してください。',
          },
          ...messages,
        ];
      }
    }

    const body: Record<string, unknown> = {
      model: p.model,
      messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 4096,
    };
    if (req.json) body.response_format = { type: 'json_object' };
    if (req.reasoning && p.supportsReasoning) body.reasoning_effort = req.reasoning;

    const started = Date.now();
    const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.headers(p) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(p.timeoutMs),
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${p.name} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      model?: string;
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    let content = data.choices?.[0]?.message?.content ?? '';
    if (mask) content = unmaskPii(content, map);

    const usage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };

    await this.audit({
      provider: p.name,
      model: data.model ?? p.model,
      locality: p.locality,
      dataClass: req.dataClass,
      taskType: req.taskType,
      masked: mask,
      maskedCounts,
      usage,
      latencyMs,
      tenantId: req.tenantId,
    });

    return { content, provider: p.name, model: data.model ?? p.model, masked: mask, usage, latencyMs };
  }

  private headers(p: ProviderConfig): Record<string, string> {
    return p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {};
  }

  /** 監査ログ：誰が・どのデータ分類を・どこへ送ったか。失敗しても本処理は止めない */
  private async audit(entry: {
    provider: string;
    model: string;
    locality: string;
    dataClass: DataClass;
    taskType: string;
    masked: boolean;
    maskedCounts: Record<string, number>;
    usage: { promptTokens: number; completionTokens: number };
    latencyMs: number;
    tenantId?: string;
  }) {
    try {
      await prisma.llmRequestLog.create({
        data: {
          provider: entry.provider,
          model: entry.model,
          locality: entry.locality,
          dataClass: entry.dataClass,
          taskType: entry.taskType,
          masked: entry.masked,
          maskedFields: entry.maskedCounts,
          promptTokens: entry.usage.promptTokens,
          completionTokens: entry.usage.completionTokens,
          latencyMs: entry.latencyMs,
          tenantId: entry.tenantId,
        },
      });
    } catch (e) {
      this.logger.warn(`audit log failed: ${String(e)}`);
    }
  }
}
