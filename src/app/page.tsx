import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">
          Phase 1 scaffold. The dashboard (resume/new/practice/recent) lands
          in Phase 2.
        </p>
      </div>

      <Link
        href="/investigations/new"
        className="tap-target flex items-center justify-center rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground"
      >
        + New Investigation
      </Link>

      <Link
        href="/investigations"
        className="tap-target flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-3 font-medium text-foreground"
      >
        View History
      </Link>
    </div>
  );
}
