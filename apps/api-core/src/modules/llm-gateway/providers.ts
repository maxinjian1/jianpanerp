import { ConfigService } from '@nestjs/config';

/** データ分類：外部送信可否を決める */
export type DataClass = 'public' | 'internal' | 'pii';

export interface ProviderConfig {
  name: string;
  baseUrl: string; // OpenAI 互換 /v1
  apiKey?: string;
  model: string;
  visionModel?: string;
  /** 'local' = データが社外に出ない（V64 / Ollama） */
  locality: 'local' | 'external';
  /** reasoning_effort をサポートするか */
  supportsReasoning?: boolean;
  timeoutMs: number;
}

/**
 * 環境変数から Provider 一覧を組み立てる。
 *
 *   cn       — 中国側ゲートウェイ（GLM など、OpenAI 互換。Tailscale 経由）
 *   dashscope— 阿里云百炼（国際サイト推奨）
 *   deepseek / moonshot — 予備
 *   local    — V64 の vLLM/llama.cpp、開発機では Ollama
 */
export function buildProviders(config: ConfigService): Record<string, ProviderConfig> {
  const timeoutMs = Number(config.get('LLM_TIMEOUT_MS', 120000));
  const providers: Record<string, ProviderConfig> = {};

  const add = (p: ProviderConfig | null) => {
    if (p && p.baseUrl) providers[p.name] = p;
  };

  const cnModel = config.get<string>('CN_LLM_MODEL', 'GLM-5.3-Flash');
  add({
    name: 'cn',
    baseUrl: config.get('CN_LLM_BASE_URL', ''),
    apiKey: config.get('CN_LLM_API_KEY'),
    model: cnModel,
    visionModel: config.get<string>('CN_LLM_VISION_MODEL', cnModel),
    locality: 'external',
    supportsReasoning: true,
    timeoutMs,
  });

  add({
    name: 'dashscope',
    baseUrl: config.get('DASHSCOPE_BASE_URL', ''),
    apiKey: config.get('DASHSCOPE_API_KEY'),
    model: config.get('DASHSCOPE_TEXT_MODEL', 'qwen-flash'),
    visionModel: config.get('DASHSCOPE_VISION_MODEL', 'qwen-vl-plus'),
    locality: 'external',
    timeoutMs,
  });

  add({
    name: 'deepseek',
    baseUrl: config.get('DEEPSEEK_BASE_URL', ''),
    apiKey: config.get('DEEPSEEK_API_KEY'),
    model: config.get('DEEPSEEK_MODEL', 'deepseek-chat'),
    locality: 'external',
    timeoutMs,
  });

  add({
    name: 'moonshot',
    baseUrl: config.get('MOONSHOT_BASE_URL', ''),
    apiKey: config.get('MOONSHOT_API_KEY'),
    model: config.get('MOONSHOT_MODEL', 'moonshot-v1-32k'),
    locality: 'external',
    timeoutMs,
  });

  add({
    name: 'local',
    baseUrl: config.get<string>('LOCAL_LLM_BASE_URL') ?? config.get<string>('OLLAMA_BASE_URL', ''),
    apiKey: config.get('LOCAL_LLM_API_KEY', 'local'),
    model: config.get<string>('LOCAL_LLM_MODEL') ?? config.get<string>('OLLAMA_MODEL', 'qwen3:14b'),
    visionModel: config.get('LOCAL_LLM_VISION_MODEL'),
    locality: 'local',
    timeoutMs: timeoutMs * 3, // ローカル推論は遅い
  });

  return providers;
}

export interface RoutingPolicy {
  /** public / internal 用 */
  defaultProvider: string;
  /** pii 用。'masked-<provider>' なら假名化してから external に送る */
  piiProvider: string;
  fallbacks: string[];
}

export function buildRoutingPolicy(config: ConfigService): RoutingPolicy {
  return {
    defaultProvider: config.get('LLM_DEFAULT_PROVIDER', 'cn'),
    piiProvider: config.get('LLM_PII_PROVIDER', 'local'),
    fallbacks: String(config.get('LLM_FALLBACK_PROVIDERS', ''))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
