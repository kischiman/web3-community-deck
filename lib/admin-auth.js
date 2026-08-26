// Admin gate for the budget panel.
//
// The password comes from ADMIN_PASSWORD in the environment — never from a file in the
// repo. With it unset the admin panel is unavailable rather than open: a public repo and
// a default password would be worse than having no panel at all.

import crypto from "node:crypto";

const TTL_MS = 12 * 60 * 60 * 1000; // a working day
const sessions = new Map(); // token → expiry

export const enabled = () => Boolean(process.env.ADMIN_PASSWORD);

/** Constant-time compare, so the response time doesn't leak the password. */
function matches(attempt) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(String(attempt || ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function login(password) {
  if (!enabled() || !matches(password)) return null;
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + TTL_MS);
  return token;
}

export function valid(token) {
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function logout(token) {
  sessions.delete(token);
}

/** Pull the bearer token off a request. */
export const tokenFrom = (req) => (req.headers.authorization || "").replace(/^Bearer /, "");

export const authed = (req) => valid(tokenFrom(req));
