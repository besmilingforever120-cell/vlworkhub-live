import crypto from "node:crypto";

const PASSWORD_MIN_LENGTH = 12;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "abc123",
  "admin",
  "admin123",
  "welcome",
  "welcome123",
  "letmein",
  "letmein123",
  "changeme",
  "iloveyou",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "1q2w3e4r",
  "asdfgh",
  "asdf1234",
  "zaq12wsx",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "superman",
  "princess",
  "trustno1",
  "login",
  "welcome1",
  "test123",
  "default"
]);

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*()-_=+[]{};:,.?";

function pick(str: string) {
  return str[crypto.randomInt(0, str.length)];
}

function shuffle(chars: string[]) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars;
}

function hasCategoryMix(password: string) {
  return {
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };
}

function hasTrivialPatterns(password: string) {
  const normalized = password.toLowerCase();

  if (/^(.)\1{4,}$/.test(password)) {
    return true;
  }

  if (/(0123|1234|2345|3456|4567|5678|6789|7890)/.test(normalized)) {
    return true;
  }

  if (/(abcd|bcde|cdef|qwer|asdf|zxcv)/.test(normalized)) {
    return true;
  }

  return false;
}

export function validatePasswordPolicy(password: string) {
  const value = String(password || "");

  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: "Password must be at least 12 characters long."
    };
  }

  const categories = hasCategoryMix(value);
  if (!categories.upper || !categories.lower || !categories.digit || !categories.special) {
    return {
      valid: false,
      message: "Password must include uppercase, lowercase, number, and special character."
    };
  }

  if (hasTrivialPatterns(value)) {
    return {
      valid: false,
      message: "Password is too predictable. Choose a less common pattern."
    };
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return {
      valid: false,
      message: "Password is too common. Choose a stronger password."
    };
  }

  return { valid: true, message: "" };
}

export function generateTemporaryPassword(length = 14) {
  const size = Math.max(PASSWORD_MIN_LENGTH, length);
  const result = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  const allChars = `${UPPER}${LOWER}${DIGITS}${SPECIAL}`;

  while (result.length < size) {
    result.push(pick(allChars));
  }

  return shuffle(result).join("");
}
