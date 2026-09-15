/**
 * 评分引擎（前后端共享 · 禁止依赖 api/）
 * 依据 DESIGN_SPEC §1 与《官网 GEO 四维评分准则 v3.0》原文口径。
 */

/** 子指标只允许的四档分：20 优秀 / 15 良好 / 10 待提升 / 0 缺失 */
export const ALLOWED_SCORES = [0, 10, 15, 20] as const;
export type IndicatorScore = (typeof ALLOWED_SCORES)[number];

export function isAllowedScore(v: number): v is IndicatorScore {
  return (ALLOWED_SCORES as readonly number[]).includes(v);
}

/** 四维权重：技术 25% / 页面 20% / 内容 30% / 可见度 25% */
export const DIMENSION_WEIGHTS = {
  tech: 0.25,
  arch: 0.2,
  content: 0.3,
  vis: 0.25,
} as const;

export type Grade = "A" | "B" | "C" | "D";

export const GRADE_LABELS: Record<Grade, string> = {
  A: "优秀",
  B: "良好",
  C: "待提升",
  D: "亟需优化",
};

export type DimensionKey = 1 | 2 | 3 | 4;

export const DIMENSION_NAMES: Record<DimensionKey, string> = {
  1: "官网技术底座",
  2: "官网页面架构",
  3: "官网内容生态",
  4: "官网GEO可见度",
};

export interface IndicatorDef {
  key: string;
  dimension: DimensionKey;
  name: string;
  keyPoints: string;
  anchorGood: string;
  anchorBad: string;
}

/** 18 项指标定义（锚点文案取自评分准则 v3 原文） */
export const INDICATORS: IndicatorDef[] = [
  // 维度一 官网技术底座（权重 25%）
  {
    key: "tech_1",
    dimension: 1,
    name: "AI爬虫准入与抓取健康度",
    keyPoints:
      "robots.txt 对主流 AI 爬虫的放行与拦截；全站 HTTPS、301 永久跳转、404 页行为规范",
    anchorGood: "robots.txt 明确放行主流 AI 爬虫，301跳转、404 均规范",
    anchorBad: "关键 AI 爬虫被拦截，或主入口不可达、跳转劫持、死链大面积存在",
  },
  {
    key: "tech_2",
    dimension: 1,
    name: "正文可提取性",
    keyPoints:
      "爬虫在不执行 JS 的情况下能否拿到完整正文——HTML 直出而非空壳容器",
    anchorGood: "核心页正文在源码中直出、机器可读，无需脚本执行即可完整提取",
    anchorBad: "正文依赖脚本渲染、源码为空壳，或正文以图片承载，机器读取为空",
  },
  {
    key: "tech_3",
    dimension: 1,
    name: "内容发现协议",
    keyPoints:
      "sitemap.xml 完整可访问且与现网一致；llms.txt 提供面向 AI 的内容索引与指引",
    anchorGood: "sitemap.xml、llms.txt 齐全，可访问且与现网页面一致",
    anchorBad: "无 sitemap 且无 llms.txt，或发现协议失效、与现网严重错位",
  },
  {
    key: "tech_4",
    dimension: 1,
    name: "结构化数据覆盖度",
    keyPoints:
      "各页型是否部署对应结构化数据——Organization、Product 或 Service、FAQPage、Article、BreadcrumbList",
    anchorGood: "品牌、产品/服务、内容、导航四类结构化数据在对应页型上全覆盖",
    anchorBad: "全站无任何结构化数据标记",
  },
  {
    key: "tech_5",
    dimension: 1,
    name: "结构化数据规范度与实体关联",
    keyPoints:
      "JSON-LD 语法合规、字段完整、与页面可见内容一致、无解析错误；实体间以 @id 互链（产品↔品牌↔内容），形成 AI 可遍历的知识图谱",
    anchorGood: "JSON-LD 规范无错、与可见内容一致，实体经 @id 互链成可遍历图谱",
    anchorBad: "结构化数据解析失败、与页面内容冲突，或实体完全孤立无关联",
  },
  // 维度二 官网页面架构（权重 20%）
  {
    key: "arch_1",
    dimension: 2,
    name: "核心页面体系完备度",
    keyPoints:
      "是否具备 AI 回答各类提问所需的页面载体——首页、产品/服务页、独立 blog 或内容板块、案例页、FAQ 页、关于我们、联系方式。缺页就是缺答案：AI 没有对应页面可指向时，只能引用外部信源",
    anchorGood: "七类核心页面齐备，含独立 blog/内容板块与 FAQ 页，各页型有独立入口",
    anchorBad: "仅有首页与产品展示页，无 blog/内容板块、无 FAQ、无案例",
  },
  {
    key: "arch_2",
    dimension: 2,
    name: "URL语义与目录层级",
    keyPoints:
      "URL 是否语义可读（英文/拼音词而非乱码 ID）、目录深度不超三层、无参数化乱串与会话参数——URL 本身就是 AI 判断页面主题的信号",
    anchorGood: "URL 语义清晰、层级扁平在三层内、目录命名与栏目结构对应",
    anchorBad: "URL 为无意义 ID 或长参数串，层级混乱无规律",
  },
  {
    key: "arch_3",
    dimension: 2,
    name: "内链与面包屑",
    keyPoints:
      "面包屑齐全、主导航可爬（非纯 JS 菜单）、内容页之间有相关推荐、无孤岛页面——AI 需要能从任一入口走到核心页",
    anchorGood: "面包屑全站覆盖、导航为可爬链接、内容互链成网、无孤岛页",
    anchorBad: "无面包屑、导航不可爬，核心页需靠外链才能进入",
  },
  {
    key: "arch_4",
    dimension: 2,
    name: "页面语义标签规范",
    keyPoints:
      "每页是否具备唯一 title 与 description、H1 唯一且 H2 层级清晰、canonical 主版本声明、图片 Alt、HTML5 语义标签（article/nav/main 等）",
    anchorGood: "title/description 逐页唯一，H1/H2 层级规范，canonical 与 Alt 完整",
    anchorBad: "核心页缺 H1 或 canonical，title/description 全站雷同或大面积缺失",
  },
  {
    key: "arch_5",
    dimension: 2,
    name: "页面主题唯一性与重复控制",
    keyPoints:
      "一页一主题：同一问题不散落在多个近似页面上，无薄页与空壳页，多入口同内容已用 canonical 归一——AI 需要判断哪一页是某个问题的权威答案页",
    anchorGood: "页面主题边界清晰、一题一页，无重复近似页",
    anchorBad: "大量重复近似页或空壳页，同一主题无法确定权威页",
  },
  // 维度三 官网内容生态（权重 30%）
  {
    key: "cont_1",
    dimension: 3,
    name: "决策问题覆盖度",
    keyPoints:
      "内容是否覆盖用户真实决策链条——怎么选、怎么比、多少钱、怎么用、适合谁；这些正是用户向 AI 提问的问题形态，官网有对应内容才可能被引用",
    anchorGood: "选型、对比、价格、使用、适用人群五类决策问题均有专门内容承接",
    anchorBad: "内容只讲品牌与产品卖点，不回答任何决策问题",
  },
  {
    key: "cont_2",
    dimension: 3,
    name: "内容时效与作者署名",
    keyPoints:
      "内容是否标注发布/更新日期与作者或责任部门——AI 判断新鲜度与权威归属的直接依据，无日期无作者的内容被引用概率偏低",
    anchorGood: "核心内容均有明确日期与作者署名，近期有持续更新",
    anchorBad: "内容无日期、无作者，无法判断时效与来源",
  },
  {
    key: "cont_3",
    dimension: 3,
    name: "内容原创性与信息增量",
    keyPoints:
      "内容是否为原创且提供他处没有的信息增量——自有经验、场景判断、选型建议、真实案例细节；而非同行复制、产品手册照搬、通稿拼凑。AI 倾向引用能补充新信息的来源",
    anchorGood: "核心内容原创，含自有经验/场景判断/案例细节，具备明显信息增量",
    anchorBad: "内容以转载、复制、通稿为主，无任何原创信息增量",
  },
  {
    key: "cont_4",
    dimension: 3,
    name: "内容可引用形态",
    keyPoints:
      "内容是否以 AI 可直接抽取的形态组织——问答式、清单式、参数表、结论先行的段落结构，而非通篇营销话术",
    anchorGood: "核心内容以问答/清单/参数表承载，结论先行、可直接抽取成答案",
    anchorBad: "内容为纯营销话术长文，AI 无法抽取出明确答案",
  },
  {
    key: "cont_5",
    dimension: 3,
    name: "白皮书与深度内容资产",
    keyPoints:
      "是否有白皮书、行业报告、技术文档、解决方案手册等成体系的深度内容，并以网页形式可读（HTML&PDF格式）——这类内容是 AI 在专业问题上优先引用的权威素材",
    anchorGood: "有白皮书/行业报告等深度资产，网页可直接读取、无需留资即可访问",
    anchorBad: "无任何深度内容资产，或仅有需留资下载的 PDF、正文机器不可读",
  },
  // 维度四 官网GEO可见度（权重 25%，由实测数据定档）
  {
    key: "vis_1",
    dimension: 4,
    name: "决策词官网被引用",
    keyPoints:
      "品类推荐类提问（如「XX 哪个牌子好」）中，官网是否被引用或呈现——正文给出官网地址，或引用来源列表包含官网页面",
    anchorGood: "三平台全部命中（每平台正文或来源含官网）",
    anchorBad: "三平台全部零引用——品牌可能被推荐，但正文与信源中均无官网",
  },
  {
    key: "vis_2",
    dimension: 4,
    name: "场景词官网被引用",
    keyPoints:
      "具体采购场景提问（如「网上买 XX 哪个平台靠谱」）中，官网是否被引用或呈现",
    anchorGood: "三平台全部命中",
    anchorBad: "三平台全部零引用",
  },
  {
    key: "vis_3",
    dimension: 4,
    name: "对比词官网被引用",
    keyPoints:
      "竞品对比类提问（如「XX 和 YY 哪个好」）中，官网是否被引用或呈现",
    anchorGood: "三平台全部命中，且引用口径与官网一致",
    anchorBad: "三平台全部零引用",
  },
];

export const INDICATOR_MAP: Record<string, IndicatorDef> = Object.fromEntries(
  INDICATORS.map((d) => [d.key, d]),
);

export const DIMENSION_INDICATOR_KEYS: Record<DimensionKey, string[]> = {
  1: ["tech_1", "tech_2", "tech_3", "tech_4", "tech_5"],
  2: ["arch_1", "arch_2", "arch_3", "arch_4", "arch_5"],
  3: ["cont_1", "cont_2", "cont_3", "cont_4", "cont_5"],
  4: ["vis_1", "vis_2", "vis_3"],
};

export interface DimensionScores {
  tech: number;
  arch: number;
  content: number;
  vis: number;
}

/** 维度分：维度一/二/三 = 5 子项求和（0–100）；维度四 = round((3 子项和 ÷ 60) × 100, 1) */
export function computeDimensionScore(
  scores: Record<string, number>,
): DimensionScores {
  const sum = (keys: string[]) =>
    keys.reduce((acc, k) => acc + (scores[k] ?? 0), 0);
  const vis3 = sum(DIMENSION_INDICATOR_KEYS[4]);
  return {
    tech: sum(DIMENSION_INDICATOR_KEYS[1]),
    arch: sum(DIMENSION_INDICATOR_KEYS[2]),
    content: sum(DIMENSION_INDICATOR_KEYS[3]),
    vis: Math.round((vis3 / 60) * 1000) / 10,
  };
}

/** 综合健康度 = 技术×0.25 + 页面×0.20 + 内容×0.30 + 可见度×0.25，保留 1 位小数 */
export function computeComposite(dims: DimensionScores): number {
  const v =
    dims.tech * DIMENSION_WEIGHTS.tech +
    dims.arch * DIMENSION_WEIGHTS.arch +
    dims.content * DIMENSION_WEIGHTS.content +
    dims.vis * DIMENSION_WEIGHTS.vis;
  return Math.round(v * 10) / 10;
}

/** 等级：A ≥80 / B 65–79.9 / C 45–64.9 / D <45 */
export function computeGrade(composite: number): Grade {
  if (composite >= 80) return "A";
  if (composite >= 65) return "B";
  if (composite >= 45) return "C";
  return "D";
}

/** 维度四单项定档：某词类在三平台命中平台数 3→20、2→15、1→10、0→0 */
export function visLevelFromHits(hits: number): IndicatorScore {
  if (hits >= 3) return 20;
  if (hits === 2) return 15;
  if (hits === 1) return 10;
  return 0;
}

/** 校验一组子分是否全部落在四档内，返回非法项 */
export function validateScores(
  scores: { indicatorKey: string; score: number }[],
): { ok: boolean; invalid: string[] } {
  const invalid = scores
    .filter((s) => !isAllowedScore(s.score))
    .map((s) => s.indicatorKey);
  return { ok: invalid.length === 0, invalid };
}
