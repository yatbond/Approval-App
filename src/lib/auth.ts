import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "approval_app_session";
const maxAgeSeconds = 60 * 60 * 8;

function getSessionSecret() {
  return (
    process.env.SUPERUSER_SESSION_SECRET ||
    "development-only-approval-app-session-secret"
  );
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function createSession(username: string) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = `${username}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [username, expiresAtText, signature] = parts;
  const payload = `${username}.${expiresAtText}`;
  const expectedSignature = sign(payload);
  const expiresAt = Number(expiresAtText);

  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  return { username };
}

export function validateSuperuser(username: string, password: string) {
  const expectedUsername = process.env.SUPERUSER_USERNAME;
  const expectedPassword = process.env.SUPERUSER_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  return (
    safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword)
  );
}
