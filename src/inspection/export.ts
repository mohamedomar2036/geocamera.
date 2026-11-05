import gulfUrl from "../../file_00000000e30c82438648e9277477d724 (2).png";
import neomUrl from "../../02_logo_3x_navy.png";
import {
  inspectionRows,
  InspectionReportError,
  type InspectionFormat,
  type InspectionScope,
  type InspectionSettings,
} from "./data";
import { prepareInspectionImages } from "./images";
import type { InspectionDocument } from "./generate";
import type { RecordItem } from "../domain";
async function loadLogo(
  url: string,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new InspectionReportError(
      "An approved report logo could not be loaded. Reopen GeoCamera online once, then retry.",
    );
  return { bytes: new Uint8Array(await response.arrayBuffer()), width, height };
}
function writeDocument(
  format: InspectionFormat,
  data: InspectionDocument,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Report export cancelled.", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./report.worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(new DOMException("Report export cancelled.", "AbortError"));
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        new InspectionReportError(
          "Report generation took too long. Please select a smaller date range or fewer photographs.",
        ),
      );
    }, 180000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (
      event: MessageEvent<{ bytes?: Uint8Array; error?: string }>,
    ) => {
      finish();
      if (event.data.bytes) resolve(event.data.bytes);
      else
        reject(
          new InspectionReportError(
            event.data.error || "Report generation failed.",
          ),
        );
    };
    worker.onerror = () => {
      finish();
      reject(
        new InspectionReportError(
          "The report could not be generated on this device. Try a report for one day. Your records are unchanged.",
        ),
      );
    };
    worker.onmessageerror = () => {
      finish();
      reject(
        new InspectionReportError(
          "The report data could not be transferred. Please retry with fewer photographs.",
        ),
      );
    };
    try {
      worker.postMessage({ format, data }, [
        ...data.images.map((image) => image.bytes.buffer as ArrayBuffer),
        data.branding.gulf.bytes.buffer as ArrayBuffer,
        data.branding.neom.bytes.buffer as ArrayBuffer,
      ]);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
export async function exportInspectionReport(
  records: readonly RecordItem[],
  scope: InspectionScope,
  format: InspectionFormat,
  settings: InspectionSettings,
  options: {
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  } = {},
) {
  const { rows, warnings } = inspectionRows(records, scope);
  options.onProgress?.("Loading approved report logos…");
  const [gulf, neom] = await Promise.all([
    loadLogo(gulfUrl, 1206, 329, options.signal),
    loadLogo(neomUrl, 2733, 3000, options.signal),
  ]);
  const images = await prepareInspectionImages(rows, {
    signal: options.signal,
    onProgress: (done, total) =>
      options.onProgress?.(`Preparing photograph ${done} of ${total}…`),
  });
  options.onProgress?.(
    `Writing ${format === "xlsx" ? "Excel" : "Word"} report (${rows.length} photographs)…`,
  );
  const bytes = await writeDocument(
    format,
    {
      rows: rows.map(({ photo, ...metadata }) => metadata),
      images,
      branding: { gulf, neom },
      settings,
      scopeLabel: scope.kind === "all" ? "All available records" : scope.day,
    },
    options.signal,
  );
  if (options.signal?.aborted)
    throw new DOMException("Report export cancelled.", "AbortError");
  const blob = new Blob([bytes.slice().buffer], {
    type:
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return {
    blob,
    filename: `Periodic-Fence-Inspection-${scope.kind === "all" ? "all-records" : scope.day}.${format}`,
    count: rows.length,
    warnings,
  };
}
