export default function LabAdminPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-bold text-foreground">Admin / Method Validation</h1>
      <p className="text-sm text-muted-foreground">
        Not yet built in this foundation pass. Intended to review a method&apos;s verification status, source
        citations, and (once Priority B10 import is UI-complete) an imported <code className="text-xs">eyeonpit-method.json</code>{" "}
        file before it&apos;s trusted — see docs/EYEONPIT_1_6_ARCHITECTURE.md.
      </p>
    </div>
  );
}
