const STATIC_CACHE = "glass-frontier-static-v1";
const DATA_CACHE = "glass-frontier-data-v1";
const STATIC_ASSETS = ["/", "/index.html"];
const STATIC_EXTENSIONS = [".js", ".css", ".png", ".svg", ".ico", ".json", ".woff2", ".woff", ".ttf"];
const SESSION_STATE_REGEX = /\/sessions\/[^/]+\/state$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => Promise.resolve())
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
            .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

function cacheStatic(request) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }

    return fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match("/index.html"));
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return new Response(
          JSON.stringify({ error: "offline", cached: false }),
          {
            headers: { "Content-Type": "application/json" },
            status: 503
          }
        );
      })
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (SESSION_STATE_REGEX.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname.startsWith("/assets/") ||
    STATIC_EXTENSIONS.some((extension) => url.pathname.endsWith(extension))
  ) {
    event.respondWith(cacheStatic(request));
  }
});
