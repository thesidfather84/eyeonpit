import { LockProvider } from "@/contexts/LockContext";
import { EntryLockProvider } from "@/contexts/EntryLockContext";
import { InvestigationProvider } from "@/contexts/InvestigationContext";
import { InvestigationChrome } from "@/components/navigation/InvestigationChrome";

export default async function InvestigationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <LockProvider>
      <EntryLockProvider>
        <InvestigationProvider investigationId={id}>
          <InvestigationChrome>{children}</InvestigationChrome>
        </InvestigationProvider>
      </EntryLockProvider>
    </LockProvider>
  );
}
