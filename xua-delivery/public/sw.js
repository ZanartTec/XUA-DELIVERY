/* eslint-disable no-restricted-globals */

// ─────────────────────────────────────────────
//  Versão do cache — incremente ao mudar assets
// ─────────────────────────────────────────────
const CACHE_VERSION = "v2";
const CACHE_NAME = `xua-static-${CACHE_VERSION}`;
const API_CACHE  = `xua-api-${CACHE_VERSION}`;

// Rotas de shell pré-cacheadas no install
const PRECACHE_URLS = [
  "/",
  "/catalog",
  "/orders",
  "/cart",
  "/driver/deliveries",
  "/manifest.json",
  "/icons/icon.svg",
];

// ─────────────────────────────────────────────
//  INSTALL — pré-cache de shell do app
// ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // addAll falha silenciosamente por URL; usamos Promise.allSettled-like
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => {
              // URL pode não existir em dev — ignora
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ─────────────────────────────────────────────
//  ACTIVATE — limpa caches de versões anteriores
// ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─────────────────────────────────────────────
//  FETCH — estratégias por tipo de recurso
// ─────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignora requisições não-GET e de outras origens
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // ── API: Network First → fallback para cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── Navegação (HTML): Network First → offline fallback para "/"
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // ── Assets estáticos (JS, CSS, imagens): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// ─────────────────────────────────────────────
//  BACKGROUND SYNC — reprocessa fila offline
// ─────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "xua-sync-queue") {
    event.waitUntil(
      // Notifica todos os clients para executar a sincronização
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) => client.postMessage({ type: "SYNC_QUEUE" }))
      )
    );
  }
});

// ─────────────────────────────────────────────
//  PUSH NOTIFICATIONS
// ─────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "Xuá Delivery", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "xua-notification",
      data: { url: data.url || "/" },
    })
  );
});

// ─────────────────────────────────────────────
//  NOTIFICATION CLICK — foca ou abre a aba
// ─────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Foca uma aba existente se possível
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

