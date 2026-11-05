import { describe, it, expect } from "vitest";
import { utm, recordsCSV, localDay, csvCell, type RecordItem } from "./domain";
describe("WGS84 to UTM", () => {
  it("projects the central meridian at the equator", () => {
    const p = utm(0, 3);
    expect(p.zone).toBe(31);
    expect(p.easting).toBeCloseTo(500000, 3);
    expect(p.northing).toBeCloseTo(0, 3);
  });
  it("handles southern false northing and longitude boundaries", () => {
    expect(utm(-1, 3).northing).toBeGreaterThan(9800000);
    expect(utm(-1, 3).hemisphere).toBe("S");
    expect(utm(0, 180).zone).toBe(60);
    expect(utm(0, -180).zone).toBe(1);
  });
  it("handles Norway and Svalbard exceptions", () => {
    expect(utm(60, 6).zone).toBe(32);
    expect(utm(78, 20).zone).toBe(33);
    expect(utm(78, 35).zone).toBe(37);
  });
  it("rejects polar and invalid coordinates", () => {
    expect(() => utm(85, 0)).toThrow();
    expect(() => utm(0, 181)).toThrow();
  });
});
it("exports escaped metadata, safe spreadsheet cells and a media reference", () => {
  const r = {
    id: "test",
    createdAt: "2026-01-01T00:00:00Z",
    day: "2026-01-01",
    kind: "photo",
    mime: "image/jpeg",
    project: "=SUM(1)",
    stage: 'a,"b',
    asset: "A",
    location: null,
  } as RecordItem;
  const csv = recordsCSV([r]);
  expect(csv).toContain("'=SUM(1)");
  expect(csv).toContain('a,""b');
  expect(csv).toContain("media/test.jpg");
});
it("uses local calendar days", () =>
  expect(localDay(new Date(2026, 0, 2, 23))).toBe("2026-01-02"));

it("keeps negative coordinates numeric while protecting spreadsheet text", () => {
  expect(csvCell(-33.9)).toBe('"-33.9"');
  expect(csvCell("  =1+1")).toBe('"\'  =1+1"');
});
