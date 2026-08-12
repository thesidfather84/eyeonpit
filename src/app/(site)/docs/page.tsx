import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Mic, Zap, Settings2, GraduationCap, HelpCircle, Wrench, FileClock, ArrowRight } from "lucide-react";
import { DocsPageHeader } from "@/components/site/DocsPageHeader";

export const metadata: Metadata = {
  title: "Documentation",
  description: "EyeOnPit documentation — getting started, the voice guide, Quick/Advanced/Practice modes, FAQ, troubleshooting, and release notes.",
};

const SECTIONS = [
  { href: "/docs/getting-started", label: "Getting Started", icon: BookOpen, detail: "Open EyeOnPit, start an investigation, and record your first hand." },
  { href: "/docs/voice", label: "Voice Guide", icon: Mic, detail: "The full natural-language operator voice reference." },
  { href: "/docs/quick", label: "Quick Mode", icon: Zap, detail: "The fastest way to start watching — minimal setup." },
  { href: "/docs/advanced", label: "Advanced Mode", icon: Settings2, detail: "Custom table, deck, and rule setup before you start." },
  { href: "/docs/practice", label: "Practice Mode", icon: GraduationCap, detail: "Train on the real workflow, kept separate from live cases." },
  { href: "/docs/faq", label: "FAQ", icon: HelpCircle, detail: "Common questions about what EyeOnPit is and isn't." },
  { href: "/docs/troubleshooting", label: "Troubleshooting", icon: Wrench, detail: "Microphone, headset, and voice-recognition issues." },
  { href: "/docs/release-notes", label: "Release Notes", icon: FileClock, detail: "What changed, version by version." },
];

export default function DocsHomePage() {
  return (
    <>
      <DocsPageHeader
        title="Documentation"
        subtitle="Written against the actual current application — nothing here describes a feature that doesn't exist yet."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 no-underline transition-colors hover:border-accent/40 hover:bg-surface-raised"
          >
            <section.icon className="h-5 w-5 text-accent-secondary" aria-hidden />
            <div>
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                {section.label}
                <ArrowRight
                  className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                  aria-hidden
                />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{section.detail}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
