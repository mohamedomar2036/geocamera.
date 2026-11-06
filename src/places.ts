import type { Location } from "./domain";
export interface PlaceNames {
  country?: string;
  city?: string;
  area?: string;
}
export interface ResolvedPlace {
  location: Location;
  names: PlaceNames;
  at: number;
}
export const PLACE_SETTINGS_KEY = "geocamera-place-names-v1";
export const PLACE_TTL = 30 * 24 * 60 * 60 * 1000;
export const PLACE_INTERVAL = 60000;
const MATCH_METRES = 20;
export function distanceMetres(a: Location, b: Location) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function matchingPlace(
  location: Location | null,
  place: ResolvedPlace | null,
  now = Date.now(),
): PlaceNames {
  return location &&
    location.accuracy >= 0 &&
    location.accuracy <= 500 &&
    place &&
    now >= place.at &&
    now - place.at <= PLACE_TTL &&
    distanceMetres(location, place.location) <= MATCH_METRES
    ? place.names
    : {};
}
function safeName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : undefined;
}
export function parsePlaceNames(value: unknown): PlaceNames {
  const data = value as Record<string, unknown> | null;
  if (!data || typeof data !== "object")
    throw new Error("Place names are unavailable.");
  // Never substitute locality, nearest town, IP geolocation or a guessed name for city.
  return {
    country: safeName(data.countryName),
    city: safeName(data.city),
    area: safeName(data.principalSubdivision),
  };
}
interface PlacePreferences {
  enabled: boolean;
  entries: ResolvedPlace[];
  lastRequestAt: number;
}
export function readPlacePreferences(): PlacePreferences {
  try {
    const data = JSON.parse(localStorage.getItem(PLACE_SETTINGS_KEY) || "{}");
    const entries = Array.isArray(data?.entries)
      ? data.entries
          .filter(
            (e: ResolvedPlace) =>
              e &&
              Number.isFinite(e.at) &&
              e.at <= Date.now() &&
              Date.now() - e.at <= PLACE_TTL &&
              Number.isFinite(e.location?.latitude) &&
              Math.abs(e.location.latitude) <= 90 &&
              Number.isFinite(e.location?.longitude) &&
              Math.abs(e.location.longitude) <= 180 &&
              e.names &&
              typeof e.names === "object",
          )
          .slice(-50)
          .map((e: ResolvedPlace) => ({
            ...e,
            names: {
              country: safeName(e.names.country),
              city: safeName(e.names.city),
              area: safeName(e.names.area),
            },
          }))
      : [];
    return {
      enabled: data?.enabled === true,
      entries,
      lastRequestAt: Number.isFinite(data?.lastRequestAt)
        ? data.lastRequestAt
        : 0,
    };
  } catch {
    return { enabled: false, entries: [], lastRequestAt: 0 };
  }
}
export function savePlacePreferences(preferences: PlacePreferences) {
  try {
    localStorage.setItem(PLACE_SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    /* Optional cache failure must never block capture. */
  }
}
function consentRevoked() {
  try {
    const saved = localStorage.getItem(PLACE_SETTINGS_KEY);
    return saved !== null && JSON.parse(saved)?.enabled === false;
  } catch {
    return false;
  } // A current explicit opt-in can still work when optional cache storage is unavailable.
}
export class PlaceResolver {
  preferences = readPlacePreferences();
  setEnabled(enabled: boolean) {
    this.preferences.enabled = enabled;
    savePlacePreferences(this.preferences);
  }
  cached(location: Location) {
    return (
      [...this.preferences.entries]
        .reverse()
        .find(
          (place) =>
            Date.now() >= place.at &&
            Date.now() - place.at <= PLACE_TTL &&
            distanceMetres(location, place.location) <= MATCH_METRES,
        ) ?? null
    );
  }
  async resolve(
    location: Location,
    signal: AbortSignal,
  ): Promise<ResolvedPlace | null> {
    if (signal.aborted)
      throw new DOMException("Place lookup cancelled.", "AbortError");
    if (!this.preferences.enabled || consentRevoked()) return null;
    const cached = this.cached(location);
    if (cached) return cached;
    if (
      !Number.isFinite(location.latitude) ||
      Math.abs(location.latitude) > 90 ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.longitude) > 180 ||
      !Number.isFinite(location.accuracy) ||
      location.accuracy < 0 ||
      location.accuracy > 500
    )
      throw new Error("A more precise GPS fix is needed for place names.");
    if (!navigator.onLine)
      throw new Error(
        "Offline: uncached place names are unavailable. Capture still works.",
      );
    // Re-read the per-browser throttle to coordinate normal use across tabs/reloads.
    const saved = readPlacePreferences();
    if (
      Date.now() -
        Math.max(this.preferences.lastRequestAt, saved.lastRequestAt) <
      PLACE_INTERVAL
    )
      throw new Error(
        "Place lookup is rate limited. Wait a minute before retrying; capture still works.",
      );
    this.preferences.lastRequestAt = Date.now();
    savePlacePreferences(this.preferences);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    const timer = setTimeout(abort, 8000);
    try {
      const query = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        localityLanguage: "en",
      });
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?${query}`,
        {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      if (!response.ok)
        throw new Error(
          "The place-name provider is unavailable or rate limited. Capture still works.",
        );
      const names = parsePlaceNames(await response.json());
      if (!names.country && !names.city && !names.area)
        throw new Error("No place names were returned for this GPS fix.");
      if (!this.preferences.enabled || signal.aborted || consentRevoked())
        return null;
      const result = { location: { ...location }, names, at: Date.now() };
      this.preferences.entries = [
        ...this.preferences.entries.slice(-49),
        result,
      ];
      savePlacePreferences(this.preferences);
      return result;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
}
