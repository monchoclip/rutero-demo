export type OfflineMutation = {
  id: string;
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
  createdAt: string;
};

const DB_NAME = "ruts68-offline";
const STORE_NAME = "mutations";
const SNAPSHOT_STORE = "snapshots";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4068";
type RegistrationWithSync = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este navegador."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE))
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function canQueueOfflineMutation(method: string, path: string) {
  const normalized = method.toUpperCase();
  return (
    normalized === "POST" &&
    (path === "/activities" ||
      /^\/activities\/[^/]+\/(complete|start-visit)$/.test(path))
  );
}

export async function enqueueMutation(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
) {
  const db = await openQueue();
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    method,
    path,
    body,
    createdAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .add(mutation);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
  window.dispatchEvent(new Event("ruts68:queue-changed"));
  try {
    await navigator.serviceWorker?.ready.then((registration) =>
      (registration as RegistrationWithSync).sync?.register("ruts68-sync"),
    );
  } catch {
    // Background Sync is optional; the online event below is the fallback.
  }
}

export async function queuedMutationCount() {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openQueue();
  const count = await new Promise<number>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return count;
}

async function queuedMutations() {
  const db = await openQueue();
  const rows = await new Promise<OfflineMutation[]>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result as OfflineMutation[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function removeMutation(id: string) {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function replayOfflineQueue() {
  if (typeof navigator === "undefined" || !navigator.onLine)
    return { synced: 0, remaining: await queuedMutationCount() };
  const rows = await queuedMutations();
  let synced = 0;
  for (const mutation of rows) {
    try {
      const response = await fetch(`${API_URL}${mutation.path}`, {
        method: mutation.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Ruts68-Request": "1",
        },
        body: JSON.stringify(mutation.body),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok && response.status < 500) {
        await removeMutation(mutation.id);
        continue;
      }
      if (!response.ok) break;
      await removeMutation(mutation.id);
      synced += 1;
    } catch {
      break;
    }
  }
  const remaining = await queuedMutationCount();
  if (synced) window.dispatchEvent(new Event("ruts68:queue-changed"));
  return { synced, remaining };
}
