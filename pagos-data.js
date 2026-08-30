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
//  - encPublicKey   : clave pública RSA-OAEP (SPKI base64) con la que
//                     se cifra la suscripción antes de mandarla al issue.
//  - repo           : owner/repo donde se abren los issues.
// ============================================================
var PUSH_CONFIG = {
    vapidPublicKey: "BEe1IdCQQz6r84Ok1bWYLferNXvefKvduGvMFxCA8ic2NKx0OAYFdXU4_dwEvAOH5LOTKO-BJlmXPalv3SFkfMQ",
    encPublicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnZVdkzRfk8bQVu4bourGuW0TfnLgZAPFWgraUb7FMLmFPrjQs31PLzjcod+pw+OWuFgoBgFt4KRmJGK3BroH8K7nXdwtFjKKpQBYwtsX4VsX+JAY45IQiC+MWmvb2AYjvcSUMPgVmayqCUmkVKD81rngVTFyF1M+nsBE3+AM6jp3DOc332RBp1+/5F1GEyqjgKQui7J4yFVk4AYX0u+3ktycP+HL67zBXV2b3RhY3Pak9Ml2WWt5M4xy+3mAjvPzT5n42jOESChmuuwQkROEd021RLzcJ7c0zx4WndM1r/QIYi9Y0MQN1TcdL01WDrEVZxKrL5OYTUSxrigM8oWF+wIDAQAB",
    repo: "NelSystems77/Calendario-pagos-2026"
};

function pushConfigListo() {
    return PUSH_CONFIG.vapidPublicKey.indexOf("PEGA_AQUI") !== 0 &&
        PUSH_CONFIG.encPublicKey.indexOf("PEGA_AQUI") !== 0 &&
        PUSH_CONFIG.repo.indexOf("/") !== -1;
}

// ---------- Helpers base64 <-> bytes ----------
function base64UrlToUint8Array(base64String) {
    var padding = "=".repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function base64ToBytes(b64) {
    var raw = atob(b64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

function bytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

// ---------- Cifrado de la suscripción (sobre RSA-OAEP + AES-GCM) ----------
// Devuelve un único blob base64 apto para pegar en el cuerpo de un issue.
function cifrarSuscripcion(obj) {
    var subtle = crypto.subtle;
    var plaintext = new TextEncoder().encode(JSON.stringify(obj));
    var aesKey, iv, ct;

    return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"])
        .then(function (k) {
            aesKey = k;
            iv = crypto.getRandomValues(new Uint8Array(12));
            return subtle.encrypt({ name: "AES-GCM", iv: iv }, aesKey, plaintext);
        })
        .then(function (buf) {
            ct = new Uint8Array(buf);
            return subtle.exportKey("raw", aesKey);
        })
        .then(function (rawAes) {
            return subtle.importKey(
                "spki", base64ToBytes(PUSH_CONFIG.encPublicKey),
                { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
            ).then(function (pub) {
                return subtle.encrypt({ name: "RSA-OAEP" }, pub, rawAes);
            });
        })
        .then(function (encKeyBuf) {
            var envelope = {
                v: 1,
                k: bytesToBase64(new Uint8Array(encKeyBuf)),
                iv: bytesToBase64(iv),
                d: bytesToBase64(ct)
            };
            return btoa(JSON.stringify(envelope));
        });
}

// URL de "nuevo issue" prellenada con el blob cifrado.
function construirUrlIssue(blob) {
    var base = "https://github.com/" + PUSH_CONFIG.repo + "/issues/new";
    var titulo = "[push] alta de recordatorios";
    var cuerpo =
        "No edites este issue: un robot lo procesa y lo cierra solo.\n\n" +
        "```\n" + blob + "\n```\n";
    return base + "?title=" + encodeURIComponent(titulo) + "&body=" + encodeURIComponent(cuerpo);
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
