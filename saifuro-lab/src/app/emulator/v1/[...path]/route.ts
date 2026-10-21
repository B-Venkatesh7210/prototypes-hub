import { handleEmulator } from "@/lib/emulator/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  return handleEmulator(req, (await ctx.params).path);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
