// /helpers/crypto.js
// Criptografia simétrica (AES-256-GCM) usada para guardar em repouso a senha
// de e-mail de cada automação de disparo. A chave nunca fica no código —
// vem de process.env.ENCRYPTION_KEY (32 bytes em hex, gerada uma vez por ambiente).
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY ausente ou inválida no .env (esperado: 64 caracteres hex / 32 bytes)."
    );
  }
  return Buffer.from(keyHex, "hex");
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(payload) {
  const [ivHex, authTagHex, dataHex] = String(payload).split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Formato inválido de dado criptografado.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };
