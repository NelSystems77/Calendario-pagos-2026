# Recordatorios push — puesta en marcha (solo GitHub)

Avisos "📢 ¡Mañana pagan!" que llegan **con la app cerrada** en Android, escritorio
y iPhone/iPad (PWA instalada, iOS 16.4+). Todo vive en GitHub: **GitHub Pages**
sirve la app y **GitHub Actions** envía las notificaciones. Sin Firebase, sin
servidores, sin costo.

## Cómo funciona

1. El usuario abre la app, pulsa **Activar Recordatorios** y da permiso.
2. La app crea la suscripción push, la **cifra** (RSA-OAEP + AES-GCM) y abre un
   *issue* de GitHub prellenado. El usuario pulsa **"Submit new issue"** (una vez
   por dispositivo; necesita sesión de GitHub).
3. El workflow **Guardar suscripción push** descifra el issue, valida, guarda el
   blob cifrado en `subscriptions/<hash>.json` y cierra el issue.
4. El workflow **Recordatorios de pagos** corre cada día a las 06:00 CR: descifra
   las suscripciones, mira qué pagos caen a 3 / 1 / 0 días y manda un push por
   cada uno. Las suscripciones caducadas se borran solas.

Las suscripciones quedan **cifradas** en el repo público: sin la clave privada
(secreto de GitHub) nadie puede usarlas.

---

## 1. Claves (ya generadas)

**VAPID** — identifican al emisor de los push:

| | valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BEe1IdCQQz6r84Ok1bWYLferNXvefKvduGvMFxCA8ic2NKx0OAYFdXU4_dwEvAOH5LOTKO-BJlmXPalv3SFkfMQ` |
| `VAPID_PRIVATE_KEY` | *(te la paso aparte — nunca al repo)* |
| `VAPID_SUBJECT` | `mailto:nelsystems77@gmail.com` |

La pública ya está puesta en `pagos-data.js` → `PUSH_CONFIG.vapidPublicKey`.

**Cifrado de suscripciones** (RSA-OAEP):

- Pública (SPKI) — ya está en `pagos-data.js` → `PUSH_CONFIG.encPublicKey`.
- Privada (PKCS8) → secreto `SUB_PRIVATE_KEY`. *(te la paso aparte)*

> Para regenerarlas todas:
> ```bash
> cd scripts && npm install
> node -e "const w=require('web-push');console.log(w.generateVAPIDKeys())"
> node -e "(async()=>{const s=globalThis.crypto.subtle;const k=await s.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);console.log('pub',Buffer.from(await s.exportKey('spki',k.publicKey)).toString('base64'));console.log('priv',Buffer.from(await s.exportKey('pkcs8',k.privateKey)).toString('base64'))})()"
> ```
> Si las cambias, actualiza `pagos-data.js` y los secretos.

---

## 2. Secretos de GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | clave pública VAPID |
| `VAPID_PRIVATE_KEY` | clave privada VAPID |
| `VAPID_SUBJECT` | `mailto:nelsystems77@gmail.com` |
| `SUB_PRIVATE_KEY` | clave privada RSA (PKCS8 base64, una sola línea) |

---

## 3. Activar GitHub Pages

Repo → **Settings → Pages**:

- **Source**: *Deploy from a branch*
- **Branch**: `main` — carpeta `/ (root)` → **Save**

La app quedará en `https://nelsystems77.github.io/Calendario-pagos-2026/`.
(El archivo `.nojekyll` ya está para que Pages sirva todo tal cual.)

---

## 4. Permisos de Actions

Repo → **Settings → Actions → General → Workflow permissions** →
**Read and write permissions** → Save. (Los workflows necesitan hacer commit de
las suscripciones.)

---

## 5. Probar

1. Abre `https://nelsystems77.github.io/Calendario-pagos-2026/` en el móvil,
   **instálala** (Compartir → Añadir a pantalla de inicio) y ábrela desde el ícono.
2. Inicia sesión en GitHub en ese navegador.
3. Pulsa **Activar Recordatorios** → acepta el permiso → se abre GitHub con un
   issue `[push] …` prellenado → pulsa **Submit new issue**.
4. En unos segundos el issue se cierra solo con "✅ Suscripción registrada" y
   aparece un archivo en `subscriptions/`.
5. Vuelve a la app y pulsa **"Ya lo confirmé"**.
6. Fuerza un envío: repo → **Actions → Recordatorios de pagos → Run workflow**.
   Si hoy no hay pago a 3/1/0 días dirá "nada que enviar" (normal). Para una
   prueba real, edita `AVISOS_DIAS` en `pagos-data.js` añadiendo el nº de días que
   falta para el próximo pago, haz push, lanza el workflow y luego revierte.

---

## Notas

- **iPhone**: la suscripción solo se crea desde la PWA **instalada** (iOS 16.4+).
- Un dispositivo = un archivo en `subscriptions/`. Si el navegador rota la
  suscripción, la app pide reactivar.
- Los bots de los workflows hacen commits (`subscriptions/…`); cada uno dispara
  una reconstrucción de Pages — es rápido y gratis.
- Cambiar fechas de pago: edita `pagos-data.js`, sube `APP_VERSION` en
  `service-worker.js` y el `?v=` de `index.html`, y haz push.
- Coste: GitHub Actions es gratis e ilimitado en repos públicos.
