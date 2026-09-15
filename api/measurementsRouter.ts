import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { measurements } from "@db/schema";
import { normalizeUrl } from "@contracts/kpi";
import {
  aggregateByCategory,
  aggregateByPlatform,
  aggregateDaily,
  aggregateMatrix,
  aggregateTopPages,
  computeKpiCards,
  getProjectTier,
  queryMeasurements,
} from "./services/measurementStats";

const rowInput = z.object({
  projectId: z.number().int().positive(),
  poolId: z.number().int().positive(),
  keywordId: z.number().int().positive(),
  measureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(["deepseek", "doubao", "qwen"]),
  level: z.enum(["L2", "L1", "L0"]),
  citedUrl: z.string().optional().nullable(),
  citedPageTitle: z.string().optional().nullable(),
  snapshot: z.string().optional().nullable(),
  isCheckpoint: z.boolean().default(false),
  checkpointTag: z.enum(["m6", "m12"]).optional().nullable(),
});

/** 服务端统一做 normalizeUrl */
function normalizeRow(row: z.infer<typeof rowInput>) {
  const citedUrlNorm = row.citedUrl ? normalizeUrl(row.citedUrl) : null;
  return {
    ...row,
    citedUrl: row.citedUrl ?? null,
    citedUrlNorm,
    citedPageTitle: row.citedPageTitle ?? null,
    snapshot: row.snapshot ?? null,
    checkpointTag: row.checkpointTag ?? null,
  };
}

export const measurementsRouter = createRouter({
  create: publicQuery.input(rowInput).mutation(async ({ input }) => {
    const [{ id }] = await getDb()
      .insert(measurements)
      .values(normalizeRow(input))
      .$returningId();
    return { id, citedUrlNorm: normalizeRow(input).citedUrlNorm };
  }),

  bulkCreate: publicQuery
    .input(z.object({ rows: z.array(rowInput).min(1).max(5000) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const values = input.rows.map(normalizeRow);
      const chunkSize = 500;
      for (let i = 0; i < values.length; i += chunkSize) {
        await db.insert(measurements).values(values.slice(i, i + chunkSize));
      }
      return { inserted: values.length };
    }),

  list: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        from: z.string().optional(),
        to: z.string().optional(),
        platform: z.enum(["deepseek", "doubao", "qwen"]).optional(),
        category: z.enum(["brand", "generic", "scenario"]).optional(),
        level: z.enum(["L2", "L1", "L0"]).optional(),
        keywordId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(2000).default(500),
      }),
    )
    .query(async ({ input }) => {
      const { limit, ...filters } = input;
      const rows = await queryMeasurements(filters);
      return rows.slice(0, limit);
    }),

  /**
   * 看板聚合：kpi 卡五项 + daily + byPlatform + byCategory + topPages + matrix(平台×词类) + calendar
   */
  stats: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        from: z.string().optional(),
        to: z.string().optional(),
        platform: z.enum(["deepseek", "doubao", "qwen"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const rows = await queryMeasurements(input);
      const tier = await getProjectTier(input.projectId);
      const cards = await computeKpiCards(rows, tier, {
        from: input.from,
        to: input.to,
      });
      const daily = aggregateDaily(rows);
      return {
        cards,
        daily,
        byPlatform: aggregateByPlatform(rows),
        byCategory: aggregateByCategory(rows),
        topPages: aggregateTopPages(rows, 10),
        matrix: aggregateMatrix(rows),
        calendar: daily.slice(-42).map((d) => ({
          date: d.date,
          rate: d.rate,
          total: d.total,
          l2: d.l2,
        })),
      };
    }),
});
