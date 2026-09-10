export type OfflineMutation = {
  id: string;
  method: "POST" | "PATCH";
  path: string;
  body: unknown;
  createdAt: string;
  status?: "pending" | "conflict";
  attempts?: number;
  lastError?: string;
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

export async function queuedMutationSummary() {
  const rows = await queuedMutations();
  return {
    pending: rows.filter((row) => row.status !== "conflict").length,
    conflicts: rows.filter((row) => row.status === "conflict").length,
    total: rows.length,
  };
}

export async function retryOfflineConflicts() {
  const rows = await queuedMutations();
  await Promise.all(
    rows
      .filter((row) => row.status === "conflict")
      .map((row) =>
        updateMutation(row.id, { status: "pending", lastError: undefined }),
      ),
  );
  if (rows.some((row) => row.status === "conflict"))
    window.dispatchEvent(new Event("ruts68:queue-changed"));
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

async function updateMutation(id: string, data: Partial<OfflineMutation>) {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const store = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME);
    const read = store.get(id);
    read.onsuccess = () => {
      if (!read.result) return resolve();
      const request = store.put({ ...read.result, ...data });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    };
    read.onerror = () => reject(read.error);
  });
  db.close();
}

async function currentActivities() {
  const response = await fetch(`${API_URL}/activities`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Ruts68-Request": "1" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  return body.data ?? [];
}

async function alreadyApplied(mutation: OfflineMutation) {
  const activities = await currentActivities();
  if (mutation.path === "/activities") {
    const key = (mutation.body as { idempotencyKey?: string } | null)
      ?.idempotencyKey;
    return Boolean(
      key && activities.some((activity) => activity.idempotencyKey === key),
    );
  }
  const match = mutation.path.match(
    /^\/activities\/([^/]+)\/(complete|start-visit)$/,
  );
  if (!match) return false;
  const activity = activities.find((row) => row.id === match[1]);
  if (!activity) return false;
  return match[2] === "complete"
    ? activity.status === "completed"
    : Boolean(activity.visitStartedAt);
}

export async function replayOfflineQueue() {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    const summary = await queuedMutationSummary();
    return {
      synced: 0,
      remaining: summary.total,
      conflicts: summary.conflicts,
    };
  }
  const rows = await queuedMutations();
  let synced = 0;
  let conflicts = 0;
  for (const mutation of rows) {
    if (mutation.status === "conflict") {
      conflicts += 1;
      continue;
    }
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
        if (await alreadyApplied(mutation).catch(() => false)) {
          await removeMutation(mutation.id);
          synced += 1;
        } else {
          await updateMutation(mutation.id, {
            status: "conflict",
            attempts: (mutation.attempts ?? 0) + 1,
            lastError: `El servidor respondió ${response.status}.`,
          });
          conflicts += 1;
        }
        continue;
      }
      if (!response.ok) break;
      await removeMutation(mutation.id);
      synced += 1;
    } catch {
      break;
    }
  }
  const summary = await queuedMutationSummary();
  if (synced || conflicts)
    window.dispatchEvent(new Event("ruts68:queue-changed"));
  return { synced, remaining: summary.total, conflicts: summary.conflicts };
}
