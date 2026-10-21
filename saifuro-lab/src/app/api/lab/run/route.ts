import { aiConfig, runAgent } from "@/lib/lab/agent";
import { currentSession, errorResponse } from "@/lib/lab/http";
import { runScenario, SCENARIOS, type ScenarioId } from "@/lib/lab/scenarios";
import { say } from "@/lib/lab/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await currentSession();
    const body = (await req.json().catch(() => ({}))) as { scenario?: string; prompt?: string };
    const scenario = body.scenario as ScenarioId | undefined;
    const prompt = body.prompt?.trim().slice(0, 500);
    if (scenario && !(scenario in SCENARIOS)) return Response.json({ error: "unknown scenario" }, { status: 400 });
    if (!scenario && !prompt) return Response.json({ error: "scenario or prompt required" }, { status: 400 });
    if (!scenario && !aiConfig()) return Response.json({ error: "Set AI_API_KEY to talk to the agent; the scenarios work without it." }, { status: 400 });
    if (s.busy) return Response.json({ error: `The agent is busy with ${s.busy}` }, { status: 409 });

    s.busy = scenario ? SCENARIOS[scenario].title : "your question";
    void (async () => {
      try {
        if (scenario) await runScenario(s, scenario);
        else await runAgent(s, prompt!);
      } catch (e) {
        say(s, { role: "note", tone: "bad", text: `Run failed: ${(e as Error).message}` });
      } finally {
        s.busy = null;
      }
    })();
    return Response.json({ started: s.busy }, { status: 202 });
  } catch (e) {
    return errorResponse(e);
  }
}
