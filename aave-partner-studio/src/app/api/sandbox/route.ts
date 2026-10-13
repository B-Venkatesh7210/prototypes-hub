import { cookies } from "next/headers";
import { EARN_SYMBOLS } from "@/lib/aave/constants";
import {
  newSessionId,
  SandboxError,
  sandboxApprove,
  sandboxState,
  sandboxSupply,
  sandboxWarp,
  sandboxWithdraw,
} from "@/lib/server/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "aps_sandbox";
const MAX_AMOUNT = 1_000_000;

type Body = { action?: string; asset?: string; amount?: number | "max"; seconds?: number };

export async function POST(req: Request) {
  const jar = await cookies();
  const body = (await req.json().catch(() => ({}))) as Body;
  const asset = (EARN_SYMBOLS as readonly string[]).includes(body.asset ?? "") ? body.asset! : "USDC";

  let sid = jar.get(COOKIE)?.value;
  if (!sid || !/^[a-f0-9]{32}$/.test(sid) || body.action === "reset") {
    sid = newSessionId();
    jar.set(COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  }

  try {
    switch (body.action) {
      case "state":
      case "reset":
        return Response.json({ state: await sandboxState(sid, asset) });
      case "approve":
        return Response.json({ hash: await sandboxApprove(sid, asset, amountOf(body.amount)) });
      case "supply":
        return Response.json({ hash: await sandboxSupply(sid, asset, amountOf(body.amount)) });
      case "withdraw":
        return Response.json({ hash: await sandboxWithdraw(sid, asset, body.amount === "max" ? "max" : amountOf(body.amount)) });
      case "warp":
        return Response.json(await sandboxWarp(Number(body.seconds) || 0));
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof SandboxError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[sandbox]", err);
    const message = err instanceof Error ? err.message.split("\n")[0] : "Sandbox request failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function amountOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) throw new SandboxError("Enter an amount greater than 0.");
  return n;
}
