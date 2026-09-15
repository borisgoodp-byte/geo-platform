import { createHash, randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { sessions, users, userProjects } from "@db/schema";
import type { AuthUser } from "./types";

export const SESSION_COOKIE = "geo_session";
const SESSION_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setSessionCookie(resHeaders: Headers, token: string, expiresAt: Date) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  resHeaders.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(resHeaders: Headers) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  resHeaders.append("Set-Cookie", parts.join("; "));
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function destroySession(token: string | null) {
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function loadAuthUser(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.status !== "active") return null;

  let projectIds: number[] = [];
  if (row.role !== "lead") {
    const binds = await db
      .select({ projectId: userProjects.projectId })
      .from(userProjects)
      .where(eq(userProjects.userId, row.userId));
    projectIds = binds.map((b) => b.projectId);
  }

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    projectIds,
  };
}

export function defaultPathFor(user: AuthUser): string {
  if (user.role === "client" && user.projectIds.length === 1) {
    return `/projects/${user.projectIds[0]}/dashboard`;
  }
  return "/";
}

export function toMePayload(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    projectIds: user.projectIds,
    defaultPath: defaultPathFor(user),
  };
}

export function canAccessProject(user: AuthUser, projectId: number): boolean {
  if (user.role === "lead") return true;
  return user.projectIds.includes(projectId);
}
