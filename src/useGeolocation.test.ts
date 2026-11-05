import { describe, expect, it } from "vitest";
import { gpsFailure, validPosition } from "./useGeolocation";
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
