
import crypto from "node:crypto";

const PREFIX = "mybasket-gdrive-v1";

function encryptionKey(): Buffer {
  const raw = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY doit être une clé hexadécimale de 32 octets (64 caractères).",
    );
  }
  return Buffer.from(raw, "hex");
}

export function encryptGoogleDriveToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptGoogleDriveToken(payload: string): string {
  const [prefix, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (prefix !== PREFIX || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Jeton Google Drive chiffré invalide.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
