import type { Metadata } from "next";
import Link from "next/link";

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
  ["kit/verdict/verify.ts", "The 12-step verifier (settle and record modes). Returns every step's status, not just pass/fail."],
  ["kit/verdict/json.ts", "Strict JSON: duplicate member names rejected at any depth, numbers kept as written."],
  ["kit/verdict/p256.ts", "ES256 with the checks WebCrypto skips: 64-byte R‖S, scalars in [1, n−1], point on curve."],
  ["kit/verdict/decimal.ts", "Amounts compared by decimal value, never as floats. Issuer form: ≤15 integer, ≤6 fraction digits."],
  ["kit/verdict/keys.ts", "JWKS source: HTTPS only, no redirects, 5-minute cache, one refetch on unknown kid."],
  ["kit/verdict/replay.ts", "Nonce + supersedes store interface; memory implementation included."],
  ["kit/client.ts", "Typed REST client: authorize, decisions, mandates, reviews, waitForApproval. Fails closed."],
  ["kit/x402.ts", "wrapFetchWithSaifuro: authorize before signing any x402 payment, attach the verdict."],
  ["kit/ai.ts", "createPaidFetchTool: a Vercel AI SDK tool whose denials are tool results."],
];

function Code({ code }: { code: string }) {
  return <pre className="scroll-thin overflow-x-auto rounded-lg border border-line bg-bg p-4 font-mono text-[12px] leading-relaxed text-text">{code}</pre>;
}

function Section({ n, title, children, code }: { n: string; title: string; children: React.ReactNode; code: string }) {
  return (
    <section className="grid gap-4 border-t border-line py-8 lg:grid-cols-[22rem_1fr]">
      <div>
        <div className="font-mono text-xs text-accent">{n}</div>
        <h2 className="mt-1 text-lg font-semibold text-bright">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
      </div>
      <Code code={code} />
    </section>
  );
}

export default function KitPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-bright">Integration kit</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Everything the Lab runs on, in <code className="text-text">src/kit</code>. The verifier needs nothing but WebCrypto; the buyer side uses the x402 client and, optionally,
        the AI SDK. Saifuro doesn&apos;t ship an SDK yet; this is what one could look like for the three people who integrate it: the agent builder, the seller, and the
        auditor.
      </p>

      <div className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
        <Stat value="138/138" label="official test vectors pass, on the exact step" href="/inspector" />
        <Stat value="0 signed" label="payments when the verdict isn't allow (enforce mode)" href="/" />
        <Stat value="12 steps" label="checked by the seller before it settles" href="/inspector" />
      </div>

      <div className="mt-8">
        <Section n="01 · Agent builder" title="Ask Saifuro before every x402 payment" code={BUYER}>
          <p>
            Wrap <code>fetch</code> once. On a <code>402</code>, the wrapper asks Saifuro with the exact amount, currency and recipient the seller quoted, waits for a person on{" "}
            <code>review</code>, and only signs the x402 payment on <code>allow</code>.
          </p>
          <p>The verdict travels with the payment in a <code>Saifuro-Verdict</code> header, so the seller can check it too.</p>
        </Section>
        <Section n="02 · Agent builder" title="Give a model a wallet it can't overspend" code={AGENT}>
          <p>
            The model decides what to buy; the mandate decides whether it may pay. Denials come back as tool results, so the agent explains them instead of crashing or
            retrying in a loop.
          </p>
          <p>A budget in the prompt is a request. Try the Prompt injection scenario in the Lab to see the difference.</p>
        </Section>
        <Section n="03 · Seller" title="Verify the verdict before you settle" code={SELLER}>
          <p>
            Saifuro decides; it doesn&apos;t move money or block anything itself. The seller is where a verdict becomes enforcement: check the 12 steps first, settle second,
            deliver third.
          </p>
          <p>
            Replay, tamper and swap attacks fail at steps 12, 5 and 9. Try them from the Lab&apos;s seller panel.
          </p>
        </Section>
        <Section n="04 · Auditor" title="Re-check what you stored" code={RECORD}>
          <p>
            Record mode runs the authenticity and timing steps against when you received the token, which is how you prove later that a payment was authorized. Paste
            Saifuro&apos;s own sample into the <Link href="/inspector" className="text-info hover:underline">Inspector</Link> to see it.
          </p>
        </Section>
      </div>

      <section className="border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-bright">What&apos;s in the box</h2>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm">
          {FILES.map(([f, d]) => (
            <div key={f} className="grid gap-1 bg-surface px-4 py-2.5 sm:grid-cols-[14rem_1fr]">
              <dt className="font-mono text-xs text-bright">{f}</dt>
              <dd className="text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

function Stat({ value, label, href }: { value: string; label: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-line-strong">
      <div className="text-xl font-semibold text-bright">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </Link>
  );
}
