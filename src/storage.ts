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
