export type VerifiedSessionUser = {
  id: string;
  email: string;
};

type CachedVerifiedSessionUser = VerifiedSessionUser & {
  expiresAt: number;
};

export function createVerifiedSessionCache({
  maxEntries = 100,
  now = Date.now,
  ttlMs = 60_000,
}: {
  maxEntries?: number;
  now?: () => number;
  ttlMs?: number;
} = {}) {
  const entries = new Map<string, CachedVerifiedSessionUser>();

  function get(cacheKey: string): VerifiedSessionUser | null {
    const cached = cacheKey ? entries.get(cacheKey) : undefined;
    if (!cached) {
      return null;
    }
    if (cached.expiresAt <= now()) {
      entries.delete(cacheKey);
      return null;
    }
    return { id: cached.id, email: cached.email };
  }

  function set({
    cacheKey,
    expiresAt,
    user,
  }: {
    cacheKey: string;
    expiresAt?: number;
    user: VerifiedSessionUser;
  }) {
    if (!cacheKey) {
      return;
    }
    if (entries.size >= maxEntries && !entries.has(cacheKey)) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey) {
        entries.delete(oldestKey);
      }
    }
    entries.set(cacheKey, {
      ...user,
      expiresAt: Math.min(
        expiresAt || Number.POSITIVE_INFINITY,
        now() + ttlMs,
      ),
    });
  }

  return { get, set };
}
