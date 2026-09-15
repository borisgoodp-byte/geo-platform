/**
 * 引用判定与 KPI 口径（前后端共享 · 禁止依赖 api/）
 * 依据 zcode pricing 2026-09-04：周期考核 3/6月≥30%、12月≥50%，词库完成率≥80%。
 */

export const PLATFORMS = ["deepseek", "doubao", "qwen"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  deepseek: "DeepSeek",
  doubao: "豆包",
  qwen: "通义千问",
};

/** 存储 key 仍为 brand/generic/scenario；对外文案对齐维度四：决策/场景/对比（不测品牌词） */
export const KEYWORD_CATEGORIES = ["brand", "generic", "scenario"] as const;
export type KeywordCategory = (typeof KEYWORD_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  generic: "决策词",
  scenario: "场景词",
  brand: "对比词",
};

/** 括注：与报告九格列头一致（品类推荐 / 采购场景 / 品牌对比） */
export const CATEGORY_HINTS: Record<KeywordCategory, string> = {
  generic: "品类推荐",
  scenario: "采购场景",
  brand: "品牌对比",
};

/** 对外完整列头（决策→场景→对比顺序展示时用） */
export function categoryColumnLabel(c: KeywordCategory): string {
  return `${CATEGORY_LABELS[c]}（${CATEGORY_HINTS[c]}）`;
}

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

/**
 * 服务周期 KPI（zcode pricing 2026-09-04）：
 * 3/6 个月 ≥30%，12 个月 ≥50%；不再使用旧初级20%/中级30%/高级40%。
 * ServiceTier 映射：basic=3个月版 / standard=6个月版 / premium=12个月版。
 */
export const TIER_KPI_TARGETS = {
  basic: 30,
  standard: 30,
  premium: 50,
} as const;
export type ServiceTier = keyof typeof TIER_KPI_TARGETS;

/** 各档对应服务月数与套餐价（元，含税） */
export const TIER_CYCLE_MONTHS = {
  basic: 3,
  standard: 6,
  premium: 12,
} as const;

export const TIER_PACKAGE_PRICE = {
  basic: 30_000,
  standard: 60_000,
  premium: 120_000,
} as const;

/**
 * 考核节点：3/6 月目标 30%、12 月目标 50%；
 * 验收线 = 目标 × 0.8（24% / 24% / 40%）。
 */
export const CHECKPOINTS = {
  m3: { tag: "m3", label: "3个月考核节点", target: 30, acceptRate: 24 },
  m6: { tag: "m6", label: "6个月考核节点", target: 30, acceptRate: 24 },
  m12: { tag: "m12", label: "12个月考核节点", target: 50, acceptRate: 40 },
} as const;
export type CheckpointTag = keyof typeof CHECKPOINTS;

/** 词库 KPI：完成词数 ÷ 词库总词数 ≥ 80% 即词库达标 */
export const POOL_COMPLETION_TARGET = 80;

/** 单词单日检索次数口径（zcode 硬规则 3）：引用率 = 命中次数 ÷ 10 */
export const WORD_DAILY_SEARCHES = 10;

/** 验收折扣口径：核心 KPI 达成率 ≥80% 即验收合格 */
export const ACCEPTANCE_FACTOR = 0.8;

/**
 * 维度四实测词类（决策/场景/对比）。不测品牌词；
 * 三平台自动实测本轮不做，保留人工录入。
 */
export const VIS_WORD_TYPES = ["decision", "scenario", "compare"] as const;
export type VisWordType = (typeof VIS_WORD_TYPES)[number];
export const VIS_WORD_TYPE_LABELS: Record<VisWordType, string> = {
  decision: "决策词",
  scenario: "场景词",
  compare: "对比词",
};

export const VIS_WORD_TYPE_HINTS: Record<VisWordType, string> = {
  decision: "品类推荐",
  scenario: "采购场景",
  compare: "品牌对比",
};

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

/** 单词官网引用率 = 单日命中次数 ÷ WORD_DAILY_SEARCHES × 100%（保留 1 位小数） */
export function calcWordCitationRate(
  hitCount: number,
  searches: number = WORD_DAILY_SEARCHES,
): number {
  if (searches <= 0) return 0;
  return Math.round((hitCount / searches) * 1000) / 10;
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


/** 词库完成率 = 达标词数 ÷ 词库总词数 × 100%（保留 1 位小数） */
export function calcPoolCompletionRate(totalWords: number, completedWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.round((completedWords / totalWords) * 1000) / 10;
}

/** 单词是否达到周期考核目标（引用率 ≥ target） */
export function isWordCompleted(wordCitationRate: number, target: number): boolean {
  return wordCitationRate >= target;
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
