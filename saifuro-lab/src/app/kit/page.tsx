import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoTip, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Integration kit · Saifuro × x402" };

const BUYER = `import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createSaifuroClient } from "./kit/client";
import { wrapFetchWithSaifuro, SpendBlockedError } from "./kit/x402";

const saifuro = createSaifuroClient({ apiKey: process.env.SAIFURO_AGENT_KEY! }); // ak_…
const x402 = new x402HTTPClient(
  new x402Client().register("eip155:84532", new ExactEvmScheme(agentWallet)),
);

const paidFetch = wrapFetchWithSaifuro(fetch, {
  saifuro,
  x402,
  reviewTimeoutMs: 120_000,          // wait for a person on "review"
  onEvent: (e) => console.log(e.type),
});

try {
  const res = await paidFetch("https://data.example.com/api/seller/data/chain-tvl");
  console.log(await res.json());
} catch (e) {
  if (e instanceof SpendBlockedError) {
    // deny_limit, deny_category, …  Nothing was signed; nothing reached the chain.
    console.log(e.decision.verdict, e.decision.reason);
  }
}`;

const AGENT = `import { generateText, stepCountIs } from "ai";
import { createPaidFetchTool } from "./kit/ai";

const { text } = await generateText({
  model,
  instructions: "You are a research agent. Buy data only when you need it.",
  prompt: "How much stablecoin supply is on Base?",
  tools: {
    buy: createPaidFetchTool({ fetch: paidFetch, baseUrl: "https://data.example.com" }),
  },
  stopWhen: stepCountIs(8),
});
// A denial comes back to the model as a tool result:
// { ok: false, blocked: true, verdict: "deny_limit", reason: "amount 900.00 exceeds …" }`;

const SELLER = `import { verifyVerdict, remoteKeySource, memoryReplayStore,
         SAIFURO_ISSUER, SAIFURO_JWKS_URL } from "./kit/verdict";

const issuers = { [SAIFURO_ISSUER]: remoteKeySource(SAIFURO_JWKS_URL) };
const replay = memoryReplayStore(); // use Redis/Postgres when you run >1 instance

export async function GET(req: Request) {
  if (!req.headers.get("payment-signature")) return paymentRequired(); // 402 + quote

  const v = await verifyVerdict(req.headers.get("Saifuro-Verdict") ?? "", {
    issuers,
    payment: { amount: "0.01", currency: "USDC", recipient: PAY_TO },
    agreedMandates: await mandatesAgreedWith(operator), // step 8
    replay,
  });
  if (!v.valid) return Response.json({ step: v.step, reason: v.reason }, { status: 403 });

  await settleWithFacilitator(req);  // only now does money move
  return Response.json(await data());
}`;

const RECORD = `// Auditing a stored verdict: steps 1–7 against when you received it.
const v = await verifyVerdict(storedToken, {
  issuers,
  mode: "record",
  receivedAt: Date.parse(row.received_at) / 1000,
});`;

const FILES = [
  ["kit/verdict/verify.ts", "The 12-step verifier, settle and record modes. Returns every step's status."],
  ["kit/verdict/json.ts", "Strict JSON: duplicate members rejected at any depth, numbers kept as written."],
  ["kit/verdict/p256.ts", "ES256 with the checks WebCrypto skips: 64-byte R‖S, scalars in range, point on curve."],
  ["kit/verdict/decimal.ts", "Amounts compared as decimals, never floats."],
  ["kit/verdict/keys.ts", "JWKS source: HTTPS only, no redirects, 5-minute cache, one refetch on unknown kid."],
  ["kit/verdict/replay.ts", "Nonce and supersedes store interface, with a memory implementation."],
  ["kit/client.ts", "Typed REST client: authorize, decisions, mandates, reviews, waitForApproval. Fails closed."],
  ["kit/x402.ts", "wrapFetchWithSaifuro: authorize before signing any x402 payment, attach the verdict."],
  ["kit/ai.ts", "createPaidFetchTool: an AI SDK tool whose denials are tool results."],
];

const KEYWORDS = new Set(["import", "from", "const", "await", "async", "export", "function", "return", "if", "try", "catch", "new", "instanceof"]);
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|\b([A-Za-z_]\w*)\b/gm;

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    const [text, comment, str, word] = m;
    if (word && !KEYWORDS.has(word)) continue;
    out.push(code.slice(last, m.index));
    const cls = comment ? "text-faint" : str ? "text-accent" : "font-semibold text-ink";
    out.push(
      <span key={m.index} className={cls}>
        {text}
      </span>,
    );
    last = m.index + text.length;
  }
  out.push(code.slice(last));
  return out;
}

function Code({ file, code }: { file: string; code: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex h-10 items-center gap-2 border-b border-line bg-subtle px-4">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="ml-2 font-mono text-[12px] text-muted">{file}</span>
      </div>
      <pre className="scroll-thin overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7] text-body [font-variant-ligatures:none]">{highlight(code)}</pre>
    </div>
  );
}

function Row({ n, who, title, tip, children, file, code }: { n: string; who: string; title: string; tip?: string; children: ReactNode; file: string; code: string }) {
  return (
    <section className="grid gap-8 border-t border-line py-10 lg:grid-cols-[20rem_1fr]">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] text-faint">{n}</span>
          <Pill tone="info">{who}</Pill>
        </div>
        <div className="mt-3 flex items-start gap-2">
          <h2 className="text-[21px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h2>
          {tip && (
            <span className="mt-1">
              <InfoTip content={tip} />
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-body">{children}</div>
      </div>
      <Code file={file} code={code} />
    </section>
  );
}

const c = (s: string) => <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[12.5px] text-ink">{s}</code>;

export default function KitPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-20">
      <section className="pb-8 pt-8">
        <div className="kicker">src/kit</div>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">Integration kit</h1>
        <div className="mt-2.5 flex items-center gap-2.5 text-[15px] text-body">
          What a Saifuro SDK could look like for the agent builder, the seller and the auditor.
          <InfoTip content="Everything the Lab runs on. The verifier needs nothing but WebCrypto; the buyer side uses the x402 client and, optionally, the AI SDK." />
        </div>
      </section>

      <div className="grid overflow-hidden rounded-md border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-line">
        <Stat value="138/138" label="official test vectors, exact step" href="/inspector" />
        <Stat value="0 signed" label="payments without an allow" href="/" />
        <Stat value="12 steps" label="checked before the seller settles" href="/inspector" />
      </div>

      <div className="mt-10">
        <Row n="01" who="Agent builder" title="Ask Saifuro before every x402 payment" file="buyer.ts" code={BUYER} tip="The verdict travels with the payment in a Saifuro-Verdict header, so the seller can check it too.">
          <p>
            Wrap {c("fetch")} once. On a {c("402")} it authorizes the exact quote, waits on {c("review")}, and signs only on {c("allow")}.
          </p>
        </Row>
        <Row n="02" who="Agent builder" title="Give a model a wallet it can't overspend" file="agent.ts" code={AGENT} tip="Try the Prompt injection scenario in the Lab to see the difference.">
          <p>The model decides what to buy; the mandate decides whether it may pay. Denials come back as tool results, not crashes.</p>
        </Row>
        <Row n="03" who="Seller" title="Verify the verdict before you settle" file="app/api/data/route.ts" code={SELLER} tip="Replay, tamper and swap attacks fail at steps 12, 5 and 9. Try them from the Lab's seller panel.">
          <p>Saifuro decides; the seller enforces. Check the 12 steps, then settle, then deliver.</p>
        </Row>
        <Row n="04" who="Auditor" title="Re-check what you stored" file="audit.ts" code={RECORD}>
          <p>
            Record mode proves later that a payment was authorized. Load Saifuro&apos;s own sample in the{" "}
            <Link href="/inspector" className="font-medium text-accent hover:underline">
              Inspector
            </Link>
            .
          </p>
        </Row>
      </div>

      <section className="border-t border-line pt-10">
        <div className="kicker">What&apos;s in the box</div>
        <dl className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {FILES.map(([f, d]) => (
            <div key={f} className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_1fr]">
              <dt className="font-mono text-[12.5px] font-medium text-ink">{f}</dt>
              <dd className="text-[13.5px] text-body">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

function Stat({ value, label, href }: { value: string; label: string; href: string }) {
  return (
    <Link href={href} className="group px-6 py-5 transition hover:bg-subtle">
      <div className="text-[26px] font-semibold tracking-[-0.025em] text-ink">{value}</div>
      <div className="mt-0.5 text-[13px] text-muted group-hover:text-body">{label}</div>
    </Link>
  );
}
