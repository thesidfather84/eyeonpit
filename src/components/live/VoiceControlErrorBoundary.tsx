"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Voice is optional, additive UI bolted onto the live screen — an
 * uncaught error inside it must never take the rest of the screen (keypad,
 * seats, Done/Next/Undo) down with it. React error boundaries can only be
 * class components; there's no hook equivalent. On catch this renders
 * nothing (no voice control) rather than rethrowing or showing broken UI —
 * every manual control outside this boundary keeps working exactly as if
 * VoiceControl were never mounted.
 */
export class VoiceControlErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Best-effort console log only — never rethrow, never touch the ledger
    // or investigation state from here.
    console.error("[voice] VoiceControl crashed; isolated from the rest of the live screen.", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
