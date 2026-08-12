import Link from "next/link";
import { BookOpen, Mic, Zap, Settings2, GraduationCap, HelpCircle, Wrench, FileClock, ArrowRight } from "lucide-react";

const DOC_LINKS = [
  { href: "/docs/getting-started", label: "Getting Started", icon: BookOpen },
  { href: "/docs/voice", label: "Voice Guide", icon: Mic },
  { href: "/docs/quick", label: "Quick Mode", icon: Zap },
  { href: "/docs/advanced", label: "Advanced Mode", icon: Settings2 },
  { href: "/docs/practice", label: "Practice Mode", icon: GraduationCap },
  { href: "/docs/faq", label: "FAQ", icon: HelpCircle },
  { href: "/docs/troubleshooting", label: "Troubleshooting", icon: Wrench },
  { href: "/docs/release-notes", label: "Release Notes", icon: FileClock },
];

export function DocsSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Documentation</h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Real workflow documentation, written against the current application — including a full operator voice
            reference.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {DOC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-raised"
            >
              <link.icon className="h-5 w-5 text-accent-secondary" aria-hidden />
              <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                {link.label}
                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
