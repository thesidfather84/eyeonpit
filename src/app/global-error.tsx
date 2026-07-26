"use client";

import { RecoveryScreen } from "@/components/system/RecoveryScreen";
import "./globals.css";

/**
 * The outermost safety net — only reached if an error escapes even the root
 * layout (e.g. a provider throwing during its own setup, before any normal
 * page/segment boundary exists to catch it). Next.js requires this file to
 * render its own <html>/<body>, since it replaces the root layout entirely
 * rather than nesting inside it — see app/layout.tsx for the frame this
 * mirrors.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full justify-center overflow-hidden bg-background text-foreground">
        <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-background">
          <RecoveryScreen error={error} />
        </div>
      </body>
    </html>
  );
}
