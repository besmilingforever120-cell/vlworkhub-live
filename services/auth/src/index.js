"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAuthToken = signAuthToken;
exports.verifyAuthToken = verifyAuthToken;
exports.getCookieName = getCookieName;
exports.buildCookie = buildCookie;
exports.clearCookie = clearCookie;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const TOKEN_NAME = "vlwh_session";
function signAuthToken(payload, secret) {
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "12h" });
}
function verifyAuthToken(token, secret) {
    return jsonwebtoken_1.default.verify(token, secret);
}
function getCookieName() {
    return TOKEN_NAME;
}
function buildCookie(token, domain) {
    const parts = [
        `${TOKEN_NAME}=${token}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        process.env.NODE_ENV === "production" ? "Secure" : ""
    ].filter(Boolean);
    if (domain) {
        parts.push(`Domain=${domain}`);
    }
    return parts.join("; ");
}
function clearCookie(domain) {
    const parts = [
        `${TOKEN_NAME}=`,
        "Path=/",
        "HttpOnly",
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        "SameSite=Lax",
        process.env.NODE_ENV === "production" ? "Secure" : ""
    ].filter(Boolean);
    if (domain) {
        parts.push(`Domain=${domain}`);
    }
    return parts.join("; ");
}
