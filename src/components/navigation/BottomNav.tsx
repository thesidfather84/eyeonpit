"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Dices, ClipboardList, History } from "lucide-react";
import { useActiveInvestigation } from "@/hooks/useActiveInvestigation";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  isActive: (pathname: string) => boolean;
}

/**
 * The 4 persistent destinations from plan.md §6/§12. Live Entry and Case
 * route to the in-progress investigation when one exists, otherwise to
 * New Investigation — there's no id-less version of either screen.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { investigation } = useActiveInvestigation();

  const liveHref = investigation
    ? `/investigations/${investigation.localId}/live`
    : "/investigations/new";
  const caseHref = investigation
    ? `/investigations/${investigation.localId}/case`
    : "/investigations/new";

  const items: NavItem[] = [
    {
      label: "Home",
      href: "/",
      icon: Home,
      isActive: (p) => p === "/",
    },
    {
      label: "Live Entry",
      href: liveHref,
      icon: Dices,
      isActive: (p) => p.includes("/live"),
    },
    {
      label: "Case",
      href: caseHref,
      icon: ClipboardList,
      isActive: (p) => p.includes("/case"),
    },
    {
      label: "History",
      href: "/investigations",
      icon: History,
      isActive: (p) => p === "/investigations",
    },
  ];

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`tap-target flex flex-col items-center justify-center gap-1 py-2 text-xs ${
                  active ? "text-accent" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
