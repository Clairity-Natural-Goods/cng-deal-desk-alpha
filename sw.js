/**
 * CNG Deal Desk Alpha V2 — Service Worker
 * Purpose: Safe, offline-capable app shell caching.
 * Security: Strictly excludes authentication tokens and private Supabase API queries.
 */

const CACHE_NAME = "cng-deal-desk-shell-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/icon-192.svg",
  "/assets/icon-512.svg",
  "/assets/env-config.js",
  "/assets/index-y0Vz-zph.css",
  "/assets/utils-fF95r_SJ.js",
  "/assets/index-A159RRyL.js",
  "/assets/auth/entry.js?v=2.0.3",
  "/assets/auth/LoginPage.js",
  "/assets/auth/RegisterPage.js",
  "/assets/auth-bg.jpg",
];

// Install Event: Pre-cache App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_SHELL).catch((err) => {
          console.warn("PWA: Some shell resources failed to precache:", err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First for HTML, Bypass for APIs
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Strict Exclusions: NEVER cache Supabase, backend APIs, or Auth endpoints
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/auth/v1/") ||
    url.pathname.startsWith("/rest/v1/") ||
    req.method !== "GET"
  ) {
    return; // Pass through directly to network
  }

  // 2. Navigation / HTML pages: Network-First with Cache Fallback
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match("/index.html") || caches.match("/");
        })
    );
    return;
  }

  // 3. Static Assets: Cache-First with Network Revalidation
  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".webmanifest") || url.pathname.endsWith(".svg")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Revalidate in background
          fetch(req)
            .then((networkResp) => {
              if (networkResp && networkResp.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResp));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(req).then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResp;
        });
      })
    );
    return;
  }

  // Default: Network with Cache Fallback
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
