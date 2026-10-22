import { currentSession, errorResponse } from "@/lib/lab/http";
import { declineTopUp, topUp } from "@/lib/lab/merchant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await currentSession();
    const { action } = (await req.json().catch(() => ({}))) as { action?: string };
    if (action === "topup") await topUp(s);
    else if (action === "stop") declineTopUp(s);
    else return Response.json({ error: "action must be topup or stop" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
