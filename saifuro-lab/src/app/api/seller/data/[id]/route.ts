import { handlePaidRequest } from "@/lib/seller/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handlePaidRequest(req, (await ctx.params).id);
}
