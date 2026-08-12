import Link from "next/link";

const DOC_LINKS = [
  { href: "/docs/getting-started", label: "Getting Started" },
  { href: "/docs/voice", label: "Voice Guide" },
  { href: "/docs/quick", label: "Quick Mode" },
  { href: "/docs/advanced", label: "Advanced Mode" },
  { href: "/docs/practice", label: "Practice Mode" },
];

const SUPPORT_LINKS = [
  { href: "/docs/faq", label: "FAQ" },
  { href: "/docs/troubleshooting", label: "Troubleshooting" },
  { href: "/docs/release-notes", label: "Release Notes" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-2">
            <span className="text-sm font-bold tracking-[0.14em] text-foreground">EYEONPIT</span>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Casino game-protection investigation software. Built around the investigator, not a spreadsheet.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Documentation</p>
            <ul className="mt-3 flex flex-col gap-2">
              {DOC_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Support</p>
            <ul className="mt-3 flex flex-col gap-2">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/access" className="text-sm text-muted-foreground hover:text-foreground">
                  Launch EyeOnPit
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} EyeOnPit. All rights reserved.</span>
          <span>Proprietary EyeOnPit Engine.</span>
        </div>
      </div>
    </footer>
  );
}
