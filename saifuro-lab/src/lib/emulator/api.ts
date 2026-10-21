import "server-only";
import { createHash, createHmac } from "node:crypto";
import { approvalBlocker, decide, isExpired, publicDecision } from "./engine";
import { emulator, hashKey, hex, hint, save, type AgentRecord, type DecisionRecord, type EmulatorState, type MandateRecord } from "./store";

type Caller = { kind: "org"; keyHash: string } | { kind: "agent"; keyHash: string; agent: AgentRecord };
type Code = "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "idempotency_conflict" | "rate_limited" | "server_error";

class ApiError extends Error {
  readonly status: number;
  readonly code: Code;
  constructor(status: number, code: Code, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bad = (message: string) => new ApiError(400, "invalid_request", message);
const notFound = (what: string) => new ApiError(404, "not_found", `No such ${what}`);
const PROTOCOLS = ["x402", "mpp", "acp", "ap2", "card"];
const VERDICTS = ["allow", "review", "deny_limit", "deny_velocity", "deny_category", "deny_expired", "deny_revoked", "deny_no_mandate"];

function json(status: number, body: unknown, requestId: string) {
  return Response.json(body, { status, headers: { "X-Request-Id": requestId } });
}

function authenticate(state: EmulatorState, header: string | null): Caller {
  const m = header?.match(/^Bearer\s+(\S+)$/);
  if (!m) throw new ApiError(401, "unauthorized", "Missing or revoked key. Keys are issued at onboarding: https://docs.saifuro.com/deployment/getting-access");
  const h = hashKey(m[1]);
  if (h === state.orgKeyHash) return { kind: "org", keyHash: h };
  const agent = state.agents.find((a) => a.keyHashes.includes(h));
  if (agent) return { kind: "agent", keyHash: h, agent };
  throw new ApiError(401, "unauthorized", "Missing or revoked key.");
}

const requireOrg = (c: Caller) => {
  if (c.kind !== "org") throw new ApiError(403, "forbidden", "This endpoint needs an organization key");
};

function fields(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw bad("body must be a JSON object");
  const unknown = Object.keys(body).find((k) => !allowed.includes(k));
  if (unknown) throw bad(`unknown field: ${unknown}`);
  return body as Record<string, unknown>;
}

function text(v: unknown, name: string, max: number, required = true): string | undefined {
  if (v === undefined && !required) return undefined;
  if (typeof v !== "string" || !v) throw bad(`${name} is required`);
  if (v.length > max) throw bad(`${name} must be at most ${max} characters`);
  return v;
}

function amount(v: unknown, name: string, required = true): number | undefined {
  if (v === undefined && !required) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw bad(`${name} must be a number`);
  if (v <= 0 || v >= 1e15) throw bad(`${name} must be greater than 0 and less than 10^15`);
  if (!/^\d+(\.\d{1,6})?$/.test(String(v))) throw bad(`${name} has more than six decimal places`);
  return v;
}

function metadata(v: unknown): Record<string, string> | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw bad("metadata must be an object");
  const entries = Object.entries(v);
  if (entries.length > 20 || entries.some(([, x]) => typeof x !== "string")) throw bad("metadata takes up to 20 string keys");
  return v as Record<string, string>;
}

function publicAgent(a: AgentRecord) {
  return { agent: a.agent, name: a.name, status: a.status, created_at: a.created_at, ...(a.metadata ? { metadata: a.metadata } : {}), key_hint: a.keyHint };
}

function mandateStatus(m: MandateRecord): MandateRecord {
  return m.status === "active" && isExpired(m, Date.now()) ? { ...m, status: "expired" as never } : m;
}

/** Signed, filter-bound, 24-hour cursors (API › Pagination). */
function paginate<T>(state: EmulatorState, items: T[], query: URLSearchParams, scope: string) {
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) {
    throw bad("limit must be an integer between 1 and 100");
  }
  const filters = [...query.entries()].filter(([k]) => k !== "cursor" && k !== "limit").sort().map((e) => e.join("="));
  const bind = createHash("sha256").update(`${scope}|${filters.join("&")}`).digest("hex").slice(0, 16);
  const mac = (s: string) => createHmac("sha256", state.cursorSecret).update(s).digest("base64url").slice(0, 22);
  let offset = 0;
  const cursor = query.get("cursor");
  if (cursor) {
    const [body, sig] = cursor.replace(/^cur_/, "").split(".");
    const parsed = body && sig === mac(body) ? (JSON.parse(Buffer.from(body, "base64url").toString()) as { o: number; b: string; t: number }) : null;
    if (!parsed || parsed.b !== bind || Date.now() - parsed.t > 86_400_000) throw bad("cursor expired or malformed");
    offset = parsed.o;
  }
  const data = items.slice(offset, offset + limit);
  const has_more = offset + limit < items.length;
  if (!has_more) return { data, has_more };
  const body = Buffer.from(JSON.stringify({ o: offset + limit, b: bind, t: Date.now() })).toString("base64url");
  return { data, has_more, next_cursor: `cur_${body}.${mac(body)}` };
}

async function route(state: EmulatorState, method: string, parts: string[], query: URLSearchParams, body: unknown, caller: Caller, idemKey: string | null) {
  const [resource, id, action, sub] = parts;
  const path = `/v1/${parts.join("/")}`;
  const unsupported = () => bad(`${method} is not supported on ${path}`);
  const iso = () => new Date().toISOString();

  if (resource === "agents") {
    requireOrg(caller);
    if (!id) {
      if (method === "GET") {
        const status = query.get("status");
        return paginate(state, state.agents.filter((a) => !status || a.status === status).map(publicAgent).reverse(), query, "org");
      }
      if (method !== "POST") throw unsupported();
      const f = fields(body, ["name", "metadata"]);
      const name = text(f.name, "name", 64)!;
      if (!/^[a-z0-9_]+$/.test(name)) throw bad("name must be a lowercase slug");
      if (state.agents.some((a) => a.name === name)) throw bad(`an agent named ${name} already exists`);
      const key = `ak_sandbox_${hex(16)}`;
      const agent: AgentRecord = { agent: `agt_${name}`, name, status: "active", created_at: iso(), metadata: metadata(f.metadata), keyHashes: [hashKey(key)], keyHint: hint(key) };
      state.agents.push(agent);
      return { status: 201, body: { ...publicAgent(agent), agent_key: key } };
    }
    const agent = state.agents.find((a) => a.agent === id);
    if (!agent) throw notFound("agent");
    if (!action && method === "GET") return publicAgent(agent);
    if (method !== "POST") throw unsupported();
    if (action === "disable" || action === "enable") {
      agent.status = action === "disable" ? "disabled" : "active";
      return publicAgent(agent);
    }
    if (action === "keys" && sub === "rotate") {
      const key = `ak_sandbox_${hex(16)}`;
      agent.keyHashes = [hashKey(key)];
      agent.keyHint = hint(key);
      return { ...publicAgent(agent), agent_key: key };
    }
    throw unsupported();
  }

  if (resource === "mandates") {
    requireOrg(caller);
    if (!id) {
      if (method === "GET") {
        const [agent, principal, status] = ["agent", "principal", "status"].map((k) => query.get(k));
        const list = state.mandates
          .map(mandateStatus)
          .filter((m) => (!agent || m.agent === agent) && (!principal || m.principal === principal) && (!status || m.status === status))
          .reverse();
        return paginate(state, list, query, "org");
      }
      if (method !== "POST") throw unsupported();
      const f = fields(body, ["principal", "agent", "limits", "categories", "review_above", "expires", "escrow"]);
      const principal = text(f.principal, "principal", 256)!;
      const agentId = text(f.agent, "agent", 128)!;
      if (!state.agents.some((a) => a.agent === agentId)) throw bad(`agent ${agentId} does not exist`);
      const limits = fields(f.limits ?? {}, ["per_transaction", "per_month", "currency"]);
      const per_transaction = amount(limits.per_transaction, "limits.per_transaction")!;
      const per_month = amount(limits.per_month, "limits.per_month", false);
      const currency = text(limits.currency, "limits.currency", 128)!;
      if (!Array.isArray(f.categories) || f.categories.length === 0) throw bad("categories is required");
      const categories = f.categories.map((c, i) => text(c, `categories[${i}]`, 128)!);
      const review_above = amount(f.review_above, "review_above", false);
      const expires = text(f.expires, "expires", 10)!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(expires))) throw bad("expires must be a date, YYYY-MM-DD");
      const escrow = f.escrow === undefined ? undefined : { required_above: text(fields(f.escrow, ["required_above"]).required_above, "escrow.required_above", 64)! };
      const m: MandateRecord = {
        mandate: `mnd_${hex(4)}`,
        principal,
        agent: agentId,
        limits: { per_transaction, ...(per_month !== undefined ? { per_month } : {}), currency },
        categories,
        ...(review_above !== undefined ? { review_above } : {}),
        expires,
        ...(escrow ? { escrow } : {}),
        status: "active",
        created_at: iso(),
      };
      state.mandates.push(m);
      return { status: 201, body: m };
    }
    const m = state.mandates.find((x) => x.mandate === id);
    if (!m) throw notFound("mandate");
    if (!action && method === "GET") return mandateStatus(m);
    if (action === "revoke" && method === "POST") {
      if (m.status !== "revoked") Object.assign(m, { status: "revoked", revoked_at: iso() });
      return m;
    }
    throw unsupported();
  }

  if (resource === "authorizations") {
    if (id || method !== "POST") throw unsupported();
    const f = fields(body, ["amount", "currency", "recipient", "category", "protocol", "agent", "metadata"]);
    let agent: string;
    if (caller.kind === "agent") agent = caller.agent.agent;
    else {
      agent = text(f.agent, "agent", 128)!;
      if (!state.agents.some((a) => a.agent === agent)) throw notFound("agent");
    }
    const protocol = text(f.protocol, "protocol", 16, false);
    if (protocol && !PROTOCOLS.includes(protocol)) throw bad(`protocol must be one of ${PROTOCOLS.join(", ")}`);
    const request = {
      agent,
      amount: amount(f.amount, "amount")!,
      currency: text(f.currency, "currency", 128)!,
      recipient: text(f.recipient, "recipient", 1024)!,
      category: text(f.category, "category", 128)!,
    };
    const d = await decide(state, request, { metadata: metadata(f.metadata), protocol });
    return { status: 201, body: publicDecision(d), idem: idemKey };
  }

  if (resource === "decisions") {
    if (method !== "GET") throw unsupported();
    const visible = (d: DecisionRecord) => caller.kind === "org" || d.request.agent === caller.agent.agent;
    if (id) {
      const d = state.decisions.find((x) => x.decision === id);
      if (!d || !visible(d)) throw notFound("decision");
      return publicDecision(d);
    }
    const [agent, mandate, verdict, mode, from, to] = ["agent", "mandate", "verdict", "mode", "from", "to"].map((k) => query.get(k));
    if (verdict && !VERDICTS.includes(verdict)) throw bad(`verdict must be one of ${VERDICTS.join(", ")}`);
    const fromT = from ? Date.parse(from) : -Infinity;
    const toT = to ? Date.parse(to) : Infinity;
    const list = state.decisions
      .filter(
        (d) =>
          visible(d) &&
          (!agent || d.request.agent === agent) &&
          (!mandate || d.mandate === mandate) &&
          (!verdict || d.verdict === verdict) &&
          (!mode || d.mode === mode) &&
          Date.parse(d.issued_at) >= fromT &&
          Date.parse(d.issued_at) <= toT,
      )
      .reverse()
      .map(publicDecision);
    return paginate(state, list, query, caller.kind === "org" ? "org" : caller.agent.agent);
  }

  if (resource === "reviews") {
    requireOrg(caller);
    if (method !== "POST" || !id || (action !== "approve" && action !== "deny")) throw unsupported();
    const review = state.reviews.find((r) => r.review === id);
    if (!review) throw notFound("review");
    if (review.status !== "pending" || Date.parse(review.expires_at) <= Date.now()) throw bad(`review ${id} is not pending`);
    const original = state.decisions.find((d) => d.decision === review.decision)!;
    if (action === "deny") {
      review.status = "denied";
      return { review: id, status: "denied" };
    }
    const blocker = approvalBlocker(state, original, Date.now());
    if (blocker) throw bad(`review ${id} cannot be approved: ${blocker}`);
    const mandate = state.mandates.find((m) => m.mandate === original.mandate)!;
    const d = await decide(state, original.request, {
      supersedes: original.decision,
      metadata: original.metadata,
      protocol: original.protocol,
      outcome: { verdict: "allow", reason: `review ${id} approved under mandate ${mandate.mandate}`, mandate },
    });
    review.status = "approved";
    return { status: 201, body: publicDecision(d) };
  }

  if (resource === "enforcement") {
    requireOrg(caller);
    if (method === "GET") return { mode: state.mode };
    if (method !== "POST") throw unsupported();
    const f = fields(body, ["mode"]);
    if (f.mode !== "observe" && f.mode !== "enforce") throw bad("mode must be observe or enforce");
    state.mode = f.mode;
    return { mode: state.mode };
  }

  throw new ApiError(404, "not_found", `${path} is not available in the local emulator`);
}

export async function handleEmulator(req: Request, parts: string[]): Promise<Response> {
  const requestId = `req_${hex(8)}`;
  const state = await emulator();
  try {
    const caller = authenticate(state, req.headers.get("authorization"));
    const raw = req.method === "GET" ? "" : await req.text();
    if (raw.length > 64 * 1024) throw bad("body larger than 64 KB");
    let body: unknown = undefined;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw bad("body is not valid JSON");
      }
    }

    const idemKey = req.method === "POST" ? req.headers.get("idempotency-key") : null;
    if (idemKey && idemKey.length > 255) throw bad("Idempotency-Key must be at most 255 characters");
    const idemSlot = idemKey ? `${caller.keyHash}:${idemKey}` : null;
    const bodyHash = createHash("sha256").update(`${req.method} ${parts.join("/")} ${raw}`).digest("hex");
    if (idemSlot) {
      const hit = state.idempotency[idemSlot];
      if (hit && Date.now() - hit.at < 86_400_000) {
        if (hit.bodyHash !== bodyHash) throw new ApiError(409, "idempotency_conflict", "This Idempotency-Key was used with a different body");
        return json(hit.status, hit.body, requestId);
      }
    }

    let status = 200;
    let out: unknown;
    try {
      const result = await route(state, req.method, parts, new URL(req.url).searchParams, body, caller, idemKey);
      if (result && typeof result === "object" && "status" in result && "body" in result && typeof (result as { status: unknown }).status === "number") {
        status = (result as { status: number }).status;
        out = (result as { body: unknown }).body;
      } else out = result;
    } catch (e) {
      if (e instanceof ApiError && idemSlot && e.status >= 400 && e.status < 500 && ![401, 403, 429].includes(e.status)) {
        state.idempotency[idemSlot] = { bodyHash, status: e.status, body: { error: { code: e.code, message: e.message, request_id: requestId } }, at: Date.now() };
        save(state);
      }
      throw e;
    }
    if (idemSlot) state.idempotency[idemSlot] = { bodyHash, status, body: out, at: Date.now() };
    if (req.method !== "GET") save(state);
    return json(status, out, requestId);
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: { code: e.code, message: e.message, request_id: requestId } }, requestId);
    console.error(e);
    return json(500, { error: { code: "server_error", message: "Internal error", request_id: requestId } }, requestId);
  }
}

export async function emulatorJwks() {
  const state = await emulator();
  return { keys: [state.publicKey] };
}
