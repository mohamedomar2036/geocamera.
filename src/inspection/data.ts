import { utm, type RecordItem } from "../domain";

export const INSPECTION_TITLE = "Periodic Fence Inspection";
export const INSPECTION_COLUMNS = [
  "Photo Number",
  "UTM X",
  "UTM Y",
  "Date",
  "Time",
  "Field Activity",
  "Photo",
  "Stage Number",
] as const;
export type InspectionFormat = "xlsx" | "docx";
export type InspectionScope = { kind: "day"; day: string } | { kind: "all" };
export interface InspectionSettings {
  preparedBy: string;
  jobTitle: string;
}
export const INSPECTION_SETTINGS_KEY = "geocamera-inspection-settings";
export const EMPTY_INSPECTION_SETTINGS: InspectionSettings = {
  preparedBy: "",
  jobTitle: "",
};
export function readInspectionSettings(): InspectionSettings {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(INSPECTION_SETTINGS_KEY) || "{}",
    );
    if (!saved || typeof saved !== "object")
      return { ...EMPTY_INSPECTION_SETTINGS };
    const values = saved as Record<string, unknown>;
    return {
      preparedBy:
        typeof values.preparedBy === "string"
          ? values.preparedBy.slice(0, 120)
          : "",
      jobTitle:
        typeof values.jobTitle === "string"
          ? values.jobTitle.slice(0, 120)
          : "",
    };
  } catch {
    return { ...EMPTY_INSPECTION_SETTINGS };
  }
}
export interface InspectionRow {
  photoNumber: number;
  utmX: number | null;
  utmY: number | null;
  /** Retained for the report's coordinate-system legend, not an extra column. */
  utmZone: string | null;
  date: string;
  time: string;
  fieldActivity: "Inspection";
  photo: Blob;
  stageNumber: string;
  recordId: string;
}
export class InspectionReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionReportError";
  }
}
export function inspectionRows(
  records: readonly RecordItem[],
  scope: InspectionScope,
): {
  rows: InspectionRow[];
  warnings: string[];
} {
  const photos = records
    .filter(
      (r) =>
        r.kind === "photo" && (scope.kind === "all" || r.day === scope.day),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  if (!photos.length)
    throw new InspectionReportError(
      "No photographs in the selected scope. Videos are excluded from inspection reports.",
    );
  const warnings: string[] = [];
  const rows = photos.map((r, index): InspectionRow => {
    const date = new Date(r.createdAt);
    if (Number.isNaN(date.getTime()))
      throw new InspectionReportError(
        `Photo ${index + 1} has an invalid timestamp. The original record was not changed.`,
      );
    let position: ReturnType<typeof utm> | null = null;
    if (r.location) {
      try {
        position = utm(r.location.latitude, r.location.longitude);
      } catch {
        /* Keep the photo and leave unavailable coordinates blank. */
      }
    }
    if (!position)
      warnings.push(
        `Photo ${index + 1}: UTM coordinates unavailable; coordinate cells must remain blank.`,
      );
    return {
      photoNumber: index + 1,
      utmX: position?.easting ?? null,
      utmY: position?.northing ?? null,
      utmZone: position ? `${position.zone}${position.hemisphere}` : null,
      date: r.day,
      time: date.toLocaleTimeString("en-GB", { hour12: false }),
      fieldActivity: "Inspection",
      photo: r.blob,
      stageNumber: r.stage,
      recordId: r.id,
    };
  });
  return { rows, warnings };
}
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (
    ![width, height, maxWidth, maxHeight].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new InspectionReportError("Invalid photograph dimensions.");
  const ratio = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
