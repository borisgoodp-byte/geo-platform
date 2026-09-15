/**
 * 维度四 · DeepGEO 自动查可见度契约（前后端共享）
 * 依据 DEEPGEO_VIS_AUTO_v1.md：从项目推词 → DeepGEO 查三平台 → 回填九格。
 * 本轮：服务端负责推词 + 九格落库定档；DeepGEO 浏览器会话由前端/媒介已登录态驱动，
 * 服务端 runDeepgeoAuto 可用 DEEPGEO_USER/PASS 真查；失败回退 saveVisManual。
 */

import { z } from "zod";
import { PLATFORMS, VIS_WORD_TYPES, type Platform, type VisWordType } from "./kpi";
import { NINE_GRID_COLUMNS, VIS_WORD_TO_CATEGORY } from "./diagnosisMeasure";

export { NINE_GRID_COLUMNS, VIS_WORD_TO_CATEGORY };

/** 系统推词结果（默认不问老板；高级可改后再跑） */
export const suggestedVisWordsSchema = z.object({
  decision: z.string().min(1),
  scenario: z.string().min(1),
  compare: z.string().min(1),
  source: z.enum(["pool", "generated"]),
  /** 本品官网域名，判定「官网是否被引用」时用 */
  siteDomain: z.string().min(1),
});

export type SuggestedVisWords = z.infer<typeof suggestedVisWordsSchema>;

/** DeepGEO 查完后回传的一格 */
export const deepgeoGridCellSchema = z.object({
  wordType: z.enum(VIS_WORD_TYPES),
  platform: z.enum(PLATFORMS),
  promptText: z.string().min(1).max(500),
  officialSiteCited: z.boolean(),
  brandMentionOnly: z.boolean().default(false),
  answerExcerpt: z.string().max(4000).optional().nullable(),
  sourceUrls: z.array(z.string().max(1024)).max(20).default([]),
  evidenceNote: z.string().max(1000).optional().nullable(),
});

/** 九格回填（通常 9 格；允许部分失败格暂不传，未传视为未查/未命中由调用方决定） */
export const applyVisGridInput = z.object({
  diagnosticId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  measureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  words: suggestedVisWordsSchema.pick({
    decision: true,
    scenario: true,
    compare: true,
  }),
  cells: z.array(deepgeoGridCellSchema).min(1).max(27),
  /** 来源标记：真查 deepgeo；韩后样例短路 demo_auto */
  provider: z.enum(["deepgeo", "demo_auto"]).default("deepgeo"),
});

export type ApplyVisGridInput = z.infer<typeof applyVisGridInput>;

export function emptyNineGridTemplate(
  words: { decision: string; scenario: string; compare: string },
): Array<{ wordType: VisWordType; platform: Platform; promptText: string }> {
  const promptByType: Record<VisWordType, string> = {
    decision: words.decision,
    scenario: words.scenario,
    compare: words.compare,
  };
  const out: Array<{ wordType: VisWordType; platform: Platform; promptText: string }> = [];
  for (const wordType of NINE_GRID_COLUMNS) {
    for (const platform of PLATFORMS) {
      out.push({ wordType, platform, promptText: promptByType[wordType] });
    }
  }
  return out;
}

/** 韩后项目预填三问（可配置常量；不测品牌词） */
export const HANHOO_DEFAULT_VIS_PROMPTS = {
  decision: "护肤品哪个牌子好？推荐几个品牌",
  scenario: "网上买护肤品哪个平台靠谱？",
  compare: "韩后和百雀羚哪个好？",
} as const;

/** 韩后 DeepGEO 九格样例：三平台全 miss，官网未引用；无法可靠区分仅品牌 */
export const HANHOO_DEEPGEO_SAMPLE_SITE_DOMAIN = "hanhoo.com";

const HANHOO_SAMPLE_EVIDENCE: Record<VisWordType, string> = {
  decision: "合并结果来源含知乎/快消品网/时尚COSMO/今日头条/科印网等，无 hanhoo.com",
  scenario: "知乎/官方知识库/沈阳市监局/Kinghonor/香港01等，无 hanhoo.com",
  compare: "淘江湖/百度百科/Suning/新华网/京东/网易/简书等，无 hanhoo.com",
};

/**
 * 媒介运营组给出的韩后 DeepGEO 九格全 miss 样例。
 * 给定三问词面，返回 9 格 deepgeoGridCellSchema 形（三平台同档）。
 */
export function HANHOO_DEEPGEO_SAMPLE_CELLS(words: {
  decision: string;
  scenario: string;
  compare: string;
}): Array<{
  wordType: VisWordType;
  platform: Platform;
  promptText: string;
  officialSiteCited: false;
  brandMentionOnly: false;
  evidenceNote: string;
  sourceUrls: [];
}> {
  const promptByType: Record<VisWordType, string> = {
    decision: words.decision,
    scenario: words.scenario,
    compare: words.compare,
  };
  const out: Array<{
    wordType: VisWordType;
    platform: Platform;
    promptText: string;
    officialSiteCited: false;
    brandMentionOnly: false;
    evidenceNote: string;
    sourceUrls: [];
  }> = [];
  for (const wordType of NINE_GRID_COLUMNS) {
    for (const platform of PLATFORMS) {
      out.push({
        wordType,
        platform,
        promptText: promptByType[wordType],
        officialSiteCited: false,
        brandMentionOnly: false,
        evidenceNote: HANHOO_SAMPLE_EVIDENCE[wordType],
        sourceUrls: [],
      });
    }
  }
  return out;
}

/** UI / 产品文案平台顺序：豆包 → DeepSeek → 通义千问 */
export const DEEPGEO_PLATFORM_ORDER = ["doubao", "deepseek", "qwen"] as const satisfies readonly Platform[];

/** DeepGEO 收录查询页（须已登录） */
export const DEEPGEO_INCLUSION_URL = "https://www.deepgeo.org.cn/inclusionQuery.html";

/**
 * 自动查适配：服务端 diagnostics.runDeepgeoVis / runDeepgeoAuto。
 * 成功直接 applyVisGrid；失败才露出人工九格。
 */
export const DEEPGEO_ADAPTER = {
  id: "deepgeo",
  status: "server_auto" as const,
  entry: DEEPGEO_INCLUSION_URL,
  note: "调用 diagnostics.runDeepgeoVis；韩后无代理可 demo_auto 样例短路；失败回退 saveVisManual",
} as const;

export function isHanhooProject(opts: { name?: string | null; domain?: string | null }): boolean {
  const name = (opts.name ?? "").toLowerCase();
  const domain = (opts.domain ?? "").toLowerCase();
  return name.includes("韩后") || name.includes("hanhoo") || domain.includes("hanhoo");
}

/** 从项目/词池推三类词；韩后走预填，否则生成草稿（不问老板） */
export function resolveDefaultVisPrompts(opts: {
  projectName?: string | null;
  domain?: string | null;
  pool?: Partial<Record<VisWordType, string>> | null;
}): {
  decision: string;
  scenario: string;
  compare: string;
  source: "pool" | "hanhou_default" | "generated";
  siteDomain: string;
} {
  const siteDomain = (opts.domain ?? "").replace(/^www\./, "") || "example.com";
  if (opts.pool?.decision && opts.pool?.scenario && opts.pool?.compare) {
    return {
      decision: opts.pool.decision,
      scenario: opts.pool.scenario,
      compare: opts.pool.compare,
      source: "pool",
      siteDomain,
    };
  }
  if (isHanhooProject(opts)) {
    return { ...HANHOO_DEFAULT_VIS_PROMPTS, source: "hanhou_default", siteDomain: siteDomain || "hanhoo.com" };
  }
  const brand = (opts.projectName ?? "本品牌").replace(/\s+/g, "").slice(0, 20) || "本品牌";
  return {
    decision: `${brand}所在品类哪个牌子好？推荐几个品牌`,
    scenario: `网上买${brand}相关产品哪个平台靠谱？`,
    compare: `${brand}和同行竞品哪个好？`,
    source: "generated",
    siteDomain,
  };
}
