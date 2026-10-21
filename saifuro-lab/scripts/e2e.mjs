// Drives the lab over HTTP: node scripts/e2e.mjs research injection runaway ...
// Each scenario runs in a fresh session. "review" is approved automatically.
const BASE = process.env.LAB_URL ?? "http://localhost:3003";
let cookie = "";

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, body: await res.json().catch(() => null) };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const scenario of process.argv.slice(2)) {
  await call("/api/lab/reset", {});
  const started = await call("/api/lab/run", scenario.startsWith("ask:") ? { prompt: scenario.slice(4) } : { scenario });
  if (started.status !== 202) {
    console.log(scenario, started.status, started.body);
    continue;
  }
  let state;
  for (let i = 0; i < 240; i++) {
    await wait(500);
    state = (await call("/api/lab/state")).body;
    if (scenario === "review" && state.pendingReviews.length) {
      const rev = state.pendingReviews[0].review.review;
      console.log(`  (approving ${rev})`);
      await call("/api/lab/review", { review: rev, action: "approve" });
    }
    if (!state.busy) break;
  }
  console.log(`\n=== ${scenario} ===`);
  for (const m of state.messages) console.log(`[${m.role}${m.tone ? ":" + m.tone : ""}] ${m.text.slice(0, 400)}`);
  console.log("decisions:", state.decisions.map((d) => `${d.verdict}(${d.request.amount})`).join(" "));
  console.log("seller:", state.seller.map((e) => `${e.label ?? e.dataset}:${e.outcome}${e.failedStep ? "@" + e.failedStep : ""}`).join(" "));
}
