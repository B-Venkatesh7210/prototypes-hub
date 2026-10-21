# Friction log: integrating Saifuro with x402

Notes from building the Agent Checkout Lab against the public docs (October 2026). Each item says what happened, where it shows up in this repo, and what would fix it.

Saifuro's [Known gaps](https://docs.saifuro.com/reference/not-built-yet), [Documentation scope](https://docs.saifuro.com/reference/portal-gaps) and [Limits of a signed verdict](https://docs.saifuro.com/reference/verdict-limits) pages already list most of the gaps you'd hit in the first hour: reviews can't be read, there's no policy object, the frequency rule is fixed, and there's no public SDK or sandbox. I don't repeat those here unless x402 makes one bite harder. Those pages, and the 138 test vectors with an expected failing step for each, are the best part of the developer experience. Because every vector names the step it must fail at, my verifier could be checked step by step, not just accept/reject, and it now matches all 138 on the exact step. Few specs make that possible.

---

## 1. There's no agreed way to carry a verdict through x402

**What happened.** x402 v2 has a `PAYMENT-SIGNATURE` header and an `extensions` object on the 402 response, but nothing says where a Saifuro verdict goes. I invented two things:

- a `Saifuro-Verdict` request header on the paid retry (`src/kit/x402.ts`, `VERDICT_HEADER`);
- a `saifuro-verdict` extension on `PAYMENT-REQUIRED`, where the seller states the exact `amount`, `currency` and `recipient` it will compare in steps 9 to 11, plus the issuers it trusts (`SaifuroExtension`).

Every buyer/seller pair will invent their own version of both, and the versions won't interoperate.

**Proposal.** Publish a short x402 profile: the extension name and shape, the header name, and the rule that a seller that advertises the extension refuses to settle without a valid verdict. It's a page of docs and makes "Saifuro-aware seller" a property a buyer can detect from the 402 response alone.

## 2. Every x402 integrator has to invent the same three agreements

The verdict doesn't state the unit, and `recipient` is "a string your integration agrees with the operator". For card or invoice payments that's reasonable. For x402 the answers are already in the 402 response, but each integrator has to rediscover them:

- **Amount.** x402 quotes atomic units (`"amount": "10000"` is 0.01 USDC). Saifuro compares major units in issuer form, at most 6 fraction digits. Converting means reading `extra.decimals`, and an 18-decimal asset can't express amounts below 0.000001 at all (`quoteFrom` in `src/kit/x402.ts`).
- **Currency.** `extra.name` says `"USD Coin"`; mandates say `"USDC"`. The match is exact and case-sensitive, so someone has to map it.
- **Recipient.** `payTo` is an EVM address. A checksummed address and a lowercase one are different strings, and step 11 is an exact match. One side normalizing and the other not is a silent `deny` at the seller.

**Proposal.** In the same x402 profile, define the canonical forms: major units derived from the asset's decimals, currency as the asset symbol (or a CAIP-19 id), and recipient as lowercase CAIP-10 (`eip155:84532:0x8496…`). Three sentences in the docs would remove a class of production mismatches.

## 3. A verdict can't be tied to a specific x402 payment

The signed claims bind amount, currency and recipient. `metadata` is returned "unread in the decision", and isn't in the token. So an allow for 0.01 USDC to a seller is valid for *any* 0.01 USDC purchase from that seller in the next five minutes: another resource at the same price, or a second request racing the first. The seller's nonce store prevents double use, but not use for the wrong item. The Lab's swap attack only fails because the two datasets have different prices (step 9).

**Proposal.** An optional `request.reference` string, signed into the verdict and echoed exactly, for example the x402 `resource.url` or a hash of the `PaymentRequirements`. Sellers that care compare it; everyone else ignores it. It also gives auditors the "what was bought" link the decision log lacks today.

## 4. Reviews meet a synchronous protocol

x402 is request/response. A `review` can last 24 hours, the resulting `allow` lasts 5 minutes, and the seller's `maxTimeoutSeconds` is usually shorter than either. In practice the agent has to park the purchase, wait, then fetch a fresh 402 and present the approval. That part is fine, and `wrapFetchWithSaifuro` does it.

The wait is the friction. With an agent key, the only signal is polling `GET /v1/decisions?verdict=allow&from=<review issued_at>` and matching `supersedes` on the client (`waitForApproval` in `src/kit/client.ts`), because:

- there's no `supersedes` filter on `GET /v1/decisions`, only `agent`, `mandate`, `verdict`, `mode`, `from` and `to`;
- a **denied** or **expired** review produces no decision at all, and the `decision.resolved` webhook goes to the operator's backend, not the agent. So the agent can't tell "denied" from "still pending" and waits for its own timeout.

The review being unreadable is on the Known gaps page; what x402 adds is that the agent waiting on it is mid-purchase.

**Proposal.** In order of cost: a `supersedes` filter on `GET /v1/decisions`; then let an agent key read the status of reviews raised on its own decisions (`pending | approved | denied | expired`). Either one turns the agent's wait into a single targeted poll.

## 5. Step 8 assumes the seller knows the operator

The seller is told to accept only mandate ids that the paying operator gave it, because any Saifuro customer can get an `allow` for any recipient. That's correct, and it fits B2B procurement. But x402's main case is an open API that anyone can pay per request, with no onboarding. An open seller has no list of mandate ids, so step 8 is either skipped or replaced with "trust any mandate", and the docs don't say which.

The Lab cheats here: `issueMandate` registers each new mandate with the seller (`agreeMandate`), standing in for an onboarding step.

**Proposal.** Say what a verdict is worth to a seller with no operator relationship. My reading is that it's mostly protection for the *buyer's* operator plus an audit record for the seller, not a guarantee of being paid. If that's right, the accept-approvals guide should have an "open seller" variant that keeps steps 1–7 and 9–12 and states plainly what skipping 8 gives up.

## 6. The fixed frequency rule bites pay-per-call first

More than 10 decisions from an agent in 60 seconds is `deny_velocity`, and the threshold is fixed (Known gaps). With invoices that's generous. With x402 every API call is a payment and so an authorization: an honest agent paging through a 0.001 USDC price feed hits it within a minute (the runaway scenario shows it). Denials count too, so a client that retries on `deny_velocity` extends its own lockout.

**Proposal.** A per-mandate `velocity` override would be ideal. Until then, document in the decision codes that `deny_velocity` should be handled as back-off-until-window-clears, never retry-now, and suggest batching paid calls.

## 7. Nothing to build against before onboarding

There's no public sandbox (by design, per Documentation scope), so to build this I wrote an emulator of the documented API (`src/lib/emulator`, about 650 lines). The docs were precise enough that I'm fairly confident it matches. But "fairly confident" is where integration bugs come from, and every prospective integrator would repeat this work.

**Proposal.** Publish a reference emulator, or a mock server generated from the OpenAPI description, that signs with a clearly local `sandbox-local-*` key. It can't authorize anything real, so it gives nothing away, and it would let evaluations start before the sales call instead of after it.

## Small things

- **The sample verdict in the docs has expired**, so it only validates in record mode with an explicit received-at time. The Inspector loads it that way. A sentence pointing readers to record mode would save a confused first try.
- **`protocol` is accepted on authorizations but isn't in the decision or the verdict.** That's documented, but it means the `x402` label can't be read back per decision, only through `/v1/usage`. I expected `GET /v1/decisions/{id}` to echo it.
- **The sandbox and production keys share one JWKS** (deliberate and documented). The only guard is the `sandbox-` prefix check, which is easy to forget, so I made `testingOnly` an explicit option in the kit's verifier that defaults to rejecting sandbox keys.
