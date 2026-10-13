import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlueprintView } from "@/components/blueprint/BlueprintView";
import { readBlueprint } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const bp = readBlueprint((await params).id);
  return bp
    ? { title: `${bp.partner.name} × Aave — integration blueprint`, description: bp.recommendation.headline }
    : { title: "Blueprint not found" };
}

export default async function BlueprintPage({ params }: PageProps<"/p/[id]">) {
  const bp = readBlueprint((await params).id);
  if (!bp) notFound();
  return <BlueprintView bp={bp} />;
}
