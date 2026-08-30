// Descifra el "sobre" (RSA-OAEP + AES-GCM) que produce cifrarSuscripcion()
// en el navegador (pagos-data.js). Solo usa APIs nativas de Node 20.

const nodeCrypto = require("crypto");
const webcrypto = globalThis.crypto || nodeCrypto.webcrypto;
const subtle = webcrypto.subtle;

function b64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function importarPrivada(pkcs8Base64) {
  return subtle.importKey(
    "pkcs8",
    b64ToBytes(pkcs8Base64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

/**
 * @param {string} blobBase64  contenido del bloque ``` del issue (o del campo "enc")
 * @param {string} pkcs8Base64 clave privada RSA (secreto SUB_PRIVATE_KEY)
 * @returns {Promise<object>}  { endpoint, keys:{p256dh,auth}, ua, ts }
 */
async function descifrarSuscripcion(blobBase64, pkcs8Base64) {
  const env = JSON.parse(Buffer.from(String(blobBase64).trim(), "base64").toString("utf8"));
  if (env.v !== 1 || !env.k || !env.iv || !env.d) {
    throw new Error("sobre con formato inesperado");
  }

  const priv = await importarPrivada(pkcs8Base64);
  const rawAes = await subtle.decrypt({ name: "RSA-OAEP" }, priv, b64ToBytes(env.k));
  const aesKey = await subtle.importKey("raw", rawAes, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(env.iv) },
    aesKey,
    b64ToBytes(env.d)
  );
  return JSON.parse(Buffer.from(pt).toString("utf8"));
}

function sha256Hex(str) {
  return nodeCrypto.createHash("sha256").update(str).digest("hex");
}

module.exports = { descifrarSuscripcion, sha256Hex };
