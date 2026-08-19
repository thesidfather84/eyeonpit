import { DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * PRIORITY 1.8-1 — the string catalog. Deliberately a SEED set, not a full
 * translation — "Do NOT translate the whole app yet." Every key here is a
 * language-INDEPENDENT identifier (e.g. "lab.counterDetection.title"),
 * never a translated string itself, so it can never collide with or be
 * confused with a canonical internal ID (method canonicalIds, route paths,
 * Dexie keys) elsewhere in the codebase.
 *
 * Only `en` is complete — a handful of representative keys are seeded in
 * `es`/`fr` purely to prove the fallback mechanism genuinely works end to
 * end; every other locale/key falls back to English via `translate()`.
 * "User-facing strings added in 1.7/1.8 should use the localization system
 * where practical" (Priority 1.8-1's own rule) — this catalog's English
 * values are the strings actually introduced by the 1.7 /lab pages, not
 * placeholder text.
 */
export type TranslationKey =
  | "lab.counterDetection.title"
  | "lab.counterDetection.experimentalNotice"
  | "lab.playerAnalytics.title"
  | "lab.validationBenchmarks.title"
  | "lab.validationBenchmarks.runButton";

type Catalog = Record<TranslationKey, string>;

const en: Catalog = {
  "lab.counterDetection.title": "Counter Detection",
  "lab.counterDetection.experimentalNotice":
    "EXPERIMENTAL — NOT VALIDATED. An investigative indicator only, never an accusation or conclusion.",
  "lab.playerAnalytics.title": "Player Behavior Analysis",
  "lab.validationBenchmarks.title": "Validation Benchmarks",
  "lab.validationBenchmarks.runButton": "Run Benchmark",
};

const es: Partial<Catalog> = {
  "lab.counterDetection.title": "Detección de Conteo",
  "lab.validationBenchmarks.runButton": "Ejecutar Prueba",
};

const fr: Partial<Catalog> = {
  "lab.counterDetection.title": "Détection de Comptage",
  "lab.validationBenchmarks.runButton": "Exécuter le Test",
};

const CATALOGS: Partial<Record<Locale, Partial<Catalog>>> = { en, es, fr };

/** Never throws, never returns undefined — falls back to English, then to the raw key itself if even English somehow lacks it (defensive, should be unreachable given `en` is a complete `Catalog`). */
export function translate(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  return CATALOGS[locale]?.[key] ?? en[key] ?? key;
}
