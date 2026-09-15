/**
 * 竞对监测对标路由（competitors.*）
 * 口径与过滤参数对齐 measurementsRouter.stats：日期 from/to 闭区间，
 * platforms/categories 多选过滤，includeExtended 默认 false（可拓词仅观察）。
 * 铁律：竞对数据仅作对比分析，不参与我方 KPI 计算。
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { competitorHits, competitors } from "@db/schema";
import { normalizeUrl } from "@contracts/kpi";
import {
  computeHeadToHead,
  computeSov,
  computeTopPages,
  computeTrend,
  listCompetitors,
} from "./services/competitorStats";

const platformEnum = z.enum(["deepseek", "doubao", "qwen"]);
const categoryEnum = z.enum(["brand", "generic", "scenario"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 统计接口统一过滤入参 */
const statsInput = z.object({
  projectId: z.number().int().positive(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  platforms: z.array(platformEnum).optional(),
  categories: z.array(categoryEnum).optional(),
  includeExtended: z.boolean().default(false),
});

/** 校验竞对存在且属于该项目 */
async function assertCompetitor(projectId: number, competitorId: number) {
  const [c] = await getDb()
    .select()
    .from(competitors)
    .where(
      and(eq(competitors.id, competitorId), eq(competitors.projectId, projectId)),
    )
    .limit(1);
  if (!c) throw new Error(`竞对不存在: ${competitorId}`);
  return c;
}

export const competitorsRouter = createRouter({
  /** 竞对清单 + 每个竞对的记录数/最近记录日 */
  list: publicQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => listCompetitors(input.projectId)),

  /** 新增竞对（≤5 个校验，域名规范化，同项目域名去重） */
  create: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        name: z.string().trim().min(1).max(128),
        domain: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(competitors)
        .where(eq(competitors.projectId, input.projectId));
      if (existing.length >= 5) throw new Error("每个项目最多配置 5 个竞对");
      // 域名规范化：去协议 / 去 www / 小写（复用 normalizeUrl）
      const domain = normalizeUrl(input.domain);
      if (!domain) throw new Error("域名不能为空");
      if (existing.some((c) => c.domain === domain)) {
        throw new Error(`该项目已存在相同域名的竞对: ${domain}`);
      }
      const [{ id }] = await db
        .insert(competitors)
        .values({ projectId: input.projectId, name: input.name, domain })
        .$returningId();
      const [row] = await db.select().from(competitors).where(eq(competitors.id, id));
      return row;
    }),

  /** 删除竞对及其全部命中记录 */
  remove: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(competitorHits).where(eq(competitorHits.competitorId, input.id));
      await db.delete(competitors).where(eq(competitors.id, input.id));
      return { ok: true };
    }),

  /** 录入选定日/平台下该竞对的已有记录（回显录入表单） */
  hits: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        competitorId: z.number().int().positive(),
        platform: platformEnum,
        date: dateStr,
      }),
    )
    .query(async ({ input }) => {
      await assertCompetitor(input.projectId, input.competitorId);
      const rows = await getDb()
        .select({
          keywordId: competitorHits.keywordId,
          level: competitorHits.level,
          url: competitorHits.url,
        })
        .from(competitorHits)
        .where(
          and(
            eq(competitorHits.projectId, input.projectId),
            eq(competitorHits.competitorId, input.competitorId),
            eq(competitorHits.platform, input.platform),
            eq(competitorHits.date, input.date),
          ),
        );
      return rows;
    }),

  /**
   * 批量落库：先删 (competitorId, platform, date) 旧记录再插新（与 measurements.record 同幂等模式）。
   * L2 必须有 url（normalizeUrl 规范化存储）；L1/L0 存 null。
   */
  recordHits: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        competitorId: z.number().int().positive(),
        platform: platformEnum,
        date: dateStr,
        rows: z
          .array(
            z.object({
              keywordId: z.number().int().positive(),
              level: z.enum(["L2", "L1", "L0"]),
              url: z.string().optional().nullable(),
            }),
          )
          .min(1)
          .max(5000),
      }),
    )
    .mutation(async ({ input }) => {
      await assertCompetitor(input.projectId, input.competitorId);
      const db = getDb();
      const values = input.rows.map((row) => {
        if (row.level === "L2" && !row.url?.trim()) {
          throw new Error(`L2（来源命中）必须填写被引 URL（keywordId=${row.keywordId}）`);
        }
        return {
          projectId: input.projectId,
          keywordId: row.keywordId,
          competitorId: input.competitorId,
          platform: input.platform,
          date: input.date,
          level: row.level,
          url: row.level === "L2" ? normalizeUrl(row.url!) : null,
        };
      });
      await db
        .delete(competitorHits)
        .where(
          and(
            eq(competitorHits.competitorId, input.competitorId),
            eq(competitorHits.platform, input.platform),
            eq(competitorHits.date, input.date),
          ),
        );
      const chunkSize = 500;
      for (let i = 0; i < values.length; i += chunkSize) {
        await db.insert(competitorHits).values(values.slice(i, i + chunkSize));
      }
      return { inserted: values.length };
    }),

  /** 声量份额：我方 + 各竞对的 L2/L1/命中率/SOV 份额 */
  sov: publicQuery.input(statsInput).query(async ({ input }) => computeSov(input)),

  /** 逐日对比：rate = 当日该品牌 L2 ÷ 当日该品牌已录格数 */
  trend: publicQuery.input(statsInput).query(async ({ input }) => computeTrend(input)),

  /** 逐词头对头：前端按「任一竞对 rate > 我方 rate」判定竞对占优词 */
  headToHead: publicQuery
    .input(statsInput)
    .query(async ({ input }) => computeHeadToHead(input)),

  /** 该竞对 L2 被引页面 TOP20 */
  topPages: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        competitorId: z.number().int().positive(),
        from: dateStr.optional(),
        to: dateStr.optional(),
      }),
    )
    .query(async ({ input }) => {
      await assertCompetitor(input.projectId, input.competitorId);
      return computeTopPages(input);
    }),
});
