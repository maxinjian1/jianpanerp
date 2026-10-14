/**
 * PII 假名化（APPI 対応）
 * 顧客の個人情報を占位符に置き換えてから外部 API に送り、応答で元に戻す。
 * 映射はプロセス内のみ保持し、外部には一切出さない。
 */

export interface MaskResult {
  text: string;
  /** placeholder -> original */
  map: Record<string, string>;
  /** どの種類を何件置き換えたか（監査ログ用） */
  counts: Record<string, number>;
}

// 自動検出パターン（日本の個人情報向け）
const PATTERNS: Array<{ kind: string; re: RegExp }> = [
  // 注文番号は電話番号パターンに部分一致するので先に処理する
  { kind: 'ORDER_ID', re: /\b\d{3}-\d{7}-\d{7}\b/g }, // Amazon order id
  { kind: 'EMAIL', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  // 携帯・固定電話（ハイフン有無、全角ハイフン対応）
  { kind: 'PHONE', re: /(?:\+81[-\s]?|0)\d{1,4}[-ー\s]?\d{1,4}[-ー\s]?\d{3,4}/g },
  { kind: 'POSTAL', re: /〒?\s?\d{3}[-ー]\d{4}/g },
  // 都道府県から始まる住所（番地・建物名まで）
  {
    kind: 'ADDRESS',
    re: /(?:北海道|東京都|(?:京都|大阪)府|[^\s　]{2,3}県)[^\s　、。]{2,40}/g,
  },
];

export function maskPii(text: string, knownValues: string[] = []): MaskResult {
  const map: Record<string, string> = {};
  const counts: Record<string, number> = {};
  const reverse = new Map<string, string>();
  let out = text;

  const put = (kind: string, original: string): string => {
    const existing = reverse.get(original);
    if (existing) return existing;
    counts[kind] = (counts[kind] ?? 0) + 1;
    const ph = `<${kind}_${counts[kind]}>`;
    map[ph] = original;
    reverse.set(original, ph);
    return ph;
  };

  // 既知の値（顧客名など、正規表現で拾えないもの）を先に置換。長いものから順に。
  for (const v of [...knownValues].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (!out.includes(v)) continue;
    out = out.split(v).join(put('NAME', v));
  }

  for (const { kind, re } of PATTERNS) {
    out = out.replace(re, (m) => put(kind, m));
  }

  return { text: out, map, counts };
}

export function unmaskPii(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [ph, original] of Object.entries(map)) {
    out = out.split(ph).join(original);
  }
  return out;
}
