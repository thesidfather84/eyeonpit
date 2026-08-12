import type { Metadata } from "next";
import { UpdateAvailableBanner } from "@/components/system/UpdateAvailableBanner";

/** The operational console has no reason to appear in search results — it's a live tool, not content. The public marketing/docs site (src/app/(site)) is what should be indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The operational app's shell — everything under /app, /investigations,
 * /settings, /help. EyeOnPit 1.4 split this out of the true root layout
 * (src/app/layout.tsx): `h-dvh`/`overflow-hidden`/centering used to live on
 * <body> itself (when the app WAS the entire site), which would have
 * squeezed the new public marketing/docs pages into the same fixed-height
 * mobile frame. Now only the app tree opts into that frame, via this outer
 * `h-dvh` wrapper — the public site (src/app/(site)/layout.tsx) scrolls
 * normally instead.
 *
 * The max-w-md inner frame keeps the app a fixed mobile-width column even
 * on a wide desktop browser (used for development/testing) — on an actual
 * portrait phone viewport it's simply full-width, since no phone is wider
 * than 448px in portrait. That assumption breaks in landscape: a phone
 * rotated on its side is easily 650-930px wide, well past 448px, so the
 * same cap would waste over half the real screen as dead margin instead of
 * giving the landscape-specific layout the width it was designed for —
 * `short:max-w-none` lifts it exactly there (short height, real device
 * constraint), not for any wide-but-tall window.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh justify-center overflow-hidden bg-background">
      <div className="safe-area-pt safe-area-pb flex h-full w-full max-w-md flex-col overflow-hidden bg-background short:max-w-none">
        <UpdateAvailableBanner />
        {children}
      </div>
    </div>
  );
}
