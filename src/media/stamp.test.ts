import { describe, expect, it } from "vitest";
import { currentLocation, stampLines } from "./stamp";
import { recordsCSV, type RecordItem } from "../domain";
const location = { latitude: 24.7136, longitude: 46.6753, accuracy: 4 };
it("includes brand, clock, project, stage, asset, WGS84, UTM and all resolved names", () => {
  const now = new Date("2026-11-05T09:12:13Z");
  const lines = stampLines(
    {
      project: "Fence",
      stage: "07",
      asset: "A-001",
      location,
      country: "Saudi Arabia",
      city: "Riyadh",
      area: "Riyadh Region",
    },
    now,
  ).join("\n");
  for (const value of [
    "MQSIO",
    now.toLocaleDateString(),
    now.toLocaleTimeString(),
    "Fence",
    "07",
    "A-001",
    "24.713600",
    "46.675300",
    "UTM 38N",
    "669459.6",
    "2734271.7",
    "±4 m",
    "Saudi Arabia",
    "Riyadh",
    "Riyadh Region",
  ])
    expect(lines).toContain(value);
  expect(lines).not.toContain("GeoCamera");
});
it("shows neutral missing GPS/place values and preserves polar WGS84", () => {
  const noFix = stampLines({
    project: "",
    stage: "",
    asset: "",
    location: null,
  }).join("\n");
  expect(noFix).toContain("Country: Unavailable");
  expect(noFix).toContain("City: Unavailable");
  expect(noFix).toContain("WGS84: Unavailable");
  expect(noFix).not.toContain("0.000000");
  expect(
    stampLines({
      project: "",
      stage: "",
      asset: "",
      location: { ...location, latitude: 89 },
    }).join("\n"),
  ).toContain("Outside coverage");
});
it("updates the clock and expires an old GPS fix during video recording", () => {
  const now = Date.now();
  expect(currentLocation(location, now - 59999, "", now)).toEqual(location);
  expect(currentLocation(location, now - 60000, "", now)).toBeNull();
  expect(currentLocation(location, now, "denied", now)).toBeNull();
  expect(currentLocation(location, now + 31000, "", now)).toBeNull();
  const meta = { project: "", stage: "", asset: "", location };
  expect(stampLines(meta, new Date(2026, 0, 1, 10, 0, 1))[0]).not.toBe(
    stampLines(meta, new Date(2026, 0, 1, 10, 0, 2))[0],
  );
});
it("appends new metadata in CSV while legacy records remain readable", () => {
  const legacy: RecordItem = {
    id: "old",
    project: "Site",
    stage: "07",
    asset: "1",
    location: null,
    kind: "photo",
    mime: "image/jpeg",
    blob: new Blob(["old"]),
    day: "2026-11-05",
    createdAt: "2026-11-05T09:00:00Z",
  };
  const current = {
    ...legacy,
    id: "new",
    country: "Saudi Arabia",
    city: "Riyadh",
    area: "Riyadh Region",
    videoStamped: true,
    stampVersion: 2,
  };
  const csv = recordsCSV([legacy, current]);
  expect(csv).toContain('"country","city","area"');
  expect(csv).toContain('"Saudi Arabia","Riyadh","Riyadh Region"');
  expect(csv).toContain("media/old.jpg");
  expect(legacy).not.toHaveProperty("country");
});
