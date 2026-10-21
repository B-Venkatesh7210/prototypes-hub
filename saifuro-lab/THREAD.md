# Launch thread (draft)

**1/**
I gave an AI agent a wallet and told it, in its prompt, to keep every purchase under $0.50.

A web page told it to spend $900. It tried.

Here's a lab that shows why spending limits belong in a mandate, not a prompt. Built on @saifuro + x402 on Base 🧵

[video: injection scenario, deny_limit, "nothing signed"]

**2/**
The setup: a research agent buys market data from a paid API over x402. Every call costs 0.001–0.30 USDC, paid per request, gasless, on Base Sepolia.

Before the agent signs anything, it asks Saifuro: does my operator's mandate allow this exact amount, to this recipient, in this category?

**3/**
Saifuro answers with a signed verdict (an ES256 JWT): allow, review, or one of six denials.

On anything but allow, the agent stops before it signs a payment. No signature, no transaction, nothing to claw back.

**4/**
The seller doesn't trust the agent either. Before it settles, it verifies the verdict in 12 steps: signature, issuer, expiry, amount, currency, recipient, nonce…

In the lab you can attack it yourself:
replay → refused at step 12
tamper → step 5
swap a cheap approval onto an expensive item → step 9

**5/**
Six scenarios on the agent side:
• normal research → allow
• prompt injection → deny_limit
• runaway loop → deny_velocity on the 11th call
• $0.30 purchase → review, you approve it, a fresh allow supersedes it
• GPU on a data-only mandate → deny_category
• revoke mid-run → deny_revoked

**6/**
There's also a Verdict Inspector: paste any Saifuro verdict and see every check pass or fail, against their live key set.

It runs all 138 of Saifuro's official test vectors. 138/138, each failing at the exact step the spec says.

**7/**
The kit is reusable:
• wrapFetchWithSaifuro(fetch): authorize before every x402 payment
• createPaidFetchTool(): an AI SDK tool whose denials come back to the model as results it can explain
• verifyVerdict(): the 12 steps for sellers, plus record mode for audits

**8/**
I also wrote down every place the integration rubbed (FRICTION.md). The big one: x402 needs a standard way to carry a verdict, plus canonical amount, currency and recipient formats, or every buyer/seller pair will invent their own.

Code + lab: [repo link]
