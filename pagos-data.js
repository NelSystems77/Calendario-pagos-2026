// ============================================================
//  Calendario de Pagos 2026 — datos y lógica compartida.
//  Lo usan tanto la página (app.js) como el Service Worker.
//  IMPORTANTE: no usar aquí document / window / localStorage,
//  porque este archivo también se carga con importScripts().
// ============================================================

var PAGOS = [
    { nombre: "Enero 1ª bis + RN", fecha: "2026/01/09" },
    { nombre: "Excedentes FRAP", fecha: "2026/01/09" },
    { nombre: "Salario Escolar", fecha: "2026/01/19" },
    { nombre: "Enero 2ª bis + Extras Noviembre", fecha: "2026/01/23" },
    { nombre: "Pago de Uniformes (T1)", fecha: "2026/01/29" },
    { nombre: "Febrero 1ª bis + RN + FER (01/25)", fecha: "2026/02/06" },
    { nombre: "Febrero 2ª bis + Extras Diciembre", fecha: "2026/02/20" },
    { nombre: "Excedentes ASECCSS", fecha: "2026/02/01" },
    { nombre: "Marzo 1ª bis + RN + FER (01)", fecha: "2026/03/06" },
    { nombre: "Marzo 2ª bis + Extras Enero", fecha: "2026/03/20" },
    { nombre: "Abril 1ª bis + RN", fecha: "2026/04/03" },
    { nombre: "Abril 2ª bis + Extras Febrero", fecha: "2026/04/17" },
    { nombre: "Pago de Uniformes (T2)", fecha: "2026/04/23" },
    { nombre: "Mayo 1ª bis + RN", fecha: "2026/05/01" },
    { nombre: "Excedentes COOPECAJA", fecha: "2026/05/01" },
    { nombre: "Mayo 2ª bis + Extras Marzo", fecha: "2026/05/15" },
    { nombre: "Mayo 3ª bis", fecha: "2026/05/29" },
    { nombre: "Junio 1ª bis + RN + FER (2/3/11)", fecha: "2026/06/12" },
    { nombre: "Junio 2ª bis + Extras Abril", fecha: "2026/06/26" },
    { nombre: "Julio 1ª bis + RN + FER (1)", fecha: "2026/07/10" },
    { nombre: "Pago de Uniformes (T3)", fecha: "2026/07/16" },
    { nombre: "Julio 2ª bis + Extras Mayo", fecha: "2026/07/24" },
    { nombre: "Agosto 1ª bis + RN", fecha: "2026/08/07" },
    { nombre: "Agosto 2ª bis + Extras Junio", fecha: "2026/08/21" },
    { nombre: "Septiembre 1ª bis + RN + FER (25)", fecha: "2026/09/04" },
    { nombre: "Septiembre 2ª bis + Extras Julio", fecha: "2026/09/18" },
    { nombre: "Octubre 1ª bis + RN + FER (2/15/31)", fecha: "2026/10/02" },
    { nombre: "Octubre 2ª bis + Extras Agosto", fecha: "2026/10/16" },
    { nombre: "Pago de Uniformes (T4)", fecha: "2026/10/22" },
    { nombre: "Octubre 3ª bis", fecha: "2026/10/30" },
    { nombre: "Noviembre 1ª bis + RN + FER (15)", fecha: "2026/11/13" },
    { nombre: "Noviembre 2ª bis + Extras Septiembre", fecha: "2026/11/27" },
    { nombre: "Diciembre 1ª bis + RN + FER (12)", fecha: "2026/12/11" },
    { nombre: "Diciembre 2ª bis + Extras Octubre", fecha: "2026/12/25" }
];

// Días de antelación con que se avisa de cada pago.
var AVISOS_DIAS = [3, 1, 0];

var MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function crearFechaSegura(s) {
    var p = String(s).split('/');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 0, 0, 0, 0);
}

function inicioDeHoy() {
    var h = new Date();
    h.setHours(0, 0, 0, 0);
    return h;
}

// Días completos entre hoy (00:00 local) y la fecha del pago.
function diasHasta(fechaStr) {
    var ms = crearFechaSegura(fechaStr).getTime() - inicioDeHoy().getTime();
    return Math.round(ms / 86400000);
}

// Clave "AAAA-MM-DD" en hora local, para no repetir avisos el mismo día.
function claveDia(d) {
    d = d || new Date();
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
}

// Pagos que HOY caen exactamente en una de las ventanas de aviso.
function avisosPendientes() {
    var res = [];
    for (var i = 0; i < PAGOS.length; i++) {
        var d = diasHasta(PAGOS[i].fecha);
        if (AVISOS_DIAS.indexOf(d) !== -1) res.push({ pago: PAGOS[i], dias: d });
    }
    return res;
}

function textoAviso(nombre, dias) {
    if (dias === 0) return { title: '💰 Hoy pagan', body: nombre };
    if (dias === 1) return { title: '📢 ¡Mañana pagan!', body: nombre };
    return { title: '🗓️ Pago en ' + dias + ' días', body: nombre };
}

// Identificador único de notificación por pago + ventana de aviso.
// Incluye el nombre para no colapsar dos pagos de la misma fecha.
function tagAviso(pago, dias) {
    var slug = String(pago.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    return 'pago:' + pago.fecha + ':' + dias + ':' + slug;
}

// ============================================================
//  Configuración de notificaciones push (Web Push / VAPID).
//  - vapidPublicKey : clave pública VAPID (ver PUSH-SETUP.md).
//  - workerUrl      : URL del Worker de Cloudflare que guarda las
//                     suscripciones (p. ej. https://xxx.workers.dev).
// ============================================================
var PUSH_CONFIG = {
    vapidPublicKey: "BEe1IdCQQz6r84Ok1bWYLferNXvefKvduGvMFxCA8ic2NKx0OAYFdXU4_dwEvAOH5LOTKO-BJlmXPalv3SFkfMQ",
    workerUrl: "https://TU-WORKER.workers.dev"
};

function pushConfigListo() {
    return PUSH_CONFIG.vapidPublicKey.indexOf("PEGA_AQUI") !== 0 &&
        /^https:\/\//.test(PUSH_CONFIG.workerUrl) &&
        PUSH_CONFIG.workerUrl.indexOf("TU-WORKER") === -1;
}

// base64url -> Uint8Array (para applicationServerKey).
function base64UrlToUint8Array(base64String) {
    var padding = "=".repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

// Envía la PushSubscription al Worker de Cloudflare.
function guardarSuscripcion(sub) {
    var raw = sub.toJSON();
    var ua = "";
    try { ua = (navigator && navigator.userAgent || "").slice(0, 200); } catch (e) {}

    return fetch(PUSH_CONFIG.workerUrl.replace(/\/$/, "") + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            subscription: { endpoint: raw.endpoint, keys: raw.keys },
            ua: ua
        })
    }).then(function (r) {
        if (!r.ok) throw new Error("el Worker respondió " + r.status);
        return r.json();
    });
}

// Permite reutilizar la lógica desde los scripts de GitHub Actions (Node).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        PAGOS: PAGOS,
        AVISOS_DIAS: AVISOS_DIAS,
        MESES: MESES,
        crearFechaSegura: crearFechaSegura,
        diasHasta: diasHasta,
        avisosPendientes: avisosPendientes,
        textoAviso: textoAviso,
        tagAviso: tagAviso,
        claveDia: claveDia
    };
}
