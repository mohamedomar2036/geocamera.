import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { captureIdentifier, nextIdentifier } from "./identifiers";
import { usePlaceNames } from "./usePlaceNames";
import { matchingPlace } from "./places";
import { currentLocation, drawStamp, type StampMetadata } from "./media/stamp";
import {
  startStampedRecording,
  validateStampedVideo,
  type StampedRecording,
} from "./media/recording";
import { useGeolocation } from "./useGeolocation";
import InspectionSettings from "./inspection/InspectionSettings";
import InspectionExport from "./inspection/InspectionExport";
import { allRecords, saveCaptureRecord, removeRecord } from "./storage";
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
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const {
    location,
    gpsAt,
    gpsError,
    status: gpsStatus,
    retryGPS,
  } = useGeolocation(!launchVisible);
  const places = usePlaceNames(currentLocation(location, gpsAt, gpsError));
  const liveStamp = useRef({
    location,
    gpsAt,
    gpsError,
    settings,
    place: places.resolved,
    placesEnabled: places.enabled,
  });
  liveStamp.current = {
    location,
    gpsAt,
    gpsError,
    settings,
    place: places.resolved,
    placesEnabled: places.enabled,
  };
  const [videoWarning, setVideoWarning] = useState("");
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
  const recordingSession = useRef<StampedRecording | null>(null);
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
      recordingSession.current?.cancel();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  function updateSettings(next: Settings) {
    latestSettings.current = next;
    setSettings(next);
    try {
      localStorage.setItem("geocamera-settings", JSON.stringify(next));
      return true;
    } catch {
      setMessage(
        "Project settings could not be saved. Existing saved settings have not been cleared.",
      );
      return false;
    }
  }
  useEffect(() => {
    if (video.current) video.current.srcObject = stream.current;
  }, [tab, camera]);
  function freshLocation() {
    return currentLocation(location, gpsAt, gpsError);
  }
  function frameMetadata(): StampMetadata {
    const current = liveStamp.current;
    const fix = currentLocation(
      current.location,
      current.gpsAt,
      current.gpsError,
    );
    return {
      ...current.settings,
      asset: captureIdentifier(current.settings.asset),
      location: fix,
      ...matchingPlace(fix, current.placesEnabled ? current.place : null),
    };
  }
  function base(
    kind: "photo" | "video",
    mime: string,
  ): Omit<RecordItem, "blob"> {
    const now = new Date();
    const snapshot = frameMetadata();
    return {
      ...snapshot,
      country: snapshot.country || "Unavailable",
      city: snapshot.city || "Unavailable",
      area: snapshot.area || "Unavailable",
      stampVersion: 2,
      id: crypto.randomUUID(),
      kind,
      mime,
      createdAt: now.toISOString(),
      day: localDay(now),
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
  async function persist(item: RecordItem, startingAsset: string) {
    await saveCaptureRecord(item);
    let nextSaved = true;
    // Never overwrite a starting ID manually edited while encoding/saving was in progress.
    if (
      latestSettings.current.asset === startingAsset &&
      startingAsset.trim()
    ) {
      nextSaved = updateSettings({
        ...latestSettings.current,
        asset: nextIdentifier(item.asset),
      });
    }
    await refresh();
    setMessage(
      `${item.kind === "photo" ? "Photo" : "Video"} saved on this device${item.location ? "" : " · no current GPS fix"}.${nextSaved ? "" : " Next Asset ID could not be persisted; check it before the next capture."}`,
    );
  }
  async function capture() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const v = video.current;
      if (!v?.videoWidth) throw new Error("Wait for the camera image to load.");
      const startingAsset = latestSettings.current.asset;
      const meta = base("photo", "image/jpeg");
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable");
      ctx.drawImage(v, 0, 0);
      drawStamp(
        ctx,
        canvas.width,
        canvas.height,
        meta,
        new Date(meta.createdAt),
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Photo encoding failed"))),
          "image/jpeg",
          0.92,
        ),
      );
      await persist({ ...meta, blob }, startingAsset);
    } catch (e) {
      notify(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function toggleRecording() {
    if (recordingSession.current) {
      recordingSession.current.stop();
      return;
    }
    if (busyRef.current || busy) return;
    try {
      if (!stream.current || !video.current?.videoWidth)
        throw new Error("Start the camera first.");
      const startingAsset = latestSettings.current.asset;
      const meta = base("video", "");
      const session = startStampedRecording(
        video.current,
        stream.current,
        () => ({ ...frameMetadata(), asset: meta.asset }),
        () => {
          if (mounted.current) {
            setRecording(false);
            setBusy(true);
          }
        },
      );
      recordingSession.current = session;
      busyRef.current = true;
      setVideoWarning("");
      setRecording(true);
      setMessage(
        "Recording stamped video without audio. Keep MQSIO in the foreground.",
      );
      void session.result
        .then(async (result) => {
          if (!mounted.current) return;
          const actualMime = await validateStampedVideo(result.blob);
          if (!mounted.current) return;
          await persist(
            {
              ...meta,
              mime: actualMime,
              blob: new Blob([result.blob], { type: actualMime }),
              videoStamped: true,
            },
            startingAsset,
          );
          if (result.reason)
            setMessage(result.reason + " The stamped clip was saved.");
        })
        .catch((error) => {
          if (mounted.current) {
            const text =
              error instanceof Error
                ? error.message
                : "Stamped-video recording failed. Use stamped photos instead.";
            setVideoWarning(text);
            notify(error);
          }
        })
        .finally(() => {
          if (recordingSession.current === session)
            recordingSession.current = null;
          busyRef.current = false;
          if (mounted.current) {
            setBusy(false);
            setRecording(false);
          }
        });
    } catch (error) {
      setVideoWarning(
        error instanceof Error
          ? error.message
          : "Stamped video is unavailable. Use stamped photos instead.",
      );
      notify(error);
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
      download(blob, `MQSIO-${day}.zip`);
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
      const text = `${settings.project || "MQSIO"}${settings.asset ? " · " + settings.asset : ""}\nhttps://maps.google.com/?q=${p.latitude},${p.longitude}\nAccuracy ±${p.accuracy.toFixed(0)} m`;
      if (navigator.share)
        await navigator.share({ title: "MQSIO location", text });
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
          aria-label="Starting MQSIO"
        >
          <img
            src="/mqsio-full-logo.png"
            alt="MQSIO — مقسيو — GIS FIELD TOOLS"
            onError={() => setLaunchVisible(false)}
          />
        </div>
      )}
      <header>
        <a className="brand" href="#">
          <img className="brand-icon" src="/mqsio-icon-192.png" alt="" />
          <span>
            MQSIO<small>GIS FIELD TOOLS</small>
          </span>
        </a>
        <span className="version">v2.0</span>
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
                {videoWarning && (
                  <div className="video-warning" role="alert">
                    <p>{videoWarning}</p>
                    <button
                      onClick={() => {
                        setMode("photo");
                        setVideoWarning("");
                      }}
                    >
                      Use stamped photos
                    </button>
                  </div>
                )}
                <p className="note">
                  Photos and supported videos contain permanent MQSIO metadata
                  stamps. Video time and valid GPS update during recording. No
                  audio.
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
                  coordinates; MQSIO will label them accordingly.
                </p>
              </details>
              <details className="gps-guidance place-card">
                <summary>Country & city (optional)</summary>
                <label className="place-consent">
                  <input
                    type="checkbox"
                    checked={places.enabled}
                    onChange={(e) => places.setEnabled(e.target.checked)}
                  />{" "}
                  Use online place names
                </label>
                <p className="subtext">
                  Optional: sends current GPS to BigDataCloud, at most once per
                  minute. Cached locally; photos and videos are never sent.
                  Capture never waits for a lookup.
                </p>
                <p>
                  Country: {places.names.country || "Unavailable"}
                  <br />
                  City: {places.names.city || "Unavailable"}
                  <br />
                  Area/region: {places.names.area || "Unavailable"}
                </p>
                {places.enabled && (
                  <>
                    <button
                      className="share"
                      disabled={places.loading || !freshLocation()}
                      onClick={places.retry}
                    >
                      {places.loading
                        ? "Resolving place names…"
                        : "Retry place names"}
                    </button>
                    <p className="note" aria-live="polite">
                      {places.error ||
                        "Provider administrative labels; not a surveyed boundary. No city is substituted when absent."}
                    </p>
                  </>
                )}
                <a
                  className="place-attribution"
                  href="https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api"
                  target="_blank"
                  rel="noreferrer"
                >
                  BigDataCloud service & privacy information
                </a>
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
          MQSIO <b>/</b> BUILT FOR THE FIELD
        </span>
        <span>WGS84 · LOCAL FIRST</span>
      </footer>
    </div>
  );
}
