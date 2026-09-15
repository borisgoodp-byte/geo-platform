/**
 * 引用判定与 KPI 口径（前后端共享 · 禁止依赖 api/）
 * 依据 DESIGN_SPEC §2 与看板规划方案原文口径。
 */

export const PLATFORMS = ["deepseek", "doubao", "qwen"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  deepseek: "DeepSeek",
  doubao: "豆包",
  qwen: "通义千问",
};

export const KEYWORD_CATEGORIES = ["brand", "generic", "scenario"] as const;
export type KeywordCategory = (typeof KEYWORD_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  brand: "品牌类",
  generic: "通用类",
  scenario: "业务场景类",
};

/** 判定等级：L2 来源命中（计 KPI）/ L1 品牌提及（单列观察）/ L0 未命中 */
export const MEASURE_LEVELS = ["L2", "L1", "L0"] as const;
export type MeasureLevel = (typeof MEASURE_LEVELS)[number];

export const LEVEL_LABELS: Record<MeasureLevel, string> = {
  L2: "来源命中",
  L1: "品牌提及",
  L0: "未命中",
};

/** KPI 达成状态 */
export const KPI_STATUSES = ["achieved", "accepted", "below", "pending"] as const;
export type KpiStatus = (typeof KPI_STATUSES)[number];

export const KPI_STATUS_LABELS: Record<KpiStatus, string> = {
  achieved: "达标",
  accepted: "验收合格",
  below: "未达标",
  pending: "未到节点",
};

/** 项目服务档 KPI 目标：初级 20% / 中级 30% / 高级 40% */
export const TIER_KPI_TARGETS = {
  basic: 20,
  standard: 30,
  premium: 40,
} as const;
export type ServiceTier = keyof typeof TIER_KPI_TARGETS;

/** 考核节点：6 个月目标 30% / 12 个月目标 50%；验收线 = 目标 × 0.8（24% / 40%） */
export const CHECKPOINTS = {
  m6: { tag: "m6", label: "6个月考核节点", target: 30, acceptRate: 24 },
  m12: { tag: "m12", label: "12个月考核节点", target: 50, acceptRate: 40 },
} as const;
export type CheckpointTag = keyof typeof CHECKPOINTS;

/** 验收折扣口径：核心 KPI 达成率 ≥80% 即验收合格 */
export const ACCEPTANCE_FACTOR = 0.8;

/** 追踪参数黑名单（normalizeUrl 时剔除） */
const TRACKING_PARAMS = new Set([
  "spm",
  "from",
  "_t",
  "ref",
  "source",
  "timestamp",
  "fbclid",
  "gclid",
]);

/**
 * URL 归一：小写 host → 去 www./m. 前缀 → 去 query 追踪参数（utm_ 前缀、spm、from、_t 等）
 * → 去 fragment → 去默认文件名（index.html/index.htm/default.aspx）→ 去尾斜杠。
 * 解析失败时返回小写 trim 后的原文。
 */
export function normalizeUrl(raw: string): string {
  const input = raw.trim();
  if (!input) return "";
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return input.toLowerCase();
  }
  let host = url.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  else if (host.startsWith("m.")) host = host.slice(2);

  const kept: [string, string][] = [];
  url.searchParams.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || TRACKING_PARAMS.has(k)) return;
    kept.push([key, value]);
  });
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = kept
    .map(([k, v]) => (v ? `${k}=${v}` : k))
    .join("&");

  let path = url.pathname.replace(/\/(index\.html?|default\.aspx?)$/i, "");
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";

  return `${host}${path}${query ? `?${query}` : ""}`;
}

/** 引用呈现率 = L2 记录数 ÷ 实测记录总数 × 100%（保留 1 位小数；总数 0 时返回 0） */
export function calcCitationRate(total: number, l2: number): number {
  if (total <= 0) return 0;
  return Math.round((l2 / total) * 1000) / 10;
}

/** 意向词覆盖率 = 期间至少 1 次 L2 的词数 ÷ 词池生效词数 × 100%（保留 1 位小数） */
export function calcCoverageRate(activeWords: number, hitWords: number): number {
  if (activeWords <= 0) return 0;
  return Math.round((hitWords / activeWords) * 1000) / 10;
}

/**
 * 考核达标判定：实测引用率 ≥ 目标 → achieved（达标）；
 * ≥ 目标 × 0.8 → accepted（验收合格）；否则 below（未达标）。
 */
export function judgeCheckpoint(measuredRate: number, target: number): KpiStatus {
  if (measuredRate >= target) return "achieved";
  if (measuredRate >= target * ACCEPTANCE_FACTOR) return "accepted";
  return "below";
}

/** 按服务档判定 KPI 达成状态（未到节点时由调用方返回 pending） */
export function judgeTierKpi(measuredRate: number, tier: ServiceTier): KpiStatus {
  return judgeCheckpoint(measuredRate, TIER_KPI_TARGETS[tier]);
}
