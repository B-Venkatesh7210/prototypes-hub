import { readBlueprint } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/blueprints/[id]">) {
  const { id } = await ctx.params;
  const blueprint = readBlueprint(id);
  if (!blueprint) return Response.json({ error: "Blueprint not found." }, { status: 404 });
  return Response.json({ blueprint });
}
