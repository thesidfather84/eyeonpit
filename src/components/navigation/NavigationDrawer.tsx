"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Eye, Home, ListPlus, History, HelpCircle, Settings, PlayCircle } from "lucide-react";
import { useActiveInvestigation } from "@/hooks/useActiveInvestigation";
import { useTerminology } from "@/hooks/useTerminology";

interface NavigationDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Compact side drawer reachable from the hamburger button in both the dashboard TopBar and the investigation LiveHeader. */
export function NavigationDrawer({ open, onClose }: NavigationDrawerProps) {
  const [mounted] = useState(() => typeof document !== "undefined");
  const { investigation } = useActiveInvestigation();
  const t = useTerminology();

  const links = [
    { href: "/", label: "Home", icon: Home },
    { href: "/investigations/new", label: `New ${t.session}`, icon: ListPlus },
    { href: "/investigations", label: t.history, icon: History },
    { href: "/help", label: "Help", icon: HelpCircle },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <button
        aria-label="Close menu"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-surface p-4">
        <div className="mb-4 flex items-center gap-2">
          <Eye className="h-5 w-5 text-accent" aria-hidden />
          <span className="text-sm font-bold text-foreground">EyeOnPit</span>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="tap-target flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-surface-raised"
            >
              <Icon className="h-5 w-5" aria-hidden /> {label}
            </Link>
          ))}
          {investigation && (
            <Link
              href={`/investigations/${investigation.localId}/live`}
              onClick={onClose}
              className="tap-target flex items-center gap-3 rounded-lg bg-accent/15 px-3 text-sm font-medium text-accent"
            >
              <PlayCircle className="h-5 w-5" aria-hidden /> Resume Active Investigation
            </Link>
          )}
        </nav>
      </div>
    </div>,
    document.body
  );
}
