"use client";

import { CodeBlock } from "@/components/ui/CodeBlock";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { ADDRESSES_PROVIDER, POOL } from "@/lib/aave/constants";
import { useMarket } from "@/lib/client/hooks";
import type { Blueprint } from "@/lib/types";
import { embeddedSnippet, omnibusClientSnippet, omnibusServerSnippet, widgetSnippet } from "./snippets";

export function IntegrateTab({ bp }: { bp: Blueprint }) {
  const asset = bp.recommendation.asset;
  const { market } = useMarket(asset);
  const embedded = bp.recommendation.custody === "embedded";

  const contracts = [
    { label: "Aave v3 Pool", address: POOL },
    { label: "PoolAddressesProvider", address: ADDRESSES_PROVIDER },
    { label: asset, address: market?.address },
    { label: `a${asset} (interest-bearing)`, address: market?.aToken },
  ];

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-8">
        <Step n={1} title="Render the Earn screen" body={`One component, themed for ${bp.partner.name}. Copy src/widget into the app: it needs React, and viem for the adapter.`}>
          <CodeBlock title="EarnScreen.tsx" code={widgetSnippet(bp)} />
        </Step>

        {embedded ? (
          <Step
            n={2}
            title="Connect the user's embedded wallet"
            body="Users hold their own keys through an embedded wallet. The adapter checks the allowance, sends approve only when needed, then supply. With a smart wallet, both can be batched into one signature."
          >
            <CodeBlock title="earn-adapter.ts" code={embeddedSnippet(bp, market)} />
          </Step>
        ) : (
          <>
            <Step
              n={2}
              title="Supply from a pooled treasury"
              body={`${bp.partner.name} keeps today's custody model. One treasury wallet holds the a${asset}; the ledger stores each user's scaled balance, the same trick aTokens use, so interest needs no per-user writes.`}
            >
              <CodeBlock title="server/earn.ts" code={omnibusServerSnippet(bp, market)} />
            </Step>
            <Step n={3} title="Point the widget at your backend" body="The widget stays identical; only the adapter changes.">
              <CodeBlock title="earn-adapter.ts" code={omnibusClientSnippet()} />
            </Step>
          </>
        )}

        <Step
          n={embedded ? 3 : 4}
          title="Test on a fork before mainnet"
          body="Run the exact flow against a local copy of Base with real Aave state. This studio's Live preview tab is doing exactly that."
        >
          <CodeBlock
            title="terminal"
            lang="bash"
            code={`# Foundry: https://getfoundry.sh
anvil --fork-url https://mainnet.base.org --chain-id 8453 --block-time 2

# point the app at the fork
FORK_RPC_URL=http://127.0.0.1:8545 npm run dev`}
          />
        </Step>
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-32">
        <Card className="p-5">
          <Eyebrow>Contracts · Base (8453)</Eyebrow>
          <ul className="mt-3 space-y-3">
            {contracts.map((c) => (
              <li key={c.label}>
                <p className="text-xs text-muted">{c.label}</p>
                {c.address ? (
                  <a
                    href={`https://basescan.org/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[0.75rem] break-all text-bright hover:text-[#7fe3ea]"
                  >
                    {c.address}
                  </a>
                ) : (
                  <p className="font-mono text-xs text-dim">loading…</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-dim">Read live from the PoolAddressesProvider, not hardcoded from docs.</p>
        </Card>

        <Card className="p-5">
          <Eyebrow>On-chain, per deposit</Eyebrow>
          <ol className="mt-3 space-y-2.5 text-sm text-muted">
            <li>
              <span className="text-bright">1. approve</span> lets the Pool pull {asset}. Skipped when the allowance already covers it.
            </li>
            <li>
              <span className="text-bright">2. supply</span> moves {asset} into the Pool and mints a{asset} 1:1.
            </li>
            <li>
              <span className="text-bright">3. accrue</span>: a{asset} balances grow every second with the liquidity index. No claiming.
            </li>
            <li>
              <span className="text-bright">4. withdraw</span> burns a{asset} and returns {asset} plus interest.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-dim">0{n}</span>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-1.5 mb-4 max-w-3xl text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}
