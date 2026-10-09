import { status } from "@/lib/server/gradium";
import { accountBalance } from "@/lib/server/ledger";
import { respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The real Gradium account balance. Reading it costs no credits. */
export async function GET(req: Request) {
  return respond(req, async () => {
    const { mode, hasKey } = status();
    return { mode, account: hasKey ? await accountBalance() : null };
  });
}
