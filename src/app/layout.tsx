import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UpdateAvailableBanner } from "@/components/system/UpdateAvailableBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EyeOnPit",
  description:
    "Professional casino surveillance and blackjack investigation software.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
  viewportFit: "cover",
};

/**
 * Deliberately minimal: chrome (top bar vs. investigation header/nav)
 * differs between the dashboard-style `(main)` route group and the
 * investigation-scoped `investigations/[id]` tree, so each provides its
 * own via a nested layout instead of this one imposing a single shape.
 *
 * The max-w-md frame keeps the app a fixed mobile-width column even on a
 * wide desktop browser (used for development/testing) — on an actual
 * portrait phone viewport it's simply full-width, since no phone is wider
 * than 448px in portrait. That assumption breaks in landscape: a phone
 * rotated on its side is easily 650-930px wide, well past 448px, so the
 * same cap would waste over half the real screen as dead margin instead of
 * giving the landscape-specific layout the width it was designed for —
 * `short:max-w-none` lifts it exactly there (short height, real device
 * constraint), not for any wide-but-tall window.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh antialiased`}
    >
      <body className="flex h-full justify-center overflow-hidden bg-background text-foreground">
        <div className="safe-area-pt safe-area-pb flex h-full w-full max-w-md flex-col overflow-hidden bg-background short:max-w-none">
          <UpdateAvailableBanner />
          {children}
        </div>
      </body>
    </html>
  );
}
