"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/#engine", label: "Product" },
  { href: "/docs", label: "Documentation" },
];

const DEMO_MAILTO = "mailto:demo@eyeonpit.com?subject=EyeOnPit%20Demo%20Request";

/**
 * Shared by every public page (homepage + all /docs pages) — deliberately
 * NOT reused by the operational app, which has its own TopBar/LiveHeader
 * chrome (a fixed-height mobile console frame, not a scrolling marketing
 * page). "Request a Demo" is a plain mailto: link — no fake booking-flow
 * integration exists yet, so this doesn't pretend to be a live scheduler.
 */
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
          </span>
          <span className="text-sm font-bold tracking-[0.14em] text-foreground">EYEONPIT</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={DEMO_MAILTO}
            className="rounded-lg border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-foreground transition-colors hover:bg-surface-raised"
          >
            Request a Demo
          </a>
          <Link
            href="/access"
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-accent-foreground shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
          >
            Launch EyeOnPit
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="tap-target flex items-center justify-center text-foreground md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/60 bg-background px-4 pb-6 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="tap-target flex items-center rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href={DEMO_MAILTO}
              className="tap-target flex items-center justify-center rounded-lg border border-border text-sm font-semibold uppercase tracking-[0.1em] text-foreground"
            >
              Request a Demo
            </a>
            <Link
              href="/access"
              onClick={() => setMobileOpen(false)}
              className="tap-target flex items-center justify-center rounded-lg bg-accent text-sm font-semibold uppercase tracking-[0.1em] text-accent-foreground"
            >
              Launch EyeOnPit
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
