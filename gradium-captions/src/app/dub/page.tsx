import { DubFlow } from "@/components/dub/DubFlow";
import { ProductHeader } from "@/components/flow/ProductHeader";
import { PageShell } from "@/components/shell/Chrome";

export default function DubPage() {
  return (
    <PageShell>
      <ProductHeader
        eyebrow="01 · Record once"
        muted="Record once,"
        bright="ship in five languages"
        apis={["Speech-to-Text", "Keyword boosting", "Instant Voice Clone", "STT translation", "Text-to-Speech"]}
      >
        Upload a short clip of someone speaking English. Gradium dubs it into French, German, Spanish and Portuguese in the
        speaker&apos;s own voice, with karaoke captions on the video, exported at the quality you uploaded.
      </ProductHeader>
      <DubFlow />
    </PageShell>
  );
}
