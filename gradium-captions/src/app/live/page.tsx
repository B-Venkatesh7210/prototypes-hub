import { ProductHeader } from "@/components/flow/ProductHeader";
import { LiveStudio } from "@/components/live/LiveStudio";
import { PageShell } from "@/components/shell/Chrome";

export default function LivePage() {
  return (
    <PageShell>
      <ProductHeader
        eyebrow="03 · Live"
        muted="Talk."
        bright="Watch the captions keep up."
        apis={["Realtime Speech-to-Text", "WebSocket", "Semantic VAD", "Keyword boosting", "Short-lived browser tokens"]}
      >
        Record from your microphone and see karaoke captions land as you speak. When you stop, the recording and its timed
        transcript open in the studio for editing and export.
      </ProductHeader>
      <LiveStudio />
    </PageShell>
  );
}
