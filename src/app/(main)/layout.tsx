import { TopBar } from "@/components/navigation/TopBar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </>
  );
}
