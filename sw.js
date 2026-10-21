// Service worker for ทางกลับบ้านยาย (baan-yai).
// Bump CACHE on every deploy so installed phones fetch the new version.
const CACHE = "baanyai-v8";
const FONT_CACHE = "baanyai-fonts";

// Every app file, relative to this script so it works under any sub-path.
const APP_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/engine.js",
  "./js/audio.js",
  "./js/scare.js",
  "./js/storage.js",
  "./js/windshield.js",
  "./js/scenery.js",
  "./data/looks.js",
  "./data/events.js",
  "./data/endings.js",
  "./data/ambushes.js",
  "./data/media.js",
  "./data/logs.js",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./media/tall.jpg",
  "./media/crowd.jpg",
  "./media/ghost-scream.webp",
  "./media/ghost-hair.webp",
  "./media/kuman.webp",
  "./media/face-1.jpg",
  "./media/face-2.jpg",
  "./media/face-6.jpg",
  "./media/face-9.jpg",
  "./media/face-13.jpg",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Precache the app shell, then take over immediately.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: "reload" skips the browser's HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(APP_FILES.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// Remove old app caches (the font cache is kept across versions) and control open pages.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Google Fonts: serve cached copy instantly, refresh it in the background.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Other cross-origin requests go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Same-origin: cache first, then network. Offline navigations fall back to the app shell.
  event.respondWith(
    cacheFirst(req).catch(() => {
      if (req.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    })
  );
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;

  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);

  const network = fetch(req)
    .then((res) => {
      // Font CSS/files from other origins may be opaque (no-cors), so accept that too.
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);

  return hit || network;
}
