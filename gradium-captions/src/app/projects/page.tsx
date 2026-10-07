import { PageShell } from "@/components/shell/Chrome";
import { ProjectList } from "@/components/home/ProjectList";
import { Eyebrow } from "@/components/ui/primitives";

export default function ProjectsPage() {
  return (
    <PageShell>
      <section className="hero-fade px-6 pt-20 pb-10">
        <div className="container-medium">
          <Eyebrow className="mb-4">Library</Eyebrow>
          <h1 className="font-favorit text-[2rem] leading-none md:text-5xl">
            <span className="text-lightgray">Every captioned </span>
            <span className="text-white">project</span>
          </h1>
        </div>
      </section>
      <section className="container-medium">
        <ProjectList />
      </section>
    </PageShell>
  );
}
