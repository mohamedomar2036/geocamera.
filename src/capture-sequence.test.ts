import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  allRecords,
  saveRecord,
  saveCaptureRecord,
  removeRecord,
} from "./storage";
import type { RecordItem } from "./domain";
function record(id: string, asset: string): RecordItem {
  return {
    id,
    asset,
    project: "Site",
    stage: "07",
    kind: "photo",
    mime: "image/jpeg",
    blob: new Blob([id]),
    day: "2026-11-05",
    createdAt: "2026-11-05T09:00:00Z",
    location: null,
  };
}
it("serializes concurrent saves and prevents duplicate assigned IDs without changing schema", async () => {
  const results = await Promise.allSettled([
    saveCaptureRecord(record("capture-a", "FENCE001")),
    saveCaptureRecord({ ...record("capture-b", "FENCE001"), kind: "video" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const saved = (await allRecords()).filter((r) => r.asset === "FENCE001");
  expect(saved).toHaveLength(1);
  expect(saved[0].sequenceVersion).toBe(1);
  await removeRecord(saved[0].id);
});
it("does not retroactively change or reject legacy identifiers on first sequence use", async () => {
  const old = record("legacy-row", "OLD001");
  await saveRecord(old);
  await saveCaptureRecord(record("new-row", "OLD001"));
  const saved = await allRecords();
  const legacy = saved.find((r) => r.id === old.id)!;
  expect(legacy.asset).toBe("OLD001");
  expect(await legacy.blob.text()).toBe("legacy-row");
  expect(legacy.sequenceVersion).toBeUndefined();
  await removeRecord("legacy-row");
  await removeRecord("new-row");
});
it("failed inserts leave old records and settings intact", async () => {
  await saveRecord(record("same-uuid", "legacy"));
  await expect(
    saveCaptureRecord(record("same-uuid", "new-id")),
  ).rejects.toThrow();
  const saved = (await allRecords()).find((r) => r.id === "same-uuid")!;
  expect(saved.asset).toBe("legacy");
  expect(saved.sequenceVersion).toBeUndefined();
  expect(await saved.blob.text()).toBe("same-uuid");
  await removeRecord("same-uuid");
});
