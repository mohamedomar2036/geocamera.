import { useCallback, useEffect, useRef, useState } from "react";
import type { Location } from "./domain";
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
export function validPosition(position: GeolocationPosition) {
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
    Number.isFinite(position.timestamp) &&
    position.timestamp > 0 &&
    position.timestamp <= Date.now() + 30000
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
  const stop = useCallback(() => {
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
  }, []);
  const startGPS = useCallback(
    (requestFresh = false) => {
      if (requestPending.current) return;
      stop();
      if (!enabled) return;
      const attempt = generation.current;
      if (requestFresh) automaticRefreshUsed.current = true;
      let latestTimestamp = 0;
      setState({
        location: null,
        gpsAt: 0,
        status: "locating",
        gpsError: "Waiting for a current GPS fix…",
      });
      const fail = (error: unknown) => {
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
        const accept = (position: GeolocationPosition) => {
          if (generation.current !== attempt) return;
          if (!validPosition(position)) {
            fail({ code: 2 });
            return;
          }
          // A cached/delayed watch callback must not replace a newer explicit fix.
          if (position.timestamp < latestTimestamp) return;
          latestTimestamp = position.timestamp;
          const receivedAt = Date.now();
          if (receivedAt - position.timestamp < 60000)
            automaticRefreshUsed.current = false;
          setNow(receivedAt);
          setState({
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
            gpsAt: position.timestamp,
            status: "ready",
            gpsError: "",
          });
        };
        const startWatch = () => {
          if (generation.current !== attempt) return;
          try {
            const id = api.watchPosition(accept, fail, {
              enableHighAccuracy: true,
              maximumAge: 10000,
              timeout: 20000,
            });
            watch.current = { api, id };
          } catch (error) {
            fail(error);
          }
        };
        if (!requestFresh || typeof api.getCurrentPosition !== "function") {
          startWatch();
          return;
        }
        requestPending.current = true;
        let settled = false;
        const complete = (position?: GeolocationPosition, error?: unknown) => {
          if (settled || generation.current !== attempt) return;
          settled = true;
          clearTimeout(requestTimer.current);
          requestPending.current = false;
          if (position) accept(position);
          else fail(error);
          // Do not immediately prompt again after a denied explicit request.
          if (!error || gpsFailure(error).status !== "denied") startWatch();
        };
        requestTimer.current = setTimeout(
          () => complete(undefined, { code: 3 }),
          20000,
        );
        try {
          api.getCurrentPosition(
            (position) => complete(position),
            (error) => complete(undefined, error),
            {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 20000,
            },
          );
        } catch (error) {
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
    if (
      enabled &&
      stale &&
      !document.hidden &&
      !automaticRefreshUsed.current &&
      typeof watch.current?.api.getCurrentPosition === "function" &&
      !requestPending.current
    ) {
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
