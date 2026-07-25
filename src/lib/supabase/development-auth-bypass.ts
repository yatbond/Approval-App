import { timingSafeEqual } from "node:crypto";

export type DevelopmentAuthBypassUser = {
  id: string;
  email: string;
};

export const localPerformanceAuthHeader =
  "x-approval-local-performance-auth";

export function getDevelopmentAuthBypassUser({
  nodeEnv,
  email,
}: {
  nodeEnv?: string;
  email?: string;
}): DevelopmentAuthBypassUser | null {
  const normalizedEmail = email?.trim().toLowerCase() || "";
  if (nodeEnv === "production" || !isEmail(normalizedEmail)) {
    return null;
  }

  return {
    id: `development-e2e-${normalizedEmail}`,
    email: normalizedEmail,
  };
}

export function getLocalPerformanceAuthBypassUser({
  enabled,
  email,
  expectedToken,
  requestToken,
  requestHost,
}: {
  enabled?: string;
  email?: string;
  expectedToken?: string;
  requestToken?: string | null;
  requestHost?: string | null;
}): DevelopmentAuthBypassUser | null {
  const normalizedEmail = email?.trim().toLowerCase() || "";
  if (
    enabled !== "true" ||
    !isEmail(normalizedEmail) ||
    !isLoopbackHost(requestHost) ||
    !tokensMatch(expectedToken, requestToken)
  ) {
    return null;
  }

  return {
    id: `local-performance-${normalizedEmail}`,
    email: normalizedEmail,
  };
}

function tokensMatch(expectedToken?: string, requestToken?: string | null) {
  if (
    !expectedToken ||
    expectedToken.length < 32 ||
    !requestToken ||
    expectedToken.length !== requestToken.length
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expectedToken, "utf8"),
    Buffer.from(requestToken, "utf8"),
  );
}

function isLoopbackHost(value?: string | null) {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(`http://${value}`).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
