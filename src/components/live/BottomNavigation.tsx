"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, FileText, Home as HomeIcon, MoreHorizontal, Settings as SettingsIcon } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { InvestigationReportsView } from "./InvestigationReportsView";
import { MoreMenu } from "./MoreMenu";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/**
 * The ONE persistent secondary navigation, shared by Surveillance and
 * Floor (AGENTS.md operational UI rebuild §13/§15/§20): Home, mode switch,
 * Report, Settings, More. This is the single home for Home and Settings —
 * neither appears anywhere in OperationalHeader, so there is exactly one
 * way to reach either, never two competing controls.
 *
 * Mode switch shows the OTHER shell's name/icon (tap it to go there),
 * matching how Floor's old "Surveillance" link and Surveillance's old
 * "Floor" link both worked — just promoted into the same shared row every
 * other operational nav item lives in, instead of a header-only button one
 * shell had and the other didn't.
 *
 * Five icon+label columns, each a real .tap-target (>=44px), safe-area
 * padding on the bottom edge for iOS home-indicator clearance, and no
 * horizontal scrolling is possible — five equal-width flex columns always
 * fit the viewport that contains them.
 */
export function BottomNavigation({ mode }: { mode: "surveillance" | "floor" }) {
  const { investigation } = useInvestigationContext();
  const [reportsOpen, setReportsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const otherMode = mode === "floor" ? "surveillance" : "floor";
  const otherHref = `/investigations/${investigation.localId}/${otherMode === "floor" ? "floor" : "live"}`;
  const otherLabel = otherMode === "floor" ? "Floor" : "Surveillance";

  return (
    <>
      <nav
        aria-label="Operational navigation"
        className="safe-area-pb flex flex-none items-stretch border-t border-border bg-surface"
      >
        <Link
          href="/app"
          aria-label="Home"
          className="tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <HomeIcon className="h-5 w-5" aria-hidden />
          <span className="text-[10px] font-semibold">Home</span>
        </Link>
        <Link
          href={otherHref}
          aria-label={`Switch to ${otherLabel}`}
          className="tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftRight className="h-5 w-5" aria-hidden />
          <span className="truncate text-[10px] font-semibold">{otherLabel}</span>
        </Link>
        <button
          type="button"
          onClick={() => setReportsOpen(true)}
          aria-label="Report"
          className="tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-5 w-5" aria-hidden />
          <span className="text-[10px] font-semibold">Report</span>
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <SettingsIcon className="h-5 w-5" aria-hidden />
          <span className="text-[10px] font-semibold">Settings</span>
        </button>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          className="tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      <BottomSheet open={reportsOpen} onClose={() => setReportsOpen(false)} title="Report">
        <InvestigationReportsView />
      </BottomSheet>

      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsScreen
          activeInvestigation={{
            localId: investigation.localId,
            displayId: investigation.displayId,
            isDemo: investigation.isDemo,
          }}
        />
      </BottomSheet>

      <MoreMenu open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
