import { DocsMobileNav, DocsSidebar } from "@/components/site/DocsSidebar";

/**
 * Responsive documentation shell: a sticky sidebar on desktop, a jump-to
 * select on mobile (see DocsSidebar.tsx) — no giant single-page doc, each
 * topic is its own route under this same layout.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-10 md:flex-row md:gap-12">
        <DocsSidebar />
        <div className="min-w-0 flex-1">
          <DocsMobileNav />
          <article className="prose-docs max-w-3xl">{children}</article>
        </div>
      </div>
    </div>
  );
}
