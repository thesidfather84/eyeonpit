import Link from "next/link";
import { WorkflowHelpContent } from "@/components/settings/WorkflowHelpContent";

const DOC_LINKS = [
  { href: "/docs/voice", label: "Full Voice Guide" },
  { href: "/docs/quick", label: "Quick Mode" },
  { href: "/docs/advanced", label: "Advanced Mode" },
  { href: "/docs/troubleshooting", label: "Troubleshooting" },
];

/**
 * Same workflow content shown in the Live screen's Help overlay — one
 * source of truth, two presentations. This standalone route (reached
 * deliberately via the nav drawer, never a mid-session popup) additionally
 * links out to the public documentation site for anyone who wants more
 * depth than the on-screen quick reference — see EyeOnPit 1.4's docs
 * section. Deliberately NOT added to WorkflowHelpContent itself, since
 * that component also renders inside the Live/Floor Menu's in-context Help
 * overlay, where extra outbound links would just be clutter mid-shift.
 */
export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">How EyeOnPit Works</h1>
        <WorkflowHelpContent />
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Full Documentation
        </p>
        <div className="flex flex-col gap-1">
          {DOC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="tap-target flex items-center rounded-lg px-2 text-sm text-accent-secondary hover:bg-surface-raised"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
