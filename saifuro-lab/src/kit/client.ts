/**
 * A small typed client for the Saifuro HTTP API (https://docs.saifuro.com/api/overview).
 * Point `baseUrl` at https://api.saifuro.com with a real key, or at the local emulator.
 */

export type VerdictCode = "allow" | "review" | "deny_limit" | "deny_velocity" | "deny_category" | "deny_expired" | "deny_revoked" | "deny_no_mandate";

export type SpendRequest = {
  amount: number;
  currency: string;
  recipient: string;
  category: string;
  protocol?: "x402" | "mpp" | "acp" | "ap2" | "card";
  /** Organization keys only: the agent this request is for. */
  agent?: string;
  metadata?: Record<string, string>;
};

export type Decision = {
  decision: string;
  request: { agent: string; amount: number; currency: string; recipient: string; category: string };
  verdict: VerdictCode;
  reason: string;
  mandate?: string;
  policy_version: string;
  nonce: string;
  mode: "observe" | "enforce";
  issued_at: string;
  expires_at?: string;
  verdict_token: string;
  supersedes?: string;
  review?: { review: string; waits_for: string; expires_at: string };
  metadata?: Record<string, string>;
};

export type Mandate = {
  mandate: string;
  principal: string;
  agent: string;
  limits: { per_transaction: number; per_month?: number; currency: string };
  categories: string[];
  review_above?: number;
  expires: string;
  status: "active" | "revoked" | "expired";
  created_at: string;
  revoked_at?: string;
};

export type Agent = { agent: string; name: string; status: "active" | "disabled"; created_at: string; metadata?: Record<string, string>; agent_key?: string };

export type Page<T> = { data: T[]; has_more: boolean; next_cursor?: string };

export class SaifuroError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Saifuro could not be reached. Fail closed: no verdict, no payment. */
export class SaifuroUnavailableError extends Error {}

export type SaifuroClient = ReturnType<typeof createSaifuroClient>;

export function createSaifuroClient({
  apiKey,
  baseUrl = "https://api.saifuro.com",
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const root = baseUrl.replace(/\/$/, "");

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      throw new SaifuroUnavailableError(`Saifuro unreachable: ${(e as Error).message}`);
    }
    if (res.status >= 500) throw new SaifuroUnavailableError(`Saifuro returned ${res.status}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as { error?: { code: string; message: string; request_id?: string } } | null)?.error;
      throw new SaifuroError(res.status, err?.code ?? "unknown", err?.message ?? `HTTP ${res.status}`, err?.request_id ?? res.headers.get("x-request-id") ?? undefined);
    }
    return data as T;
  }

  const qs = (q: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return {
    /** Ask before spending. A denial is a normal 201 response, not an error. */
    authorize: (req: SpendRequest, opts: { idempotencyKey?: string } = {}) =>
      call<Decision>("POST", "/v1/authorizations", req, opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    decision: (id: string) => call<Decision>("GET", `/v1/decisions/${encodeURIComponent(id)}`),
    decisions: (q: { agent?: string; mandate?: string; verdict?: VerdictCode; mode?: string; from?: string; to?: string; limit?: number; cursor?: string } = {}) =>
      call<Page<Decision>>("GET", `/v1/decisions${qs(q)}`),

    createAgent: (body: { name: string; metadata?: Record<string, string> }) => call<Agent & { agent_key: string }>("POST", "/v1/agents", body),
    disableAgent: (id: string) => call<Agent>("POST", `/v1/agents/${encodeURIComponent(id)}/disable`),

    createMandate: (body: Omit<Mandate, "mandate" | "status" | "created_at" | "revoked_at">) => call<Mandate>("POST", "/v1/mandates", body),
    revokeMandate: (id: string) => call<Mandate>("POST", `/v1/mandates/${encodeURIComponent(id)}/revoke`),
    mandates: (q: { agent?: string; principal?: string; status?: string; limit?: number; cursor?: string } = {}) => call<Page<Mandate>>("GET", `/v1/mandates${qs(q)}`),

    approveReview: (id: string) => call<Decision>("POST", `/v1/reviews/${encodeURIComponent(id)}/approve`),
    denyReview: (id: string) => call<{ review: string; status: string }>("POST", `/v1/reviews/${encodeURIComponent(id)}/deny`),

    /**
     * Waits for a held request to be approved. Reviews cannot be read over the API, so this looks for
     * the fresh allow whose `supersedes` names the review decision. Returns null on timeout, which
     * covers a denial or an expiry too: those issue no decision.
     */
    async waitForApproval(review: Decision, { pollMs = 1500, timeoutMs = 120_000, signal }: { pollMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && !signal?.aborted) {
        const page = await call<Page<Decision>>("GET", `/v1/decisions${qs({ verdict: "allow", from: review.issued_at, limit: 100 })}`);
        const hit = page.data.find((d) => d.supersedes === review.decision);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return null;
    },
  };
}
