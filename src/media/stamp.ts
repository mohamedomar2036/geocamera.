import { utm, type Location, type Settings } from "../domain";
import type { PlaceNames } from "../places";
export interface StampMetadata extends Settings, PlaceNames {
  location: Location | null;
}
export function currentLocation(
  location: Location | null,
  gpsAt: number,
  error: string,
  now = Date.now(),
) {
  return location && !error && gpsAt <= now + 30000 && now - gpsAt < 60000
    ? { ...location }
    : null;
}
export function stampLines(meta: StampMetadata, date = new Date()): string[] {
  const p = meta.location;
  let grid = "UTM: Unavailable";
  if (p)
    try {
      const u = utm(p.latitude, p.longitude);
      grid = `UTM ${u.zone}${u.hemisphere} · X ${u.easting.toFixed(1)} m · Y ${u.northing.toFixed(1)} m`;
    } catch {
      grid = "UTM: Outside coverage · WGS84 retained";
    }
  return [
    `MQSIO · ${date.toLocaleDateString()} · ${date.toLocaleTimeString()}`,
    `Project: ${meta.project || "Unavailable"}`,
    `Stage: ${meta.stage || "Unavailable"} · Asset: ${meta.asset || "Unavailable"}`,
    p
      ? `WGS84 ${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)} · Accuracy ±${p.accuracy.toFixed(0)} m`
      : "WGS84: Unavailable · GPS accuracy: Unavailable",
    grid,
    `Country: ${meta.country || "Unavailable"} · City: ${meta.city || "Unavailable"}`,
    `Area/region: ${meta.area || "Unavailable"}`,
  ];
}
/** Shared renderer burns the same metadata into JPEG and every recorded video frame. */
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  meta: StampMetadata,
  date = new Date(),
) {
  const lines = stampLines(meta, date);
  const size = Math.max(8, Math.min(28, width / 48, height / 45));
  const pad = size * 0.7;
  const lineHeight = size * 1.3;
  const blockHeight = lines.length * lineHeight + pad * 2;
  ctx.save();
  ctx.fillStyle = "#230c15";
  ctx.fillRect(0, height - blockHeight, width, blockHeight);
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    let font = size;
    ctx.font = `${font}px sans-serif`;
    const available = width - pad * 2;
    if (ctx.measureText(line).width > available) {
      font = Math.max(8, (size * available) / ctx.measureText(line).width);
      ctx.font = `${font}px sans-serif`;
    }
    ctx.fillStyle = index === 0 ? "#E8C58C" : "#F5EEE9";
    ctx.fillText(
      line,
      pad,
      height - blockHeight + pad + lineHeight * (index + 0.5),
      available,
    );
  });
  ctx.restore();
}
