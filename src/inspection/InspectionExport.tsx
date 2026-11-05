import { useEffect, useRef, useState } from "react";
import type { RecordItem } from "../domain";
import { readInspectionSettings, type InspectionFormat } from "./data";
interface Props {
  records: RecordItem[];
  day: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onDownload: (blob: Blob, name: string) => void;
}
export default function InspectionExport({
  records,
  day,
  busy,
  onBusyChange,
  onDownload,
}: Props) {
  const [format, setFormat] = useState<InspectionFormat>("xlsx");
  const [scope, setScope] = useState<"day" | "all">("day");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const control = useRef<AbortController | null>(null);
  useEffect(() => () => control.current?.abort(), []);
  const count = records.filter(
    (r) => r.kind === "photo" && (scope === "all" || r.day === day),
  ).length;
  async function exportReport() {
    if (control.current) return;
    const abort = new AbortController();
    control.current = abort;
    setRunning(true);
    onBusyChange(true);
    setError("");
    setProgress("Preparing inspection report…");
    try {
      const { exportInspectionReport } = await import("./export");
      const result = await exportInspectionReport(
        records,
        scope === "all" ? { kind: "all" } : { kind: "day", day },
        format,
        readInspectionSettings(),
        { signal: abort.signal, onProgress: setProgress },
      );
      onDownload(result.blob, result.filename);
      setProgress(
        `${result.count} photographs exported.${result.warnings.length ? ` ${result.warnings.length} photographs have no UTM fix; coordinate cells are blank.` : ""}`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        setProgress("Report export cancelled.");
      else {
        setProgress("");
        setError(
          error instanceof Error
            ? error.message
            : "Report export failed. Try a report for one day.",
        );
      }
    } finally {
      control.current = null;
      setRunning(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      className="inspection-export"
      aria-label="Export Inspection Report"
    >
      <h3>Export Inspection Report</h3>
      <p className="subtext">
        Periodic Fence Inspection · stamped photographs only
      </p>
      <div className="report-options">
        <label>
          Report format
          <select
            value={format}
            disabled={busy}
            onChange={(e) => setFormat(e.target.value as InspectionFormat)}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </label>
        <label>
          Report records
          <select
            value={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.value as "day" | "all")}
          >
            <option value="day">Selected day ({day})</option>
            <option value="all">All available records</option>
          </select>
        </label>
      </div>
      <p className="note">
        {count} photographs · Prepared By and Job Title are editable in report
        settings.
      </p>
      <button
        className="primary export"
        onClick={exportReport}
        disabled={busy || !count}
      >
        Export Inspection Report
      </button>
      {running && (
        <button
          className="report-cancel"
          onClick={() => control.current?.abort()}
        >
          Cancel report export
        </button>
      )}
      <p className="report-progress" aria-live="polite">
        {progress}
      </p>
      {error && (
        <p className="report-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
