import { fitWithin, InspectionReportError, type InspectionRow } from "./data";
export interface InspectionImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Report export cancelled.", "AbortError");
}
/** Resamples the stored stamped photo. Originals, GPS data and stamps are never replaced. */
export async function prepareInspectionImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<InspectionImage> {
  checkAbort(signal);
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new InspectionReportError(
            "A stored photograph could not be decoded. Export cancelled; your records are unchanged.",
          ),
        );
      onAbort = () =>
        reject(new DOMException("Report export cancelled.", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(
        () =>
          reject(
            new InspectionReportError(
              "Photograph decoding timed out. Please retry with a smaller selection.",
            ),
          ),
        15000,
      );
      image.src = url;
    });
    checkAbort(signal);
    const size = fitWithin(image.naturalWidth, image.naturalHeight, 1200, 1200);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    try {
      const context = canvas.getContext("2d");
      if (!context)
        throw new InspectionReportError(
          "This browser cannot prepare report photographs.",
        );
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      const encoded = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(
                  new InspectionReportError(
                    "Photograph encoding failed. Please try a smaller report.",
                  ),
                ),
          "image/jpeg",
          0.88,
        ),
      );
      checkAbort(signal);
      return { bytes: new Uint8Array(await encoded.arrayBuffer()), ...size };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
/** Sequential decoding bounds transient canvas memory and yields so cancellation stays responsive. */
export async function prepareInspectionImages(
  rows: readonly InspectionRow[],
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    maxBytes?: number;
  } = {},
): Promise<InspectionImage[]> {
  const images: InspectionImage[] = [];
  const budget = options.maxBytes ?? 48 * 1024 * 1024;
  let bytes = 0;
  for (const row of rows) {
    checkAbort(options.signal);
    const image = await prepareInspectionImage(row.photo, options.signal);
    bytes += image.bytes.byteLength;
    if (bytes > budget)
      throw new InspectionReportError(
        "This report is too large to generate safely on this device. Select a particular day instead. Your records are unchanged.",
      );
    images.push(image);
    options.onProgress?.(images.length, rows.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  checkAbort(options.signal);
  return images;
}
