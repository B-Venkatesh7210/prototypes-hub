import { storedImage } from "@/lib/lab/merchant";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const img = storedImage((await params).id);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { "content-type": img.type, "cache-control": "private, max-age=3600" } });
}
