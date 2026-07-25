"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileText, Radio, Settings, Users } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: typeof Radio;
  isActive: (pathname: string) => boolean;
}

/** The 5-tab nav for an open investigation — Live/Analysis/Seats/Report are scoped to this investigation; Settings is global. */
export function InvestigationBottomNav({ investigationId }: { investigationId: string }) {
  const pathname = usePathname();
  const base = `/investigations/${investigationId}`;

  const items: NavItem[] = [
    { label: "Live", href: `${base}/live`, icon: Radio, isActive: (p) => p.endsWith("/live") },
    {
      label: "Analysis",
      href: `${base}/analysis`,
      icon: Activity,
      isActive: (p) => p.endsWith("/analysis"),
    },
    { label: "Seats", href: `${base}/seats`, icon: Users, isActive: (p) => p.endsWith("/seats") },
    {
      label: "Report",
      href: `${base}/report`,
      icon: FileText,
      isActive: (p) => p.endsWith("/report"),
    },
    { label: "Settings", href: "/settings", icon: Settings, isActive: (p) => p === "/settings" },
  ];

  return (
    <nav
      className="flex-none border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`tap-target flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
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
