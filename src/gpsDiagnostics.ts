// Temporary, opt-in, memory-only diagnostics. Never pass native positions/errors to the buffer.
export interface GPSDiagnosticDetails {
  source?: "getCurrentPosition" | "watchPosition" | "initialization";
  reason?: string;
  generation?: number;
  attemptGeneration?: number;
  settled?: boolean | null;
  pending?: boolean;
  automaticRefreshUsed?: boolean;
  positionTimestamp?: number;
  stateNow?: number;
  accuracyMeters?: number;
  errorCode?: number;
  latestTimestamp?: number;
  maximumAge?: number;
  timeout?: number;
  enableHighAccuracy?: boolean;
  stateStatus?: string;
  status?: string;
  hasPosition?: boolean;
  hasError?: boolean;
}
declare global {
  interface Window {
    MQSIO_GPS_DEBUG?: {
      text: () => string;
      copy: () => Promise<void>;
      clear: () => void;
    };
  }
}
function enabled() {
  try {
    return new URLSearchParams(window.location.search).get("gps_debug") === "1";
  } catch {
    return false;
  }
}
function createGPSDiagnostics() {
  if (!enabled()) return null;
  try {
    const info = {
      baselineCommit: "4291621",
      buildCommit:
        import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ||
        import.meta.env.VITE_COMMIT_SHA ||
        null,
      // The hashed module filename identifies the loaded build without logging the page URL/query.
      moduleAsset: new URL(import.meta.url).pathname.split("/").pop(),
    };
    const events: Record<string, unknown>[] = [];
    let droppedEvents = 0;
    let lastStatus: string | null = null;
    let lastStateStatus: string | null = null;
    const lastFlags: {
      generation: number;
      pending: boolean;
      settled: boolean | null;
      automaticRefreshUsed: boolean;
    } = {
      generation: 0,
      pending: false,
      settled: null,
      automaticRefreshUsed: true,
    };
    const numberKeys = [
      "generation",
      "attemptGeneration",
      "positionTimestamp",
      "stateNow",
      "accuracyMeters",
      "errorCode",
      "latestTimestamp",
      "maximumAge",
      "timeout",
    ] as const;
    const booleanKeys = [
      "pending",
      "automaticRefreshUsed",
      "enableHighAccuracy",
      "hasPosition",
      "hasError",
    ] as const;
    function record(event: string, details: GPSDiagnosticDetails = {}) {
      if (!enabled()) return;
      try {
        const at = Date.now();
        if (typeof details.generation === "number")
          lastFlags.generation = details.generation;
        if (typeof details.pending === "boolean")
          lastFlags.pending = details.pending;
        if (details.settled === null || typeof details.settled === "boolean")
          lastFlags.settled = details.settled;
        if (typeof details.automaticRefreshUsed === "boolean")
          lastFlags.automaticRefreshUsed = details.automaticRefreshUsed;
        const entry: Record<string, unknown> = {
          event,
          at,
          visibility: document.visibilityState,
          ...lastFlags,
        };
        // Explicit scalar allowlist prevents native objects, coordinates and arbitrary error text leaking.
        for (const key of numberKeys)
          if (typeof details[key] === "number" && Number.isFinite(details[key]))
            entry[key] = details[key];
        for (const key of booleanKeys)
          if (typeof details[key] === "boolean") entry[key] = details[key];
        if (details.source) entry.source = details.source;
        if (details.reason) entry.reason = details.reason;
        if (details.status) entry.status = details.status;
        if (details.stateStatus) entry.stateStatus = details.stateStatus;
        if (event === "state_transition") {
          entry.fromStatus = lastStatus;
          entry.fromStateStatus = lastStateStatus;
          lastStatus = details.status ?? null;
          lastStateStatus = details.stateStatus ?? null;
        }
        if (typeof entry.positionTimestamp === "number")
          entry.ageMs = at - entry.positionTimestamp;
        if (events.length >= 1000) {
          events.shift();
          droppedEvents++;
        }
        events.push(entry);
      } catch {
        /* Diagnostics must never interfere with GPS. */
      }
    }
    const text = () => JSON.stringify({ info, droppedEvents, events }, null, 2);
    window.MQSIO_GPS_DEBUG = Object.freeze({
      text,
      copy: async () => {
        await navigator.clipboard.writeText(text());
      },
      clear: () => {
        events.length = 0;
        droppedEvents = 0;
      },
    });
    document.addEventListener("visibilitychange", () =>
      record("visibility_change"),
    );
    record("diagnostics_enabled");
    return { record };
  } catch {
    return null;
  }
}
export const gpsDiagnostics = createGPSDiagnostics();
