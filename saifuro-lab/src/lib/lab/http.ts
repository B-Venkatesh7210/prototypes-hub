import "server-only";
import { cookies } from "next/headers";
import { dropSession, getSession, newSid, type LabSession } from "./session";

const COOKIE = "sl_lab";

export async function currentSession(opts: { fresh?: boolean } = {}): Promise<LabSession> {
  const jar = await cookies();
  let sid = jar.get(COOKIE)?.value;
  if (opts.fresh && sid) dropSession(sid);
  if (opts.fresh || !sid || !/^[0-9a-f]{24}$/.test(sid)) {
    sid = newSid();
    jar.set(COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 86_400 });
  }
  return getSession(sid);
}

export function errorResponse(e: unknown, status = 500) {
  return Response.json({ error: (e as Error).message ?? "error" }, { status });
}
