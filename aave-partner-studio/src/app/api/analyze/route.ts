import { analyze, AnalyzeError } from "@/lib/server/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { input?: unknown; refresh?: unknown };
  const visitor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  try {
    const blueprint = await analyze(String(body.input ?? ""), visitor, { refresh: body.refresh === true });
    return Response.json({ blueprint });
  } catch (err) {
    if (err instanceof AnalyzeError) return Response.json({ error: err.message }, { status: 400 });
    console.error("[analyze]", err);
    return Response.json({ error: "Couldn't build the blueprint. Check the address and try again." }, { status: 500 });
  }
}
