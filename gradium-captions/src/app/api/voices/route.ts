import { customVoices } from "@/lib/server/gradium";
import { respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return respond(async () => ({ custom: await customVoices() }));
}
