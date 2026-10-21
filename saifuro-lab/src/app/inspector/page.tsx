import type { Metadata } from "next";
import { Inspector } from "@/components/inspector/Inspector";

export const metadata: Metadata = { title: "Verdict Inspector · Saifuro" };

export default function Page() {
  return <Inspector />;
}
