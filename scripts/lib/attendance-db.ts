import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface PendingAttendanceBatch {
  id: string;
  classId: string;
  className: string;
  date: string;
  records: [string, string][];
  queuedAt: string;
}

interface AttendanceDB extends DBSchema {
  pending: {
    key: string;
    value: PendingAttendanceBatch;
  };
}

let dbPromise: Promise<IDBPDatabase<AttendanceDB>> | null = null;

export function getAttendanceDB() {
  if (!dbPromise) {
    dbPromise = openDB<AttendanceDB>("skuli-attendance", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pending")) {
          db.createObjectStore("pending", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function queueAttendanceBatch(batch: PendingAttendanceBatch): Promise<void> {
  const db = await getAttendanceDB();
  await db.put("pending", batch);

  // Request a background sync so queued attendance is flushed even if the
  // page is closed before reconnecting.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      // The SyncManager type isn't in the default lib DOM typings.
      await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(
        "sync-attendance"
      );
    } catch {
      // Background Sync unsupported — the page will sync on reconnect instead.
    }
  }
}

export async function getPendingBatches(): Promise<PendingAttendanceBatch[]> {
  const db = await getAttendanceDB();
  return db.getAll("pending");
}

export async function removePendingBatch(id: string): Promise<void> {
  const db = await getAttendanceDB();
  await db.delete("pending", id);
}
