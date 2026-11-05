import { openDB } from "idb";
import type { RecordItem } from "./domain";
// A denied/temporarily unavailable API must not throw while the app module is loading.
let db: ReturnType<typeof openDB> | undefined;
function database() {
  if (!db) {
    db = Promise.resolve()
      .then(() =>
        openDB("geocamera", 1, {
          terminated() {
            db = undefined;
          },
          upgrade(database) {
            database.createObjectStore("records", { keyPath: "id" });
          },
        }),
      )
      .catch((error) => {
        db = undefined; // Permit an explicit retry without deleting or upgrading anything.
        throw new Error(
          "Local records could not be opened. Existing data has not been deleted. Allow browser storage and tap Retry Records.",
          { cause: error },
        );
      });
  }
  return db;
}
export async function allRecords(): Promise<RecordItem[]> {
  return (await (await database()).getAll("records")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export async function saveRecord(record: RecordItem) {
  await (await database()).put("records", record);
}
export async function removeRecord(id: string) {
  await (await database()).delete("records", id);
}

/** Serial read/write transaction rejects overlapping new-sequence saves without migrating legacy data. */
export async function saveCaptureRecord(record: RecordItem) {
  const transaction = (await database()).transaction("records", "readwrite");
  try {
    if (record.asset.trim()) {
      let cursor = await transaction.store.openCursor();
      while (cursor) {
        if (
          cursor.value.sequenceVersion === 1 &&
          cursor.value.asset === record.asset
        )
          throw new Error(
            `Asset ID ${record.asset} was already saved by another capture. Choose a new starting Asset ID and retry.`,
          );
        cursor = await cursor.continue();
      }
    }
    await transaction.store.add({ ...record, sequenceVersion: 1 });
    await transaction.done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* Already completed or aborted. */
    }
    await transaction.done.catch(() => {});
    throw error;
  }
}
