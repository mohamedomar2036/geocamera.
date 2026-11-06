import { useEffect, useRef, useState } from "react";
import {
  PlaceResolver,
  matchingPlace,
  PLACE_SETTINGS_KEY,
  readPlacePreferences,
  type ResolvedPlace,
} from "./places";
import type { Location } from "./domain";
export function usePlaceNames(location: Location | null) {
  const [resolver] = useState(() => new PlaceResolver());
  const [enabled, setEnabled] = useState(resolver.preferences.enabled);
  const [resolved, setResolved] = useState<ResolvedPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === PLACE_SETTINGS_KEY) {
        resolver.preferences = readPlacePreferences();
        setEnabled(resolver.preferences.enabled);
        setAttempt((n) => n + 1);
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [resolver]);
  useEffect(() => {
    controller.current?.abort();
    if (!enabled || !location) {
      setLoading(false);
      setResolved(null);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    void resolver
      .resolve(location, request.signal)
      .then((result) => {
        if (!request.signal.aborted) setResolved(result);
      })
      .catch((error) => {
        if (!request.signal.aborted) {
          setResolved(null);
          setError(
            error instanceof DOMException && error.name === "AbortError"
              ? "Place lookup timed out. Capture still works."
              : error instanceof Error
                ? error.message
                : "Place names unavailable.",
          );
        }
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [enabled, location?.latitude, location?.longitude, attempt, resolver]);
  return {
    enabled,
    resolved,
    names: enabled ? matchingPlace(location, resolved) : {},
    loading,
    error,
    setEnabled: (value: boolean) => {
      resolver.setEnabled(value);
      setEnabled(value);
    },
    retry: () => setAttempt((n) => n + 1),
  };
}
