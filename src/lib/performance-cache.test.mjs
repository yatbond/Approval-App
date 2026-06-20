import assert from "node:assert/strict";
import { test } from "node:test";
import { createTtlCache } from "./performance-cache.ts";

test("reuses loaded values while the ttl is still valid", async () => {
  let now = 1_000;
  let calls = 0;
  const cache = createTtlCache({
    ttlMs: 10_000,
    now: () => now,
    load: async () => {
      calls += 1;
      return [`value-${calls}`];
    },
  });

  assert.deepEqual(await cache.get(), ["value-1"]);
  assert.deepEqual(await cache.get(), ["value-1"]);
  assert.equal(calls, 1);

  now += 10_001;
  assert.deepEqual(await cache.get(), ["value-2"]);
  assert.equal(calls, 2);
});

test("shares one in-flight load between concurrent callers", async () => {
  let calls = 0;
  let resolveLoad;
  const cache = createTtlCache({
    ttlMs: 10_000,
    now: () => 1_000,
    load: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveLoad = resolve;
      });
    },
  });

  const first = cache.get();
  const second = cache.get();
  resolveLoad(["shared"]);

  assert.deepEqual(await first, ["shared"]);
  assert.deepEqual(await second, ["shared"]);
  assert.equal(calls, 1);
});
