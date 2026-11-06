import { useCallback, useEffect, useRef, useState } from "react";
import type { Location } from "./domain";
import { gpsDiagnostics, type GPSDiagnosticDetails } from "./gpsDiagnostics";
export type GPSStatus =
  | "locating"
  | "ready"
  | "denied"
  | "timeout"
  | "unavailable"
  | "unsupported"
  | "stale";
interface GPSState {
  location: Location | null;
  gpsAt: number;
  status: GPSStatus;
  gpsError: string;
}
export function gpsFailure(
  error: unknown,
): Pick<GPSState, "status" | "gpsError"> {
  const value = error as { code?: number; name?: string } | null;
  if (value?.code === 1 || value?.name === "SecurityError")
    return {
      status: "denied",
      gpsError:
        "Location access was denied for this website. Check Safari website permissions below, then tap Retry GPS.",
    };
  if (value?.code === 3)
    return {
      status: "timeout",
      gpsError: "GPS timed out. Move to an open area and tap Retry GPS.",
    };
  return {
    status: "unavailable",
    gpsError:
      "Your device cannot determine a position right now. Check Location Services, move to an open area and tap Retry GPS.",
  };
}
// Only recognize the Apple epoch when adding its exact offset yields a fresh fix.
// Leave all other timestamps unchanged so existing stale/future validation still applies.
export function normalizeGPSTimestamp(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return timestamp;
  const unixTimestamp = timestamp + 978307200000;
  const age = now - unixTimestamp;
  return age >= 0 && age < 60000 ? unixTimestamp : timestamp;
}
export function validPosition(
  position: GeolocationPosition,
  timestamp = normalizeGPSTimestamp(position.timestamp),
) {
  const c = position.coords;
  return (
    c &&
    Number.isFinite(c.latitude) &&
    c.latitude >= -90 &&
    c.latitude <= 90 &&
    Number.isFinite(c.longitude) &&
    c.longitude >= -180 &&
    c.longitude <= 180 &&
    Number.isFinite(c.accuracy) &&
    c.accuracy >= 0 &&
    Number.isFinite(timestamp) &&
    timestamp > 0 &&
    timestamp <= Date.now() + 30000
  );
}
export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GPSState>({
    location: null,
    gpsAt: 0,
    status: "locating",
    gpsError: "Waiting for GPS permission",
  });
  const [now, setNow] = useState(Date.now);
  const watch = useRef<{ api: Geolocation; id: number } | null>(null);
  const generation = useRef(0);
  const requestPending = useRef(false);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // One automatic recovery per genuinely fresh fix; failures never arm another retry.
  const automaticRefreshUsed = useRef(true);
  function trace(event: string, details?: () => GPSDiagnosticDetails) {
    if (!gpsDiagnostics) return;
    try {
      gpsDiagnostics.record(event, {
        ...details?.(),
        generation: generation.current,
        pending: requestPending.current,
        automaticRefreshUsed: automaticRefreshUsed.current,
      });
    } catch {
      /* Logging must not change callback handling. */
    }
  }
  const stop = useCallback(() => {
    trace("attempt_cancelled", () => ({
      attemptGeneration: generation.current,
    }));
    generation.current++;
    clearTimeout(requestTimer.current);
    requestPending.current = false;
    if (watch.current) {
      try {
        watch.current.api.clearWatch(watch.current.id);
      } catch {
        /* Browser APIs can be restricted independently. */
      }
      watch.current = null;
    }
    trace("attempt_stopped", () => ({ settled: null }));
  }, []);
  const startGPS = useCallback(
    (requestFresh = false) => {
      if (requestPending.current) {
        trace("request_ignored", () => ({ reason: "request_already_pending" }));
        return;
      }
      stop();
      if (!enabled) return;
      const attempt = generation.current;
      if (requestFresh) automaticRefreshUsed.current = true;
      let latestTimestamp = 0;
      let diagnosticSettled: (() => boolean) | undefined;
      const flags = () => ({
        attemptGeneration: attempt,
        settled: diagnosticSettled?.() ?? null,
        latestTimestamp,
      });
      trace("attempt_started", () => ({
        ...flags(),
        reason: requestFresh ? "fresh_request" : "initial_watch",
      }));
      setState({
        location: null,
        gpsAt: 0,
        status: "locating",
        gpsError: "Waiting for a current GPS fix…",
      });
      const fail = (
        error: unknown,
        source: GPSDiagnosticDetails["source"] = "initialization",
      ) => {
        trace("callback_decision", () => ({
          ...flags(),
          source,
          reason:
            generation.current === attempt
              ? "error_applied"
              : "generation_changed",
          errorCode: (error as { code?: number })?.code,
        }));
        if (generation.current === attempt) {
          automaticRefreshUsed.current = true;
          setState({ location: null, gpsAt: 0, ...gpsFailure(error) });
        }
      };
      try {
        if (!window.isSecureContext) {
          setState({
            location: null,
            gpsAt: 0,
            status: "unsupported",
            gpsError: "GPS requires a secure HTTPS connection.",
          });
          return;
        }
        const api = navigator.geolocation;
        if (!api) {
          setState({
            location: null,
            gpsAt: 0,
            status: "unsupported",
            gpsError:
              "GPS is unavailable in this browser. You can still use the camera without coordinates.",
          });
          return;
        }
        const accept = (
          position: GeolocationPosition,
          source: GPSDiagnosticDetails["source"] = "watchPosition",
        ) => {
          if (source === "watchPosition")
            trace("success_callback", () => ({
              ...flags(),
              source,
              positionTimestamp: position.timestamp,
              accuracyMeters: position.coords.accuracy,
            }));
          if (generation.current !== attempt) {
            trace("callback_decision", () => ({
              ...flags(),
              source,
              reason: "generation_changed",
            }));
            return;
          }
          const timestamp = normalizeGPSTimestamp(position.timestamp);
          if (!validPosition(position, timestamp)) {
            trace("callback_decision", () => ({
              ...flags(),
              source,
              reason: "invalid_position",
            }));
            fail({ code: 2 }, source);
            return;
          }
          // A cached/delayed watch callback must not replace a newer explicit fix.
          if (timestamp < latestTimestamp) {
            trace("callback_decision", () => ({
              ...flags(),
              source,
              reason: "older_than_latest",
            }));
            return;
          }
          trace("callback_decision", () => ({
            ...flags(),
            source,
            reason: "accepted",
            positionTimestamp: timestamp,
            accuracyMeters: position.coords.accuracy,
          }));
          latestTimestamp = timestamp;
          const receivedAt = Date.now();
          if (receivedAt - timestamp < 60000)
            automaticRefreshUsed.current = false;
          setNow(receivedAt);
          setState({
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
            gpsAt: timestamp,
            status: "ready",
            gpsError: "",
          });
        };
        const startWatch = () => {
          if (generation.current !== attempt) {
            trace("watch_start_ignored", () => ({
              ...flags(),
              source: "watchPosition",
              reason: "generation_changed",
            }));
            return;
          }
          try {
            trace("request_start", () => ({
              ...flags(),
              source: "watchPosition",
              maximumAge: 10000,
              timeout: 20000,
              enableHighAccuracy: true,
            }));
            const id = api.watchPosition(
              accept,
              (error) => {
                trace("error_callback", () => ({
                  ...flags(),
                  source: "watchPosition",
                  errorCode: (error as { code?: number })?.code,
                }));
                fail(error, "watchPosition");
              },
              {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 20000,
              },
            );
            watch.current = { api, id };
          } catch (error) {
            trace("request_threw", () => ({
              ...flags(),
              source: "watchPosition",
              errorCode: (error as { code?: number })?.code,
            }));
            fail(error, "watchPosition");
          }
        };
        if (!requestFresh || typeof api.getCurrentPosition !== "function") {
          startWatch();
          return;
        }
        requestPending.current = true;
        let settled = false;
        if (gpsDiagnostics) diagnosticSettled = () => settled;
        const complete = (position?: GeolocationPosition, error?: unknown) => {
          if (settled || generation.current !== attempt) {
            trace("callback_decision", () => ({
              ...flags(),
              source: "getCurrentPosition",
              reason:
                generation.current !== attempt
                  ? "generation_changed"
                  : "already_settled",
            }));
            return;
          }
          settled = true;
          clearTimeout(requestTimer.current);
          requestPending.current = false;
          if (position) accept(position, "getCurrentPosition");
          else fail(error, "getCurrentPosition");
          // Do not immediately prompt again after a denied explicit request.
          if (!error || gpsFailure(error).status !== "denied") startWatch();
        };
        requestTimer.current = setTimeout(() => {
          trace("local_timeout", () => ({
            ...flags(),
            source: "getCurrentPosition",
            timeout: 20000,
          }));
          complete(undefined, { code: 3 });
        }, 20000);
        try {
          trace("request_start", () => ({
            ...flags(),
            source: "getCurrentPosition",
            maximumAge: 0,
            timeout: 20000,
            enableHighAccuracy: true,
          }));
          api.getCurrentPosition(
            (position) => {
              trace("success_callback", () => ({
                ...flags(),
                source: "getCurrentPosition",
                positionTimestamp: position.timestamp,
                accuracyMeters: position.coords.accuracy,
              }));
              complete(position);
            },
            (error) => {
              trace("error_callback", () => ({
                ...flags(),
                source: "getCurrentPosition",
                errorCode: (error as { code?: number })?.code,
              }));
              complete(undefined, error);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 20000,
            },
          );
        } catch (error) {
          trace("request_threw", () => ({
            ...flags(),
            source: "getCurrentPosition",
            errorCode: (error as { code?: number })?.code,
          }));
          complete(undefined, error);
        }
      } catch (error) {
        fail(error);
      }
    },
    [enabled, stop],
  );
  const retryGPS = useCallback(() => startGPS(true), [startGPS]);
  useEffect(() => {
    if (enabled) startGPS();
    return stop;
  }, [enabled, startGPS, stop]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  const stale = state.status === "ready" && now - state.gpsAt >= 60000;
  useEffect(() => {
    trace("state_transition", () => ({
      stateStatus: state.status,
      status: stale ? "stale" : state.status,
      positionTimestamp: state.gpsAt || undefined,
      stateNow: now,
      hasPosition: state.location !== null,
      hasError: stale || !!state.gpsError,
    }));
  }, [state.status, state.gpsAt, state.gpsError, stale]);
  useEffect(() => {
    if (
      enabled &&
      stale &&
      !document.hidden &&
      !automaticRefreshUsed.current &&
      typeof watch.current?.api.getCurrentPosition === "function" &&
      !requestPending.current
    ) {
      trace("automatic_refresh", () => ({
        reason: "stale_fix",
        positionTimestamp: state.gpsAt,
      }));
      automaticRefreshUsed.current = true;
      startGPS(true);
    }
  }, [enabled, stale, now, startGPS]);
  return {
    ...state,
    status: stale ? ("stale" as const) : state.status,
    gpsError: stale
      ? "The last GPS fix is over a minute old. Tap Retry GPS for current coordinates."
      : state.gpsError,
    retryGPS,
  };
}
