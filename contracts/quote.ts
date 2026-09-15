/**
 * 报价服务目录（前后端共享 · 占位价格，可编辑）
 * 依据 DESIGN_SPEC §4：A 诊断类 / B 重构类 / C 内容类 / D 监测类，按服务档组织。
 */

export const QUOTE_GROUPS = [
  { group: "A", name: "诊断类" },
  { group: "B", name: "重构类" },
  { group: "C", name: "内容类" },
  { group: "D", name: "监测类" },
] as const;

export interface QuoteCatalogItem {
  group: "A" | "B" | "C" | "D";
  code: string;
  name: string;
  desc: string;
  unit: string;
  /** 占位价格（元），按档区分 */
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

export const QUOTE_CATALOG: QuoteCatalogItem[] = [
  {
    group: "A",
    code: "A1",
    name: "官网 GEO 四维诊断",
    desc: "18 项指标实测评分 + 诊断报告（技术底座/页面架构/内容生态/GEO可见度）",
    unit: "次",
    priceByTier: { basic: 8000, standard: 15000, premium: 25000 },
  },
  {
    group: "A",
    code: "A2",
    name: "意图词池商定与锁定",
    desc: "与客户商定 10–20 个考核意图词，分类锁定并建立基准档案",
    unit: "次",
    priceByTier: { basic: 3000, standard: 5000, premium: 8000 },
  },
  {
    group: "A",
    code: "A3",
    name: "竞品 GEO 对标分析",
    desc: "同词池下 2–3 家竞品引用表现对比与差异化机会清单",
    unit: "次",
    priceByTier: { basic: 6000, standard: 10000, premium: 18000 },
  },
  {
    group: "B",
    code: "B1",
    name: "官网语义化重构",
    desc: "title/H1/canonical/Alt 语义标签体系重建，URL 语义与目录层级调整",
    unit: "项",
    priceByTier: { basic: 15000, standard: 30000, premium: 50000 },
  },
  {
    group: "B",
    code: "B2",
    name: "结构化数据部署",
    desc: "Organization/Product/FAQPage/Article/BreadcrumbList JSON-LD 部署与 @id 互链",
    unit: "项",
    priceByTier: { basic: 8000, standard: 15000, premium: 25000 },
  },
  {
    group: "B",
    code: "B3",
    name: "发现协议建设",
    desc: "sitemap.xml 与 llms.txt 建设，robots.txt 准入规范化",
    unit: "项",
    priceByTier: { basic: 3000, standard: 5000, premium: 8000 },
  },
  {
    group: "C",
    code: "C1",
    name: "FAQ 问答体系搭建",
    desc: "围绕决策问题（怎么选/怎么比/多少钱/怎么用/适合谁）建设问答式内容",
    unit: "套",
    priceByTier: { basic: 6000, standard: 12000, premium: 20000 },
  },
  {
    group: "C",
    code: "C2",
    name: "深度长文持续产出",
    desc: "行业专题/选购指南等深度内容，每周 2 篇，结论先行可引用形态",
    unit: "月",
    priceByTier: { basic: 8000, standard: 15000, premium: 25000 },
  },
  {
    group: "C",
    code: "C3",
    name: "白皮书/深度资产制作",
    desc: "白皮书、行业报告、技术文档等深度内容资产（网页可读）",
    unit: "份",
    priceByTier: { basic: 15000, standard: 30000, premium: 60000 },
  },
  {
    group: "D",
    code: "D1",
    name: "三平台引用率监测",
    desc: "DeepSeek/豆包/通义千问固定词池日粒度实测与看板监控",
    unit: "月",
    priceByTier: { basic: 3000, standard: 5000, premium: 8000 },
  },
  {
    group: "D",
    code: "D2",
    name: "周期报告（周报/月报/季报）",
    desc: "KPI 达成、环比趋势、空白词清单与补位建议",
    unit: "期",
    priceByTier: { basic: 2000, standard: 3000, premium: 5000 },
  },
  {
    group: "D",
    code: "D3",
    name: "考核节点验收支持",
    desc: "6/12 个月考核节点单日实测、达标判定与验收材料",
    unit: "次",
    priceByTier: { basic: 5000, standard: 8000, premium: 12000 },
  },
];

/** 按服务档展开目录为报价明细（qty 默认 1） */
export function catalogItemsForTier(
  tier: keyof QuoteCatalogItem["priceByTier"],
): QuoteItem[] {
  return QUOTE_CATALOG.map((c) => ({
    group: c.group,
    name: c.name,
    desc: c.desc,
    unit: c.unit,
    price: c.priceByTier[tier],
    qty: 1,
  }));
}

/** 报价单总价 = Σ price × qty，保留 2 位小数 */
export function computeQuoteTotal(items: QuoteItem[]): number {
  const total = items.reduce((acc, it) => acc + it.price * it.qty, 0);
  return Math.round(total * 100) / 100;
}
