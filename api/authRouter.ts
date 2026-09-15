import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, authed } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { verifyPassword } from "./auth/password";
import {
  SESSION_COOKIE,
  parseCookie,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  loadAuthUser,
  toMePayload,
} from "./auth/session";

export const authRouter = createRouter({
  login: publicQuery
    .input(
      z.object({
        email: z.string().email().max(255),
        password: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [row] = await getDb()
        .select()
        .from(users)
        .where(eq(users.email, input.email.trim().toLowerCase()))
        .limit(1);
      if (!row || !verifyPassword(input.password, row.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "邮箱或密码错误" });
      }
      if (row.status !== "active") {
        throw new TRPCError({ code: "FORBIDDEN", message: "账号已停用" });
      }

      const old = parseCookie(ctx.req.headers.get("cookie"), SESSION_COOKIE);
      await destroySession(old);

      const { token, expiresAt } = await createSession(row.id);
      setSessionCookie(ctx.resHeaders, token, expiresAt);

      const user = await loadAuthUser(token);
      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "会话创建失败" });
      }
      return toMePayload(user);
    }),

  me: authed.query(({ ctx }) => toMePayload(ctx.user)),

  logout: publicQuery.mutation(async ({ ctx }) => {
    const token = parseCookie(ctx.req.headers.get("cookie"), SESSION_COOKIE);
    await destroySession(token);
    clearSessionCookie(ctx.resHeaders);
    return { ok: true as const };
  }),
});
