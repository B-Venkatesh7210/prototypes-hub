# Relay

Live on-chain ops desk for Solana product teams, built on [Helius](https://www.helius.dev/docs) free-plan APIs.

Two desks, one console:

- **Treasury** — wallet / fintech ops watching hot wallets and company money
- **Protocol** — DeFi on-call watching vaults, tip routers, and admin — not the whole DEX

## Why these products

Free LaserStream cannot carry every Jupiter swap, and it should not. Relay watches the accounts that page you at 3am.

| Layer | Helius product | Job in Relay |
| --- | --- | --- |
| Now | LaserStream WebSocket `logsSubscribe` + `accountSubscribe` | Live wire |
| English | Enhanced Transactions parse | Human-readable cards |
| Book | Wallet API balances / history / transfers | Address dossier |
| Holdings | DAS `getAssetsByOwner` | Token metadata |

Parsed Streams, identity, and funded-by stay behind paid plans. The desk still works without them.

## Run

```bash
cd helius-relay
cp .env.example .env.local
# put HELIUS_API_KEY in .env.local — never commit it
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Video beats

1. Two customers, one infra gap.
2. Treasury desk: a hot-wallet mention lands, inspector shows the English line, dossier opens the USD book.
3. Flip to Protocol: watch the vault, not the program. Failed txs stay on the wire.
4. Close: three free APIs, no indexer. Upgrade unlocks decoded streams and identity.

## Notes

- API key lives only in `.env.local` and is proxied through Next.js routes.
- Enhanced parse is capped at ~2 req/s on Free. Burst traffic is sampled; failures are not.
- Do not subscribe to Jupiter Aggregator on this key.
