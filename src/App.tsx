import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { useGeolocation } from "./useGeolocation";
import InspectionSettings from "./inspection/InspectionSettings";
import InspectionExport from "./inspection/InspectionExport";
import { allRecords, saveRecord, removeRecord } from "./storage";
import {
  utm,
  localDay,
  filename,
  recordsCSV,
  type Location,
  type Settings,
  type RecordItem,
} from "./domain";
const defaults: Settings = { project: "", stage: "", asset: "" };
function readSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem("geocamera-settings") || "{}",
    );
    return {
      project: typeof saved?.project === "string" ? saved.project : "",
      stage: typeof saved?.stage === "string" ? saved.stage : "",
      asset: typeof saved?.asset === "string" ? saved.asset : "",
    };
  } catch {
    return { ...defaults };
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function Media({ item }: { item: RecordItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(item.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [item.blob]);
  return item.kind === "photo" ? (
    <img src={url} alt={`${item.project || "Field"} capture`} />
  ) : (
    <video src={url} controls playsInline preload="metadata" />
  );
}
function coordinates(location: Location | null) {
  if (!location) return "Location unavailable";
  try {
    const u = utm(location.latitude, location.longitude);
    return `UTM ${u.zone}${u.hemisphere} · ${u.easting.toFixed(1)} E · ${u.northing.toFixed(1)} N`;
  } catch {
    return "Outside UTM coverage · WGS84 retained";
  }
}
export default function App() {
  const [launchVisible, setLaunchVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setLaunchVisible(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);
  const [settings, setSettings] = useState<Settings>(readSettings);
  const {
    location,
    gpsAt,
    gpsError,
    status: gpsStatus,
    retryGPS,
  } = useGeolocation(!launchVisible);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!launchVisible) window.GeoCameraStartup?.ready();
  }, [launchVisible]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [tab, setTab] = useState<"camera" | "library">("camera");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [day, setDay] = useState(localDay());
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const notify = (e: unknown) =>
    setMessage(e instanceof Error ? e.message : String(e));
  async function refresh() {
    try {
      setRecords(await allRecords());
      setStorageError("");
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Local records are temporarily unavailable. Existing data has not been deleted.",
      );
    }
  }
  useEffect(() => {
    mounted.current = true;
    refresh().catch(notify);
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function updateSettings(next: Settings) {
    setSettings(next);
    try {
      localStorage.setItem("geocamera-settings", JSON.stringify(next));
    } catch {
      setMessage(
        "Project settings could not be saved. Existing saved settings have not been cleared.",
      );
    }
  }
  useEffect(() => {
    if (video.current) video.current.srcObject = stream.current;
  }, [tab, camera]);
  function freshLocation() {
    return location && !gpsError && Date.now() - gpsAt < 60000
      ? { ...location }
      : null;
  }
  function base(
    kind: "photo" | "video",
    mime: string,
  ): Omit<RecordItem, "blob"> {
    const now = new Date();
    return {
      ...settings,
      id: crypto.randomUUID(),
      kind,
      mime,
      createdAt: now.toISOString(),
      day: localDay(now),
      location: freshLocation(),
    };
  }
  async function startCamera() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera requires HTTPS and a supported browser.");
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      setCamera(true);
      setMessage("Camera ready. Video records without audio.");
    } catch (e) {
      notify(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function persist(item: RecordItem) {
    await saveRecord(item);
    await refresh();
    setMessage(
      `${item.kind === "photo" ? "Photo" : "Video"} saved on this device${item.location ? "" : " · no current GPS fix"}.`,
    );
  }
  async function capture() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const v = video.current;
      if (!v?.videoWidth) throw new Error("Wait for the camera image to load.");
      const meta = base("photo", "image/jpeg");
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable");
      ctx.drawImage(v, 0, 0);
      const size = Math.max(16, Math.round(canvas.width / 48));
      const lines = [
        "GeoCamera · " + new Date(meta.createdAt).toLocaleString(),
        `${meta.project || "No project"} / ${meta.stage || "No stage"} / ${meta.asset || "No asset ID"}`,
        meta.location
          ? `WGS84 ${meta.location.latitude.toFixed(6)}, ${meta.location.longitude.toFixed(6)} · ±${meta.location.accuracy.toFixed(0)} m`
          : "GPS unavailable at capture",
        coordinates(meta.location),
      ];
      const height = size * 1.6 * lines.length + size;
      ctx.fillStyle = "rgba(35,12,21,.83)";
      ctx.fillRect(0, canvas.height - height, canvas.width, height);
      ctx.font = `${size}px sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? "#E8C58C" : "#F5EEE9";
        ctx.fillText(
          line,
          size,
          canvas.height - height + size * 1.6 * (i + 1),
          canvas.width - size * 2,
        );
      });
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Photo encoding failed"))),
          "image/jpeg",
          0.92,
        ),
      );
      await persist({ ...meta, blob });
    } catch (e) {
      notify(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function toggleRecording() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      setRecording(false);
      setBusy(true);
      return;
    }
    try {
      if (!stream.current || !video.current?.videoWidth)
        throw new Error("Start the camera first.");
      if (typeof MediaRecorder === "undefined")
        throw new Error("Video recording is unavailable in this browser.");
      const mime = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      if (!mime) throw new Error("No supported video recording format.");
      const meta = base("video", mime);
      const r = new MediaRecorder(stream.current, { mimeType: mime });
      const chunks: BlobPart[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        setMessage("Video recording failed.");
        setRecording(false);
        setBusy(false);
      };
      r.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: r.mimeType || mime });
          if (!blob.size) throw new Error("The recording is empty.");
          await persist({ ...meta, mime: blob.type, blob });
        } catch (e) {
          notify(e);
        } finally {
          setBusy(false);
        }
      };
      r.start(1000);
      setRecording(true);
      setMessage("Recording · GPS and project metadata captured at start.");
    } catch (e) {
      notify(e);
    }
  }
  async function exportDay() {
    setBusy(true);
    try {
      const selected = records.filter((r) => r.day === day);
      if (!selected.length) throw new Error("No records for the selected day.");
      const zip = new JSZip();
      zip.file("records.csv", recordsCSV(selected));
      for (const r of selected) zip.file(`media/${filename(r)}`, r.blob);
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "STORE",
      });
      download(blob, `GeoCamera-${day}.zip`);
      setMessage(
        `Exported ${selected.length} records with their original media.`,
      );
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function shareLocation() {
    try {
      const p = freshLocation();
      if (!p) throw new Error("Wait for a current GPS fix before sharing.");
      const text = `${settings.project || "GeoCamera"}${settings.asset ? " · " + settings.asset : ""}\nhttps://maps.google.com/?q=${p.latitude},${p.longitude}\nAccuracy ±${p.accuracy.toFixed(0)} m`;
      if (navigator.share)
        await navigator.share({ title: "GeoCamera location", text });
      else {
        await navigator.clipboard.writeText(text);
        setMessage("Location copied. Paste it into WhatsApp.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) notify(e);
    }
  }
  const selected = records.filter((r) => r.day === day);
  return (
    <div className="app">
      {launchVisible && (
        <div
          className="launch-screen"
          role="status"
          aria-label="Starting GeoCamera"
        >
          <img
            src="/geocamera-full-logo.png"
            alt="GeoCamera — GIS Field Tools"
            onError={() => setLaunchVisible(false)}
          />
        </div>
      )}
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">◎</span>
          <span>
            GeoCamera<small>FIELD DOCUMENTATION</small>
          </span>
        </a>
        <span className="version">v1.0</span>
      </header>
      <main>
        {storageError && (
          <section className="storage-warning" role="alert">
            <p>{storageError}</p>
            <button
              onClick={() => {
                void refresh();
              }}
            >
              Retry Records
            </button>
          </section>
        )}
        <div className="intro">
          <p className="eyebrow">PRECISION IN EVERY FRAME</p>
          <h1>Your site. On record.</h1>
          <p>Capture the work. Keep the coordinates.</p>
        </div>
        <div className="workspace">
          <section className="capture-panel">
            <div className="section-heading">
              <h2>
                {tab === "camera" ? "Field camera" : "Your field records"}
              </h2>
              <span className="pill">● ON-DEVICE</span>
            </div>
            <nav className="tabs">
              <button
                className={tab === "camera" ? "active" : ""}
                onClick={() => setTab("camera")}
              >
                Camera
              </button>
              <button
                disabled={recording}
                className={tab === "library" ? "active" : ""}
                onClick={() => setTab("library")}
              >
                Records <span>{records.length}</span>
              </button>
            </nav>
            {tab === "camera" ? (
              <>
                <div className="viewfinder">
                  <video
                    ref={video}
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={() => video.current?.play().catch(notify)}
                  />
                  {!camera && (
                    <div className="camera-empty">
                      <span>◎</span>
                      <h3>Ready for the field</h3>
                      <p>Enable your camera to start documenting.</p>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={startCamera}
                      >
                        Enable camera
                      </button>
                    </div>
                  )}
                  {camera && (
                    <button
                      className="stop-camera"
                      disabled={recording || busy}
                      onClick={() => {
                        stream.current?.getTracks().forEach((t) => t.stop());
                        stream.current = null;
                        setCamera(false);
                      }}
                    >
                      Close camera
                    </button>
                  )}
                  <span className="finder-label">
                    {recording ? "● REC" : "LIVE VIEW"}{" "}
                    <b> / {mode.toUpperCase()}</b>
                  </span>
                  <div className="finder-bottom">
                    <strong>{settings.project || "PROJECT NOT SET"}</strong>
                    <span>
                      {settings.asset || "No asset ID"} ·{" "}
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                  <i className="corner tl" />
                  <i className="corner br" />
                </div>
                <div className="capture-controls">
                  <div className="mode">
                    <button
                      disabled={recording}
                      className={mode === "photo" ? "chosen" : ""}
                      onClick={() => setMode("photo")}
                    >
                      Photo
                    </button>
                    <button
                      disabled={recording}
                      className={mode === "video" ? "chosen" : ""}
                      onClick={() => setMode("video")}
                    >
                      Video
                    </button>
                  </div>
                  <button
                    className={`shutter ${recording ? "recording" : ""}`}
                    aria-label={
                      mode === "photo"
                        ? "Capture photo"
                        : recording
                          ? "Stop recording"
                          : "Start recording"
                    }
                    disabled={!camera || busy}
                    onClick={mode === "photo" ? capture : toggleRecording}
                  >
                    <span />
                  </button>
                  <span className="capture-hint">
                    {recording
                      ? "Tap to stop"
                      : mode === "photo"
                        ? "Tap to capture"
                        : "Record video"}
                  </span>
                </div>
                <p className="note">
                  Photos include a permanent location & time stamp. Videos keep
                  capture metadata in the record and CSV.
                </p>
              </>
            ) : (
              <div className="library">
                <label className="date-label">
                  Record date
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </label>
                <button
                  className="primary export"
                  onClick={exportDay}
                  disabled={busy || !selected.length}
                >
                  ↓ Export day · CSV + media ZIP
                </button>
                <InspectionExport
                  records={records}
                  day={day}
                  busy={busy}
                  onBusyChange={setBusy}
                  onDownload={download}
                />
                {!selected.length ? (
                  <div className="empty-records">
                    No captures on this date.
                    <br />
                    <small>Your field story starts with a photo.</small>
                  </div>
                ) : (
                  selected.map((r) => (
                    <article className="record" key={r.id}>
                      <Media item={r} />
                      <div className="record-info">
                        <strong>{r.asset || "Untitled asset"}</strong>
                        <span>
                          {r.kind} ·{" "}
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </span>
                        <p>
                          {r.project || "No project"} / {r.stage || "No stage"}
                        </p>
                        <small>{coordinates(r.location)}</small>
                        <div className="record-actions">
                          <button onClick={() => download(r.blob, filename(r))}>
                            Save {r.kind}
                          </button>
                          <button
                            onClick={async () => {
                              if (
                                confirm(
                                  "Delete this capture permanently from this device?",
                                )
                              ) {
                                try {
                                  await removeRecord(r.id);
                                  await refresh();
                                } catch (e) {
                                  notify(e);
                                }
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
          <aside>
            <section className="card">
              <div className="section-heading">
                <h2>Project details</h2>
                <span className="step">01</span>
              </div>
              <p className="subtext">Give every capture the right context.</p>
              {(
                [
                  ["project", "Project name", "e.g. North District"],
                  ["stage", "Stage name", "e.g. Foundation works"],
                  ["asset", "Asset ID", "e.g. ND-FW-001"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={100}
                    value={settings[key]}
                    placeholder={placeholder}
                    disabled={recording}
                    onChange={(e) =>
                      updateSettings({ ...settings, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </section>
            <InspectionSettings />
            <section className="card location-card">
              <div className="section-heading">
                <h2>Location</h2>
                <span className={`gps ${gpsStatus === "ready" ? "fixed" : ""}`}>
                  {gpsStatus === "ready"
                    ? "● GPS FIX"
                    : gpsStatus === "locating"
                      ? "○ WAITING"
                      : "○ GPS OFF"}
                </span>
              </div>
              <p className="subtext">WGS84 / automatic UTM zone</p>
              {location ? (
                <>
                  <div className="latlon">
                    <div>
                      <small>LATITUDE</small>
                      <strong>{location.latitude.toFixed(6)}°</strong>
                    </div>
                    <div>
                      <small>LONGITUDE</small>
                      <strong>{location.longitude.toFixed(6)}°</strong>
                    </div>
                  </div>
                  <div className="utm">{coordinates(location)}</div>
                  <p className="accuracy">
                    Accuracy ±{location.accuracy.toFixed(0)} m ·{" "}
                    {new Date(gpsAt).toLocaleTimeString()}
                  </p>
                </>
              ) : (
                <p className="gps-help">
                  Allow location access to attach coordinates to your field
                  records.
                </p>
              )}
              {gpsError && (
                <p className="gps-help" aria-live="polite">
                  {gpsError}
                </p>
              )}
              <button className="retry-gps" onClick={retryGPS}>
                Retry GPS
              </button>
              <details className="gps-guidance">
                <summary>Allow location in Safari</summary>
                <p>
                  iPhone Safari: open the page menu (aA or …), then Website
                  Settings → Location → Allow or Ask. In iPhone Settings →
                  Privacy &amp; Security → Location Services, enable Safari
                  Websites while using the app and Precise Location.
                </p>
                <p>
                  For a Home Screen app, check its location permission in iPhone
                  settings. On macOS, use Safari → Settings → Websites →
                  Location and allow this site. Then tap Retry GPS. Safari may
                  require changing the website permission before it will ask
                  again.
                </p>
                <p>
                  GPS permission is optional. Photos can be captured without
                  coordinates; GeoCamera will label them accordingly.
                </p>
              </details>
              <button className="share" onClick={shareLocation}>
                ↗ Share location <span>WhatsApp & more</span>
              </button>
            </section>
            <div className="privacy">
              <span>◈</span>
              <p>
                <strong>Your field data stays yours.</strong>
                <br />
                Stored locally. No account. No cloud upload.
                <br />
                Export regularly; browser storage can be cleared.
              </p>
            </div>
          </aside>
        </div>
        {message && (
          <div className="message" role="status">
            <span>{message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          </div>
        )}
      </main>
      <footer>
        <span>
          GEOCAMERA <b>/</b> BUILT FOR THE FIELD
        </span>
        <span>WGS84 · LOCAL FIRST</span>
      </footer>
    </div>
  );
}
