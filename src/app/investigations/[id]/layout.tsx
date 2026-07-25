import { LockProvider } from "@/contexts/LockContext";
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
      <InvestigationProvider investigationId={id}>
        <InvestigationChrome investigationId={id}>{children}</InvestigationChrome>
      </InvestigationProvider>
    </LockProvider>
  );
}
