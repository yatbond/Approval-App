type TtlCacheOptions<T> = {
  ttlMs: number;
  now?: () => number;
  load: () => Promise<T>;
};

export function createTtlCache<T>({
  ttlMs,
  now = Date.now,
  load,
}: TtlCacheOptions<T>) {
  let value: T | undefined;
  let expiresAt = 0;
  let inFlight: Promise<T> | null = null;

  return {
    async get() {
      const currentTime = now();
      if (value !== undefined && currentTime < expiresAt) {
        return value;
      }

      if (!inFlight) {
        inFlight = load().then((loadedValue) => {
          value = loadedValue;
          expiresAt = now() + ttlMs;
          inFlight = null;
          return loadedValue;
        });
      }

      return inFlight;
    },
    clear() {
      value = undefined;
      expiresAt = 0;
      inFlight = null;
    },
  };
}
