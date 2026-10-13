import type { Metadata } from "next";
import { WidgetPlayground } from "@/components/widget/WidgetPlayground";

export const metadata: Metadata = {
  title: "AaveEarn widget — Partner Studio for Aave",
  description: "A drop-in React Earn card backed by Aave v3. Theme it, wire an adapter, ship it.",
};

export default function WidgetPage() {
  return <WidgetPlayground />;
}
