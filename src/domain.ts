import proj4 from "proj4";
export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
}
export interface Settings {
  project: string;
  stage: string;
  asset: string;
}
export interface RecordItem extends Settings {
  id: string;
  createdAt: string;
  day: string;
  kind: "photo" | "video";
  mime: string;
  blob: Blob;
  location: Location | null;
  country?: string;
  city?: string;
  area?: string;
  stampVersion?: number;
  videoStamped?: boolean;
  sequenceVersion?: number;
}
export function utm(lat: number, lon: number) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -80 ||
    lat > 84 ||
    lon < -180 ||
    lon > 180
  )
    throw new Error("UTM supports latitudes 80°S–84°N.");
  let zone = Math.min(60, Math.floor((lon + 180) / 6) + 1);
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84 && lon >= 0 && lon < 42)
    zone = lon < 9 ? 31 : lon < 21 ? 33 : lon < 33 ? 35 : 37;
  const hemisphere = lat >= 0 ? "N" : "S";
  const [easting, northing] = proj4(
    "EPSG:4326",
    `+proj=utm +zone=${zone} ${lat < 0 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`,
    [lon, lat],
  );
  return { zone, hemisphere, easting, northing };
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function csvCell(value: unknown) {
  const s = String(value ?? "");
  return (
    '"' +
    (typeof value === "string" && /^\s*[=+\-@]|^[\t\r\n]/.test(s)
      ? "'" + s
      : s
    ).replaceAll('"', '""') +
    '"'
  );
}
export function filename(r: RecordItem) {
  return `${r.id}.${r.kind === "photo" ? "jpg" : r.mime.includes("mp4") ? "mp4" : "webm"}`;
}
export function recordsCSV(records: RecordItem[]) {
  const rows = records.map((r) => {
    let u;
    try {
      if (r.location) u = utm(r.location.latitude, r.location.longitude);
    } catch {
      /* Outside UTM range; retain WGS84. */
    }
    return [
      r.id,
      r.createdAt,
      r.day,
      r.kind,
      r.project,
      r.stage,
      r.asset,
      r.location?.latitude,
      r.location?.longitude,
      r.location?.accuracy,
      u?.zone,
      u?.hemisphere,
      u?.easting,
      u?.northing,
      `media/${filename(r)}`,
      r.country,
      r.city,
      r.area,
    ];
  });
  return (
    "\uFEFF" +
    [
      [
        "id",
        "timestamp_iso",
        "local_day",
        "type",
        "project",
        "stage",
        "asset_id",
        "latitude_wgs84",
        "longitude_wgs84",
        "accuracy_m",
        "utm_zone",
        "hemisphere",
        "easting_m",
        "northing_m",
        "file",
        "country",
        "city",
        "area",
      ],
      ...rows,
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
