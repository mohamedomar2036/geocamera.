import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PlaceResolver,
  matchingPlace,
  parsePlaceNames,
  PLACE_TTL,
  savePlacePreferences,
} from "./places";
const fix = { latitude: 24.7136, longitude: 46.6753, accuracy: 4 };
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        countryName: "Saudi Arabia",
        city: "Riyadh",
        principalSubdivision: "Riyadh Region",
      }),
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does not use locality or IP-derived fields as a guessed city", () => {
  expect(
    parsePlaceNames({
      countryName: "Saudi Arabia",
      locality: "Nearest settlement",
    }),
  ).toEqual({ country: "Saudi Arabia", city: undefined, area: undefined });
  expect(
    parsePlaceNames({ city: 12, countryName: { bad: "x" } }).city,
  ).toBeUndefined();
});
it("never sends coordinates before opt-in", async () => {
  const resolver = new PlaceResolver();
  expect(await resolver.resolve(fix, new AbortController().signal)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("requests current coordinates without credentials, caches the result and uses it offline", async () => {
  const resolver = new PlaceResolver();
  resolver.setEnabled(true);
  const result = await resolver.resolve(fix, new AbortController().signal);
  expect(result?.names.city).toBe("Riyadh");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toContain("latitude=24.7136");
  expect(options).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  vi.stubGlobal("navigator", { onLine: false });
  const next = new PlaceResolver();
  expect(
    (await next.resolve(fix, new AbortController().signal))?.names.country,
  ).toBe("Saudi Arabia");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not carry names to a different position or an expired cache", () => {
  const place = { location: fix, names: { city: "Riyadh" }, at: Date.now() };
  expect(matchingPlace(fix, place).city).toBe("Riyadh");
  expect(matchingPlace({ ...fix, latitude: 25 }, place)).toEqual({});
  expect(matchingPlace(null, place)).toEqual({});
  expect(matchingPlace({ ...fix, accuracy: 1001 }, place)).toEqual({});
  expect(
    matchingPlace(fix, { ...place, at: Date.now() - PLACE_TTL - 1 }),
  ).toEqual({});
});
it("rate limits across resolver instances and leaves new positions unresolved", async () => {
  const one = new PlaceResolver();
  one.setEnabled(true);
  await one.resolve(fix, new AbortController().signal);
  const two = new PlaceResolver();
  await expect(
    two.resolve({ ...fix, latitude: 25 }, new AbortController().signal),
  ).rejects.toThrow("rate limited");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("handles offline, provider failure, coarse fixes and cancellation without creating names", async () => {
  const resolver = new PlaceResolver();
  resolver.setEnabled(true);
  vi.stubGlobal("navigator", { onLine: false });
  await expect(
    resolver.resolve(fix, new AbortController().signal),
  ).rejects.toThrow("Offline");
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal("navigator", { onLine: true });
  await expect(
    resolver.resolve({ ...fix, accuracy: 1001 }, new AbortController().signal),
  ).rejects.toThrow("more precise");
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(resolver.resolve(fix, cancelled.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
  await expect(
    resolver.resolve(fix, new AbortController().signal),
  ).rejects.toThrow("unavailable");
  expect(resolver.cached(fix)).toBeNull();
});
it("does not change legacy project or report preference keys when using the optional cache", () => {
  values.set("geocamera-settings", "original");
  values.set("geocamera-inspection-settings", "preparer");
  savePlacePreferences({ enabled: true, entries: [], lastRequestAt: 0 });
  expect(values.get("geocamera-settings")).toBe("original");
  expect(values.get("geocamera-inspection-settings")).toBe("preparer");
});

it("honors an opt-out saved by another tab before sending another request", async () => {
  const resolver = new PlaceResolver();
  resolver.setEnabled(true);
  savePlacePreferences({ enabled: false, entries: [], lastRequestAt: 0 });
  expect(await resolver.resolve(fix, new AbortController().signal)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
