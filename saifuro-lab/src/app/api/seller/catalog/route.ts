import { CATALOG } from "@/lib/seller/catalog";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    seller: "Lab Data Co.",
    payment: "x402 · USDC on Base Sepolia",
    requires: "a Saifuro verdict in the Saifuro-Verdict header",
    datasets: CATALOG.map((d) => ({ id: d.id, title: d.title, blurb: d.blurb, price: d.price, currency: "USDC", category: d.category, untrusted: d.untrusted ?? false, path: `/api/seller/data/${d.id}` })),
  });
}
