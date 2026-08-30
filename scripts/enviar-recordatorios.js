/**
 * Recordatorios de pago — envío diario vía Web Push (cron de GitHub Actions).
 *
 * Lee subscriptions/*.json, descifra cada suscripción, calcula qué pagos caen
 * hoy en una ventana de aviso (3 / 1 / 0 días) y manda una notificación por
 * cada combinación pago + ventana. Las suscripciones caducadas (404 / 410) o
 * ilegibles se borran; el workflow hace commit de esa limpieza.
 *
 * Secretos necesarios: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
 * SUB_PRIVATE_KEY.
 */

console.log("== enviar-recordatorios: arranque, node " + process.version + " ==");

const fs = require("fs");
const path = require("path");

let webpush, avisosPendientes, textoAviso, tagAviso, descifrarSuscripcion;
try {
  webpush = require("web-push");
  ({ avisosPendientes, textoAviso, tagAviso } = require("../pagos-data.js"));
  ({ descifrarSuscripcion } = require("./lib-cripto"));
} catch (e) {
  console.error("Fallo al cargar dependencias: " + (e && e.stack || e));
  process.exit(1);
}

const SUBS_DIR = path.join(__dirname, "..", "subscriptions");
const {
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SUB_PRIVATE_KEY
} = process.env;

function exigir(nombre, valor) {
  if (!valor || !String(valor).trim()) {
    console.error("Falta la variable de entorno: " + nombre);
    process.exit(1);
  }
}
exigir("VAPID_PUBLIC_KEY", VAPID_PUBLIC_KEY);
exigir("VAPID_PRIVATE_KEY", VAPID_PRIVATE_KEY);
exigir("SUB_PRIVATE_KEY", SUB_PRIVATE_KEY);

// Normaliza el "subject": web-push exige mailto: o http(s):
let vapidSubject = (VAPID_SUBJECT || "mailto:nelsystems77@gmail.com").trim();
if (!/^(mailto:|https?:)/i.test(vapidSubject)) vapidSubject = "mailto:" + vapidSubject;

const pub = (VAPID_PUBLIC_KEY || "").trim();
const priv = (VAPID_PRIVATE_KEY || "").trim();
console.log("Diagnóstico: subject=" + vapidSubject +
  " | pub=" + pub.length + "c | priv=" + priv.length + "c | subKey=" + (SUB_PRIVATE_KEY || "").trim().length + "c");

try {
  webpush.setVapidDetails(vapidSubject, pub, priv);
} catch (e) {
  console.error("setVapidDetails falló: " + e.message);
  console.error("Revisa que VAPID_PUBLIC_KEY (~87 car.) y VAPID_PRIVATE_KEY (~43 car.) no estén invertidas ni con saltos de línea.");
  process.exit(1);
}

(async () => {
  console.log("Fecha del runner (TZ=" + (process.env.TZ || "UTC") + "): " + new Date().toString());

  const avisos = avisosPendientes();
  if (avisos.length === 0) {
    console.log("Hoy no hay pagos en ventana de aviso. Nada que enviar.");
    return;
  }
  avisos.forEach(a => console.log("  aviso [" + a.dias + "d] " + a.pago.nombre));

  let archivos = [];
  try {
    archivos = fs.readdirSync(SUBS_DIR).filter(f => f.endsWith(".json"));
  } catch (e) { /* carpeta aún sin crear */ }
  console.log(archivos.length + " suscripción(es) registradas.");

  let enviadas = 0, eliminadas = 0, errores = 0;
  const aBorrar = [];

  for (const f of archivos) {
    const ruta = path.join(SUBS_DIR, f);
    let rec;
    try { rec = JSON.parse(fs.readFileSync(ruta, "utf8")); }
    catch (e) { aBorrar.push(f); continue; }
    if (!rec || !rec.enc) { aBorrar.push(f); continue; }

    let sub;
    try { sub = await descifrarSuscripcion(rec.enc, SUB_PRIVATE_KEY); }
    catch (e) { console.warn("Ilegible " + f.slice(0, 12) + ": " + e.message); aBorrar.push(f); continue; }

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
        console.warn("Error enviando a " + f.slice(0, 12) + "…: " + err.statusCode +
          " " + (err.body || err.message || "").toString().slice(0, 160));
      }
    }
    if (!viva) aBorrar.push(f);
  }

  for (const f of aBorrar) {
    try { fs.unlinkSync(path.join(SUBS_DIR, f)); eliminadas++; } catch (e) {}
  }

  console.log("Listo. Enviadas: " + enviadas +
    " | eliminadas: " + eliminadas + " | errores: " + errores);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
