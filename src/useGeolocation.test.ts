import { describe, expect, it } from "vitest";
import {
  gpsFailure,
  normalizeGPSTimestamp,
  validPosition,
} from "./useGeolocation";
describe("GPS failures", () => {
  it("distinguishes denied, timeout and unavailable fixes", () => {
    expect(gpsFailure({ code: 1 }).status).toBe("denied");
    expect(gpsFailure({ code: 3 }).status).toBe("timeout");
    expect(gpsFailure({ code: 2 }).status).toBe("unavailable");
    expect(
      gpsFailure(new DOMException("Restricted", "SecurityError")).status,
    ).toBe("denied");
  });
  it("rejects fabricated/out-of-range readings and invalid accuracy", () => {
    const p = {
      coords: { latitude: 24.7136, longitude: 46.6753, accuracy: 4 },
      timestamp: Date.now(),
    } as GeolocationPosition;
    expect(validPosition(p)).toBe(true);
    expect(
      validPosition({ ...p, coords: { ...p.coords, latitude: NaN } }),
    ).toBe(false);
    expect(
      validPosition({ ...p, coords: { ...p.coords, longitude: 181 } }),
    ).toBe(false);
    expect(validPosition({ ...p, coords: { ...p.coords, accuracy: -1 } })).toBe(
      false,
    );
    expect(validPosition({ ...p, timestamp: Infinity })).toBe(false);
  });
});

describe("GPS timestamp epochs", () => {
  const now = 1793964008538;
  const offset = 978307200000;
  it("normalizes the exact Safari runtime evidence without replacing its timestamp", () => {
    expect(normalizeGPSTimestamp(815656808507, now)).toBe(1793964008507);
    expect(now - normalizeGPSTimestamp(815656808507, now)).toBe(31);
  });
  it("leaves normal Chrome timestamps unchanged, including stale and future values", () => {
    for (const timestamp of [
      now,
      now - 31,
      now - 60000,
      now - 120000,
      now + 1,
      now + 30001,
    ])
      expect(normalizeGPSTimestamp(timestamp, now)).toBe(timestamp);
  });
  it("recognizes only a currently fresh Apple fix, never a stale or future candidate", () => {
    expect(normalizeGPSTimestamp(now - offset, now)).toBe(now);
    expect(normalizeGPSTimestamp(now - offset - 59999, now)).toBe(now - 59999);
    for (const age of [60000, 120000, -1, -30001]) {
      const timestamp = now - offset - age;
      expect(normalizeGPSTimestamp(timestamp, now)).toBe(timestamp);
    }
  });
  it("preserves invalid timestamps for rejection and rejects future dates beyond existing tolerance", () => {
    for (const timestamp of [NaN, Infinity, -Infinity, 0, -1]) {
      expect(normalizeGPSTimestamp(timestamp, now)).toBe(timestamp);
      expect(
        validPosition({
          coords: { latitude: 24, longitude: 46, accuracy: 35 },
          timestamp,
        } as GeolocationPosition),
      ).toBe(false);
    }
    expect(
      validPosition({
        coords: { latitude: 24, longitude: 46, accuracy: 35 },
        timestamp: Date.now() + 60000,
      } as GeolocationPosition),
    ).toBe(false);
  });
});
