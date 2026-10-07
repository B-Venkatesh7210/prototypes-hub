import Link from "next/link";
import { PageShell } from "@/components/shell/Chrome";
import { HeroDemo } from "@/components/home/HeroDemo";
import { ProjectList } from "@/components/home/ProjectList";
import { ArrowRight, Globe, Mic, Type } from "@/components/ui/icons";
import { ButtonLink, Eyebrow } from "@/components/ui/primitives";

const PRODUCTS = [
  {
    href: "/dub",
    eyebrow: "01 · Record once",
    title: "Ship in five languages",
    body: "Upload a short English clip. Gradium transcribes it, clones the speaker, and dubs it into French, German, Spanish and Portuguese with karaoke captions on the video, exported at the quality you uploaded.",
    apis: ["Speech-to-Text", "Instant Clone", "STT translation", "Text-to-Speech"],
    icon: Globe,
    accent: "#daff52",
  },
  {
    href: "/script",
    eyebrow: "02 · Script",
    title: "Type it, hear it, caption it",
    body: "Write a script, pick a flagship voice, design one from a prompt, or clone your own. Gradium speaks it and returns word timestamps, so the captions are done the moment the audio is.",
    apis: ["Text-to-Speech", "Voice Design", "Flagship voices"],
    icon: Type,
    accent: "#aed2ff",
  },
  {
    href: "/live",
    eyebrow: "03 · Live",
    title: "Caption while you talk",
    body: "Record from your microphone and watch karaoke captions appear as you speak, streamed from Gradium's realtime Speech-to-Text with semantic turn detection. Stop, polish and export.",
    apis: ["Realtime STT", "Semantic VAD", "Keyword boosting"],
    icon: Mic,
    accent: "#ff95e5",
  },
];

const STATS = [
  { value: "5", label: "Languages", note: "English, French, German, Spanish, Portuguese" },
  { value: "10 s", label: "To clone a voice", note: "Instant Voice Clone from a short sample" },
  { value: "word", label: "Timestamp grain", note: "TTS returns timing for every spoken word" },
  { value: "<300 ms", label: "Streaming STT", note: "Expected time to first token when streaming" },
];

export default function Home() {
  return (
    <PageShell>
      <section className="hero-fade flex flex-col items-center overflow-x-clip px-6 pt-20 pb-16 lg:pb-24">
        <Eyebrow className="mb-4">Captions · by Gradium</Eyebrow>
        <h1 className="max-w-4xl text-center font-favorit text-[2rem] leading-none md:text-6xl">
          <span className="block text-lightgray">Voice in, captions out.</span>
          <span className="block text-white">In five languages, in your voice.</span>
        </h1>
        <h2 className="mt-4 max-w-2xl text-center font-plex text-base leading-normal text-lightgray lg:text-lg">
          Three tools on one set of speech models: localize a recording, turn a script into a voice-over, or caption yourself live.
          Every word arrives with its own timestamp.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/dub">Start with a recording</ButtonLink>
          <ButtonLink href="/script" tone="secondary">
            Write a script
          </ButtonLink>
        </div>
        <HeroDemo />
      </section>

      <section className="w-full bg-ink py-18">
        <div className="container-medium">
          <h2 className="text-center font-mono text-base leading-tight font-medium tracking-tight text-lightgray uppercase md:text-xl">
            Three products, one speech stack
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PRODUCTS.map((p) => {
              const Icon = p.icon;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className="group flex flex-col justify-between gap-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <span className="font-komuna text-sm leading-none tracking-[0.0175rem] text-lightgray uppercase">{p.eyebrow}</span>
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${p.accent}1a`, color: p.accent }}
                      >
                        <Icon size={17} />
                      </span>
                    </div>
                    <h3 className="font-favorit text-[1.75rem] leading-none text-bright">{p.title}</h3>
                    <p className="font-plex text-sm leading-snug text-lightgray">{p.body}</p>
                  </div>
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap gap-1.5">
                      {p.apis.map((a) => (
                        <span key={a} className="rounded-full border border-white/10 px-2.5 py-1 font-code text-[0.6875rem] text-bright/80">
                          {a}
                        </span>
                      ))}
                    </div>
                    <span className="flex items-center gap-2 font-favorit text-sm text-bright transition-opacity group-hover:opacity-70">
                      Open <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="w-full bg-ink py-12">
        <div className="container-medium grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col gap-3">
              <span className="font-code text-[1.75rem] leading-none font-medium tracking-tight text-white uppercase">{s.value}</span>
              <p className="font-plex text-base leading-snug text-lightgray">{s.label}</p>
              <p className="max-w-60 font-plex text-sm leading-snug text-lightgray/80">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full bg-ink py-16">
        <div className="container-medium">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-favorit text-[2rem] leading-none md:text-[2.5rem]">
              <span className="text-lightgray">Recent </span>
              <span className="text-bright">projects</span>
            </h2>
            <Link href="/projects" className="font-plex text-sm text-lightgray hover:text-bright">
              View all
            </Link>
          </div>
          <ProjectList limit={6} />
          <p className="mt-4 font-plex text-xs text-lightgray">Projects and audio stay in this browser (IndexedDB). Nothing is uploaded except to Gradium.</p>
        </div>
      </section>
    </PageShell>
  );
}
