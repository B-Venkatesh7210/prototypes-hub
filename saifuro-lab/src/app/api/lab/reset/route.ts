import { currentSession, errorResponse } from "@/lib/lab/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const s = await currentSession({ fresh: true });
    return Response.json({ agent: s.agent });
  } catch (e) {
    return errorResponse(e);
  }
}
