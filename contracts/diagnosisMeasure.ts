/**
 * 诊断维度四 · 人工实测录入契约（前后端共享）
 * 依据 DIAGNOSIS_ACCEPTANCE_v1 §B/F + zcode ai-platform-test：
 * - 仅决策词 / 场景词 / 对比词；不测品牌词（不测不写不留档）
 * - 默认路径：DeepGEO 查完后 applyVisGrid；本契约为失败时人工录入兜底（saveVisManual）
 * - 定档：命中平台数 3/2/1/0 → 20/15/10/0
 */

import { z } from "zod";
import {
  PLATFORMS,
  VIS_WORD_TYPES,
  VIS_WORD_TYPE_HINTS,
  VIS_WORD_TYPE_LABELS,
  type KeywordCategory,
  type Platform,
  type VisWordType,
} from "./kpi";
import { visLevelFromHits, type IndicatorScore } from "./scoring";

/** 维度四指标 → 词池 category 存储 key（brand 存的是「对比词」，不是品牌知名度提问） */
export const VIS_INDICATOR_CATEGORY = {
  vis_1: "generic",
  vis_2: "scenario",
  vis_3: "brand",
} as const satisfies Record<string, KeywordCategory>;

export const VIS_WORD_TO_INDICATOR: Record<VisWordType, keyof typeof VIS_INDICATOR_CATEGORY> = {
  decision: "vis_1",
  scenario: "vis_2",
  compare: "vis_3",
};

export const VIS_WORD_TO_CATEGORY: Record<VisWordType, KeywordCategory> = {
  decision: "generic",
  scenario: "scenario",
  compare: "brand",
};

/** 九格列顺序：决策 → 场景 → 对比（禁止插入品牌词列） */
export const NINE_GRID_COLUMNS: VisWordType[] = ["decision", "scenario", "compare"];

export const NINE_GRID_COLUMN_LABELS = NINE_GRID_COLUMNS.map(
  (t) => `${VIS_WORD_TYPE_LABELS[t]}（${VIS_WORD_TYPE_HINTS[t]}）`,
);

/**
 * 单格人工实测录入：一次「平台 × 词类」真问结果。
 * officialSiteCited=true → 计 L2（官网地址/链接出现）；仅品牌提及 → false + brandMentionOnly。
 */
export const manualVisCellInput = z.object({
  wordType: z.enum(VIS_WORD_TYPES),
  platform: z.enum(PLATFORMS),
  /** 提问原文 */
  promptText: z.string().min(1).max(500),
  /** 回答摘要 / 摘录（可空，建议留） */
  answerExcerpt: z.string().max(4000).optional().nullable(),
  /** 来源列表中的 URL（可空） */
  sourceUrls: z.array(z.string().max(1024)).max(20).default([]),
  /** 官网是否被引用或呈现（正文地址或来源含官网页） */
  officialSiteCited: z.boolean(),
  /** 仅品牌提及、官网未出现（不计维度四命中，可单列观察） */
  brandMentionOnly: z.boolean().default(false),
  /** 证据备注 */
  evidenceNote: z.string().max(1000).optional().nullable(),
});

export type ManualVisCellInput = z.infer<typeof manualVisCellInput>;

/** 一次提交：某诊断单下若干格（通常 9 格：3 词类 × 3 平台） */
export const manualVisBatchInput = z.object({
  diagnosticId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  /** 实测归属日（存储可到日；对外展示一律到月） */
  measureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cells: z.array(manualVisCellInput).min(1).max(27),
});

export type ManualVisBatchInput = z.infer<typeof manualVisBatchInput>;

export type VisCellKey = `${VisWordType}:${Platform}`;

export function visCellKey(wordType: VisWordType, platform: Platform): VisCellKey {
  return `${wordType}:${platform}`;
}

/** 按词类统计命中平台数 → 维度四单项分 */
export function scoreVisFromCells(
  cells: ManualVisCellInput[],
): Record<keyof typeof VIS_INDICATOR_CATEGORY, { score: IndicatorScore; hits: number; evidence: string }> {
  const out = {} as Record<
    keyof typeof VIS_INDICATOR_CATEGORY,
    { score: IndicatorScore; hits: number; evidence: string }
  >;
  for (const wordType of VIS_WORD_TYPES) {
    const indicator = VIS_WORD_TO_INDICATOR[wordType];
    const hitPlatforms = new Set(
      cells
        .filter((c) => c.wordType === wordType && c.officialSiteCited)
        .map((c) => c.platform),
    );
    const hits = hitPlatforms.size;
    const score = visLevelFromHits(hits);
    const label = VIS_WORD_TYPE_LABELS[wordType];
    out[indicator] = {
      score,
      hits,
      evidence:
        hits === 0
          ? `${label}：三平台均无官网引用（人工实测）`
          : `${label}：命中 ${hits}/3 平台（${[...hitPlatforms].join("、")}）`,
    };
  }
  return out;
}

/** 对外日期：仅到月，如「2026 年 9 月」 */
export function formatMonthOnly(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[1]} 年 ${Number(m[2])} 月`;
}

/** 本轮明确跳过：三平台浏览器自动提问（S1） */
export const SKIP_AUTO_PLATFORM_PROBE = {
  id: "S1",
  reason: "需老板平台账号/浏览器会话",
  fallback: "DeepGEO 失败时人工实测录入（saveVisManual）",
} as const;
