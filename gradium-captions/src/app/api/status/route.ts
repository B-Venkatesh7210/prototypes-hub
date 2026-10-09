import { status } from "@/lib/server/gradium";
import { withRequestKey } from "@/lib/server/gradium/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return withRequestKey(req, async () => Response.json(status()));
}
