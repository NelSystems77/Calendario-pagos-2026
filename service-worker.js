// Sube APP_VERSION al cambiar cualquier archivo cacheado o los datos de pagos.
// Debe coincidir con el ?v= de index.html.
const APP_VERSION = "2026.7";
const CACHE_NAME = "pagos-" + APP_VERSION;

// Datos y lógica compartida (PAGOS, avisosPendientes, textoAviso, guardarSuscripcion...).
// Si fallara la carga, el Service Worker sigue vivo para servir la app.
try {
  importScripts("pagos-data.js");
} catch (e) {
  // sin los extras de recordatorios en segundo plano, pero la app carga igual
}

const ASSETS_TO_CACHE = [
  "./",
  "index.html",
  "pagos-data.js",
  "app.js",
  "manifest.json",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png"
];

// Instalación: cachea los activos. Un fallo suelto no rompe la instalación.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(ASSETS_TO_CACHE.map(url =>
        cache.add(url).catch(() => null)
      ))
    )
  );
  self.skipWaiting();
});

// Activación: borra cachés de versiones anteriores.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.map(n => (n !== CACHE_NAME ? caches.delete(n) : null))
      ))
      .then(() => self.clients.claim())
  );
});

// Estrategia:
//  - Navegación (abrir la app): red primero; si falla, index.html de caché.
//  - Resto de GET del mismo origen: caché primero (ignorando ?v=), refresco detrás.
// Nunca se resuelve a undefined -> nunca pantalla en blanco.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("index.html", { ignoreSearch: true })
          .then(r => r || caches.match("./", { ignoreSearch: true }))
          .then(r => r || new Response(
            "<h1>Sin conexión</h1><p>Abre la app con internet al menos una vez.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          ))
      )
    );
    return;
  }

  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const fromNet = fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fromNet;
    })
  );
});

// ---------- Recordatorios de pagos (extras; requieren pagos-data.js) ----------

function notificarPagos() {
  if (typeof avisosPendientes !== "function") return Promise.resolve();
  return Promise.all(avisosPendientes().map(item => {
    const msg = textoAviso(item.pago.nombre, item.dias);
    return self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: tagAviso(item.pago, item.dias),
      icon: "icon-192.png",
      badge: "icon-192.png",
      requireInteraction: item.dias <= 1,
      data: { url: "./" }
    });
  }));
}

// Sincronización periódica en segundo plano (Android / escritorio, PWA instalada).
self.addEventListener("periodicsync", event => {
  if (event.tag === "revisar-pagos") event.waitUntil(notificarPagos());
});

// Forzar una revisión desde la página.
self.addEventListener("message", event => {
  if (event.data === "revisar-pagos") event.waitUntil(notificarPagos());
});

// Push real: lo envía el cron de GitHub Actions (scripts/enviar-recordatorios.js).
self.addEventListener("push", event => {
  let payload = {
    title: "Calendario de Pagos 2026",
    body: "Tienes un pago próximo.",
    tag: "pago",
    url: "./",
    requireInteraction: false
  };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) { /* payload por defecto */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      requireInteraction: payload.requireInteraction === true,
      data: { url: payload.url || "./" }
    })
  );
});

// El navegador puede rotar la suscripción: hay que volver a registrarla.
self.addEventListener("pushsubscriptionchange", event => {
  if (typeof pushConfigListo !== "function" || !pushConfigListo()) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(PUSH_CONFIG.vapidPublicKey)
    }).then(guardarSuscripcion).catch(err => console.warn("Re-suscripción falló:", err))
  );
});

// Al tocar la notificación: enfoca la pestaña existente o abre la app.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf(self.location.origin) === 0 && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
