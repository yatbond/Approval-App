import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(
  request: Request,
  secret = process.env.CRON_SECRET,
) {
  if (!secret || secret.length < 16) return false;
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const suppliedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function getSchedulerRunKey(request: Request, now = new Date()) {
  const minute = now.toISOString().slice(0, 16);
  const deployment = (request.headers.get("x-vercel-deployment-url") || "local")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 80);
  return `approval-operations:${deployment}:${minute}`;
}
