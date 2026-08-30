/**
 * Procesa un issue "[push] …": descifra la suscripción, la valida y la guarda
 * en subscriptions/<sha256(endpoint)>.json (guardando solo el blob cifrado).
 *
 * Entradas (env):  ISSUE_BODY, SUB_PRIVATE_KEY
 * Salidas (GITHUB_OUTPUT):  resultado=ok|error  [, sub_id=<hash>]
 *
 * Siempre termina con código 0: el workflow decide qué hacer según "resultado".
 */

const fs = require("fs");
const path = require("path");
const { descifrarSuscripcion, sha256Hex } = require("./lib-cripto");

const SUBS_DIR = path.join(__dirname, "..", "subscriptions");
const { ISSUE_BODY, SUB_PRIVATE_KEY } = process.env;

function setOutput(clave, valor) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, clave + "=" + valor + "\n");
}

function terminar(resultado, extra) {
  setOutput("resultado", resultado);
  if (extra) Object.keys(extra).forEach(k => setOutput(k, extra[k]));
  process.exit(0);
}

function error(msg) {
  console.error("::warning::" + msg);
  terminar("error");
}

(async () => {
  if (!SUB_PRIVATE_KEY) return error("Falta el secreto SUB_PRIVATE_KEY.");
  if (!ISSUE_BODY) return error("El issue no tiene cuerpo.");

  const m = ISSUE_BODY.match(/```[a-z0-9]*\s*([\s\S]*?)```/i);
  const blob = (m ? m[1] : ISSUE_BODY).replace(/\s+/g, "");
  if (blob.length < 40) return error("No se encontró el bloque de datos en el issue.");

  let sub;
  try {
    sub = await descifrarSuscripcion(blob, SUB_PRIVATE_KEY);
  } catch (e) {
    return error("No se pudo descifrar: " + e.message);
  }

  const ok = sub && typeof sub.endpoint === "string" &&
    /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 2048 &&
    sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
  if (!ok) return error("La suscripción descifrada no tiene el formato esperado.");

  fs.mkdirSync(SUBS_DIR, { recursive: true });
  const id = sha256Hex(sub.endpoint);
  fs.writeFileSync(
    path.join(SUBS_DIR, id + ".json"),
    JSON.stringify({ enc: blob, added: new Date().toISOString() }, null, 2) + "\n"
  );

  console.log("Suscripción guardada: " + id.slice(0, 12) + "…  (" + (sub.ua || "sin UA") + ")");
  terminar("ok", { sub_id: id });
})().catch(e => {
  console.error(e);
  terminar("error");
});
