import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Role } from "./auth/types";
import { canAccessProject } from "./auth/session";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

export const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "未登录" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export function requireRole(...roles: Role[]) {
  return authed.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无权访问" });
    }
    return next({ ctx });
  });
}

/** 校验当前用户能否访问某项目；在 procedure 内调用 */
export function assertProjectAccess(
  ctx: { user: NonNullable<TrpcContext["user"]> },
  projectId: number,
) {
  if (!canAccessProject(ctx.user, projectId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权访问该项目" });
  }
}
