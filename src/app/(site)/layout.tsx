import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * The public marketing/docs site shell — an ordinary scrolling page, unlike
 * (app)/layout.tsx's fixed-height mobile console frame. Shared by the
 * homepage and every /docs page so header/footer never drift between them.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
