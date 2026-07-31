import type { CardEvent, CardEventSource } from "./types";

/** The one place "no source recorded" becomes a concrete value — every event written before this field existed reads as "manual" here, permanently, without ever touching the stored row. */
export const DEFAULT_CARD_EVENT_SOURCE: CardEventSource = "manual";

/** Always read a CardEvent's source through this — never `event.source` directly — so "field absent" and "field explicitly manual" are indistinguishable everywhere except this one function. */
export function cardEventSource(event: CardEvent): CardEventSource {
  return event.source ?? DEFAULT_CARD_EVENT_SOURCE;
}

export const CARD_EVENT_SOURCE_LABEL: Record<CardEventSource, string> = {
  manual: "Manual",
  voice: "Voice",
  ai: "AI",
  import: "Import",
};
