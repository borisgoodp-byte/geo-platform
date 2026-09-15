/**
 * 报价服务目录（前后端共享 · 禁止依赖 api/）
 * 依据 zcode pricing 2026-09-04：按服务周期统一报价
 * 3 个月 30,000 / 6 个月 60,000 / 12 个月 120,000（含税）；
 * ServiceTier：basic=3个月版 / standard=6个月版 / premium=12个月版。
 */

import {
  TIER_CYCLE_MONTHS,
  TIER_KPI_TARGETS,
  TIER_PACKAGE_PRICE,
  type ServiceTier,
} from "./kpi";

export const QUOTE_GROUPS = [
  { group: "P", name: "周期套餐" },
  { group: "A", name: "诊断类（单项）" },
  { group: "B", name: "改造类（单项）" },
  { group: "C", name: "内容类（单项）" },
  { group: "D", name: "监测类（单项）" },
] as const;

export interface QuoteCatalogItem {
  group: "P" | "A" | "B" | "C" | "D";
  code: string;
  name: string;
  desc: string;
  unit: string;
  /** 占位价格（元），按档区分；套餐项三档价即 3万/6万/12万 */
  priceByTier: { basic: number; standard: number; premium: number };
}

export interface QuoteItem {
  group: string;
  name: string;
  desc: string;
  unit: string;
  price: number;
  qty: number;
}

/** 周期套餐主目录（默认报价单只展开当前档对应套餐一行） */
export const PACKAGE_CATALOG: Record<
  ServiceTier,
  { code: string; name: string; months: number; price: number; kpiTarget: number; scope: string }
> = {
  basic: {
    code: "P3",
    name: "3个月版",
    months: TIER_CYCLE_MONTHS.basic,
    price: TIER_PACKAGE_PRICE.basic,
    kpiTarget: TIER_KPI_TARGETS.basic,
    scope: "技术诊断 1 次 + 官网小幅度优化 + GEO内容优化与平台适配 + 监测报告；赠送意图词监测 5 个 + 周/月数据报告",
  },
  standard: {
    code: "P6",
    name: "6个月版",
    months: TIER_CYCLE_MONTHS.standard,
    price: TIER_PACKAGE_PRICE.standard,
    kpiTarget: TIER_KPI_TARGETS.standard,
    scope: "技术诊断 1 次 + 官网部分优化 + GEO内容优化与平台适配 + 监测报告；赠送意图词监测 5 个 + 周/月数据报告",
  },
  premium: {
    code: "P12",
    name: "12个月版",
    months: TIER_CYCLE_MONTHS.premium,
    price: TIER_PACKAGE_PRICE.premium,
    kpiTarget: TIER_KPI_TARGETS.premium,
    scope: "技术诊断 1 次 + 官网整体改造优化 + GEO内容优化与平台适配 + 监测报告；赠送意图词监测 5 个 + 周/月数据报告",
  },
};

export const QUOTE_CATALOG: QuoteCatalogItem[] = [
  {
    group: "P",
    code: "P-CYCLE",
    name: "官网 GEO 周期套餐",
    desc: "按服务周期计费：3个月版 3万（考核≥30%）/ 6个月版 6万（≥30%）/ 12个月版 12万（≥50%）；词库完成率≥80%",
    unit: "套",
    priceByTier: {
      basic: TIER_PACKAGE_PRICE.basic,
      standard: TIER_PACKAGE_PRICE.standard,
      premium: TIER_PACKAGE_PRICE.premium,
    },
  },
  // 以下为超套餐范围或定制组合时用的单项参考价（不计入默认套餐展开）
  {
    group: "A",
    code: "A1",
    name: "官网技术底座诊断",
    desc: "页面速度、TDK、H 标签、ALT、sitemap、robots 等核心指标检测",
    unit: "次",
    priceByTier: { basic: 500, standard: 500, premium: 500 },
  },
  {
    group: "A",
    code: "A2",
    name: "AI 平台可见性检测",
    desc: "检测官网在 DeepSeek / 豆包 / 通义千问等平台的可见情况（人工实测录入）",
    unit: "平台",
    priceByTier: { basic: 500, standard: 500, premium: 500 },
  },
  {
    group: "A",
    code: "A3",
    name: "竞品 GEO 分析",
    desc: "竞品官网在 AI 平台表现、架构与意图词布局对比",
    unit: "个",
    priceByTier: { basic: 500, standard: 500, premium: 500 },
  },
  {
    group: "B",
    code: "B1",
    name: "官网页面 GEO 改造",
    desc: "TDK、URL、面包屑、H 标签、ALT、sitemap、robots 等（约 30 页内）",
    unit: "项",
    priceByTier: { basic: 10000, standard: 10000, premium: 10000 },
  },
  {
    group: "B",
    code: "B2",
    name: "数据结构化标记",
    desc: "Schema / FAQ 等结构化数据，全站",
    unit: "项",
    priceByTier: { basic: 5000, standard: 5000, premium: 5000 },
  },
  {
    group: "D",
    code: "D1",
    name: "三平台引用率监测",
    desc: "DeepSeek/豆包/通义千问固定词池人工实测与看板（本轮不做自动提问）",
    unit: "月",
    priceByTier: { basic: 500, standard: 500, premium: 500 },
  },
];

/**
 * 按服务档展开默认报价明细：只展开对应周期套餐一行（3万/6万/12万）。
 * 单项加价由商务在报价单上手动追加。
 */
export function catalogItemsForTier(tier: ServiceTier): QuoteItem[] {
  const pkg = PACKAGE_CATALOG[tier];
  return [
    {
      group: "P",
      name: pkg.name,
      desc: `${pkg.scope}；考核：引用官网呈现率 ≥${pkg.kpiTarget}%，词库完成率 ≥80%`,
      unit: "套",
      price: pkg.price,
      qty: 1,
    },
  ];
}

/** 报价单总价 = Σ price × qty，保留 2 位小数 */
export function computeQuoteTotal(items: QuoteItem[]): number {
  const total = items.reduce((acc, it) => acc + it.price * it.qty, 0);
  return Math.round(total * 100) / 100;
}
