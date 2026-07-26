import Dexie, { type Table } from "dexie";

/**
 * A lightweight, real diagnostic logger — scoped to what's actually needed
 * to explain the Casino 1.4 stabilization bugs (Hi-Lo display, End
 * Investigation lifecycle, stale-build reports), not the full field-by-field
 * enterprise logging spec. Every entry accepts an open `context` object so
 * call sites can attach whatever's relevant (investigation id, card, count
 * values, before/after state) without the logger needing to know every
 * field name in advance.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogEntry {
  id?: number;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  context?: Record<string, unknown>;
}

const RING_BUFFER_SIZE = 200;
const PERSISTED_RETENTION = 500;
/** warn/error/critical are worth surviving a reload; debug/info are only useful in the moment. */
const PERSIST_LEVELS: LogLevel[] = ["warn", "error", "critical"];

const ringBuffer: LogEntry[] = [];

class DiagnosticsDB extends Dexie {
  logs!: Table<LogEntry, number>;
  constructor() {
    super("eyeonpit-diagnostics");
    this.version(1).stores({ logs: "++id, timestamp, level" });
  }
}

let dbInstance: DiagnosticsDB | null = null;
function getDiagnosticsDb(): DiagnosticsDB | null {
  if (typeof window === "undefined") return null;
  if (!dbInstance) dbInstance = new DiagnosticsDB();
  return dbInstance;
}

async function persist(entry: LogEntry): Promise<void> {
  try {
    const db = getDiagnosticsDb();
    if (!db) return;
    await db.logs.add(entry);
    const count = await db.logs.count();
    if (count > PERSISTED_RETENTION) {
      const excess = count - PERSISTED_RETENTION;
      const oldest = await db.logs.orderBy("id").limit(excess).toArray();
      await db.logs.bulkDelete(oldest.map((e) => e.id!));
    }
  } catch {
    // IndexedDB unavailable/full — the in-memory ring buffer above is the
    // emergency fallback; losing persisted history is never worth throwing
    // over inside a logger.
  }
}

function sanitize(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return context;
  const banned = /password|token|secret|auth/i;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = banned.test(key) ? "[redacted]" : value;
  }
  return out;
}

export function log(level: LogLevel, category: string, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    context: sanitize(context),
  };

  ringBuffer.push(entry);
  if (ringBuffer.length > RING_BUFFER_SIZE) ringBuffer.shift();

  if (process.env.NODE_ENV !== "production") {
    const consoleFn = level === "critical" || level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(`[${category}] ${message}`, entry.context ?? "");
  }

  if (PERSIST_LEVELS.includes(level)) {
    void persist(entry);
  }
}

export const diagnostics = {
  debug: (category: string, message: string, context?: Record<string, unknown>) => log("debug", category, message, context),
  info: (category: string, message: string, context?: Record<string, unknown>) => log("info", category, message, context),
  warn: (category: string, message: string, context?: Record<string, unknown>) => log("warn", category, message, context),
  error: (category: string, message: string, context?: Record<string, unknown>) => log("error", category, message, context),
  critical: (category: string, message: string, context?: Record<string, unknown>) => log("critical", category, message, context),
};

/** Installs window.onerror / unhandledrejection capture. Call once, client-side only. */
export function installGlobalErrorCapture(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    diagnostics.error("window.onerror", event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 2000),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagnostics.error("unhandled-rejection", String(event.reason?.message ?? event.reason), {
      stack: event.reason?.stack?.slice(0, 2000),
    });
  });
}

export interface ExportedDiagnostics {
  exportedAt: string;
  buildId: string | undefined;
  ringBuffer: LogEntry[];
  persisted: LogEntry[];
}

/** Everything Settings' "Export Diagnostics" button downloads: the live ring buffer plus whatever survived in Dexie. */
export async function exportDiagnostics(): Promise<ExportedDiagnostics> {
  const db = getDiagnosticsDb();
  const persisted = db ? await db.logs.orderBy("id").toArray() : [];
  return {
    exportedAt: new Date().toISOString(),
    buildId: process.env.NEXT_PUBLIC_BUILD_ID,
    ringBuffer: [...ringBuffer],
    persisted,
  };
}

export function downloadDiagnostics(data: ExportedDiagnostics): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eyeonpit-diagnostics-${data.exportedAt.replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
