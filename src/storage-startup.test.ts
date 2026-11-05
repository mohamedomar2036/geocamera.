import { indexedDB as workingDB } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("imports without IndexedDB and retries access without changing the schema or deleting data", async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", undefined);
  const storage = await import("./storage");
  await expect(storage.allRecords()).rejects.toThrow(
    "Existing data has not been deleted",
  );
  vi.stubGlobal("indexedDB", workingDB);
  // idb wraps IDB interfaces from the browser globals.
  const fake = await import("fake-indexeddb");
  for (const key of [
    "IDBRequest",
    "IDBTransaction",
    "IDBDatabase",
    "IDBObjectStore",
    "IDBIndex",
    "IDBCursor",
  ] as const)
    vi.stubGlobal(key, fake[key]);
  await expect(storage.allRecords()).resolves.toEqual([]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = workingDB.open("geocamera");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(db.version).toBe(1);
  expect([...db.objectStoreNames]).toEqual(["records"]);
  db.close();
});
