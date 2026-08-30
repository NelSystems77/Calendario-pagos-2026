/**
 * Recordatorios de pago — envío diario vía Web Push (cron de GitHub Actions).
 *
 * Lee las suscripciones del Worker de Cloudflare (GET /list), calcula qué pagos
 * caen hoy en una ventana de aviso (3 / 1 / 0 días) y manda una notificación por
 * cada combinación pago + ventana. Las suscripciones caducadas (404 / 410) se
 * borran del Worker (POST /prune).
 *
 * Secretos necesarios:
 *   WORKER_URL           https://xxx.workers.dev
 *   WORKER_ADMIN_TOKEN   el mismo valor que el secreto ADMIN_TOKEN del Worker
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 */

console.log("== enviar-recordatorios: arranque, node " + process.version + " ==");

let webpush, avisosPendientes, textoAviso, tagAviso;
try {
  webpush = require("web-push");
  ({ avisosPendientes, textoAviso, tagAviso } = require("../pagos-data.js"));
} catch (e) {
  console.error("Fallo al cargar dependencias: " + ((e && e.stack) || e));
  process.exit(1);
}

const WORKER_URL = (process.env.WORKER_URL || "").trim().replace(/\/$/, "");
const WORKER_ADMIN_TOKEN = (process.env.WORKER_ADMIN_TOKEN || "").trim();
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();

function exigir(nombre, valor) {
  if (!valor) { console.error("Falta la variable de entorno: " + nombre); process.exit(1); }
}
exigir("WORKER_URL", WORKER_URL);
exigir("WORKER_ADMIN_TOKEN", WORKER_ADMIN_TOKEN);
exigir("VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY);
exigir("VAPID_PRIVATE_KEY", VAPID_PRIVATE_KEY);

let vapidSubject = (process.env.VAPID_SUBJECT || "mailto:nelsystems77@gmail.com").trim();
if (!/^(mailto:|https?:)/i.test(vapidSubject)) vapidSubject = "mailto:" + vapidSubject;

console.log("Diagnóstico: worker=" + WORKER_URL +
  " | pub=" + VAPID_PUBLIC_KEY.length + "c | priv=" + VAPID_PRIVATE_KEY.length + "c");

try {
  webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.error("setVapidDetails falló: " + e.message);
  process.exit(1);
}

async function pedirSuscripciones() {
  const res = await fetch(WORKER_URL + "/list", {
    headers: { Authorization: "Bearer " + WORKER_ADMIN_TOKEN }
  });
  if (!res.ok) throw new Error("GET /list -> " + res.status + " " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return Array.isArray(data.subscriptions) ? data.subscriptions : [];
}

async function podarSuscripciones(endpoints) {
  if (!endpoints.length) return;
  const res = await fetch(WORKER_URL + "/prune", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + WORKER_ADMIN_TOKEN },
    body: JSON.stringify({ endpoints })
  });
  console.log("prune -> " + res.status + " (" + endpoints.length + " endpoint/s)");
}

(async () => {
  console.log("Fecha del runner (TZ=" + (process.env.TZ || "UTC") + "): " + new Date().toString());

  const avisos = avisosPendientes();
  if (avisos.length === 0) {
    console.log("Hoy no hay pagos en ventana de aviso. Nada que enviar.");
    return;
  }
  avisos.forEach(a => console.log("  aviso [" + a.dias + "d] " + a.pago.nombre));

  const subs = await pedirSuscripciones();
  console.log(subs.length + " suscripción(es) registradas.");

  let enviadas = 0, errores = 0;
  const caducadas = [];

  for (const sub of subs) {
    if (!sub || !sub.endpoint || !sub.keys) continue;
    const subscription = { endpoint: sub.endpoint, keys: sub.keys };
    let viva = true;

    for (const item of avisos) {
      const msg = textoAviso(item.pago.nombre, item.dias);
      const payload = JSON.stringify({
        title: msg.title,
        body: msg.body,
        tag: tagAviso(item.pago, item.dias),
        url: "./",
        requireInteraction: item.dias <= 1
      });
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 12 * 60 * 60 });
        enviadas++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) { viva = false; break; }
        errores++;
        console.warn("Error enviando: " + err.statusCode + " " +
          (err.body || err.message || "").toString().slice(0, 160));
      }
    }
    if (!viva) caducadas.push(sub.endpoint);
  }

  await podarSuscripciones(caducadas);
  console.log("Listo. Enviadas: " + enviadas + " | caducadas: " + caducadas.length + " | errores: " + errores);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
