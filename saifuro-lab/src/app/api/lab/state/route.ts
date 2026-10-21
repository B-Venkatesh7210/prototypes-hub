import { currentSession, errorResponse } from "@/lib/lab/http";
import { labState } from "@/lib/lab/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await labState(await currentSession()));
  } catch (e) {
    return errorResponse(e);
  }
}
