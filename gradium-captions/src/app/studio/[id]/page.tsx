import { PageShell } from "@/components/shell/Chrome";
import { Studio } from "@/components/studio/Studio";

export default async function StudioPage({ params }: PageProps<"/studio/[id]">) {
  const { id } = await params;
  return (
    <PageShell footer={false}>
      <Studio id={id} />
    </PageShell>
  );
}
