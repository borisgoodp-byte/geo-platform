/**
 * 实测记录聚合统计（measurements.stats / reports.period / projects.get 共用）
 * 口径：可拓词（isExtended）默认不计 KPI 分母；仅 L2 计引用。
 */

import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { keywords, keywordPools, measurements, projects } from "@db/schema";
import {
  calcCitationRate,
  calcCoverageRate,
  judgeCheckpoint,
  judgeTierKpi,
  CHECKPOINTS,
  TIER_KPI_TARGETS,
  type KpiStatus,
  type Platform,
  type ServiceTier,
} from "@contracts/kpi";

export interface StatsFilters {
  projectId: number;
  from?: string;
  to?: string;
  platform?: Platform;
}

export interface MeasurementRow {
  id: number;
  projectId: number;
  poolId: number;
  keywordId: number;
  measureDate: string;
  platform: Platform;
  level: "L2" | "L1" | "L0";
  citedUrl: string | null;
  citedUrlNorm: string | null;
  citedPageTitle: string | null;
  snapshot: string | null;
  isCheckpoint: boolean;
  checkpointTag: "m6" | "m12" | null;
  keywordText: string;
  category: "brand" | "generic" | "scenario";
  isExtended: boolean;
  keywordStatus: "active" | "removed";
}

/** 拉取实测记录（联表关键词），按筛选条件过滤 */
export async function queryMeasurements(
  filters: StatsFilters & {
    category?: "brand" | "generic" | "scenario";
    level?: "L2" | "L1" | "L0";
    keywordId?: number;
  },
): Promise<MeasurementRow[]> {
  const conds: SQL[] = [eq(measurements.projectId, filters.projectId)];
  if (filters.from) conds.push(gte(measurements.measureDate, filters.from));
  if (filters.to) conds.push(lte(measurements.measureDate, filters.to));
  if (filters.platform) conds.push(eq(measurements.platform, filters.platform));
  if (filters.keywordId) conds.push(eq(measurements.keywordId, filters.keywordId));
  if (filters.level) conds.push(eq(measurements.level, filters.level));
  if (filters.category) conds.push(eq(keywords.category, filters.category));

  const rows = await getDb()
    .select({
      id: measurements.id,
      projectId: measurements.projectId,
      poolId: measurements.poolId,
      keywordId: measurements.keywordId,
      measureDate: measurements.measureDate,
      platform: measurements.platform,
      level: measurements.level,
      citedUrl: measurements.citedUrl,
      citedUrlNorm: measurements.citedUrlNorm,
      citedPageTitle: measurements.citedPageTitle,
      snapshot: measurements.snapshot,
      isCheckpoint: measurements.isCheckpoint,
      checkpointTag: measurements.checkpointTag,
      keywordText: keywords.text,
      category: keywords.category,
      isExtended: keywords.isExtended,
      keywordStatus: keywords.status,
    })
    .from(measurements)
    .innerJoin(keywords, eq(measurements.keywordId, keywords.id))
    .where(and(...conds))
    .orderBy(measurements.measureDate);
  return rows;
}

/** KPI 卡五项 */
export interface KpiCards {
  citationRate: number;
  citedPages: number;
  citedTotal: number;
  coverageRate: number;
  hitWords: number;
  activeWords: number;
  kpiStatus: KpiStatus;
  kpiTarget: number;
  total: number;
  l2: number;
  l1: number;
}

function groupAgg(rows: MeasurementRow[]) {
  const total = rows.length;
  const l2 = rows.filter((r) => r.level === "L2").length;
  const l1 = rows.filter((r) => r.level === "L1").length;
  return { total, l2, l1, rate: calcCitationRate(total, l2) };
}

export async function computeKpiCards(
  rows: MeasurementRow[],
  tier: ServiceTier,
  opts?: { from?: string; to?: string },
): Promise<KpiCards> {
  const kpiRows = rows.filter((r) => !r.isExtended);
  const { total, l2, l1, rate } = groupAgg(kpiRows);
  const citedPages = new Set(
    kpiRows.filter((r) => r.level === "L2" && r.citedUrlNorm).map((r) => r.citedUrlNorm!),
  ).size;
  const hitWordIds = new Set(kpiRows.filter((r) => r.level === "L2").map((r) => r.keywordId));

  // 词池生效词数：项目最新词池中 active 且非可拓的词
  const db = getDb();
  const [pool] = await db
    .select()
    .from(keywordPools)
    .where(eq(keywordPools.projectId, rows[0]?.projectId ?? 0))
    .orderBy(desc(keywordPools.id))
    .limit(1);
  let activeWords = 0;
  if (pool) {
    const poolWords = await db
      .select()
      .from(keywords)
      .where(eq(keywords.poolId, pool.id));
    activeWords = poolWords.filter((w) => w.status === "active" && !w.isExtended).length;
  }

  // KPI 达成状态：范围内有考核节点记录 → 以最近节点当日实测率判定；否则以整体引用率对照服务档目标
  let kpiStatus: KpiStatus = total === 0 ? "pending" : judgeTierKpi(rate, tier);
  let kpiTarget: number = TIER_KPI_TARGETS[tier];
  const checkpoints = kpiRows.filter((r) => r.isCheckpoint && r.checkpointTag);
  if (checkpoints.length > 0) {
    const latest = checkpoints.sort((a, b) =>
      a.measureDate < b.measureDate ? 1 : -1,
    )[0]!;
    const dayRows = kpiRows.filter(
      (r) => r.measureDate === latest.measureDate && r.checkpointTag === latest.checkpointTag,
    );
    const dayAgg = groupAgg(dayRows);
    const cp = CHECKPOINTS[latest.checkpointTag!];
    kpiTarget = cp.target;
    kpiStatus = judgeCheckpoint(dayAgg.rate, cp.target);
  }
  void opts;
  return {
    citationRate: rate,
    citedPages,
    citedTotal: l2,
    coverageRate: calcCoverageRate(activeWords, hitWordIds.size),
    hitWords: hitWordIds.size,
    activeWords,
    kpiStatus,
    kpiTarget,
    total,
    l2,
    l1,
  };
}

export function aggregateDaily(rows: MeasurementRow[]) {
  const byDate = new Map<string, MeasurementRow[]>();
  for (const r of rows.filter((x) => !x.isExtended)) {
    const arr = byDate.get(r.measureDate) ?? [];
    arr.push(r);
    byDate.set(r.measureDate, arr);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rs]) => ({ date, ...groupAgg(rs) }));
}

export function aggregateByPlatform(rows: MeasurementRow[]) {
  const kpiRows = rows.filter((r) => !r.isExtended);
  return (["deepseek", "doubao", "qwen"] as const).map((platform) => ({
    platform,
    ...groupAgg(kpiRows.filter((r) => r.platform === platform)),
  }));
}

export function aggregateByCategory(rows: MeasurementRow[]) {
  const kpiRows = rows.filter((r) => !r.isExtended);
  return (["brand", "generic", "scenario"] as const).map((category) => ({
    category,
    ...groupAgg(kpiRows.filter((r) => r.category === category)),
  }));
}

export function aggregateMatrix(rows: MeasurementRow[]) {
  const kpiRows = rows.filter((r) => !r.isExtended);
  const out: {
    platform: Platform;
    category: "brand" | "generic" | "scenario";
    total: number;
    l2: number;
    rate: number;
  }[] = [];
  for (const platform of ["deepseek", "doubao", "qwen"] as const) {
    for (const category of ["brand", "generic", "scenario"] as const) {
      const cell = kpiRows.filter((r) => r.platform === platform && r.category === category);
      out.push({ platform, category, ...groupAgg(cell) });
    }
  }
  return out;
}

export function aggregateTopPages(rows: MeasurementRow[], limit = 10) {
  const l2Rows = rows.filter((r) => !r.isExtended && r.level === "L2" && r.citedUrlNorm);
  const count = new Map<string, { url: string; title: string | null; count: number }>();
  for (const r of l2Rows) {
    const key = r.citedUrlNorm!;
    const cur = count.get(key) ?? { url: key, title: r.citedPageTitle, count: 0 };
    cur.count++;
    if (r.citedPageTitle) cur.title = r.citedPageTitle;
    count.set(key, cur);
  }
  const totalL2 = l2Rows.length;
  return [...count.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      share: totalL2 > 0 ? Math.round((p.count / totalL2) * 1000) / 10 : 0,
    }));
}

/** 速览九格：指定日期（通常为最近一轮）按 平台×词类 聚合 */
export function aggregateNineGrid(rows: MeasurementRow[]) {
  const grid: {
    platform: Platform;
    category: "brand" | "generic" | "scenario";
    level: "L2" | "L1" | "L0" | "none";
    total: number;
    l2: number;
  }[] = [];
  for (const platform of ["deepseek", "doubao", "qwen"] as const) {
    for (const category of ["generic", "scenario", "brand"] as const) {
      const cell = rows.filter((r) => r.platform === platform && r.category === category);
      const l2 = cell.filter((r) => r.level === "L2").length;
      const l1 = cell.filter((r) => r.level === "L1").length;
      grid.push({
        platform,
        category,
        level: cell.length === 0 ? "none" : l2 > 0 ? "L2" : l1 > 0 ? "L1" : "L0",
        total: cell.length,
        l2,
      });
    }
  }
  return grid;
}

export async function getProjectTier(projectId: number): Promise<ServiceTier> {
  const [p] = await getDb()
    .select({ serviceTier: projects.serviceTier })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return (p?.serviceTier ?? "standard") as ServiceTier;
}
