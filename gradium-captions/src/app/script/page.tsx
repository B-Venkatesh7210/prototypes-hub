import { ProductHeader } from "@/components/flow/ProductHeader";
import { ScriptFlow } from "@/components/script/ScriptFlow";
import { PageShell } from "@/components/shell/Chrome";

export default function ScriptPage() {
  return (
    <PageShell>
      <ProductHeader
        eyebrow="02 · Script"
        muted="Type a script."
        bright="Get a captioned voice-over."
        apis={["Text-to-Speech", "Word timestamps", "Flagship voices", "Voice Design", "Instant Voice Clone"]}
      >
        No recording needed. Gradium voices your script and times every word as it speaks, so the captions are done the moment
        the audio is.
      </ProductHeader>
      <ScriptFlow />
    </PageShell>
  );
}
