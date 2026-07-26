// EyeOnPit offline app-shell cache.
//
// Root-cause fix (Casino 1.4 stabilization): the previous version served
// the HTML document ("/") cache-first, unconditionally. Since the SW script
// itself rarely changes between app deploys, the browser never re-ran
// install/activate to refresh that cached document, so operators could be
// stuck on an arbitrarily old build indefinitely — the app "not updating"
// (Hi-Lo, or anything else) was almost always this document staying stale,
// not a logic bug. Fixed by making the *document* request network-first:
// every load gets the latest HTML (and therefore the correct, current,
// content-hashed JS/CSS chunk references) whenever the network is
// reachable, falling back to the cached shell only when it isn't — e.g.
// inside a casino with no Wi-Fi or cellular service. See plan.md §5.
//
// Hashed static assets (JS/CSS/images under /_next/static/...) are safe to
// keep cache-first: a real new build always emits new filenames, so there
// is no staleness risk there, only a speed win.

const CACHE_NAME = "eyeonpit-shell-v2";
const APP_SHELL_URLS = ["/", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  // Deliberately no self.skipWaiting() here — a freshly installed worker
  // waits until the page explicitly asks it to take over (see the
  // "SKIP_WAITING" message listener below), which only happens when an
  // operator clicks "Update Now". Taking over automatically mid-session
  // would swap the running app out from under an operator mid-hand.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

/** Network-first: always try the network so a reachable operator gets the current build; cache is purely the offline fallback. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.match("/");
    if (shell) return shell;
    throw new Error("Offline and no cached shell available.");
  }
}

/** Cache-first: instant for content-hashed assets, refreshing the cache in the background for next time. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    isNavigationRequest(event.request) ? networkFirst(event.request) : cacheFirst(event.request)
  );
});
