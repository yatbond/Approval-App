import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createTemplateCopilotV2LifecycleFence,
  discoverTemplateCopilotV2Recovery,
  executeTemplateCopilotStart,
  releaseTemplateCopilotV2ClientAfterRollback,
} from "./template-copilot-v2-client-command.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function lifecycleModel() {
  return {
    residue: true,
    pendingStart: { idempotencyKey: "start:old" },
    pendingAnswer: { idempotencyKey: "turn:old" },
    pendingSpecial: { idempotencyKey: "special:old" },
    storage: new Map([
      ["start", { idempotencyKey: "start:old" }],
      ["special", { idempotencyKey: "special:old" }],
    ]),
    state: { sessionId: "old-v2", revision: 1 },
    messages: ["old optimistic"],
    draft: "old answer",
    notApplicableReason: "old reason",
    draftReview: { draftId: "draft-old", revision: 1 },
    resolved: new Set(),
    locks: { start: true, answer: true, special: true },
    busy: true,
    error: "",
    reconcileRequests: 0,
    tailRequests: 0,
    cleanupEvents: [],
  };
}

function rollbackLoadedV2(fence, model) {
  let cleanupLease = fence.capture();
  const released = releaseTemplateCopilotV2ClientAfterRollback({
    hasLoadedV2: () => model.residue,
    advanceLifecycleEpoch: () => {
      model.cleanupEvents.push("epoch");
      fence.invalidateCurrent();
      cleanupLease = fence.capture();
    },
    markReleased: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("mark");
      model.residue = false;
    }),
    clearPendingStart: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("start");
      model.pendingStart = null;
      model.storage.delete("start");
    }),
    clearPendingSpecial: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("special");
      model.pendingSpecial = null;
      model.storage.delete("special");
    }),
    clearPendingAnswer: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("answer");
      model.pendingAnswer = null;
    }),
    clearCommandTracking: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("tracking");
      model.resolved.clear();
    }),
    clearInterviewAndMessages: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("interview");
      model.state = null;
      model.messages = [];
      model.draft = "";
      model.notApplicableReason = "";
      model.draftReview = null;
      model.error = "";
    }),
    clearLocks: () => cleanupLease.commit(() => {
      model.cleanupEvents.push("locks");
      model.locks = { start: false, answer: false, special: false };
      model.busy = false;
    }),
  });
  return { released, lifecycle: cleanupLease };
}

function installStart(model, lifecycle, pending) {
  return lifecycle.commit(() => {
    model.pendingStart = pending;
    if (pending) {
      model.residue = true;
      model.storage.set("start", pending);
    } else {
      model.storage.delete("start");
    }
  });
}

async function runStartUiOperation(model, lifecycle, post, idempotencyKey) {
  lifecycle.commit(() => {
    model.locks.start = true;
    model.busy = true;
    model.error = "";
  });
  try {
    const started = await executeTemplateCopilotStart({
      lifecycle,
      schemaVersion: 2,
      intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
      loadPendingV2: () => model.pendingStart,
      installPendingV2: (pending) => installStart(model, lifecycle, pending),
      createKey: () => idempotencyKey,
      request: () => post.promise,
    });
    if (!started || !lifecycle.isCurrent()) return null;
    lifecycle.commit(() => {
      model.state = started.response;
      model.messages = ["old start assistant"];
    });
    return started;
  } catch {
    if (!lifecycle.isCurrent()) return null;
    lifecycle.commit(() => {
      model.error = "old start error";
    });
    return null;
  } finally {
    lifecycle.commit(() => {
      model.locks.start = false;
      model.busy = false;
    });
  }
}

test("mount capability recovery performs no rollback or storage work after its epoch is stale", async () => {
  for (const schemaVersion of [1, 2]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const lifecycle = fence.capture();
    const capability = deferred();
    const calls = [];
    const recoveryPromise = discoverTemplateCopilotV2Recovery({
      lifecycle,
      discoverSchemaVersion: () => capability.promise,
      releaseLoadedV2AfterRollback: () => calls.push("release"),
      loadPendingV2Start: () => {
        calls.push("load-start");
        return null;
      },
      loadPendingV2Special: () => {
        calls.push("load-special");
        return null;
      },
    });
    fence.invalidateCurrent();
    capability.resolve(schemaVersion);
    assert.equal(await recoveryPromise, null);
    assert.deepEqual(calls, [], `stale schema ${schemaVersion} mount result is inert`);
  }
});

test("clicked Start takes a fresh epoch and survives late mount schema-1 and schema-2 results", async () => {
  for (const lateMountSchemaVersion of [1, 2]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    model.residue = false;
    model.pendingStart = null;
    model.pendingAnswer = null;
    model.pendingSpecial = null;
    model.storage.clear();
    model.state = null;
    model.messages = [];
    model.locks = { start: false, answer: false, special: false };
    model.busy = false;

    const mountLifecycle = fence.capture();
    const mountCapability = deferred();
    const mountCalls = [];
    const mountRecovery = discoverTemplateCopilotV2Recovery({
      lifecycle: mountLifecycle,
      discoverSchemaVersion: () => mountCapability.promise,
      releaseLoadedV2AfterRollback: () => {
        mountCalls.push("release");
        return rollbackLoadedV2(fence, model);
      },
      loadPendingV2Start: () => {
        mountCalls.push("load-start");
        return model.pendingStart;
      },
      loadPendingV2Special: () => {
        mountCalls.push("load-special");
        return model.pendingSpecial;
      },
    });

    // Production start() invalidates the mount lease before capturing the
    // lifecycle used by both its capability check and its POST.
    fence.invalidateCurrent();
    const startLifecycle = fence.capture();
    const startRecovery = await discoverTemplateCopilotV2Recovery({
      lifecycle: startLifecycle,
      discoverSchemaVersion: async () => 2,
      releaseLoadedV2AfterRollback: () => {
        throw new Error("the clicked v2 Start must not roll back");
      },
      loadPendingV2Start: () => model.pendingStart,
      loadPendingV2Special: () => model.pendingSpecial,
    });
    assert.equal(startRecovery.schemaVersion, 2);

    const post = deferred();
    const startExecution = executeTemplateCopilotStart({
      lifecycle: startLifecycle,
      schemaVersion: startRecovery.schemaVersion,
      intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
      loadPendingV2: () => model.pendingStart,
      installPendingV2: (pending) => installStart(model, startLifecycle, pending),
      createKey: () => `start:fresh-after-mount-${lateMountSchemaVersion}`,
      request: () => post.promise,
    });
    assert.equal(model.residue, true);
    assert.equal(model.storage.has("start"), true);

    mountCapability.resolve(lateMountSchemaVersion);
    assert.equal(await mountRecovery, null);
    assert.deepEqual(
      mountCalls,
      [],
      `late schema ${lateMountSchemaVersion} mount result cannot release or inspect v2 storage`,
    );

    post.resolve({ sessionId: `fresh-v2-${lateMountSchemaVersion}`, revision: 1 });
    const started = await startExecution;
    assert.ok(started);
    startLifecycle.commit(() => {
      model.state = started.response;
      model.messages = ["fresh assistant"];
    });
    assert.deepEqual(model.state, {
      sessionId: `fresh-v2-${lateMountSchemaVersion}`,
      revision: 1,
    });
    assert.deepEqual(model.messages, ["fresh assistant"]);
    assert.equal(model.pendingStart, null);
    assert.equal(model.storage.has("start"), false);
    assert.equal(startLifecycle.isCurrent(), true);
  }
});

test("unmount invalidates an advanced Start while preserving its durable command for remount recovery", async () => {
  for (const outcome of ["success", "503"]) {
    const oldFence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    model.residue = false;
    model.pendingStart = null;
    model.pendingAnswer = null;
    model.pendingSpecial = null;
    model.storage.clear();
    model.state = null;
    model.messages = [];
    model.locks = { start: false, answer: false, special: false };
    model.busy = false;
    model.error = "";

    const mountLifecycle = oldFence.capture();
    // A clicked Start first supersedes the mount capability probe.
    oldFence.invalidateCurrent();
    const startLifecycle = oldFence.capture();
    const post = deferred();
    const flow = runStartUiOperation(
      model,
      startLifecycle,
      post,
      `start:old-${outcome}`,
    );
    assert.equal(model.storage.get("start").idempotencyKey, `start:old-${outcome}`);
    assert.equal(model.busy, true);

    // Component teardown advances the current epoch without deleting the
    // durable command that a later mount needs for authoritative recovery.
    oldFence.invalidateCurrent();
    assert.equal(mountLifecycle.isCurrent(), false);
    assert.equal(startLifecycle.isCurrent(), false);
    assert.equal(model.storage.get("start").idempotencyKey, `start:old-${outcome}`);

    const remountFence = createTemplateCopilotV2LifecycleFence();
    const remountLifecycle = remountFence.capture();
    const recovered = model.storage.get("start");
    assert.equal(
      recovered.idempotencyKey,
      `start:old-${outcome}`,
      "remount can recover the exact pending command left by unmount",
    );
    const freshCommand = Object.freeze({
      idempotencyKey: `start:fresh-${outcome}`,
      businessUnitId: "business",
      departmentName: "Finance",
      locale: "en",
    });
    installStart(model, remountLifecycle, freshCommand);
    remountLifecycle.commit(() => {
      model.state = { sessionId: `fresh-v2-${outcome}`, revision: 7 };
      model.messages = ["fresh assistant"];
      model.locks.start = true;
      model.busy = true;
      model.error = "fresh error";
    });

    if (outcome === "success") {
      post.resolve({ sessionId: "old-v2", revision: 2 });
    } else {
      const error = new Error("old start response lost");
      error.status = 503;
      post.reject(error);
    }
    assert.equal(await flow, null);

    assert.equal(model.storage.get("start").idempotencyKey, `start:fresh-${outcome}`);
    assert.equal(model.pendingStart.idempotencyKey, `start:fresh-${outcome}`);
    assert.deepEqual(model.state, { sessionId: `fresh-v2-${outcome}`, revision: 7 });
    assert.deepEqual(model.messages, ["fresh assistant"]);
    assert.equal(model.locks.start, true, "old finally cannot unlock the remount");
    assert.equal(model.busy, true, "old finally cannot clear remount busy state");
    assert.equal(model.error, "fresh error", "old error cannot overwrite remount error");
    assert.equal(remountLifecycle.isCurrent(), true);
  }
});

test("clean and Strict Mode unmounts only invalidate their own component fence", () => {
  const oldFence = createTemplateCopilotV2LifecycleFence();
  const cleanModel = lifecycleModel();
  cleanModel.residue = false;
  cleanModel.pendingStart = null;
  cleanModel.pendingAnswer = null;
  cleanModel.pendingSpecial = null;
  cleanModel.storage.clear();
  cleanModel.state = null;
  cleanModel.messages = [];
  cleanModel.locks = { start: false, answer: false, special: false };
  cleanModel.busy = false;
  cleanModel.error = "";

  const firstSetup = oldFence.capture();
  oldFence.invalidateCurrent();
  assert.equal(firstSetup.isCurrent(), false);
  assert.equal(oldFence.currentEpoch(), 1);
  assert.equal(cleanModel.residue, false);
  assert.equal(cleanModel.storage.size, 0);
  assert.equal(cleanModel.state, null);
  assert.equal(cleanModel.busy, false);
  assert.equal(cleanModel.error, "");

  // Strict Mode re-runs effect setup on the same component ref, so it captures
  // the fresh epoch produced by the preceding cleanup.
  const strictModeSetup = oldFence.capture();
  assert.equal(strictModeSetup.isCurrent(), true);
  oldFence.invalidateCurrent();
  assert.equal(strictModeSetup.isCurrent(), false);

  // A genuinely remounted component owns a separate fence. Further cleanup on
  // the old instance cannot invalidate the new instance's lease.
  const remountFence = createTemplateCopilotV2LifecycleFence();
  const remountLifecycle = remountFence.capture();
  oldFence.invalidateCurrent();
  assert.equal(remountLifecycle.isCurrent(), true);
  assert.equal(remountFence.currentEpoch(), 0);
});

test("old v2 Start cannot resurrect after schema-1 cleanup, failed v1 Start, and later v2 re-enable", async () => {
  const fence = createTemplateCopilotV2LifecycleFence();
  const model = lifecycleModel();
  model.pendingStart = null;
  model.storage.delete("start");
  const oldLifecycle = fence.capture();
  const oldPost = deferred();
  const oldStart = executeTemplateCopilotStart({
    lifecycle: oldLifecycle,
    schemaVersion: 2,
    intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
    loadPendingV2: () => model.pendingStart,
    installPendingV2: (pending) => installStart(model, oldLifecycle, pending),
    createKey: () => "start:old",
    request: () => oldPost.promise,
  });
  assert.equal(model.pendingStart.idempotencyKey, "start:old");
  assert.equal(model.storage.has("start"), true, "v2 command is persisted before POST");

  const rollback = rollbackLoadedV2(fence, model);
  assert.equal(rollback.released, true);
  assert.deepEqual(model.cleanupEvents.slice(0, 2), ["epoch", "mark"]);
  assert.equal(oldLifecycle.isCurrent(), false);

  const v1Lifecycle = fence.capture();
  v1Lifecycle.commit(() => {
    model.locks.start = true;
    model.busy = true;
  });
  await assert.rejects(
    () => executeTemplateCopilotStart({
      lifecycle: v1Lifecycle,
      schemaVersion: 1,
      intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
      loadPendingV2: () => {
        throw new Error("v1 cannot read v2 storage");
      },
      installPendingV2: () => {
        throw new Error("v1 cannot install v2 storage");
      },
      createKey: () => "start:v1",
      request: async () => {
        const error = new Error("v1 503");
        error.status = 503;
        throw error;
      },
    }),
    /v1 503/,
  );
  v1Lifecycle.commit(() => {
    model.error = "v1 503";
    model.locks.start = false;
    model.busy = false;
  });

  oldPost.resolve({ sessionId: "old-v2", revision: 2 });
  assert.equal(await oldStart, null);
  oldLifecycle.commit(() => {
    model.state = { sessionId: "old-v2", revision: 2 };
    model.messages = ["stale assistant"];
    model.locks.start = false;
    model.busy = false;
  });
  assert.equal(model.state, null);
  assert.deepEqual(model.messages, []);
  assert.equal(model.pendingStart, null);
  assert.equal(model.storage.size, 0);
  assert.equal(model.error, "v1 503");

  const freshLifecycle = fence.capture();
  const freshStart = await executeTemplateCopilotStart({
    lifecycle: freshLifecycle,
    schemaVersion: 2,
    intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
    loadPendingV2: () => model.pendingStart,
    installPendingV2: (pending) => installStart(model, freshLifecycle, pending),
    createKey: () => "start:fresh",
    request: async () => ({ sessionId: "fresh-v2", revision: 1 }),
  });
  assert.ok(freshStart);
  freshLifecycle.commit(() => {
    model.state = freshStart.response;
    model.messages = ["fresh assistant"];
    model.error = "";
  });
  assert.deepEqual(model.state, { sessionId: "fresh-v2", revision: 1 });
  assert.deepEqual(model.messages, ["fresh assistant"]);
  assert.equal(model.pendingStart, null);
  assert.equal(model.storage.has("start"), false);
  assert.equal(oldLifecycle.commit(() => {
    model.state = { sessionId: "old-v2", revision: 99 };
  }), false);
  assert.equal(model.state.sessionId, "fresh-v2");
});

test("execute Start ignores both stale success and stale rejection settlements", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const lifecycle = fence.capture();
    const post = deferred();
    const installs = [];
    let pending = null;
    const execution = executeTemplateCopilotStart({
      lifecycle,
      schemaVersion: 2,
      intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
      loadPendingV2: () => pending,
      installPendingV2: (next) => lifecycle.commit(() => {
        pending = next;
        installs.push(next);
      }),
      createKey: () => `start:${outcome}`,
      request: () => post.promise,
    });
    assert.equal(installs.length, 1, "initial command is installed before the request");
    fence.invalidateCurrent();
    if (outcome === "resolve") post.resolve({ sessionId: "stale" });
    else post.reject(Object.assign(new Error("stale 503"), { status: 503 }));
    assert.equal(await execution, null);
    assert.equal(installs.length, 1, `${outcome} cannot clear or reinstall pending state`);
  }
});

async function runAnswerSuccess(model, lifecycle, post) {
  lifecycle.commit(() => {
    model.locks.answer = true;
    model.busy = true;
  });
  try {
    const response = await post.promise;
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.state = response.state;
      model.pendingAnswer = null;
      model.resolved.add("turn:old");
      model.messages.push("old assistant");
    });
  } catch {
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.error = "answer error";
    });
  } finally {
    lifecycle.commit(() => {
      model.locks.answer = false;
      model.busy = false;
    });
  }
}

async function runAnswerFailureWithReconcile(model, lifecycle, post, history) {
  lifecycle.commit(() => {
    model.locks.answer = true;
    model.busy = true;
  });
  try {
    await post.promise;
    if (!lifecycle.isCurrent()) return;
  } catch (error) {
    if (!lifecycle.isCurrent()) return;
    if (error.status === 503) {
      model.reconcileRequests += 1;
      const snapshot = await history.promise;
      if (!lifecycle.isCurrent()) return;
      lifecycle.commit(() => {
        model.state = snapshot.state;
        model.messages = snapshot.messages;
        model.pendingAnswer = null;
        model.error = "reconciled";
      });
      return;
    }
    lifecycle.commit(() => {
      model.pendingAnswer = null;
      model.draft = "restored old answer";
      model.messages = [];
      model.resolved.add("turn:old");
      model.error = "validation";
    });
  } finally {
    lifecycle.commit(() => {
      model.locks.answer = false;
      model.busy = false;
    });
  }
}

test("answer success, validation rejection, reconciliation history, and finally are inert after rollback", async () => {
  {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const flow = runAnswerSuccess(model, lifecycle, post);
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 4 };
      model.messages = ["fresh"];
      model.pendingAnswer = { idempotencyKey: "turn:fresh" };
      model.locks.answer = true;
      model.busy = true;
      model.error = "fresh error";
    });
    post.resolve({ state: { sessionId: "old", revision: 2 } });
    await flow;
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 4 });
    assert.deepEqual(model.messages, ["fresh"]);
    assert.deepEqual(model.pendingAnswer, { idempotencyKey: "turn:fresh" });
    assert.equal(model.locks.answer, true);
    assert.equal(model.busy, true);
    assert.equal(model.error, "fresh error");
    assert.equal(model.resolved.has("turn:old"), false);
  }

  {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const history = deferred();
    const flow = runAnswerFailureWithReconcile(model, lifecycle, post, history);
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.draft = "fresh draft";
      model.messages = ["fresh"];
      model.pendingAnswer = { idempotencyKey: "turn:fresh" };
      model.error = "fresh error";
      model.locks.answer = true;
      model.busy = true;
    });
    post.reject(Object.assign(new Error("invalid"), { status: 422 }));
    await flow;
    assert.equal(model.draft, "fresh draft");
    assert.deepEqual(model.messages, ["fresh"]);
    assert.deepEqual(model.pendingAnswer, { idempotencyKey: "turn:fresh" });
    assert.equal(model.error, "fresh error");
    assert.equal(model.reconcileRequests, 0);
    assert.equal(model.locks.answer, true);
    assert.equal(model.busy, true);
  }

  {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const history = deferred();
    const flow = runAnswerFailureWithReconcile(model, lifecycle, post, history);
    post.reject(Object.assign(new Error("lost"), { status: 503 }));
    await flushMicrotasks();
    assert.equal(model.reconcileRequests, 1, "current 503 starts authoritative history recovery");
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 8 };
      model.messages = ["fresh"];
      model.pendingAnswer = { idempotencyKey: "turn:fresh" };
      model.error = "fresh error";
      model.locks.answer = true;
      model.busy = true;
    });
    history.resolve({ state: { sessionId: "old", revision: 2 }, messages: ["old recovered"] });
    await flow;
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 8 });
    assert.deepEqual(model.messages, ["fresh"]);
    assert.deepEqual(model.pendingAnswer, { idempotencyKey: "turn:fresh" });
    assert.equal(model.error, "fresh error");
    assert.equal(model.locks.answer, true);
    assert.equal(model.busy, true);
  }
});

async function runSpecialSuccess(model, lifecycle, post) {
  lifecycle.commit(() => {
    model.locks.special = true;
    model.busy = true;
  });
  try {
    const response = await post.promise;
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.state = response.state;
      model.pendingSpecial = null;
      model.storage.delete("special");
      model.messages.push("old special assistant");
      model.notApplicableReason = "";
    });
  } catch {
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.pendingSpecial = null;
      model.storage.delete("special");
      model.error = "special request error";
    });
  } finally {
    lifecycle.commit(() => {
      model.locks.special = false;
      model.busy = false;
    });
  }
}

async function runSpecialFailureWithReconcile(model, lifecycle, post, reconcile, tail) {
  lifecycle.commit(() => {
    model.locks.special = true;
    model.busy = true;
  });
  try {
    await post.promise;
    if (!lifecycle.isCurrent()) return;
  } catch (error) {
    if (!lifecycle.isCurrent()) return;
    if (error.status !== 503) {
      lifecycle.commit(() => {
        model.pendingSpecial = null;
        model.storage.delete("special");
        model.error = "special request error";
      });
      return;
    }
    model.reconcileRequests += 1;
    const receipt = await reconcile.promise;
    if (!lifecycle.isCurrent()) return;
    if (receipt.outcome === "committed") {
      model.tailRequests += 1;
      const snapshot = await tail.promise;
      if (!lifecycle.isCurrent()) return;
      lifecycle.commit(() => {
        model.state = snapshot.state;
        model.messages = snapshot.messages;
      });
    }
    lifecycle.commit(() => {
      model.pendingSpecial = null;
      model.storage.delete("special");
      model.error = receipt.outcome;
    });
  } finally {
    lifecycle.commit(() => {
      model.locks.special = false;
      model.busy = false;
    });
  }
}

async function runDraftOrDossierSuccess(model, lifecycle, operation, kind) {
  lifecycle.commit(() => {
    model.busy = true;
  });
  try {
    const response = await operation.promise;
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.draftReview = response.review;
      model.messages.push(`old ${kind}`);
      if (kind === "create-draft") model.state = response.state;
    });
  } catch {
    if (!lifecycle.isCurrent()) return;
    lifecycle.commit(() => {
      model.error = `${kind} error`;
    });
  } finally {
    lifecycle.commit(() => {
      model.busy = false;
    });
  }
}

test("unmount makes answer, special, draft, and dossier continuations inert to a fresh remount", async () => {
  for (const kind of ["answer", "special", "create-draft", "save-dossier"]) {
    const oldFence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const oldLifecycle = oldFence.capture();
    const operation = deferred();
    const flow = kind === "answer"
      ? runAnswerSuccess(model, oldLifecycle, operation)
      : kind === "special"
        ? runSpecialSuccess(model, oldLifecycle, operation)
        : runDraftOrDossierSuccess(model, oldLifecycle, operation, kind);

    assert.equal(model.busy, true);
    oldFence.invalidateCurrent();
    assert.equal(oldLifecycle.isCurrent(), false);

    const remountFence = createTemplateCopilotV2LifecycleFence();
    const remountLifecycle = remountFence.capture();
    remountLifecycle.commit(() => {
      model.state = { sessionId: `fresh-${kind}`, revision: 12 };
      model.messages = ["fresh"];
      model.pendingAnswer = { idempotencyKey: "turn:fresh" };
      model.pendingSpecial = { idempotencyKey: "special:fresh" };
      model.storage.set("special", model.pendingSpecial);
      model.draftReview = { draftId: "draft-fresh", revision: 7 };
      model.error = "fresh error";
      model.locks = { start: true, answer: true, special: true };
      model.busy = true;
    });

    operation.resolve({
      state: { sessionId: `old-${kind}`, revision: 2 },
      messages: ["old recovered"],
      review: { draftId: "draft-old", revision: 2 },
    });
    await flow;

    assert.deepEqual(model.state, { sessionId: `fresh-${kind}`, revision: 12 }, kind);
    assert.deepEqual(model.messages, ["fresh"], kind);
    assert.deepEqual(model.pendingAnswer, { idempotencyKey: "turn:fresh" }, kind);
    assert.deepEqual(model.pendingSpecial, { idempotencyKey: "special:fresh" }, kind);
    assert.equal(model.storage.get("special").idempotencyKey, "special:fresh", kind);
    assert.deepEqual(model.draftReview, { draftId: "draft-fresh", revision: 7 }, kind);
    assert.equal(model.error, "fresh error", kind);
    assert.deepEqual(model.locks, { start: true, answer: true, special: true }, kind);
    assert.equal(model.busy, true, `${kind} finally cannot unlock the remount`);
    assert.equal(remountLifecycle.isCurrent(), true);
  }
});

test("special success, rejection, reconcile, committed tail, and finally are inert after rollback", async () => {
  for (const outcome of ["success", "rejection"]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const flow = runSpecialSuccess(model, lifecycle, post);
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 3 };
      model.messages = ["fresh"];
      model.pendingSpecial = { idempotencyKey: "special:fresh" };
      model.storage.set("special", model.pendingSpecial);
      model.notApplicableReason = "fresh reason";
      model.error = "fresh error";
      model.locks.special = true;
      model.busy = true;
    });
    if (outcome === "success") post.resolve({ state: { sessionId: "old", revision: 2 } });
    else post.reject(Object.assign(new Error("invalid"), { status: 422 }));
    await flow;
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 3 }, outcome);
    assert.deepEqual(model.messages, ["fresh"], outcome);
    assert.deepEqual(model.pendingSpecial, { idempotencyKey: "special:fresh" }, outcome);
    assert.equal(model.storage.get("special").idempotencyKey, "special:fresh", outcome);
    assert.equal(model.notApplicableReason, "fresh reason", outcome);
    assert.equal(model.error, "fresh error", outcome);
    assert.equal(model.locks.special, true, outcome);
    assert.equal(model.busy, true, outcome);
  }

  {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const reconcile = deferred();
    const tail = deferred();
    const flow = runSpecialFailureWithReconcile(model, lifecycle, post, reconcile, tail);
    post.reject(Object.assign(new Error("lost"), { status: 503 }));
    await flushMicrotasks();
    assert.equal(model.reconcileRequests, 1);
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 5 };
      model.messages = ["fresh"];
      model.pendingSpecial = { idempotencyKey: "special:fresh" };
      model.storage.set("special", model.pendingSpecial);
      model.error = "fresh error";
      model.locks.special = true;
      model.busy = true;
    });
    reconcile.resolve({ outcome: "missing" });
    await flow;
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 5 });
    assert.deepEqual(model.pendingSpecial, { idempotencyKey: "special:fresh" });
    assert.equal(model.storage.get("special").idempotencyKey, "special:fresh");
    assert.equal(model.error, "fresh error");
    assert.equal(model.locks.special, true);
    assert.equal(model.busy, true);
  }

  {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const post = deferred();
    const reconcile = deferred();
    const tail = deferred();
    const flow = runSpecialFailureWithReconcile(model, lifecycle, post, reconcile, tail);
    post.reject(Object.assign(new Error("lost"), { status: 503 }));
    await flushMicrotasks();
    reconcile.resolve({ outcome: "committed" });
    await flushMicrotasks();
    assert.equal(model.tailRequests, 1, "committed receipt starts authoritative tail refresh");
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 9 };
      model.messages = ["fresh"];
      model.pendingSpecial = { idempotencyKey: "special:fresh" };
      model.storage.set("special", model.pendingSpecial);
      model.error = "fresh error";
      model.locks.special = true;
      model.busy = true;
    });
    tail.resolve({ state: { sessionId: "old", revision: 4 }, messages: ["old tail"] });
    await flow;
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 9 });
    assert.deepEqual(model.messages, ["fresh"]);
    assert.deepEqual(model.pendingSpecial, { idempotencyKey: "special:fresh" });
    assert.equal(model.error, "fresh error");
    assert.equal(model.locks.special, true);
    assert.equal(model.busy, true);
  }
});

test("stored-special recovery, draft creation, dossier save, and queued React updater stay inert after rollback", async () => {
  for (const kind of ["stored-special", "create-draft", "save-dossier"]) {
    const fence = createTemplateCopilotV2LifecycleFence();
    const model = lifecycleModel();
    const lifecycle = fence.capture();
    const operation = deferred();
    const flow = (async () => {
      lifecycle.commit(() => {
        model.busy = true;
        if (kind === "stored-special") model.locks.special = true;
      });
      try {
        const response = await operation.promise;
        if (!lifecycle.isCurrent()) return;
        lifecycle.commit(() => {
          if (kind === "stored-special") {
            model.pendingSpecial = null;
            model.messages = response.messages;
          } else if (kind === "create-draft") {
            model.draftReview = response.review;
            model.state = response.state;
            model.messages.push("old review");
          } else {
            model.draftReview = response.review;
            model.messages.push("old saved");
          }
        });
      } catch {
        if (!lifecycle.isCurrent()) return;
        lifecycle.commit(() => {
          model.error = `${kind} error`;
        });
      } finally {
        lifecycle.commit(() => {
          model.busy = false;
          if (kind === "stored-special") model.locks.special = false;
        });
      }
    })();
    let queuedReactUpdater;
    lifecycle.commit(() => {
      queuedReactUpdater = () => {
        if (lifecycle.isCurrent()) model.messages = ["queued old updater"];
      };
    });
    rollbackLoadedV2(fence, model);
    const fresh = fence.capture();
    fresh.commit(() => {
      model.state = { sessionId: "fresh", revision: 12 };
      model.messages = ["fresh"];
      model.draftReview = { draftId: "draft-fresh", revision: 7 };
      model.error = "fresh error";
      model.busy = true;
      model.locks.special = true;
    });
    operation.resolve({
      state: { sessionId: "old", revision: 2 },
      messages: ["old recovered"],
      review: { draftId: "draft-old", revision: 2 },
    });
    await flow;
    queuedReactUpdater();
    assert.deepEqual(model.state, { sessionId: "fresh", revision: 12 }, kind);
    assert.deepEqual(model.messages, ["fresh"], kind);
    assert.deepEqual(model.draftReview, { draftId: "draft-fresh", revision: 7 }, kind);
    assert.equal(model.error, "fresh error", kind);
    assert.equal(model.busy, true, kind);
    assert.equal(model.locks.special, true, kind);
  }
});

test("clean v1 rollback is a true no-op and leaves its ordinary 503 settlement intact", async () => {
  const fence = createTemplateCopilotV2LifecycleFence();
  const calls = [];
  const beforeEpoch = fence.currentEpoch();
  const released = releaseTemplateCopilotV2ClientAfterRollback({
    hasLoadedV2: () => false,
    advanceLifecycleEpoch: () => {
      calls.push("epoch");
      fence.invalidateCurrent();
    },
    markReleased: () => calls.push("mark"),
    clearPendingStart: () => calls.push("start"),
    clearPendingSpecial: () => calls.push("special"),
    clearPendingAnswer: () => calls.push("answer"),
    clearCommandTracking: () => calls.push("tracking"),
    clearInterviewAndMessages: () => calls.push("interview"),
    clearLocks: () => calls.push("locks"),
  });
  assert.equal(released, false);
  assert.deepEqual(calls, []);
  assert.equal(fence.currentEpoch(), beforeEpoch);

  let v1Error = "";
  const lifecycle = fence.capture();
  await assert.rejects(
    () => executeTemplateCopilotStart({
      lifecycle,
      schemaVersion: 1,
      intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
      loadPendingV2: () => {
        throw new Error("clean v1 cannot read v2");
      },
      installPendingV2: () => {
        throw new Error("clean v1 cannot install v2");
      },
      createKey: () => "start:v1-clean",
      request: async () => {
        const error = new Error("v1 503");
        error.status = 503;
        throw error;
      },
    }),
    /v1 503/,
  );
  lifecycle.commit(() => {
    v1Error = "v1 503";
  });
  assert.equal(v1Error, "v1 503");
});

test("production source carries one lease through every v2 continuation and rechecks React updaters", async () => {
  const component = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  const helper = await readFile(new URL("./template-copilot-v2-client-command.ts", import.meta.url), "utf8");
  const slice = (start, end) => component.slice(component.indexOf(start), component.indexOf(end));

  assert.match(component, /const v2LifecycleEpochRef = useRef<[^;]+createTemplateCopilotV2LifecycleFence/);
  assert.match(component, /setter\(\(current\) => lifecycle\.isCurrent\(\) \? update\(current\) : current\)/);
  assert.match(component, /function installV2State\(\s*lifecycle: TemplateCopilotV2LifecycleLease,/);
  assert.doesNotMatch(component, /installV2State\(\s*\{/);
  assert.match(component, /function installPendingV2Start\(\s*lifecycle:/);
  assert.match(component, /function installPendingV2Special\(\s*lifecycle:/);

  const release = slice("function releaseV2AfterRollback()", "async function reconcileV2Special");
  assert.ok(release.indexOf("advanceLifecycleEpoch:") < release.indexOf("markReleased:"), "epoch advances before cleanup");
  assert.match(helper, /cleanup\.advanceLifecycleEpoch\(\);\s+cleanup\.markReleased\(\);/);

  const mount = slice("useEffect(() => {", "const locale =");
  assert.match(mount, /const mountLifecycle = captureV2LifecycleLease\(\)/);
  assert.match(mount, /!mountLifecycle\.isCurrent\(\)/);
  assert.match(mount, /return \(\) => \{[\s\S]+?active = false;[\s\S]+?v2LifecycleEpochRef\.current\?\.invalidateCurrent\(\);/);
  assert.doesNotMatch(mount, /if\s*\(\s*mountLifecycle\.isCurrent\(\)\s*\)[\s\S]*?invalidateCurrent/);

  const start = slice("async function start()", "async function reconcileV2(");
  assert.match(start, /v2LifecycleEpochRef\.current\?\.invalidateCurrent\(\);\s+const capabilityLifecycle = captureV2LifecycleLease\(\)/);
  assert.match(start, /const recovery = await discoverTemplateCopilotV2Recovery\([\s\S]+?if \(!recovery\) return;/);
  assert.match(start, /const started = await executeTemplateCopilotStart\([\s\S]+?if \(!started \|\| !operationLifecycle\.isCurrent\(\)\) return;/);
  assert.match(start, /finally \{[\s\S]+?operationLifecycle\.commit\(/);

  const answerReconcile = slice("async function reconcileV2(", "async function submitV2(");
  assert.match(answerReconcile, /lifecycle: TemplateCopilotV2LifecycleLease/);
  assert.match(answerReconcile, /const response = await api\([\s\S]+?if \(!lifecycle\.isCurrent\(\)\) return null;/);

  const answer = slice("async function submitV2(", "function releaseV2AfterRollback()");
  assert.match(answer, /const response = await api\([\s\S]+?if \(!lifecycle\.isCurrent\(\)\) return false;/);
  assert.match(answer, /recovered = await reconcileV2\(lifecycle,/);
  assert.match(answer, /finally \{[\s\S]+?lifecycle\.commit\(/);

  const specialReconcile = slice("async function reconcileV2Special(", "async function submitV2Special(");
  assert.match(specialReconcile, /const reconciled = await api\([\s\S]+?if \(!lifecycle\.isCurrent\(\)\) return null;/);
  assert.match(specialReconcile, /const snapshot = await api\([\s\S]+?if \(!lifecycle\.isCurrent\(\)\) return null;/);

  const special = slice("async function submitV2Special(", "async function recoverStoredV2Special(");
  assert.match(special, /const response = await api\([\s\S]+?if \(!lifecycle\.isCurrent\(\)\) return;/);
  assert.match(special, /await reconcileV2Special\(lifecycle,/);
  assert.match(special, /finally \{[\s\S]+?lifecycle\.commit\(/);

  const recovery = slice("async function recoverStoredV2Special(", "async function send()");
  assert.match(recovery, /await reconcileV2Special\(lifecycle,/);
  assert.match(recovery, /if \(!lifecycle\.isCurrent\(\)\) return;/);
  assert.match(recovery, /finally \{[\s\S]+?lifecycle\.commit\(/);

  const createDraft = slice("async function createDraft()", "async function saveDossierReview()");
  assert.match(createDraft, /const lifecycle = isV2State\(sourceState\) \? captureV2LifecycleLease\(\) : null/);
  assert.match(createDraft, /const response = await legacyApi\([\s\S]+?if \(lifecycle && !lifecycle\.isCurrent\(\)\) return;/);
  assert.match(createDraft, /current\?\.sessionId === sourceState\.sessionId/);

  const saveReview = slice("async function saveDossierReview()", "function continueToBuilder()");
  assert.match(saveReview, /const lifecycle = review\.lifecycle/);
  assert.match(saveReview, /const response = await legacyApi\([\s\S]+?if \(lifecycle && !lifecycle\.isCurrent\(\)\) return;/);
  assert.match(saveReview, /current\?\.draftId === review\.draftId/);
  assert.match(saveReview, /current\.sourceSessionId === review\.sourceSessionId/);
});
