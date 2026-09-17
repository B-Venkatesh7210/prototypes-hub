import { parseTransactions } from "@/lib/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { signatures?: string[] };
  const signatures = (body.signatures ?? []).filter(Boolean).slice(0, 8);
  if (!signatures.length) {
    return Response.json({ error: "signatures required" }, { status: 400 });
  }

  try {
    const data = await parseTransactions(signatures);
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Parse failed" },
      { status: 502 },
    );
  }
}
