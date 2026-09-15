import { createRouter, publicQuery } from "./middleware";
import { projectsRouter } from "./projectsRouter";
import { diagnosticsRouter } from "./diagnosticsRouter";
import { crawlRouter } from "./crawlRouter";
import { poolsRouter } from "./poolsRouter";
import { measurementsRouter } from "./measurementsRouter";
import { quotesRouter, schedulesRouter } from "./quotesRouter";
import { reportsRouter } from "./reportsRouter";
import { competitorsRouter } from "./competitorsRouter";
import { collectionRouter } from "./collectionRouter";
import { authRouter } from "./authRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  auth: authRouter,

  projects: projectsRouter,
  diagnostics: diagnosticsRouter,
  crawl: crawlRouter,
  pools: poolsRouter,
  measurements: measurementsRouter,
  quotes: quotesRouter,
  schedules: schedulesRouter,
  reports: reportsRouter,
  competitors: competitorsRouter,
  collection: collectionRouter,
});

export type AppRouter = typeof appRouter;
