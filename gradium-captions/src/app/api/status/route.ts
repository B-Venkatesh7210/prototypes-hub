import { status } from "@/lib/server/gradium";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(status());
}
