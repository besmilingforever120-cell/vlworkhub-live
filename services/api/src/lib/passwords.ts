import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";

const BCRYPT_ROUNDS = 12;
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function sha256(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function isLegacySha256Hash(passwordHash: string) {
  return LEGACY_SHA256_PATTERN.test(String(passwordHash || ""));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedPasswordHash: string) {
  if (isLegacySha256Hash(storedPasswordHash)) {
    return sha256(password) === storedPasswordHash;
  }

  return bcrypt.compare(password, storedPasswordHash);
}

export async function migrateLegacyPasswordHashOnLogin(userId: string, password: string, storedPasswordHash: string) {
  if (!isLegacySha256Hash(storedPasswordHash)) {
    return false;
  }

  if (sha256(password) !== storedPasswordHash) {
    return false;
  }

  const nextPasswordHash = await hashPassword(password);
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1
     WHERE id = $2 AND password_hash = $3`,
    [nextPasswordHash, userId, storedPasswordHash]
  );

  return (result.rowCount ?? 0) > 0;
}