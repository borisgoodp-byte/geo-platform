import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  aggregateByPlatform,
  aggregateDaily,
  computeKpiCards,
  getProjectTier,
  queryMeasurements,
  type MeasurementRow,
} from "./services/measurementStats";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  calcCitationRate,
} from "@contracts/kpi";
import {
  computeHeadToHead,
  computeSov,
  computeTopPages,
  listCompetitors,
} from "./services/competitorStats";

type PeriodType = "week" | "month" | "quarter";

function periodRange(type: PeriodType, refDate: string): { from: string; to: string } {
  const d = new Date(`${refDate}T00:00:00Z`);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  if (type === "week") {
    const end = new Date(d);
    const start = new Date(d);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: fmt(start), to: fmt(end) };
  }
  if (type === "month") {
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { from: fmt(start), to: fmt(end) };
  }
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0));
  return { from: fmt(start), to: fmt(end) };
}

function shiftRange(from: string, to: string): { from: string; to: string } {
  const days =
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000 +
    1;
  const prevTo = new Date(`${from}T00:00:00Z`);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
}

function keywordDetails(rows: MeasurementRow[]) {
  const kpiRows = rows.filter((r) => !r.isExtended && r.keywordStatus === "active");
  const map = new Map<number, MeasurementRow[]>();
  for (const r of kpiRows) {
    const arr = map.get(r.keywordId) ?? [];
    arr.push(r);
    map.set(r.keywordId, arr);
  }
  return [...map.entries()].map(([keywordId, rs]) => {
    const l2 = rs.filter((r) => r.level === "L2").length;
    const last = [...rs].sort((a, b) => (a.measureDate < b.measureDate ? 1 : -1))[0]!;
    return {
      keywordId,
      text: last.keywordText,
      category: last.category,
      total: rs.length,
      l2,
      l1: rs.filter((r) => r.level === "L1").length,
      rate: calcCitationRate(rs.length, l2),
      lastLevel: last.level,
    };
  });
}

export const reportsRouter = createRouter({
  /**
   * 周期报告：KPI 达成、环比、趋势数组、词级明细、空白词清单、建议。
   * type: week（近 7 天）/ month（自然月）/ quarter（自然季），refDate 为期内任一日。
   */
  period: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        type: z.enum(["week", "month", "quarter"]),
        refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ input }) => {
      const range = periodRange(input.type, input.refDate);
      const prevRange = shiftRange(range.from, range.to);
      const [rows, prevRows, tier] = await Promise.all([
        queryMeasurements({ projectId: input.projectId, ...range }),
        queryMeasurements({ projectId: input.projectId, ...prevRange }),
        getProjectTier(input.projectId),
      ]);
      const [cards, prevCards] = await Promise.all([
        computeKpiCards(rows, tier, range),
        computeKpiCards(prevRows, tier, prevRange),
      ]);

      const details = keywordDetails(rows);
      const blankKeywords = details
        .filter((k) => k.l2 === 0)
        .map((k) => ({
          keywordId: k.keywordId,
          text: k.text,
          category: k.category,
          total: k.total,
        }));

      const byPlatform = aggregateByPlatform(rows);
      const weakest = [...byPlatform].sort((a, b) => a.rate - b.rate)[0];
      const strongest = [...byPlatform].sort((a, b) => b.rate - a.rate)[0];

      const suggestions: string[] = [];
      if (blankKeywords.length > 0) {
        const byCat = new Map<string, number>();
        for (const b of blankKeywords) {
          byCat.set(b.category, (byCat.get(b.category) ?? 0) + 1);
        }
        const catText = [...byCat.entries()]
          .map(([c, n]) => `${CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]} ${n} 词`)
          .join("、");
        suggestions.push(
          `本期 ${blankKeywords.length} 个词零引用（${catText}），建议下周期定向补位内容：${blankKeywords
            .slice(0, 5)
            .map((b) => `「${b.text}」`)
            .join("、")}${blankKeywords.length > 5 ? " 等" : ""}。`,
        );
      }
      if (weakest && strongest && weakest.rate < strongest.rate) {
        suggestions.push(
          `${PLATFORM_LABELS[weakest.platform]}引用率 ${weakest.rate}% 低于 ${PLATFORM_LABELS[strongest.platform]} ${strongest.rate}%，优先补齐该平台短板词类内容。`,
        );
      }
      if (cards.citationRate < cards.kpiTarget) {
        suggestions.push(
          `当前引用呈现率 ${cards.citationRate}% 低于考核目标 ${cards.kpiTarget}%（验收线 ${Math.round(cards.kpiTarget * 0.8)}%），建议加快 FAQ 与深度内容产出节奏。`,
        );
      } else {
        suggestions.push(`当前引用呈现率 ${cards.citationRate}% 已达考核目标 ${cards.kpiTarget}%，保持现有内容产出与监测节奏。`);
      }

      // ============ 竞对对比章节（无竞对数据时为 null，前端不渲染） ============
      const comps = await listCompetitors(input.projectId);
      let compete: {
        sov: Awaited<ReturnType<typeof computeSov>>;
        losingWords: {
          text: string;
          category: string;
          ownRate: number;
          rivalName: string;
          rivalRate: number;
        }[];
        rivalTopPages: { competitorName: string; url: string; count: number }[];
      } | null = null;
      if (comps.some((c) => c.recordCount > 0)) {
        const competeFilters = { projectId: input.projectId, ...range };
        const [sov, h2h] = await Promise.all([
          computeSov(competeFilters),
          computeHeadToHead(competeFilters),
        ]);
        // 竞对占优词：任一竞对 rate > 我方 rate，按 (rivalRate-ownRate) 降序取前 10
        const losing: {
          text: string;
          category: string;
          ownRate: number;
          rivalName: string;
          rivalRate: number;
          gap: number;
        }[] = [];
        for (const row of h2h) {
          if (row.own.rate === null) continue;
          for (const rival of row.rivals) {
            if (rival.rate !== null && rival.rate > row.own.rate) {
              losing.push({
                text: row.text,
                category: row.category,
                ownRate: row.own.rate,
                rivalName:
                  comps.find((c) => c.id === rival.competitorId)?.name ?? "",
                rivalRate: rival.rate,
                gap: rival.rate - row.own.rate,
              });
            }
          }
        }
        losing.sort((a, b) => b.gap - a.gap);
        // 全部竞对被引页面合并取前 10
        const perCompPages = await Promise.all(
          comps.map(async (c) =>
            (await computeTopPages({ ...competeFilters, competitorId: c.id })).map(
              (p) => ({ competitorName: c.name, url: p.url, count: p.count }),
            ),
          ),
        );
        compete = {
          sov,
          losingWords: losing.slice(0, 10).map(({ gap: _gap, ...rest }) => rest),
          rivalTopPages: perCompPages
            .flat()
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        };
      }

      return {
        period: { type: input.type, ...range },
        prevPeriod: prevRange,
        compete,
        kpi: {
          ...cards,
          prevRate: prevCards.citationRate,
          delta: Math.round((cards.citationRate - prevCards.citationRate) * 10) / 10,
        },
        trend: aggregateDaily(rows),
        byPlatform,
        keywordDetails: details,
        blankKeywords,
        suggestions,
      };
    }),
});
