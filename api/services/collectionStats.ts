/**
 * 采集中心聚合统计（collectionRouter 专用）
 * 口径见 collect-spec §0/§2：
 * - 应采词 = 项目最新锁定词池的 active 词（含可拓词，返回时以 extended 标记区分）
 * - 已采格 = measurements 按 (date, platform, keywordId) 去重，且仅统计当前锁定词池词 × 启用平台
 * - 竞对已采格 competitorRecords 从 competitorHits 统计，不计入我方完成率
 */

import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  collectionConfigs,
  competitorHits,
  keywordPools,
  keywords,
  measurements,
  projects,
} from "@db/schema";
import type { KeywordCategory, Platform } from "@contracts/kpi";
import {
  calcCompletionRate,
  isPlannedDay,
  DEFAULT_COLLECTION_PLATFORMS,
  type CollectionConfigShape,
} from "@contracts/collection";

/** 生效配置：库中记录或默认值（不落库）；updatedAt=null 表示默认值 */
export interface EffectiveCollectionConfig extends CollectionConfigShape {
  updatedAt: Date | null;
}

/** 读取生效采集配置：无记录时返回默认值（daily/三平台/项目负责人/competitorSync=true） */
export async function getEffectiveConfig(
  projectId: number,
): Promise<EffectiveCollectionConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(collectionConfigs)
    .where(eq(collectionConfigs.projectId, projectId))
    .limit(1);
  if (row) return row;
  const [p] = await db
    .select({ owner: projects.owner })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return {
    projectId,
    frequency: "daily",
    customDays: null,
    platforms: [...DEFAULT_COLLECTION_PLATFORMS],
    assignee: p?.owner ?? null,
    competitorSync: true,
    updatedAt: null,
  };
}

/** 应采词条目（extended 标记可拓词） */
export interface PlanKeyword {
  id: number;
  text: string;
  category: KeywordCategory;
  extended: boolean;
}

/** 项目最新锁定词池的 active 词；无锁定词池返回空 */
export async function getLockedPoolKeywords(projectId: number): Promise<{
  poolId: number | null;
  words: PlanKeyword[];
}> {
  const db = getDb();
  const [pool] = await db
    .select({ id: keywordPools.id })
    .from(keywordPools)
    .where(
      and(eq(keywordPools.projectId, projectId), eq(keywordPools.status, "locked")),
    )
    .orderBy(desc(keywordPools.id))
    .limit(1);
  if (!pool) return { poolId: null, words: [] };
  const rows = await db
    .select({
      id: keywords.id,
      text: keywords.text,
      category: keywords.category,
      isExtended: keywords.isExtended,
    })
    .from(keywords)
    .where(and(eq(keywords.poolId, pool.id), eq(keywords.status, "active")))
    .orderBy(keywords.id);
  return {
    poolId: pool.id,
    words: rows.map((r) => ({
      id: r.id,
      text: r.text,
      category: r.category,
      extended: r.isExtended,
    })),
  };
}

/** 拉取区间内已采格（去重键 platform|keywordId），按日期分组；仅统计词池词 × 启用平台 */
async function queryCollectedCells(
  projectId: number,
  platforms: Platform[],
  wordIds: Set<number>,
  from: string,
  to: string,
): Promise<Map<string, Set<string>>> {
  const byDate = new Map<string, Set<string>>();
  if (wordIds.size === 0 || platforms.length === 0) return byDate;
  const rows = await getDb()
    .select({
      measureDate: measurements.measureDate,
      platform: measurements.platform,
      keywordId: measurements.keywordId,
    })
    .from(measurements)
    .where(
      and(
        eq(measurements.projectId, projectId),
        gte(measurements.measureDate, from),
        lte(measurements.measureDate, to),
        inArray(measurements.platform, platforms),
        inArray(measurements.keywordId, [...wordIds]),
      ),
    );
  for (const r of rows) {
    const set = byDate.get(r.measureDate) ?? new Set<string>();
    set.add(`${r.platform}|${r.keywordId}`);
    byDate.set(r.measureDate, set);
  }
  return byDate;
}

/** 竞对当日/区间已录格数（competitorHits 行数，唯一索引保证 词×平台×日×竞对 不重复） */
async function countCompetitorRecords(
  projectId: number,
  from: string,
  to: string,
): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(competitorHits)
    .where(
      and(
        eq(competitorHits.projectId, projectId),
        gte(competitorHits.date, from),
        lte(competitorHits.date, to),
      ),
    );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------- plan

export interface PlanResult {
  date: string;
  planned: boolean;
  expected: number;
  actualOwn: number;
  actualCompetitors: number;
  completionRate: number | null;
  missing: { platform: Platform; keywords: PlanKeyword[] }[];
  perPlatform: { platform: Platform; expected: number; actual: number }[];
}

/** 当日采集任务：应采/已采/缺失词/分平台进度 */
export async function computePlan(
  projectId: number,
  date: string,
): Promise<PlanResult> {
  const config = await getEffectiveConfig(projectId);
  const { words } = await getLockedPoolKeywords(projectId);
  const planned = isPlannedDay(date, config);
  const wordIds = new Set(words.map((w) => w.id));
  const perPlatformExpected = words.length;
  const expected = perPlatformExpected * config.platforms.length;

  const cells = await queryCollectedCells(
    projectId,
    config.platforms,
    wordIds,
    date,
    date,
  );
  const done = cells.get(date) ?? new Set<string>();

  const perPlatform = config.platforms.map((platform) => {
    const actual = words.filter((w) => done.has(`${platform}|${w.id}`)).length;
    return { platform, expected: perPlatformExpected, actual };
  });
  const actualOwn = perPlatform.reduce((s, p) => s + p.actual, 0);
  const actualCompetitors = await countCompetitorRecords(projectId, date, date);

  const missing = config.platforms
    .map((platform) => ({
      platform,
      keywords: words.filter((w) => !done.has(`${platform}|${w.id}`)),
    }))
    .filter((m) => m.keywords.length > 0);

  return {
    date,
    planned,
    expected,
    actualOwn,
    actualCompetitors,
    completionRate: calcCompletionRate(expected, actualOwn),
    missing,
    perPlatform,
  };
}

// ---------------------------------------------------------------- calendar

export interface CalendarDay {
  date: string;
  planned: boolean;
  expected: number;
  actual: number;
  /** 完成率；非计划日或应采为 0 时为 null */
  rate: number | null;
}

/** 逐日采集日历（from/to 闭区间，YYYY-MM-DD，按 UTC 遍历） */
export async function computeCalendar(
  projectId: number,
  from: string,
  to: string,
): Promise<CalendarDay[]> {
  const config = await getEffectiveConfig(projectId);
  const { words } = await getLockedPoolKeywords(projectId);
  const wordIds = new Set(words.map((w) => w.id));
  const expected = words.length * config.platforms.length;
  const cells = await queryCollectedCells(projectId, config.platforms, wordIds, from, to);

  const out: CalendarDay[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const planned = isPlannedDay(date, config);
    const actual = cells.get(date)?.size ?? 0;
    out.push({
      date,
      planned,
      expected: planned ? expected : 0,
      actual,
      rate: planned ? calcCompletionRate(expected, actual) : null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------- stats

export interface CollectionStats {
  plannedDays: number;
  fullDays: number;
  avgRate: number | null;
  currentMissStreak: number;
  totalRecords: number;
  /** measurements 有快照字段时为快照留存占比（无记录时为 null）；无快照字段时为 null */
  snapshotRatio: number | null;
  competitorRecords: number;
}

/** UTC 今日 YYYY-MM-DD（与种子数据口径一致） */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 日期前移 n 天（UTC） */
function shiftDay(date: string, offset: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/**
 * 近 N 天采集统计。currentMissStreak 从今天往回数「计划日但完成率<100%」的连续天数
 * （非计划日、无词池日跳过不计也不中断；内部回看 90 天以防连缺跨出统计窗口）。
 */
export async function computeStats(
  projectId: number,
  days: number,
): Promise<CollectionStats> {
  const db = getDb();
  const today = todayUtc();
  const lookback = Math.max(days, 90);
  const cal = await computeCalendar(projectId, shiftDay(today, -(lookback - 1)), today);
  const windowStart = shiftDay(today, -(days - 1));
  const win = cal.filter((c) => c.date >= windowStart);

  const plannedDays = win.filter((c) => c.planned).length;
  const fullDays = win.filter((c) => c.planned && c.rate === 100).length;
  const rates = win.filter((c) => c.planned && c.rate !== null).map((c) => c.rate!);
  const avgRate = rates.length
    ? Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 10) / 10
    : null;

  let currentMissStreak = 0;
  for (let i = cal.length - 1; i >= 0; i--) {
    const c = cal[i]!;
    if (!c.planned || c.expected === 0) continue; // 非计划日/无词池日跳过
    if (c.rate === 100) break;
    currentMissStreak++;
  }

  const [totalRow] = await db
    .select({ n: count() })
    .from(measurements)
    .where(
      and(
        eq(measurements.projectId, projectId),
        gte(measurements.measureDate, windowStart),
        lte(measurements.measureDate, today),
      ),
    );
  const totalRecords = totalRow?.n ?? 0;

  // 快照留存率：仅当 measurements 表具备快照字段（snapshot）时计算，否则返回 null
  let snapshotRatio: number | null = null;
  const hasSnapshotField = "snapshot" in measurements;
  if (hasSnapshotField) {
    const snapRows = await db
      .select({ snapshot: measurements.snapshot })
      .from(measurements)
      .where(
        and(
          eq(measurements.projectId, projectId),
          gte(measurements.measureDate, windowStart),
          lte(measurements.measureDate, today),
        ),
      );
    if (snapRows.length > 0) {
      const withSnapshot = snapRows.filter(
        (r) => r.snapshot !== null && r.snapshot.trim() !== "",
      ).length;
      snapshotRatio = Math.round((withSnapshot / snapRows.length) * 1000) / 10;
    }
  }

  const competitorRecords = await countCompetitorRecords(projectId, windowStart, today);

  return {
    plannedDays,
    fullDays,
    avgRate,
    currentMissStreak,
    totalRecords,
    snapshotRatio,
    competitorRecords,
  };
}
