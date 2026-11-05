import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordItem } from "../domain";
import {
  INSPECTION_COLUMNS,
  INSPECTION_SETTINGS_KEY,
  fitWithin,
  inspectionRows,
  readInspectionSettings,
} from "./data";
function record(overrides: Partial<RecordItem> = {}): RecordItem {
  return {
    id: "a",
    kind: "photo",
    createdAt: "2026-11-05T09:12:13Z",
    day: "2026-11-05",
    mime: "image/jpeg",
    blob: new Blob(["stored-stamped-photo"]),
    project: "Site",
    stage: "02",
    asset: "A",
    location: { latitude: 0, longitude: 3, accuracy: 4 },
    ...overrides,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("inspection report data", () => {
  it("uses the exact eight-column contract", () =>
    expect(INSPECTION_COLUMNS).toEqual([
      "Photo Number",
      "UTM X",
      "UTM Y",
      "Date",
      "Time",
      "Field Activity",
      "Photo",
      "Stage Number",
    ]));
  it("selects only photographs on the recorded day and keeps the stored stamped blob", () => {
    const photo = record();
    const { rows } = inspectionRows(
      [
        photo,
        record({ id: "v", kind: "video" }),
        record({ id: "old", day: "2026-11-04" }),
      ],
      { kind: "day", day: "2026-11-05" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].photo).toBe(photo.blob);
    expect(rows[0].fieldActivity).toBe("Inspection");
    expect(rows[0].stageNumber).toBe("02");
  });
  it("includes all days, numbers chronologically and does not mutate the library", () => {
    const library = [
      record({ id: "later" }),
      record({
        id: "earlier",
        createdAt: "2026-11-04T09:00:00Z",
        day: "2026-11-04",
      }),
    ];
    const { rows } = inspectionRows(library, { kind: "all" });
    expect(rows.map((r) => [r.photoNumber, r.recordId])).toEqual([
      [1, "earlier"],
      [2, "later"],
    ]);
    expect(library[0].id).toBe("later");
  });
  it("provides numeric easting/northing and retains UTM zone information", () => {
    const { rows } = inspectionRows([record()], { kind: "all" });
    expect(rows[0].utmX).toBeCloseTo(500000, 3);
    expect(rows[0].utmY).toBeCloseTo(0, 3);
    expect(rows[0].utmZone).toBe("31N");
    expect(typeof rows[0].utmX).toBe("number");
  });
  it("leaves missing or polar coordinates blank with explicit warnings, never zero", () => {
    const { rows, warnings } = inspectionRows(
      [
        record({ location: null }),
        record({
          id: "polar",
          location: { latitude: 89, longitude: 3, accuracy: 5 },
        }),
      ],
      { kind: "all" },
    );
    expect(rows.map((r) => [r.utmX, r.utmY])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(warnings).toHaveLength(2);
  });
  it("rejects empty selections and damaged timestamps with useful errors", () => {
    expect(() =>
      inspectionRows([record({ kind: "video" })], { kind: "all" }),
    ).toThrow("No photographs");
    expect(() =>
      inspectionRows([record()], { kind: "day", day: "2026-01-01" }),
    ).toThrow("No photographs");
    expect(() =>
      inspectionRows([record({ createdAt: "invalid" })], { kind: "all" }),
    ).toThrow("invalid timestamp");
  });
});
it("fits portrait and landscape images without stretching or upscaling", () => {
  expect(fitWithin(1920, 1080, 1200, 1200)).toEqual({
    width: 1200,
    height: 675,
  });
  expect(fitWithin(1080, 1920, 1200, 1200)).toEqual({
    width: 675,
    height: 1200,
  });
  expect(fitWithin(100, 50, 1200, 1200)).toEqual({ width: 100, height: 50 });
  expect(() => fitWithin(0, 100, 1200, 1200)).toThrow();
});
it("reads independent preparer settings safely without changing capture settings", () => {
  const getItem = vi.fn((key: string) =>
    key === INSPECTION_SETTINGS_KEY
      ? JSON.stringify({ preparedBy: "Inspector", jobTitle: "Field Engineer" })
      : null,
  );
  vi.stubGlobal("localStorage", { getItem });
  expect(readInspectionSettings()).toEqual({
    preparedBy: "Inspector",
    jobTitle: "Field Engineer",
  });
  expect(getItem).toHaveBeenCalledWith(INSPECTION_SETTINGS_KEY);
  getItem.mockReturnValue("{invalid");
  expect(readInspectionSettings()).toEqual({ preparedBy: "", jobTitle: "" });
  getItem.mockReturnValue(
    JSON.stringify({ preparedBy: { name: "bad" }, jobTitle: 123 }),
  );
  expect(readInspectionSettings()).toEqual({ preparedBy: "", jobTitle: "" });
});
