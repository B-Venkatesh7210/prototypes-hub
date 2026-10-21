import { inspect, type InspectInput } from "@/lib/inspector";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<InspectInput> | null;
  if (!body?.token || typeof body.token !== "string" || body.token.length > 120_000) return Response.json({ error: "token required" }, { status: 400 });
  const mode = body.mode === "record" ? "record" : "settle";
  if (mode === "settle" && (!body.payment?.amount || !body.payment.currency || !body.payment.recipient)) {
    return Response.json({ error: "settle mode needs the payment you are about to accept: amount, currency, recipient" }, { status: 400 });
  }
  try {
    return Response.json(
      await inspect({
        token: body.token,
        mode,
        payment: body.payment,
        agreedMandates: Array.isArray(body.agreedMandates) ? body.agreedMandates.filter((m) => typeof m === "string") : undefined,
        testingOnly: !!body.testingOnly,
        receivedAt: typeof body.receivedAt === "number" ? body.receivedAt : null,
      }),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
