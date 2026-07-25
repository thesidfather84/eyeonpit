import Link from "next/link";
import { ResumeInvestigationCard } from "@/components/dashboard/ResumeInvestigationCard";
import { PracticeInvestigationCta } from "@/components/dashboard/PracticeInvestigationCta";

export default function Home() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ResumeInvestigationCard />

      <Link
        href="/investigations/new"
        className="tap-target flex items-center justify-center rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground"
      >
        + New Investigation
      </Link>

      <PracticeInvestigationCta />

      <Link
        href="/investigations"
        className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-3 font-medium text-foreground"
      >
        View History
      </Link>
    </div>
  );
}
