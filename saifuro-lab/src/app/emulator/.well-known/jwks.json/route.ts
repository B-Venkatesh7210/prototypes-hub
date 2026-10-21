import { emulatorJwks } from "@/lib/emulator/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await emulatorJwks(), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
