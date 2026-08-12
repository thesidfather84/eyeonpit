import { Camera } from "lucide-react";
import { StatusBadge } from "@/components/site/StatusBadge";

export function VisionSection() {
  return (
    <section className="border-b border-border/60 bg-surface/40 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-secondary/30 bg-accent-secondary/10">
          <Camera className="h-6 w-6 text-accent-secondary" aria-hidden />
        </span>
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">EyeOnPit Vision</h2>
        <div className="mt-3 flex justify-center">
          <StatusBadge status="in-development" />
        </div>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Authorized camera and video inputs could identify visible table events and feed structured observations
          into the same EyeOnPit engine that voice and touch entry already use — no separate analysis path, no
          separate ledger.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Vision is not available in production today. It is being actively built on top of the same engine
          powering Voice and Touch.
        </p>
      </div>
    </section>
  );
}
