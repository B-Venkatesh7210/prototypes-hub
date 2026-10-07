import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter_Tight } from "next/font/google";
import { StatusProvider } from "@/components/shell/StatusProvider";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "latin-ext"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Gradium Captions — voice in, captions out",
  description:
    "Record once and ship captioned voice-overs in five languages, turn a script into a captioned voice-over, or caption a live recording. Powered by Gradium speech models.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
    >
      <body className="min-h-dvh">
        <StatusProvider>{children}</StatusProvider>
      </body>
    </html>
  );
}
