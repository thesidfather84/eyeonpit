import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "EyeOnPit — Casino Game Protection, Rebuilt Around the Investigator",
    template: "%s — EyeOnPit",
  },
  description:
    "EyeOnPit is a casino game-protection investigation platform that turns surveillance observations into structured evidence, deterministic analysis, and professional reporting.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1220",
  viewportFit: "cover",
};

/**
 * The TRUE root — shared by the public marketing/docs site AND the
 * operational app. Deliberately minimal (fonts, global CSS, base
 * background/color) since the two halves need fundamentally different
 * shells: the app is a fixed-height, non-scrolling mobile frame (see
 * src/app/(app)/layout.tsx), while the site is an ordinary scrolling page
 * (see src/app/(site)/layout.tsx). Neither `h-dvh` nor `overflow-hidden`
 * lives here anymore — EyeOnPit 1.4 moved those into (app)/layout.tsx
 * specifically, so the public site can scroll normally instead of being
 * squeezed into the app's mobile-console frame.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
