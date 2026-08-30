# Recordatorios push — puesta en marcha

Avisos "📢 ¡Mañana pagan!" que llegan **con la app cerrada** en Android, escritorio
y iPhone/iPad (PWA instalada, iOS 16.4+). **Los usuarios no necesitan cuenta de
nada**: solo pulsar "Activar Recordatorios" y aceptar el permiso.

## Arquitectura

```
Navegador  --(POST /subscribe)-->  Worker de Cloudflare  --(KV)-->  suscripciones
GitHub Actions (cron diario)  --(GET /list)-->  Worker  -->  envía Web Push  -->  --(POST /prune)--> borra las caducadas
GitHub Pages  -->  aloja la web
```

- **Cloudflare Worker** (gratis): guarda las suscripciones en KV. ~1 archivo.
- **GitHub Actions** (gratis): un cron que lee del Worker y manda los push.
- **GitHub Pages** (gratis): sirve la app.

Piezas a configurar: claves VAPID, el Worker + KV + su token, y 5 secretos en GitHub.

---

## 1. Claves VAPID (ya generadas)

| | valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BEe1IdCQQz6r84Ok1bWYLferNXvefKvduGvMFxCA8ic2NKx0OAYFdXU4_dwEvAOH5LOTKO-BJlmXPalv3SFkfMQ` (87 car.) |
| `VAPID_PRIVATE_KEY` | *(te la paso aparte — nunca al repo, solo secreto de GitHub)* |
| `VAPID_SUBJECT` | `mailto:nelsystems77@gmail.com` |

La pública ya está en `pagos-data.js` → `PUSH_CONFIG.vapidPublicKey`.

Regenerar: `cd scripts && npm i && node -e "console.log(require('web-push').generateVAPIDKeys())"`.

---

## 2. Cloudflare Worker

1. Crea cuenta gratis en [dash.cloudflare.com](https://dash.cloudflare.com).
2. Instala wrangler y entra: `npm i -g wrangler && wrangler login`.
3. Crea el namespace KV:
   ```bash
   cd worker
   wrangler kv namespace create SUBS
   ```
   Copia el `id` que imprime y pégalo en `worker/wrangler.toml` (campo `id`).
4. Crea el token de administración (el mismo valor irá como secreto de GitHub):
   ```bash
   wrangler secret put ADMIN_TOKEN
   # pega:  e173e844c6041d83a390e874e38e8c5cb76c46070e3693e6400ddb7de5ed7bfb
   ```
5. Despliega:
   ```bash
   wrangler deploy
   ```
   Te da una URL tipo `https://calendario-pagos-push.TU-SUBDOMINIO.workers.dev`.
6. Pega esa URL en **dos sitios**:
   - `pagos-data.js` → `PUSH_CONFIG.workerUrl`
   - secreto `WORKER_URL` de GitHub (paso 4 siguiente).
7. En `worker/worker.js`, si tu dominio de Pages no es
   `https://nelsystems77.github.io`, ajusta `ALLOWED_ORIGINS` y vuelve a `wrangler deploy`.

> Sin wrangler: en el dashboard → Workers & Pages → Create Worker → pega
> `worker/worker.js`; en Settings crea la variable KV `SUBS` (bindea un namespace
> nuevo) y el secreto `ADMIN_TOKEN`.

---

## 3. Secretos de GitHub

Repo → **Settings → Secrets and variables → Actions**:

| Nombre | Valor |
|---|---|
| `WORKER_URL` | `https://…workers.dev` (sin barra final) |
| `WORKER_ADMIN_TOKEN` | el mismo valor que pusiste en `ADMIN_TOKEN` del Worker |
| `VAPID_PUBLIC_KEY` | clave pública VAPID (87 car.) |
| `VAPID_PRIVATE_KEY` | clave privada VAPID (43 car.) |
| `VAPID_SUBJECT` | `mailto:nelsystems77@gmail.com` |

*(Ya no hacen falta `SUB_PRIVATE_KEY` ni permisos de escritura de Actions — puedes borrarlos.)*

---

## 4. GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → `main` / `/(root)`.
App en `https://nelsystems77.github.io/Calendario-pagos-2026/`.

---

## 5. Probar

1. `git push` con `pagos-data.js` ya apuntando al Worker.
2. Móvil: abre la app, **instálala**, pulsa **Activar Recordatorios**, acepta.
   No se abre nada más: la suscripción va directa al Worker.
3. Verifica en Cloudflare → tu Worker → KV → namespace `SUBS`: debe haber una
   clave `sub:…`.
4. Fuerza un envío: repo → **Actions → Recordatorios de pagos → Run workflow**.
   Log esperado:
   ```
   Diagnóstico: worker=https://… | pub=87c | priv=43c
   Hoy no hay pagos en ventana de aviso. Nada que enviar.
   ```
   (El 4-sep está a 5 días, fuera de la ventana 3/1/0.)
5. Prueba real de push: en `pagos-data.js` pon `AVISOS_DIAS = [5, 3, 1, 0]`,
   push, **Run workflow** → debe llegar la notificación del pago del 4-sep.
   Revierte a `[3, 1, 0]`.

---

## Notas

- **iPhone**: la suscripción solo se crea desde la PWA **instalada** (iOS 16.4+).
- Cuota gratis de Cloudflare Workers: 100 000 req/día — sobra de lejos.
- El Worker solo acepta `Origin` de la lista `ALLOWED_ORIGINS`; `/list` y `/prune`
  exigen el token. Aun así, si alguien manda basura, el envío la marca 404/410 y
  se poda sola.
- Cambiar fechas de pago: edita `pagos-data.js`, sube `APP_VERSION` en
  `service-worker.js` y el `?v=` de `index.html`, y `git push`.
