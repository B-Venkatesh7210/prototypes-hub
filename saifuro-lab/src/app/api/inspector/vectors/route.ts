import { liveJwks, SAIFURO_SAMPLE, vectorReport } from "@/lib/inspector";

export const dynamic = "force-dynamic";

export async function GET() {
  const [report, jwks] = await Promise.all([vectorReport(), liveJwks().catch((e: Error) => ({ error: e.message }))]);
  return Response.json({ ...report, jwks, sample: SAIFURO_SAMPLE });
}
