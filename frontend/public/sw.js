// Minimal service worker for Workora AI.
// Its only job right now is to exist, so the browser treats the app as
// installable (Add to Home Screen / desktop install icon appears).
// It does not cache anything and does not enable offline use of tasks,
// projects, or chat - that was intentionally left out for now.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass every request straight through to the network, unchanged.
  event.respondWith(fetch(event.request));
});
