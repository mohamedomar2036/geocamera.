import { openDB } from "idb";
import type { RecordItem } from "./domain";
const db = openDB("geocamera", 1, {
  upgrade(db) {
    db.createObjectStore("records", { keyPath: "id" });
  },
});
export async function allRecords(): Promise<RecordItem[]> {
  return (await (await db).getAll("records")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export async function saveRecord(record: RecordItem) {
  await (await db).put("records", record);
}
export async function removeRecord(id: string) {
  await (await db).delete("records", id);
}
