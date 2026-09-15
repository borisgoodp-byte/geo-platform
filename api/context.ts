import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AuthUser } from "./auth/types";
import { SESSION_COOKIE, parseCookie, loadAuthUser } from "./auth/session";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: AuthUser | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const token = parseCookie(opts.req.headers.get("cookie"), SESSION_COOKIE);
  let user: AuthUser | null = null;
  try {
    user = await loadAuthUser(token);
  } catch {
    user = null;
  }
  return { req: opts.req, resHeaders: opts.resHeaders, user };
}
