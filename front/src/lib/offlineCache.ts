type Snapshot<T> = { key: string; value: T; updatedAt: string };

const DB_NAME = "ruts68-offline";
const STORE_NAME = "snapshots";
const MUTATION_STORE = "mutations";

function openCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este navegador."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      if (!db.objectStoreNames.contains(MUTATION_STORE))
        db.createObjectStore(MUTATION_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSnapshot<T>(key: string) {
  if (typeof indexedDB === "undefined") return null;
  const db = await openCache();
  const snapshot = await new Promise<Snapshot<T> | undefined>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () =>
        resolve(request.result as Snapshot<T> | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  db.close();
  return snapshot?.value ?? null;
}

export async function writeSnapshot<T>(key: string, value: T) {
  const db = await openCache();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({
        key,
        value,
        updatedAt: new Date().toISOString(),
      } satisfies Snapshot<T>);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}
