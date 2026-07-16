export type DevelopmentAuthBypassUser = {
  id: string;
  email: string;
};

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

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
