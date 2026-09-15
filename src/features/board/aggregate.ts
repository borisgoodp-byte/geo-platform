/**
 * 看板聚合工具：
 * - mergeStats：多平台 measurements.stats 结果合并（服务端 stats 仅支持单平台筛选）
 * - aggregateRows：从原始实测行做全量客户端聚合（词类筛选时服务端不支持，前端等口径复算）
 * 口径全部委托 @contracts/kpi（只读消费）。
 */
import {
  CHECKPOINTS,
  calcCitationRate,
  calcCoverageRate,
  judgeCheckpoint,
  judgeTierKpi,
  TIER_KPI_TARGETS,
  type KeywordCategory,
  type KpiStatus,
  type Platform,
  type ServiceTier,
} from "@contracts/kpi";
import { CATEGORIES_ALL, PLATFORMS_ALL } from "./format";

export interface GroupAgg {
  total: number;
  l2: number;
  l1: number;
  rate: number;
}

export interface DailyPoint extends GroupAgg {
  date: string;
}

export interface PlatformAgg extends GroupAgg {
  platform: Platform;
}

export interface CategoryAgg extends GroupAgg {
  category: KeywordCategory;
}

export interface MatrixCell extends GroupAgg {
  platform: Platform;
  category: KeywordCategory;
}

export interface TopPage {
  url: string;
  title: string | null;
  count: number;
  share: number;
}

export interface KpiCardsData {
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

export interface BoardData {
  cards: KpiCardsData;
  daily: DailyPoint[];
  byPlatform: PlatformAgg[];
  byCategory: CategoryAgg[];
  matrix: MatrixCell[];
}

/** stats 接口返回的 cards 与服务端 KpiCards 同形 */
export interface StatsResultLike {
  cards: KpiCardsData;
  daily: DailyPoint[];
  byPlatform: PlatformAgg[];
  byCategory: CategoryAgg[];
  matrix: MatrixCell[];
  topPages: TopPage[];
  calendar: { date: string; rate: number; total: number; l2: number }[];
}

function groupAgg(rows: { level: string }[]): GroupAgg {
  const total = rows.length;
  const l2 = rows.filter((r) => r.level === "L2").length;
  const l1 = rows.filter((r) => r.level === "L1").length;
  return { total, l2, l1, rate: calcCitationRate(total, l2) };
}

/** 合并若干份 stats（每份对应一个平台；词池级字段各份一致，取首份） */
export function mergeStats(parts: { platform: Platform; stats: StatsResultLike }[]): BoardData {
  const first = parts[0]?.stats;
  const dailyMap = new Map<string, { total: number; l2: number; l1: number }>();
  const catMap = new Map<KeywordCategory, { total: number; l2: number; l1: number }>();
  const matrixMap = new Map<string, { total: number; l2: number; l1: number }>();
  for (const { stats: p } of parts) {
    for (const d of p.daily) {
      const cur = dailyMap.get(d.date) ?? { total: 0, l2: 0, l1: 0 };
      cur.total += d.total;
      cur.l2 += d.l2;
      cur.l1 += d.l1;
      dailyMap.set(d.date, cur);
    }
    for (const c of p.byCategory) {
      const cur = catMap.get(c.category) ?? { total: 0, l2: 0, l1: 0 };
      cur.total += c.total;
      cur.l2 += c.l2;
      cur.l1 += c.l1;
      catMap.set(c.category, cur);
    }
    for (const m of p.matrix) {
      const key = `${m.platform}|${m.category}`;
      const cur = matrixMap.get(key) ?? { total: 0, l2: 0, l1: 0 };
      cur.total += m.total;
      cur.l2 += m.l2;
      cur.l1 += m.l1;
      matrixMap.set(key, cur);
    }
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, g]) => ({ date, ...g, rate: calcCitationRate(g.total, g.l2) }));
  const total = daily.reduce((s, d) => s + d.total, 0);
  const l2 = daily.reduce((s, d) => s + d.l2, 0);
  const l1 = daily.reduce((s, d) => s + d.l1, 0);
  return {
    cards: {
      citationRate: calcCitationRate(total, l2),
      citedPages: first?.cards.citedPages ?? 0, // 由调用方以原始 L2 行覆盖（跨平台去重）
      citedTotal: l2,
      coverageRate: first?.cards.coverageRate ?? 0,
      hitWords: first?.cards.hitWords ?? 0,
      activeWords: first?.cards.activeWords ?? 0,
      kpiStatus: first?.cards.kpiStatus ?? "pending",
      kpiTarget: first?.cards.kpiTarget ?? 30,
      total,
      l2,
      l1,
    },
    daily,
    byPlatform: parts.map(({ platform, stats }) => {
      const hit = stats.byPlatform.find((x) => x.platform === platform);
      return hit ?? { platform, total: 0, l2: 0, l1: 0, rate: 0 };
    }),
    byCategory: CATEGORIES_ALL.map((category) => {
      const g = catMap.get(category) ?? { total: 0, l2: 0, l1: 0 };
      return { category, ...g, rate: calcCitationRate(g.total, g.l2) };
    }),
    matrix: PLATFORMS_ALL.flatMap((platform) =>
      CATEGORIES_ALL.map((category) => {
        const g = matrixMap.get(`${platform}|${category}`) ?? { total: 0, l2: 0, l1: 0 };
        return { platform, category, ...g, rate: calcCitationRate(g.total, g.l2) };
      }),
    ),
  };
}

export interface RawRow {
  measureDate: string;
  platform: Platform;
  level: "L2" | "L1" | "L0";
  citedUrl: string | null;
  citedUrlNorm: string | null;
  citedPageTitle: string | null;
  isCheckpoint: boolean;
  checkpointTag: "m6" | "m12" | null;
  keywordId: number;
  keywordText: string;
  category: KeywordCategory;
  isExtended: boolean;
}

/**
 * 客户端全量聚合（等口径复算 services/measurementStats.ts）。
 * activeWords / tier 由调用方提供（pools.get / projects.get）。
 */
export function aggregateRows(
  rows: RawRow[],
  opts: { activeWords: number; tier: ServiceTier; platforms?: Platform[] },
): BoardData & { topPages: TopPage[] } {
  const inPlatforms = opts.platforms ? new Set(opts.platforms) : null;
  const scoped = rows.filter((r) => !inPlatforms || inPlatforms.has(r.platform));
  const kpiRows = scoped.filter((r) => !r.isExtended);
  const { total, l2, l1, rate } = groupAgg(kpiRows);
  const citedPages = new Set(
    kpiRows.filter((r) => r.level === "L2" && r.citedUrlNorm).map((r) => r.citedUrlNorm!),
  ).size;
  const hitWords = new Set(kpiRows.filter((r) => r.level === "L2").map((r) => r.keywordId)).size;

  // 考核节点：以最近节点当日实测率判定（同 computeKpiCards）
  let kpiStatus: KpiStatus = total === 0 ? "pending" : judgeTierKpi(rate, opts.tier);
  let kpiTarget: number = TIER_KPI_TARGETS[opts.tier];
  const checkpoints = kpiRows.filter((r) => r.isCheckpoint && r.checkpointTag);
  if (checkpoints.length > 0) {
    const latest = [...checkpoints].sort((a, b) => (a.measureDate < b.measureDate ? 1 : -1))[0]!;
    const dayRows = kpiRows.filter(
      (r) => r.measureDate === latest.measureDate && r.checkpointTag === latest.checkpointTag,
    );
    const cp = CHECKPOINTS[latest.checkpointTag!];
    kpiTarget = cp.target;
    kpiStatus = judgeCheckpoint(groupAgg(dayRows).rate, cp.target);
  }

  const dailyMap = new Map<string, RawRow[]>();
  for (const r of kpiRows) {
    const arr = dailyMap.get(r.measureDate) ?? [];
    arr.push(r);
    dailyMap.set(r.measureDate, arr);
  }
  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rs]) => ({ date, ...groupAgg(rs) }));

  const l2Rows = kpiRows.filter((r) => r.level === "L2" && r.citedUrlNorm);
  const pageMap = new Map<string, { url: string; title: string | null; count: number }>();
  for (const r of l2Rows) {
    const key = r.citedUrlNorm!;
    const cur = pageMap.get(key) ?? { url: key, title: r.citedPageTitle, count: 0 };
    cur.count++;
    if (r.citedPageTitle) cur.title = r.citedPageTitle;
    pageMap.set(key, cur);
  }
  const totalL2 = l2Rows.length;
  const topPages = [...pageMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((p) => ({
      ...p,
      share: totalL2 > 0 ? Math.round((p.count / totalL2) * 1000) / 10 : 0,
    }));

  return {
    cards: {
      citationRate: rate,
      citedPages,
      citedTotal: l2,
      coverageRate: calcCoverageRate(opts.activeWords, hitWords),
      hitWords,
      activeWords: opts.activeWords,
      kpiStatus,
      kpiTarget,
      total,
      l2,
      l1,
    },
    daily,
    byPlatform: PLATFORMS_ALL.map((platform) => ({
      platform,
      ...groupAgg(kpiRows.filter((r) => r.platform === platform)),
    })),
    byCategory: CATEGORIES_ALL.map((category) => ({
      category,
      ...groupAgg(kpiRows.filter((r) => r.category === category)),
    })),
    matrix: PLATFORMS_ALL.flatMap((platform) =>
      CATEGORIES_ALL.map((category) => ({
        platform,
        category,
        ...groupAgg(
          kpiRows.filter((r) => r.platform === platform && r.category === category),
        ),
      })),
    ),
    topPages,
  };
}

/** 7 日移动平均 */
export function movingAvg7(daily: DailyPoint[]): (number | null)[] {
  return daily.map((_, i) => {
    if (i < 6) return null;
    const win = daily.slice(i - 6, i + 1);
    const avg = win.reduce((s, x) => s + x.rate, 0) / 7;
    return Math.round(avg * 10) / 10;
  });
}
