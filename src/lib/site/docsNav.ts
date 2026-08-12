export interface DocsNavItem {
  href: string;
  label: string;
}

/** Single source of truth for /docs navigation — sidebar (desktop), the mobile nav select, and prev/next links all read from this same ordered list. */
export const DOCS_NAV: DocsNavItem[] = [
  { href: "/docs", label: "Documentation Home" },
  { href: "/docs/getting-started", label: "Getting Started" },
  { href: "/docs/voice", label: "Voice Guide" },
  { href: "/docs/quick", label: "Quick Mode" },
  { href: "/docs/advanced", label: "Advanced Mode" },
  { href: "/docs/practice", label: "Practice Mode" },
  { href: "/docs/faq", label: "FAQ" },
  { href: "/docs/troubleshooting", label: "Troubleshooting" },
  { href: "/docs/release-notes", label: "Release Notes" },
];
