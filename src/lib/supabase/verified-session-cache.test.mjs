import assert from "node:assert/strict";
import test from "node:test";
import { createVerifiedSessionCache } from "./verified-session-cache.ts";

test("verified session cache expires entries at its short TTL", () => {
  let currentTime = 1_000;
  const cache = createVerifiedSessionCache({
    now: () => currentTime,
    ttlMs: 60_000,
  });
  cache.set({
    cacheKey: "session-a",
    user: { id: "user-a", email: "a@example.com" },
  });

  assert.deepEqual(cache.get("session-a"), {
    id: "user-a",
    email: "a@example.com",
  });
  currentTime += 60_000;
  assert.equal(cache.get("session-a"), null);
});

test("verified session cache never outlives the token expiration", () => {
  let currentTime = 1_000;
  const cache = createVerifiedSessionCache({ now: () => currentTime });
  cache.set({
    cacheKey: "session-a",
    expiresAt: 2_000,
    user: { id: "user-a", email: "a@example.com" },
  });

  currentTime = 2_000;
  assert.equal(cache.get("session-a"), null);
});

test("verified session cache evicts the oldest entry at capacity", () => {
  const cache = createVerifiedSessionCache({ maxEntries: 2 });
  cache.set({
    cacheKey: "session-a",
    user: { id: "user-a", email: "a@example.com" },
  });
  cache.set({
    cacheKey: "session-b",
    user: { id: "user-b", email: "b@example.com" },
  });
  cache.set({
    cacheKey: "session-c",
    user: { id: "user-c", email: "c@example.com" },
  });

  assert.equal(cache.get("session-a"), null);
  assert.equal(cache.get("session-b")?.id, "user-b");
  assert.equal(cache.get("session-c")?.id, "user-c");
});
