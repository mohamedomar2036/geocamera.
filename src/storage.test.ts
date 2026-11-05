import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { allRecords, saveRecord, removeRecord } from "./storage";
import type { RecordItem } from "./domain";
it("retains metadata and media through IndexedDB and deletes explicitly", async () => {
  const item: RecordItem = {
    id: "storage-check",
    createdAt: new Date().toISOString(),
    day: "2026-11-05",
    kind: "photo",
    mime: "image/jpeg",
    blob: new Blob(["photo-bytes"], { type: "image/jpeg" }),
    project: "Site",
    stage: "Survey",
    asset: "A1",
    location: { latitude: 24.7136, longitude: 46.6753, accuracy: 4 },
  };
  await saveRecord(item);
  const found = (await allRecords()).find((r) => r.id === item.id)!;
  expect(found.project).toBe("Site");
  expect(found.location).toEqual(item.location);
  expect(await found.blob.text()).toBe("photo-bytes");
  await removeRecord(item.id);
  expect((await allRecords()).find((r) => r.id === item.id)).toBeUndefined();
});
