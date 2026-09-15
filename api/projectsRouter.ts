import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  projects,
  diagnostics,
  indicatorScores,
  findings,
  crawlResults,
  keywordPools,
  keywords,
  poolChangeLogs,
  measurements,
  quotes,
  schedules,
  competitors,
  competitorHits,
  collectionConfigs,
} from "@db/schema";
import { calcCitationRate } from "@contracts/kpi";

const projectInput = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  domain: z.string().min(1),
  industry: z.string().min(1),
  serviceTier: z.enum(["basic", "standard", "premium"]).default("standard"),
  stage: z.enum(["A", "B", "C", "D"]).default("A"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  owner: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
});

function toNum(v: string | null): number | null {
  return v === null ? null : Number(v);
}

async function latestDiagnostic(projectId: number) {
  const [d] = await getDb()
    .select()
    .from(diagnostics)
    .where(eq(diagnostics.projectId, projectId))
    .orderBy(desc(diagnostics.id))
    .limit(1);
  if (!d) return null;
  return {
    id: d.id,
    diagnoseDate: d.diagnoseDate,
    status: d.status,
    techScore: toNum(d.techScore),
    archScore: toNum(d.archScore),
    contentScore: toNum(d.contentScore),
    visScore: toNum(d.visScore),
    compositeScore: toNum(d.compositeScore),
    grade: d.grade,
  };
}

async function citationRate30d(projectId: number) {
  const db = getDb();
  const [latest] = await db
    .select({ d: measurements.measureDate })
    .from(measurements)
    .where(eq(measurements.projectId, projectId))
    .orderBy(desc(measurements.measureDate))
    .limit(1);
  if (!latest) return { rate: 0, total: 0, l2: 0 };
  const anchor = new Date(`${latest.d}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - 29);
  const from = anchor.toISOString().slice(0, 10);
  const rows = await db
    .select({ level: measurements.level })
    .from(measurements)
    .where(
      and(
        eq(measurements.projectId, projectId),
        gte(measurements.measureDate, from),
      ),
    );
  const l2 = rows.filter((r) => r.level === "L2").length;
  return { rate: calcCitationRate(rows.length, l2), total: rows.length, l2 };
}

export const projectsRouter = createRouter({
  list: publicQuery.query(async () => {
    const rows = await getDb()
      .select()
      .from(projects)
      .orderBy(desc(projects.id));
    return Promise.all(
      rows.map(async (p) => ({
        ...p,
        latestDiagnostic: await latestDiagnostic(p.id),
      })),
    );
  }),

  get: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [p] = await getDb()
        .select()
        .from(projects)
        .where(eq(projects.id, input.id))
        .limit(1);
      if (!p) return null;
      const [diag, rate30] = await Promise.all([
        latestDiagnostic(p.id),
        citationRate30d(p.id),
      ]);
      return { ...p, latestDiagnostic: diag, recent30d: rate30 };
    }),

  create: publicQuery.input(projectInput).mutation(async ({ input }) => {
    const [{ id }] = await getDb().insert(projects).values(input).$returningId();
    const [p] = await getDb().select().from(projects).where(eq(projects.id, id));
    return p;
  }),

  update: publicQuery
    .input(z.object({ id: z.number().int().positive() }).merge(projectInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      await getDb().update(projects).set(patch).where(eq(projects.id, id));
      const [p] = await getDb().select().from(projects).where(eq(projects.id, id));
      return p;
    }),

  remove: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const diags = await db
        .select({ id: diagnostics.id })
        .from(diagnostics)
        .where(eq(diagnostics.projectId, input.id));
      const pools = await db
        .select({ id: keywordPools.id })
        .from(keywordPools)
        .where(eq(keywordPools.projectId, input.id));
      for (const d of diags) {
        await db.delete(indicatorScores).where(eq(indicatorScores.diagnosticId, d.id));
        await db.delete(findings).where(eq(findings.diagnosticId, d.id));
        await db.delete(crawlResults).where(eq(crawlResults.diagnosticId, d.id));
      }
      for (const p of pools) {
        await db.delete(keywords).where(eq(keywords.poolId, p.id));
        await db.delete(poolChangeLogs).where(eq(poolChangeLogs.poolId, p.id));
      }
      await db.delete(measurements).where(eq(measurements.projectId, input.id));
      await db.delete(diagnostics).where(eq(diagnostics.projectId, input.id));
      await db.delete(keywordPools).where(eq(keywordPools.projectId, input.id));
      await db.delete(quotes).where(eq(quotes.projectId, input.id));
      await db.delete(schedules).where(eq(schedules.projectId, input.id));
      await db.delete(competitorHits).where(eq(competitorHits.projectId, input.id));
      await db.delete(competitors).where(eq(competitors.projectId, input.id));
      await db.delete(collectionConfigs).where(eq(collectionConfigs.projectId, input.id));
      await db.delete(projects).where(eq(projects.id, input.id));
      return { ok: true };
    }),
});
