# Partner Studio for Aave

Paste a company's website. In about a minute you get:

- **Their own app with an Aave Earn account inside it**, in their brand colours, running **real transactions against the real Aave v3 contracts on a fork of Base**. Deposit, fast-forward 30 days, watch the interest.
- **`<AaveEarn />`**, a drop-in React widget: one file, no CSS framework, no wallet code. An adapter connects it to the partner's wallet layer.
- **Integration code** for their custody model (embedded wallets or a pooled omnibus treasury), filled in with live contract addresses.
- **An architecture**, a **business case on live rates** (including how much their deposits would move the market rate), **risks**, a **rollout plan** and **questions for the first call**.
- A **share link** and a **Markdown one-pager** for the CRM.

Built as a Solutions Engineering prototype: the work of turning "a partner is interested" into "here is your integration, running" compressed into one link.

> Independent prototype, not affiliated with Aave Labs.

## Run it

```bash
cd aave-partner-studio
npm install
npm run dev            # http://localhost:3000
```

That's enough to use everything: live market data comes from Base's public RPC, analysis uses templates, and the preview simulates deposits at the live Aave rate.

### Real transactions (recommended for demos)

Install [Foundry](https://getfoundry.sh) for `anvil`, then in a second terminal:

```bash
npm run fork           # anvil --fork-url https://mainnet.base.org --chain-id 8453 --block-time 2
```

and add to `.env.local`:

```bash
FORK_RPC_URL=http://127.0.0.1:8545
```

The header shows **Base fork** when it's connected. Each browser gets a throwaway wallet funded with 10,000 of the chosen stablecoin. For a hosted demo, use a [Tenderly Virtual TestNet](https://docs.tenderly.co/virtual-testnets) forked from Base instead; the sandbox detects it and uses Tenderly's balance methods.

### AI analysis (optional, free)

Without a key, a keyword classifier and templates build the blueprint. With a key, an LLM reads the partner's site and writes a sharper, company-specific blueprint. Every field it returns is validated and falls back to the template if it's invalid (unknown asset, out-of-range numbers, bad enums).

Any OpenAI-compatible endpoint works. The default is Gemini's free tier:

```bash
AI_API_KEY=...         # https://aistudio.google.com/apikey
# AI_MODEL=gemini-2.5-flash
# AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

Groq or OpenRouter work by changing `AI_BASE_URL` and `AI_MODEL` (for Groq's free plan: `https://api.groq.com/openai/v1` and `openai/gpt-oss-120b`). Blueprints are cached per company for 7 days and each visitor gets 20 AI analyses a day (`AI_ANALYSES_PER_DAY`), so a busy demo doesn't drain the free quota.

## How it works

```
Partner website ──► /api/analyze ──► blueprint (.data/blueprints/<id>.json) ──► /p/<id>
                     │  safe fetch (no private IPs, 1.5 MB cap, 3 redirects)
                     │  templates ─► optional LLM ─► field-by-field validation
                     └─ live Aave markets (/api/markets)

/p/<id> Live preview: <AaveEarn adapter={forkAdapter | simulatedAdapter} />
                         │
                         └─► /api/sandbox ─► Anvil / Tenderly fork of Base
                               approve ─► Pool.supply ─► evm_increaseTime ─► Pool.withdraw
```

- **Live data** (`src/lib/server/markets.ts`): resolves the Pool and oracle from Aave's `PoolAddressesProvider` on Base, then reads every reserve in two multicalls: rates, aToken and debt totals, oracle prices, and the packed configuration (LTV, reserve factor, supply cap, frozen/paused). Cached for 60 s.
- **Widget** (`src/widget/`): self-contained so it could be published as its own package. `AaveEarn.tsx` is the UI; `aave.ts` has `readPosition`, `approveIfNeeded`, `supply` and `withdraw` on viem; `viemAdapter.ts` is a ready adapter for any viem `WalletClient` (Privy, Dynamic, Coinbase Smart Wallet, wagmi). The sandbox server uses the same helpers, so the code shown to partners is the code that runs in the demo.
- **Sandbox** (`src/lib/server/sandbox.ts`): a wallet per browser session, derived from a server secret so nothing is stored. Funding on Anvil impersonates the asset's aToken (which holds the market's liquidity); on Tenderly it uses `tenderly_setErc20Balance`. Fork-wide cheat calls are serialized. Fast-forward uses `evm_increaseTime` + `evm_mine`; aToken balances read Aave's time-based liquidity index, so interest appears on the next block.
- **Business case**: deposits from users × adoption × balance; partner revenue as a fee on yield (Aave pays no referral fee); rate impact as an upper bound `apy × S / (S + D)`; supply-cap headroom from the reserve configuration.

## Layout

```
src/app/                 landing, /p/[id] blueprint, /widget playground, API routes
src/widget/              AaveEarn widget, Aave helpers, viem adapter (portable)
src/lib/server/          markets, site fetch, analysis + AI, sandbox, blueprint store
src/lib/client/          shared fetch hooks, demo adapters (fork + simulated)
src/components/blueprint preview, integration code, architecture, business case, risks
```

## Checked end to end

- Live reserves on Base (USDC ≈ 4.5% on ~$182M, EURC, GHO; USDbC is frozen and excluded).
- Fork: fund 10,000 USDC → approve → supply 1,000 → +30 days → 1,003.60 aUSDC → withdraw max. Same for EURC and GHO.
- Browser: build `deel.com` from the landing page → deposit 2,500 in the widget → +30 days shows $9.06 interest → withdraw everything.
- AI path against a mock OpenAI-compatible server, including invalid fields (unknown asset, 1 trillion users, 90% fee) falling back or clamping.

## Demo video (60 s)

1. Landing: paste `nubank.com.br`, click **Build integration**. Show the live rates strip.
2. Nubank's app appears in their purple with an Earn card. Deposit $2,500: approve, then supply, with transaction hashes in Activity.
3. Click **+30 days**. The balance jumps and the interest ticker keeps counting.
4. **Integration code**: their widget config, the omnibus backend with scaled balances, and live contract addresses.
5. **Business case**: drag adoption; show "APY after these deposits" and the supply-cap headroom.
6. **Copy one-pager**, paste into Notion. End on the share link.

## Tweet thread

1. I built the tool I'd want on day one as a Solutions Engineer at @aave. Paste any fintech's website and get their own app with Aave Earn inside, running real transactions on a fork of Base. 60 seconds. 🧵
2. Video.
3. How: it reads the site, classifies the business, and matches it to a live Aave v3 market. USDC on Base is paying ~4.5% on ~$180M right now, read straight from the Pool contract.
4. The Earn card is `<AaveEarn />`: one React file, no CSS framework, no wallet code. Partners pass an adapter for their wallet layer, whether that's embedded wallets or a pooled treasury.
5. The part I'm proudest of: omnibus partners get a backend that stores *scaled* balances (amount ÷ liquidity index), the same trick aTokens use. Interest accrues for every user with zero writes.
6. The business case asks the question a partner's risk team will: how much would our deposits move the rate? Supply APY after deposits ≤ apy × S / (S + D), plus supply-cap headroom from the reserve config.
7. The AI is optional and boxed in: it can only choose from live markets and valid enums, and every field is validated. No key? Templates still produce a full blueprint.
8. Code: <repo link>. Built for the Aave Solutions Engineer role. Would love feedback from the @aave team.

## Notes

- Blueprints are stored in `.data/` (gitignored). On serverless hosts that disk is temporary; swap `src/lib/server/store.ts` for KV or a database to keep share links permanent.
- Fast-forward on a shared fork moves the clock for everyone using it. That's fine for a demo; use one fork per presenter for parallel demos.
- The simulated mode compounds per second at the live APY; it doesn't model utilization changes from your own deposits.
