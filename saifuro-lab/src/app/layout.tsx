import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Agent Checkout Lab · Saifuro + x402",
  description: "An AI agent buys data over x402. Saifuro decides whether it may pay; the seller verifies the signed verdict before it settles on Base.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
