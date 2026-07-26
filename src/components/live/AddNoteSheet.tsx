"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { addOperatorNote } from "@/lib/db/repositories/investigations";
import { useInvestigationContext } from "@/contexts/InvestigationContext";

/** Fast note entry — a small sheet, not a form that interrupts card entry. Timestamp is automatic. */
export function AddNoteSheet({ onClose }: { onClose: () => void }) {
  const { investigation, refresh } = useInvestigationContext();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addOperatorNote(investigation.localId, text.trim());
      await refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Add Note">
      <div className="flex flex-col gap-3 pb-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Quick note…"
          className="w-full rounded-lg border border-border bg-surface-raised p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
        <Button variant="primary" fullWidth disabled={!text.trim() || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save Note"}
        </Button>
      </div>
    </BottomSheet>
  );
}
