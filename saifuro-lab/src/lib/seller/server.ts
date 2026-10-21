import "server-only";
import { randomBytes } from "node:crypto";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { memoryReplayStore, remoteKeySource, SAIFURO_ISSUER, SAIFURO_JWKS_URL, verifyVerdict, type Check, type KeySource } from "@/kit/verdict/index.ts";
import { SAIFURO_EXTENSION, VERDICT_HEADER, type SaifuroExtension } from "@/kit/x402.ts";
import { toUnits } from "@/kit/verdict/decimal.ts";
import { emulatorIssuer } from "@/lib/emulator/store";
import { facilitatorUrl, NETWORK, paymentsMode, sellerAddress, USDC_BASE_SEPOLIA } from "@/lib/payments";
import { datasetById, deliver, type Dataset } from "./catalog";

export type SellerEvent = {
  id: string;
  at: string;
  dataset: string;
  price: string;
  agent?: string;
  decision?: string;
  verdict?: string;
  checks?: Check[];
  outcome: "quoted" | "delivered" | "rejected";
  reason?: string;
  payment?: { status: "settled" | "simulated" | "failed" | "not_attempted"; transaction?: string; payer?: string; error?: string };
  label?: string;
};

type SellerState = {
  server: Promise<x402ResourceServer> | null;
  agreedMandates: Set<string>;
  log: SellerEvent[];
  issuers: Record<string, KeySource> | null;
  replay: ReturnType<typeof memoryReplayStore>;
};

const g = globalThis as { __seller?: SellerState };
const state: SellerState = (g.__seller ??= { server: null, agreedMandates: new Set(), log: [], issuers: null, replay: memoryReplayStore() });

/** The operator gives the seller its mandate ids out of band (step 8). The lab does it when it creates one. */
export function agreeMandate(id: string) {
  state.agreedMandates.add(id);
}

export function sellerLog(agent?: string) {
  return state.log.filter((e) => !agent || e.agent === agent).slice(-60);
}

function record(e: Omit<SellerEvent, "id" | "at">): SellerEvent {
  const full = { id: `sev_${randomBytes(4).toString("hex")}`, at: new Date().toISOString(), ...e };
  state.log.push(full);
  if (state.log.length > 1000) state.log.splice(0, state.log.length - 1000);
  return full;
}

function issuers(): Record<string, KeySource> {
  state.issuers ??= {
    [emulatorIssuer()]: remoteKeySource(`${emulatorIssuer()}/.well-known/jwks.json`),
    [SAIFURO_ISSUER]: remoteKeySource(SAIFURO_JWKS_URL),
  };
  return state.issuers;
}

function resourceServer(): Promise<x402ResourceServer> {
  state.server ??= (async () => {
    const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl() })).register(NETWORK, new ExactEvmScheme());
    await server.initialize();
    return server;
  })().catch((e) => {
    state.server = null;
    throw e;
  });
  return state.server;
}

async function requirementsFor(d: Dataset, payTo: string): Promise<PaymentRequirements[]> {
  try {
    const server = await resourceServer();
    return await server.buildPaymentRequirements({ scheme: "exact", network: NETWORK, payTo, price: `$${d.price}`, maxTimeoutSeconds: 300 });
  } catch {
    // Facilitator unreachable: the same requirements by hand, for simulated mode.
    return [
      { scheme: "exact", network: NETWORK, asset: USDC_BASE_SEPOLIA, amount: toUnits(d.price, 6).toString(), payTo, maxTimeoutSeconds: 300, extra: { name: "USDC", version: "2" } },
    ];
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

export async function handlePaidRequest(req: Request, id: string): Promise<Response> {
  const d = datasetById(id);
  if (!d) return json(404, { error: "unknown dataset" });
  const payTo = sellerAddress() ?? "0x0000000000000000000000000000000000000402";
  const accepts = await requirementsFor(d, payTo);
  const recipient = accepts[0].payTo;
  const signature = req.headers.get("payment-signature");

  if (!signature) {
    const resource = { url: req.url, description: d.title, mimeType: "application/json" };
    let required;
    try {
      required = await (await resourceServer()).createPaymentRequiredResponse(accepts, resource);
    } catch {
      required = { x402Version: 2, resource, accepts };
    }
    const ext: SaifuroExtension = { amount: d.price, currency: "USDC", recipient, category: d.category, issuers: Object.keys(issuers()) };
    required = { ...required, error: "Payment required", extensions: { ...(required.extensions ?? {}), [SAIFURO_EXTENSION]: ext } };
    record({ dataset: d.id, price: d.price, outcome: "quoted", label: "402 Payment Required" });
    return json(402, required, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required) });
  }

  const token = req.headers.get(VERDICT_HEADER);
  const label = req.headers.get("x-lab-label") ?? undefined;
  if (!token) {
    const e = record({ dataset: d.id, price: d.price, outcome: "rejected", reason: "no Saifuro verdict attached", payment: { status: "not_attempted" }, label });
    return json(403, { error: "verdict_required", message: `Attach a Saifuro verdict in the ${VERDICT_HEADER} header`, event: e });
  }

  // 1. The verdict: twelve steps, before any money moves.
  const v = await verifyVerdict(token, {
    issuers: issuers(),
    payment: { amount: d.price, currency: "USDC", recipient },
    agreedMandates: [...state.agreedMandates],
    testingOnly: true,
    replay: state.replay,
  });
  const claims = v.claims as { request?: { agent?: string }; jti?: string; verdict?: string } | undefined;
  const who = { agent: claims?.request?.agent, decision: claims?.jti, verdict: claims?.verdict };
  if (!v.valid) {
    const e = record({ dataset: d.id, price: d.price, ...who, checks: v.checks, outcome: "rejected", reason: `step ${v.step}: ${v.reason}`, payment: { status: "not_attempted" }, label });
    return json(403, { error: "verdict_rejected", step: v.step, message: v.reason, checks: v.checks, event: e });
  }

  // 2. The payment, through the x402 facilitator.
  let settle: SettleResponse;
  const mode = await paymentsMode();
  try {
    const payload = decodePaymentSignatureHeader(signature);
    if (mode.mode === "live") {
      const server = await resourceServer();
      const match = server.findMatchingRequirements(accepts, payload);
      if (!match) throw new Error("payment does not match this resource's requirements");
      const verified = await server.verifyPayment(payload, match);
      if (!verified.isValid) throw new Error(verified.invalidMessage || verified.invalidReason || "payment invalid");
      settle = await server.settlePayment(payload, match);
      if (!settle.success) throw new Error(settle.errorMessage || settle.errorReason || "settlement failed");
    } else {
      const auth = (payload.payload as { authorization?: { from?: string } }).authorization;
      settle = { success: true, transaction: "", network: NETWORK, payer: auth?.from };
    }
  } catch (err) {
    const e = record({
      dataset: d.id,
      price: d.price,
      ...who,
      checks: v.checks,
      outcome: "rejected",
      reason: `payment: ${(err as Error).message}`,
      payment: { status: "failed", error: (err as Error).message },
      label,
    });
    return json(402, { error: "payment_failed", message: (err as Error).message, checks: v.checks, event: e });
  }

  const data = await deliver(d.id).catch((err: Error) => ({ error: `source unavailable: ${err.message}` }));
  const e = record({
    dataset: d.id,
    price: d.price,
    ...who,
    checks: v.checks,
    outcome: "delivered",
    payment: { status: mode.mode === "live" ? "settled" : "simulated", transaction: settle.transaction || undefined, payer: settle.payer },
    label,
  });
  return json(
    200,
    { dataset: d.id, title: d.title, untrusted: d.untrusted ?? false, data, receipt: { decision: who.decision, transaction: settle.transaction || null, network: NETWORK, simulated: mode.mode !== "live" }, event: e.id },
    { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle) },
  );
}
