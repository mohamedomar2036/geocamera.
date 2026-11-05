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
  const stop = useCallback(() => {
    generation.current++;
    if (watch.current) {
      try {
        watch.current.api.clearWatch(watch.current.id);
      } catch {
        /* Browser APIs can be restricted independently. */
      }
      watch.current = null;
    }
  }, []);
  const retryGPS = useCallback(() => {
    stop();
    if (!enabled) return;
    const attempt = generation.current;
    setState({
      location: null,
      gpsAt: 0,
      status: "locating",
      gpsError: "Waiting for a current GPS fix…",
    });
    const fail = (error: unknown) => {
      if (generation.current === attempt)
        setState({ location: null, gpsAt: 0, ...gpsFailure(error) });
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
      const id = api.watchPosition(
        (position) => {
          if (generation.current !== attempt) return;
          if (!validPosition(position)) {
            fail({ code: 2 });
            return;
          }
          setNow(Date.now());
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
        },
        fail,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );
      watch.current = { api, id };
    } catch (error) {
      fail(error);
    }
  }, [enabled, stop]);
  useEffect(() => {
    if (enabled) retryGPS();
    return stop;
  }, [enabled, retryGPS, stop]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  const stale = state.status === "ready" && now - state.gpsAt >= 60000;
  return {
    ...state,
    status: stale ? ("stale" as const) : state.status,
    gpsError: stale
      ? "The last GPS fix is over a minute old. Tap Retry GPS for current coordinates."
      : state.gpsError,
    retryGPS,
  };
}
