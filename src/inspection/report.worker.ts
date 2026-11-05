import {
  generateInspectionDocument,
  type InspectionDocument,
} from "./generate";
import type { InspectionFormat } from "./data";
self.onmessage = async (
  event: MessageEvent<{ format: InspectionFormat; data: InspectionDocument }>,
) => {
  try {
    const bytes = await generateInspectionDocument(
      event.data.format,
      event.data.data,
    );
    self.postMessage({ bytes }, { transfer: [bytes.buffer as ArrayBuffer] });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Document generation failed.",
    });
  }
};
