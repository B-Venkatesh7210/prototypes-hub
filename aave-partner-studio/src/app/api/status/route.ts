import { aiConfig } from "@/lib/server/ai";
import { sandboxInfo } from "@/lib/server/sandbox";
import type { ServiceStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ai = aiConfig();
  const body: ServiceStatus = {
    ai: ai ? { enabled: true, model: ai.model } : { enabled: false },
    sandbox: await sandboxInfo(),
  };
  return Response.json(body);
}
