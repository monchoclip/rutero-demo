const CACHE_NAME = "ruts68-shell-v1";
const APP_SHELL = ["/", "/app/", "/ingresar/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("ruts68-shell-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match("/")),
      ),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "ruts68-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window" })
      .then((clients) =>
        clients.forEach((client) =>
          client.postMessage({ type: "ruts68:sync" }),
        ),
      ),
  );
});
