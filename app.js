// ============================================================
//  Calendario de Pagos 2026 — interfaz y recordatorios.
//  Requiere que pagos-data.js se cargue ANTES que este archivo.
// ============================================================

// ---------- Render de la lista ----------
function renderizarPagos() {
    var cont = document.getElementById("listaPagos");
    if (!cont) return;

    var proximos = PAGOS.map(function (p) {
        return {
            nombre: p.nombre,
            fecha: p.fecha,
            dias: diasHasta(p.fecha),
            obj: crearFechaSegura(p.fecha)
        };
    }).filter(function (p) {
        return p.dias >= 0;
    }).sort(function (a, b) {
        return a.dias - b.dias;
    });

    cont.innerHTML = "";

    if (proximos.length === 0) {
        var vacio = document.createElement("p");
        vacio.className = "vacio";
        vacio.textContent = "No hay pagos pendientes en el calendario 2026. 🎉";
        cont.appendChild(vacio);
        return;
    }

    proximos.forEach(function (p) {
        var status = "ok";
        var texto = "Faltan " + p.dias + " días";
        if (p.dias === 0) { status = "urgente"; texto = "¡Se paga hoy!"; }
        else if (p.dias === 1) { status = "pendiente"; texto = "¡Mañana!"; }
        else if (p.dias <= 3) { status = "pendiente"; texto = "En " + p.dias + " días"; }

        var div = document.createElement("div");
        div.className = "pago";

        var info = document.createElement("div");
        info.className = "pago-info";

        var h3 = document.createElement("h3");
        h3.textContent = p.nombre;

        var fecha = document.createElement("p");
        fecha.textContent = "📅 " + p.obj.getDate() + " de " + MESES[p.obj.getMonth()] + ", 2026";

        info.appendChild(h3);
        info.appendChild(fecha);

        var badge = document.createElement("div");
        badge.className = "status-badge " + status;
        badge.textContent = texto;

        div.appendChild(info);
        div.appendChild(badge);
        cont.appendChild(div);
    });
}

// ---------- Utilidades de entorno ----------
function esiOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function appInstalada() {
    return window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
}

function soportaNotificaciones() {
    return "Notification" in window && "serviceWorker" in navigator;
}

function puedeSuscribirPush() {
    return pushConfigListo() && "PushManager" in window && "serviceWorker" in navigator;
}

// ---------- Mostrar avisos desde la página ----------
// forzar = true  -> muestra aunque ya se haya mostrado hoy (al pulsar el botón)
// forzar = false -> una sola vez al día por ventana (al abrir la app)
function mostrarAvisos(forzar) {
    if (!soportaNotificaciones() || Notification.permission !== "granted") {
        return Promise.resolve();
    }

    return navigator.serviceWorker.ready.then(function (reg) {
        var hoy = claveDia();
        var mostradas = {};
        try {
            mostradas = JSON.parse(localStorage.getItem("avisosMostrados") || "{}");
        } catch (e) { mostradas = {}; }

        var cadena = Promise.resolve();

        avisosPendientes().forEach(function (item) {
            var tag = tagAviso(item.pago, item.dias);
            if (!forzar && mostradas[tag] === hoy) return;

            var msg = textoAviso(item.pago.nombre, item.dias);
            cadena = cadena.then(function () {
                return reg.showNotification(msg.title, {
                    body: msg.body,
                    tag: tag,
                    icon: "icon-192.png",
                    badge: "icon-192.png",
                    requireInteraction: item.dias <= 1,
                    data: { url: "./" }
                });
            });
            mostradas[tag] = hoy;
        });

        return cadena.then(function () {
            try {
                localStorage.setItem("avisosMostrados", JSON.stringify(mostradas));
            } catch (e) { /* almacenamiento no disponible */ }
        });
    });
}

// ---------- Suscripción a Web Push (Worker de Cloudflare) ----------
// Crea (o reutiliza) la PushSubscription y la manda al Worker.
function suscribirPush() {
    if (!puedeSuscribirPush()) return Promise.resolve();

    return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existente) {
            if (existente) return existente;
            return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(PUSH_CONFIG.vapidPublicKey)
            });
        });
    }).then(function (sub) {
        return guardarSuscripcion(sub).then(function () {
            try { localStorage.setItem("pushSuscrito", sub.endpoint); } catch (e) {}
            actualizarEstado();
        });
    }).catch(function (e) {
        console.warn("Suscripción push falló:", e);
    });
}

// ---------- Sincronización periódica en segundo plano ----------
function registrarSyncPeriodico() {
    return navigator.serviceWorker.ready.then(function (reg) {
        if (!("periodicSync" in reg)) return;
        return navigator.permissions.query({ name: "periodic-background-sync" }).then(function (st) {
            if (st.state !== "granted") return;
            return reg.periodicSync.register("revisar-pagos", {
                minInterval: 12 * 60 * 60 * 1000
            });
        });
    }).catch(function (e) {
        console.warn("periodicSync no disponible:", e);
    });
}

// ---------- Botón "Activar Recordatorios" ----------
function activarRecordatorios() {
    if (!soportaNotificaciones()) {
        if (esiOS() && !appInstalada()) {
            alert("En iPhone/iPad primero instala la app:\nCompartir → \"Añadir a pantalla de inicio\", ábrela desde el ícono y vuelve a intentar.");
        } else {
            alert("Este navegador no soporta notificaciones web.");
        }
        return;
    }

    Notification.requestPermission().then(function (permiso) {
        if (permiso !== "granted") {
            alert("No se concedió el permiso. Puedes activarlo luego desde los ajustes del navegador para este sitio.");
            actualizarEstado();
            return;
        }

        try { localStorage.setItem("recordatoriosActivos", "1"); } catch (e) {}

        registrarSyncPeriodico();
        mostrarAvisos(true);
        suscribirPush();
        actualizarEstado();
    });
}

// ---------- Texto de estado bajo el botón ----------
function actualizarEstado() {
    var el = document.getElementById("estadoNotif");
    if (!el) return;

    if (!soportaNotificaciones()) {
        el.textContent = (esiOS() && !appInstalada())
            ? "Para recordatorios en iPhone: instala la app (Compartir → Añadir a inicio) y ábrela desde el ícono."
            : "Este navegador no soporta notificaciones.";
        return;
    }

    if (Notification.permission === "granted") {
        if (puedeSuscribirPush()) {
            el.textContent = "Recordatorios activos ✔ — también con la app cerrada.";
        } else if (esiOS() && !appInstalada()) {
            el.textContent = "Instala la app (Compartir → Añadir a inicio) y ábrela desde el ícono para los avisos con la app cerrada.";
        } else {
            el.textContent = "Avisos activos ✔ — se muestran al abrir la app.";
        }
    } else if (Notification.permission === "denied") {
        el.textContent = "Permiso bloqueado. Actívalo en los ajustes del navegador para este sitio.";
    } else {
        el.textContent = "Pulsa el botón para recibir avisos antes de cada pago.";
    }
}

// ---------- Arranque ----------
function iniciarApp() {
    renderizarPagos();
    actualizarEstado();

    if (soportaNotificaciones() && Notification.permission === "granted") {
        registrarSyncPeriodico();
        mostrarAvisos(false);
        suscribirPush();
    }
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then(function (reg) {
        reg.update();
    }).catch(function (err) {
        console.error("Error SW:", err);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    iniciarApp();
    var btn = document.getElementById("btnNotify");
    if (btn) btn.addEventListener("click", activarRecordatorios);
});

// Reintento de render para navegadores lentos / Safari en incógnito.
window.addEventListener("load", function () {
    setTimeout(renderizarPagos, 300);
});
