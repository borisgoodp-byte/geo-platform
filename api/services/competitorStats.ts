/**
 * 竞对监测对标聚合统计（competitorsRouter / reportsRouter 共用）
 * 口径：与我方看板一致——可拓词（isExtended）默认排除（includeExtended=false）；
 * 命中率 hitRate = L2 ÷ 该品牌已录入格数；SOV share = 该品牌 L2 ÷ 全部品牌 L2 合计。
 * 铁律：竞对数据不参与我方 KPI 计算，本文件只做对比分析。
 */

import { and, count, eq, gte, inArray, lte, max, type SQL } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { competitorHits, competitors, keywords, projects } from "@db/schema";
import {
  calcCitationRate,
  type KeywordCategory,
  type Platform,
} from "@contracts/kpi";
import { queryMeasurements, type MeasurementRow } from "./measurementStats";

/** 统计接口统一过滤参数（与 measurements.stats 语义一致，platforms/categories 为多选） */
export interface CompeteFilters {
  projectId: number;
  from?: string; // YYYY-MM-DD 闭区间起
  to?: string; // YYYY-MM-DD 闭区间止
  platforms?: Platform[];
  categories?: KeywordCategory[];
  includeExtended?: boolean; // 默认 false：可拓词仅观察，默认排除
}

/** 竞对命中记录（联表关键词后的行） */
export interface HitRow {
  id: number;
  projectId: number;
  keywordId: number;
  competitorId: number;
  platform: Platform;
  date: string;
  level: "L2" | "L1" | "L0";
  url: string | null;
  keywordText: string;
  category: KeywordCategory;
  isExtended: boolean;
}

/** 拉取竞对命中记录（联表关键词），按筛选条件过滤 */
export async function queryCompetitorHits(
  filters: CompeteFilters & { competitorId?: number },
): Promise<HitRow[]> {
  const conds: SQL[] = [eq(competitorHits.projectId, filters.projectId)];
  if (filters.from) conds.push(gte(competitorHits.date, filters.from));
  if (filters.to) conds.push(lte(competitorHits.date, filters.to));
  if (filters.platforms?.length)
    conds.push(inArray(competitorHits.platform, filters.platforms));
  if (filters.competitorId)
    conds.push(eq(competitorHits.competitorId, filters.competitorId));
  if (filters.categories?.length)
    conds.push(inArray(keywords.category, filters.categories));

  const rows = await getDb()
    .select({
      id: competitorHits.id,
      projectId: competitorHits.projectId,
      keywordId: competitorHits.keywordId,
      competitorId: competitorHits.competitorId,
      platform: competitorHits.platform,
      date: competitorHits.date,
      level: competitorHits.level,
      url: competitorHits.url,
      keywordText: keywords.text,
      category: keywords.category,
      isExtended: keywords.isExtended,
    })
    .from(competitorHits)
    .innerJoin(keywords, eq(competitorHits.keywordId, keywords.id))
    .where(and(...conds))
    .orderBy(competitorHits.date);
  // 可拓词默认排除（与我方看板口径一致）
  return filters.includeExtended ? rows : rows.filter((r) => !r.isExtended);
}

/** 拉取我方实测记录并套用同一套过滤语义（复用 measurementStats 的联表查询） */
async function queryOwnRows(filters: CompeteFilters): Promise<MeasurementRow[]> {
  const rows = await queryMeasurements({
    projectId: filters.projectId,
    from: filters.from,
    to: filters.to,
  });
  return rows.filter(
    (r) =>
      (filters.includeExtended || !r.isExtended) &&
      (!filters.platforms?.length || filters.platforms.includes(r.platform)) &&
      (!filters.categories?.length || filters.categories.includes(r.category)),
  );
}

/** 项目竞对清单 + 每个竞对的记录数 / 最近记录日 */
export async function listCompetitors(projectId: number) {
  const db = getDb();
  const comps = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, projectId))
    .orderBy(competitors.id);
  const aggs = await db
    .select({
      competitorId: competitorHits.competitorId,
      recordCount: count(),
      lastDate: max(competitorHits.date),
    })
    .from(competitorHits)
    .where(eq(competitorHits.projectId, projectId))
    .groupBy(competitorHits.competitorId);
  const byComp = new Map(aggs.map((a) => [a.competitorId, a]));
  return comps.map((c) => ({
    ...c,
    recordCount: Number(byComp.get(c.id)?.recordCount ?? 0),
    lastDate: byComp.get(c.id)?.lastDate ?? null,
  }));
}

/** SOV 声量份额行：brandKey 我方为 "own"，竞对为其 competitor id */
export interface SovEntry {
  brandKey: "own" | number;
  name: string;
  l2: number;
  l1: number;
  cells: number;
  hitRate: number;
  share: number;
}

function levelCounts(rows: { level: "L2" | "L1" | "L0" }[]) {
  return {
    l2: rows.filter((r) => r.level === "L2").length,
    l1: rows.filter((r) => r.level === "L1").length,
    l0: rows.filter((r) => r.level === "L0").length,
  };
}

/** 声量份额：我方 + 各竞对的 L2/L1/命中率/SOV 份额 */
export async function computeSov(filters: CompeteFilters): Promise<SovEntry[]> {
  const db = getDb();
  const [ownRows, hits, comps, proj] = await Promise.all([
    queryOwnRows(filters),
    queryCompetitorHits(filters),
    db
      .select()
      .from(competitors)
      .where(eq(competitors.projectId, filters.projectId))
      .orderBy(competitors.id),
    db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, filters.projectId))
      .limit(1),
  ]);

  const own = levelCounts(ownRows);
  const entries: SovEntry[] = [
    {
      brandKey: "own",
      name: proj[0]?.name ?? "我方官网",
      l2: own.l2,
      l1: own.l1,
      cells: ownRows.length,
      hitRate: calcCitationRate(ownRows.length, own.l2),
      share: 0,
    },
  ];
  for (const c of comps) {
    const rs = hits.filter((h) => h.competitorId === c.id);
    const { l2, l1 } = levelCounts(rs);
    entries.push({
      brandKey: c.id,
      name: c.name,
      l2,
      l1,
      cells: rs.length,
      hitRate: calcCitationRate(rs.length, l2),
      share: 0,
    });
  }
  const totalL2 = entries.reduce((s, e) => s + e.l2, 0);
  for (const e of entries) {
    e.share = totalL2 > 0 ? Math.round((e.l2 / totalL2) * 1000) / 10 : 0;
  }
  return entries;
}

/** 逐日对比：rate = 当日该品牌 L2 ÷ 当日该品牌已录格数（当日无记录为 null） */
export async function computeTrend(filters: CompeteFilters) {
  const db = getDb();
  const [ownRows, hits, comps] = await Promise.all([
    queryOwnRows(filters),
    queryCompetitorHits(filters),
    db
      .select()
      .from(competitors)
      .where(eq(competitors.projectId, filters.projectId))
      .orderBy(competitors.id),
  ]);
  const dayRate = (rows: { level: string }[]): number | null => {
    if (rows.length === 0) return null;
    return calcCitationRate(
      rows.length,
      rows.filter((r) => r.level === "L2").length,
    );
  };
  const dates = [
    ...new Set([
      ...ownRows.map((r) => r.measureDate),
      ...hits.map((h) => h.date),
    ]),
  ].sort();
  return dates.map((date) => ({
    date,
    own: dayRate(ownRows.filter((r) => r.measureDate === date)),
    competitors: comps.map((c) => ({
      competitorId: c.id,
      rate: dayRate(hits.filter((h) => h.competitorId === c.id && h.date === date)),
    })),
  }));
}

/** 头对头逐词对比行 */
export interface HeadToHeadRow {
  keywordId: number;
  text: string;
  category: KeywordCategory;
  own: { l2: number; l1: number; l0: number; rate: number | null };
  rivals: {
    competitorId: number;
    l2: number;
    l1: number;
    l0: number;
    rate: number | null;
  }[];
}

/** 逐词头对头：该词区间内每个品牌的 l2/l1/l0 计数与 rate（rate = L2 ÷ 已录格数，无记录为 null） */
export async function computeHeadToHead(
  filters: CompeteFilters,
): Promise<HeadToHeadRow[]> {
  const db = getDb();
  const [ownRows, hits, comps] = await Promise.all([
    queryOwnRows(filters),
    queryCompetitorHits(filters),
    db
      .select()
      .from(competitors)
      .where(eq(competitors.projectId, filters.projectId))
      .orderBy(competitors.id),
  ]);

  const agg = (rows: { level: "L2" | "L1" | "L0" }[]) => {
    const { l2, l1, l0 } = levelCounts(rows);
    return {
      l2,
      l1,
      l0,
      rate: rows.length > 0 ? calcCitationRate(rows.length, l2) : null,
    };
  };

  // 词集合 = 我方与竞对记录的并集（词文本/词类取自联表字段）
  const kwMeta = new Map<number, { text: string; category: KeywordCategory }>();
  for (const r of ownRows) kwMeta.set(r.keywordId, { text: r.keywordText, category: r.category });
  for (const h of hits) kwMeta.set(h.keywordId, { text: h.keywordText, category: h.category });

  return [...kwMeta.entries()]
    .sort(([a], [b]) => a - b)
    .map(([keywordId, meta]) => ({
      keywordId,
      text: meta.text,
      category: meta.category,
      own: agg(ownRows.filter((r) => r.keywordId === keywordId)),
      rivals: comps.map((c) => ({
        competitorId: c.id,
        ...agg(hits.filter((h) => h.keywordId === keywordId && h.competitorId === c.id)),
      })),
    }));
}

/** 该竞对 L2 被引页面 TOP（share = 占该竞对全部 L2 的比例），按 count 降序取前 20 */
export async function computeTopPages(
  filters: CompeteFilters & { competitorId: number },
) {
  const hits = await queryCompetitorHits(filters);
  const l2Rows = hits.filter((h) => h.level === "L2" && h.url);
  const byUrl = new Map<string, number>();
  for (const h of l2Rows) {
    byUrl.set(h.url!, (byUrl.get(h.url!) ?? 0) + 1);
  }
  return [...byUrl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([url, cnt]) => ({
      url,
      count: cnt,
      share: l2Rows.length > 0 ? Math.round((cnt / l2Rows.length) * 1000) / 10 : 0,
    }));
}
