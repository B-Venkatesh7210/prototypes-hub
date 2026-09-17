import WebSocket from "ws";
import { isPubkey } from "@/lib/format";
import { requireApiKey } from "@/lib/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubMeta = { kind: "slot" | "logs" | "account"; address?: string };

export async function GET(req: Request) {
  let key: string;
  try {
    key = requireApiKey();
  } catch {
    return Response.json(
      { error: "Missing HELIUS_API_KEY. Add it to .env.local." },
      { status: 500 },
    );
  }

  const addresses = (new URL(req.url).searchParams.get("addresses") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isPubkey)
    .slice(0, 5);

  const encoder = new TextEncoder();
  let ws: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          ws.close();
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", cleanup);

      ws = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${key}`);
      const pending = new Map<number, SubMeta>();
      const confirmed = new Map<number, SubMeta>();
      let rpcId = 1;

      const subscribe = (method: string, params: unknown[], meta: SubMeta) => {
        const id = rpcId++;
        pending.set(id, meta);
        ws?.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      };

      ws.on("open", () => {
        send({ type: "status", state: "live" });
        subscribe("slotSubscribe", [], { kind: "slot" });
        for (const address of addresses) {
          subscribe(
            "logsSubscribe",
            [{ mentions: [address] }, { commitment: "confirmed" }],
            { kind: "logs", address },
          );
          subscribe(
            "accountSubscribe",
            [address, { encoding: "jsonParsed", commitment: "confirmed" }],
            { kind: "account", address },
          );
        }
      });

      ws.on("message", (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if (typeof msg.id === "number" && typeof msg.result === "number") {
          const meta = pending.get(msg.id);
          if (meta) {
            pending.delete(msg.id);
            confirmed.set(msg.result, meta);
          }
          return;
        }

        if (msg.method === "slotNotification") {
          const params = msg.params as { result?: { slot?: number; parent?: number; root?: number } };
          send({
            type: "slot",
            slot: params.result?.slot,
            parent: params.result?.parent,
            root: params.result?.root,
          });
          return;
        }

        if (msg.method === "logsNotification") {
          const params = msg.params as {
            subscription?: number;
            result?: {
              context?: { slot?: number };
              value?: { signature?: string; err?: unknown; logs?: string[] };
            };
          };
          const meta = confirmed.get(params.subscription ?? -1);
          send({
            type: "log",
            slot: params.result?.context?.slot,
            signature: params.result?.value?.signature,
            err: params.result?.value?.err ?? null,
            logs: (params.result?.value?.logs ?? []).slice(-10),
            watched: meta?.address,
          });
          return;
        }

        if (msg.method === "accountNotification") {
          const params = msg.params as {
            subscription?: number;
            result?: { context?: { slot?: number }; value?: { lamports?: number } };
          };
          const meta = confirmed.get(params.subscription ?? -1);
          send({
            type: "account",
            slot: params.result?.context?.slot,
            watched: meta?.address,
            lamports: params.result?.value?.lamports,
          });
        }
      });

      ws.on("close", () => {
        send({ type: "status", state: "disconnected" });
        cleanup();
      });

      ws.on("error", () => {
        send({ type: "status", state: "error" });
      });

      heartbeat = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 20_000);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      ws?.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
