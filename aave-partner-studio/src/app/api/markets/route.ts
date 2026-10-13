import { getMarkets } from "@/lib/server/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getMarkets(), { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (err) {
    console.error("[markets]", err);
    return Response.json({ error: "Could not read Aave markets on Base right now. Try again in a moment." }, { status: 502 });
  }
}
