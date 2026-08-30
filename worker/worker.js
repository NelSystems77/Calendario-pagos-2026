/**
 * Cloudflare Worker — almacén de suscripciones push del Calendario de Pagos 2026.
 *
 * Rutas públicas (CORS desde GitHub Pages):
 *   POST /subscribe    body { subscription:{endpoint,keys}, ua }
 *   POST /unsubscribe  body { endpoint }
 *
 * Rutas de administración (cabecera  Authorization: Bearer <ADMIN_TOKEN>):
 *   GET  /list                       -> { subscriptions: [...] }
 *   POST /prune   body { endpoints }  -> borra esas suscripciones
 *
 * Binding KV requerido:  SUBS
 * Secreto requerido:     ADMIN_TOKEN   (wrangler secret put ADMIN_TOKEN)
 */

const ALLOWED_ORIGINS = [
  "https://nelsystems77.github.io"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/subscribe" && request.method === "POST") {
        return await subscribe(request, env, cors);
      }
      if (url.pathname === "/unsubscribe" && request.method === "POST") {
        return await unsubscribe(request, env, cors);
      }
      if (url.pathname === "/list" && request.method === "GET") {
        if (!authorized(request, env)) return json({ error: "unauthorized" }, 401, cors);
        return await list(env, cors);
      }
      if (url.pathname === "/prune" && request.method === "POST") {
        if (!authorized(request, env)) return json({ error: "unauthorized" }, 401, cors);
        return await prune(request, env, cors);
      }
      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500, cors);
    }
  }
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, extra || {})
  });
}

function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  const token = h.replace(/^Bearer\s+/i, "");
  return !!env.ADMIN_TOKEN && !!token && token === env.ADMIN_TOKEN;
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function validSub(s) {
  return s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 2048 && s.keys &&
    typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

async function subscribe(request, env, cors) {
  const body = await readJson(request);
  if (!body) return json({ error: "bad json" }, 400, cors);
  const sub = body.subscription;
  if (!validSub(sub)) return json({ error: "invalid subscription" }, 422, cors);

  const id = await sha256hex(sub.endpoint);
  await env.SUBS.put("sub:" + id, JSON.stringify({
    endpoint: sub.endpoint,
    keys: sub.keys,
    ua: String(body.ua || "").slice(0, 200),
    ts: Date.now()
  }));
  return json({ ok: true, id }, 200, cors);
}

async function unsubscribe(request, env, cors) {
  const body = await readJson(request);
  if (!body || !body.endpoint) return json({ error: "no endpoint" }, 422, cors);
  await env.SUBS.delete("sub:" + await sha256hex(body.endpoint));
  return json({ ok: true }, 200, cors);
}

async function list(env, cors) {
  const out = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const v = await env.SUBS.get(k.name);
      if (v) {
        try { out.push(JSON.parse(v)); } catch (e) { /* ignora entradas corruptas */ }
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return json({ subscriptions: out }, 200, cors);
}

async function prune(request, env, cors) {
  const body = await readJson(request);
  const endpoints = body && Array.isArray(body.endpoints) ? body.endpoints : [];
  let deleted = 0;
  for (const ep of endpoints) {
    if (typeof ep === "string") {
      await env.SUBS.delete("sub:" + await sha256hex(ep));
      deleted++;
    }
  }
  return json({ ok: true, deleted }, 200, cors);
}
