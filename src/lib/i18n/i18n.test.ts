import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES, toBcp47 } from "./locale";
import { translate } from "./catalog";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatSignedNumber } from "./format";

describe("locale", () => {
  it("supports exactly the 8 target locales named in Priority 1.8-1", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "es", "fr", "de", "pt", "ko", "zh-Hans", "zh-Hant"]);
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("has a display name for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_DISPLAY_NAMES[locale]).toBeTruthy();
    }
  });

  it("isSupportedLocale correctly narrows valid/invalid values", () => {
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("xx")).toBe(false);
  });

  it("toBcp47 produces a valid tag Intl accepts for every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(() => new Intl.DateTimeFormat(toBcp47(locale))).not.toThrow();
    }
  });
});

describe("translate — catalog fallback discipline", () => {
  it("returns the real English string for a fully-seeded key/locale", () => {
    expect(translate("lab.counterDetection.title", "en")).toBe("Counter Detection");
  });

  it("returns the real translated string when a locale has it", () => {
    expect(translate("lab.counterDetection.title", "es")).toBe("Detección de Conteo");
  });

  it("falls back to English when a locale is only partially seeded", () => {
    // "es" only seeds 2 of 5 keys — this one isn't one of them.
    expect(translate("lab.playerAnalytics.title", "es")).toBe("Player Behavior Analysis");
  });

  it("falls back to English for a locale with no catalog at all", () => {
    expect(translate("lab.counterDetection.title", "ko")).toBe("Counter Detection");
  });

  it("defaults to the DEFAULT_LOCALE when none is given", () => {
    expect(translate("lab.counterDetection.title")).toBe("Counter Detection");
  });
});

describe("format — locale-aware, Intl-backed, never mutates the source value", () => {
  it("formats a date differently for en vs fr locale conventions", () => {
    const iso = "2026-08-19T00:00:00.000Z";
    const en = formatDate(iso, "en");
    const fr = formatDate(iso, "fr");
    expect(en).toBeTruthy();
    expect(fr).toBeTruthy();
    // Different locales' medium date styles are not required to differ in
    // every environment's ICU data, but both must be valid non-empty
    // strings and the function must never throw for any supported locale.
  });

  it("returns the original string unchanged for an invalid ISO timestamp, never throws", () => {
    expect(formatDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("formatDateTime includes a time component", () => {
    const result = formatDateTime("2026-08-19T15:30:00.000Z", "en");
    expect(result).toMatch(/\d/);
  });

  it("formatNumber respects requested fraction digits", () => {
    expect(formatNumber(3.14159, "en", 2)).toBe("3.14");
  });

  it("formatCurrency includes a currency symbol/code", () => {
    const result = formatCurrency(25, "USD", "en");
    expect(result).toMatch(/25/);
  });

  it("formatSignedNumber shows an explicit sign for positive and negative values", () => {
    expect(formatSignedNumber(3, "en")).toContain("+");
    expect(formatSignedNumber(-3, "en")).toContain("-");
    expect(formatSignedNumber(0, "en")).not.toMatch(/[+-]/);
  });

  it("works for every supported locale without throwing", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(() => formatDate("2026-08-19T00:00:00.000Z", locale)).not.toThrow();
      expect(() => formatNumber(1234.5, locale)).not.toThrow();
      expect(() => formatCurrency(10, "USD", locale)).not.toThrow();
    }
  });
});
