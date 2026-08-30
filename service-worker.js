// Sube APP_VERSION al cambiar cualquier archivo cacheado o los datos de pagos.
// Debe coincidir con el ?v= de index.html.
const APP_VERSION = "2026.4";
const CACHE_NAME = "pagos-" + APP_VERSION;

// Datos y lógica compartida (PAGOS, avisosPendientes, textoAviso, ...).
importScripts("pagos-data.js");

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

// Instalación: cachea los activos críticos.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
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

// Estrategia: red primero; si falla, caché. Solo peticiones GET de este origen.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html");
        return undefined;
      }))
  );
});

// ---------- Recordatorios de pagos ----------

// Muestra una notificación por cada pago que hoy cae en una ventana de aviso.
// El "tag" evita duplicados: si ya hay una notificación de ese pago/ventana,
// se reemplaza en silencio en lugar de acumularse.
function notificarPagos() {
  const pendientes = avisosPendientes();
  return Promise.all(pendientes.map(item => {
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
// El navegador decide la frecuencia real (aprox. 1 vez al día).
self.addEventListener("periodicsync", event => {
  if (event.tag === "revisar-pagos") {
    event.waitUntil(notificarPagos());
  }
});

// Permite forzar una revisión desde la página: navigator.serviceWorker.controller.postMessage("revisar-pagos")
self.addEventListener("message", event => {
  if (event.data === "revisar-pagos") {
    event.waitUntil(notificarPagos());
  }
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

// El navegador puede rotar la suscripción. Desde el SW no se puede abrir un
// issue de GitHub, así que avisamos al usuario para que reactive en la app.
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(
    self.registration.showNotification("Reactiva tus recordatorios", {
      body: "Abre el Calendario de Pagos y pulsa “Activar Recordatorios” de nuevo.",
      tag: "resubscribe",
      icon: "icon-192.png",
      badge: "icon-192.png",
      requireInteraction: true,
      data: { url: "./" }
    })
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
