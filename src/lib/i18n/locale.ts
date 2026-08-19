/**
 * PRIORITY 1.8-1 — internationalization foundation. This file defines the
 * SHAPE only — see catalog.ts for the (deliberately small, seed-only)
 * string catalog and format.ts for locale-aware date/number/currency
 * formatting. "Do NOT translate the whole app yet" (this priority's own
 * rule) — this is architecture for FUTURE work, not a completed
 * translation. Internal IDs (canonical method/game/property codes, Dexie
 * keys, route paths) are and remain entirely language-independent —
 * nothing in this file or its siblings ever uses a translated string as a
 * key.
 */
export const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "pt", "ko", "zh-Hans", "zh-Hant"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** BCP-47 tag for `Intl.*` formatters — every supported Locale maps to a real, valid tag. */
export function toBcp47(locale: Locale): string {
  return locale === "zh-Hans" ? "zh-Hans" : locale === "zh-Hant" ? "zh-Hant" : locale;
}
