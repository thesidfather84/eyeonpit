"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DOCS_NAV } from "@/lib/site/docsNav";

/** Desktop sidebar — sticky, highlights the current page. Hidden below md; DocsMobileNav takes over there. */
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <div className="sticky top-24 flex flex-col gap-0.5">
        {DOCS_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent/10 font-semibold text-accent-secondary"
                  : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Mobile navigation pattern — a native select, always visible, jumps directly to any docs page in one interaction (no drawer/overlay needed for a list this short). */
export function DocsMobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="mb-6 md:hidden">
      <label htmlFor="docs-nav-select" className="sr-only">
        Jump to documentation page
      </label>
      <select
        id="docs-nav-select"
        value={pathname}
        onChange={(e) => router.push(e.target.value)}
        className="tap-target w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground focus:border-accent focus:outline-none"
      >
        {DOCS_NAV.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
