import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { quotes, projects } from "@db/schema";
import {
  QUOTE_CATALOG,
  computeQuoteTotal,
  catalogItemsForTier,
} from "@contracts/quote";
import { generateSchedule } from "@contracts/schedule";
import { schedules } from "@db/schema";
import type { ServiceTier } from "@contracts/kpi";

const quoteItemInput = z.object({
  group: z.string(),
  name: z.string().min(1),
  desc: z.string().default(""),
  unit: z.string().default("项"),
  price: z.number().nonnegative(),
  qty: z.number().positive(),
});

export const quotesRouter = createRouter({
  /** 价格目录常量（占位价可编辑） */
  catalog: publicQuery.query(() => QUOTE_CATALOG),

  create: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        title: z.string().min(1),
        tier: z.enum(["basic", "standard", "premium"]).optional(),
        items: z.array(quoteItemInput).min(1).optional(),
        status: z.enum(["draft", "issued"]).default("draft"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!p) throw new Error(`项目不存在: ${input.projectId}`);
      const tier = input.tier ?? p.serviceTier;
      const items = input.items ?? catalogItemsForTier(tier);
      const total = computeQuoteTotal(items);
      const [{ id }] = await db
        .insert(quotes)
        .values({
          projectId: input.projectId,
          title: input.title,
          tier,
          itemsJson: items,
          totalPrice: String(total),
          status: input.status,
        })
        .$returningId();
      const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
      return q;
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).optional(),
        tier: z.enum(["basic", "standard", "premium"]).optional(),
        items: z.array(quoteItemInput).min(1).optional(),
        status: z.enum(["draft", "issued"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, items, ...patch } = input;
      const set: Record<string, unknown> = { ...patch };
      if (items) {
        set.itemsJson = items;
        set.totalPrice = String(computeQuoteTotal(items));
      }
      await db.update(quotes).set(set).where(eq(quotes.id, id));
      const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
      return q;
    }),

  get: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [q] = await getDb()
        .select()
        .from(quotes)
        .where(eq(quotes.id, input.id))
        .limit(1);
      return q ?? null;
    }),

  listByProject: publicQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getDb()
        .select()
        .from(quotes)
        .where(eq(quotes.projectId, input.projectId))
        .orderBy(desc(quotes.id));
    }),
});

export const schedulesRouter = createRouter({
  /** 按 §6 规则生成 phasesJson + milestonesJson 并落库 */
  generate: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!p) throw new Error(`项目不存在: ${input.projectId}`);
      const { phasesJson, milestonesJson } = generateSchedule(
        input.startDate,
        p.serviceTier as ServiceTier,
      );
      const [{ id }] = await db
        .insert(schedules)
        .values({
          projectId: input.projectId,
          startDate: input.startDate,
          phasesJson,
          milestonesJson,
        })
        .$returningId();
      const [s] = await db.select().from(schedules).where(eq(schedules.id, id));
      return s;
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        phasesJson: z.array(z.unknown()).optional(),
        milestonesJson: z.array(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...patch } = input;
      await db
        .update(schedules)
        .set(patch as never)
        .where(eq(schedules.id, id));
      const [s] = await db.select().from(schedules).where(eq(schedules.id, id));
      return s;
    }),

  get: publicQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [s] = await getDb()
        .select()
        .from(schedules)
        .where(eq(schedules.projectId, input.projectId))
        .orderBy(desc(schedules.id))
        .limit(1);
      return s ?? null;
    }),
});
