import assert from "node:assert/strict";
import test from "node:test";
import { applyTemplateCopilotV2Reconciliation, canReplaceTemplateCopilotV2Transcript, canRestoreTemplateCopilotV2Draft, createTemplateCopilotClientChatMessage, createTemplateCopilotV2LifecycleFence, discoverTemplateCopilotV2Recovery, executeTemplateCopilotStart, mergeTemplateCopilotClientChatMessages, nextTemplateCopilotV2PendingCommand, nextTemplateCopilotV2PendingSpecialCommand, nextTemplateCopilotV2PendingStart, parseTemplateCopilotClientChatMessages, parseTemplateCopilotV2PendingSpecialCommand, reconcileTemplateCopilotV2PendingCommand, releaseTemplateCopilotV2ClientAfterRollback, resolveTemplateCopilotV2ExplicitConflict, resolveTemplateCopilotV2Failure, resolveTemplateCopilotV2SpecialReconciliation, resolveTemplateCopilotV2StartFailure, selectNewerTemplateCopilotV2Snapshot, selectTemplateCopilotStartIntent, templateCopilotV2FailureNeedsReconcile, templateCopilotV2InterviewMutationBlocked } from "./template-copilot-v2-client-command.ts";

function freshLifecycle() {
  return createTemplateCopilotV2LifecycleFence().capture();
}

test("v2 start retains its exact command over first-call stale closures, retries, and double clicks", () => {
  const first = nextTemplateCopilotV2PendingStart({ pending: null, businessUnitId: "business", departmentName: "Finance", locale: "en", createKey: () => "start:one" });
  // This models the first request's catch after React has not yet published
  // setState: it must use the captured command, not a stale null state value.
  const lost = resolveTemplateCopilotV2StartFailure({ status: null, command: first, currentPending: first });
  assert.equal(lost.pending, first);
  assert.equal(nextTemplateCopilotV2PendingStart({ pending: lost.pending, businessUnitId: "business", departmentName: "Finance", locale: "en", createKey: () => "start:two" }), first);
  assert.throws(() => nextTemplateCopilotV2PendingStart({ pending: first, businessUnitId: "other", departmentName: "Finance", locale: "en", createKey: () => "start:three" }), /previous Copilot start/);
  assert.equal(resolveTemplateCopilotV2StartFailure({ status: 422, command: first, currentPending: first }).pending, null);
  assert.equal(resolveTemplateCopilotV2StartFailure({ status: 503, command: first, currentPending: first }).retain, true);
});

test("v1 start never reads, persists, reduces, replays, or scope-locks v2 pending state", async () => {
  let loadCalls = 0;
  let installCalls = 0;
  let createdKeys = 0;
  const requests = [];
  const run = (request) => executeTemplateCopilotStart({
    lifecycle: freshLifecycle(),
    schemaVersion: 1,
    intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
    loadPendingV2: () => {
      loadCalls += 1;
      throw new Error("v1 must not inspect v2 storage");
    },
    installPendingV2: () => {
      installCalls += 1;
      throw new Error("v1 must not persist v2 state");
    },
    createKey: () => `start:v1-${++createdKeys}`,
    request: async (command, expectedSchemaVersion) => {
      requests.push({ command, expectedSchemaVersion });
      return request(command);
    },
  });

  const success = await run(async () => ({ sessionId: "v1-success" }));
  assert.equal(success.schemaVersion, 1);
  assert.equal(success.response.sessionId, "v1-success");
  assert.equal(loadCalls, 0);
  assert.equal(installCalls, 0);
  assert.deepEqual(requests[0], {
    command: {
      businessUnitId: "business",
      departmentName: "Finance",
      locale: "en",
      clientMessageId: "start:v1-1",
    },
    expectedSchemaVersion: 1,
  });

  for (const status of [null, 503]) {
    await assert.rejects(() => run(async () => {
      const error = new Error("legacy transport failure");
      if (status !== null) error.status = status;
      throw error;
    }), /legacy transport failure/);
  }
  const retryAfterReload = await run(async () => ({ sessionId: "v1-retry" }));
  assert.equal(retryAfterReload.response.sessionId, "v1-retry");
  assert.equal(loadCalls, 0, "network, 5xx, and a later retry never load v2 sessionStorage");
  assert.equal(installCalls, 0, "v1 never creates duplicate v2 persistence");
  assert.equal(requests.every((entry) => entry.expectedSchemaVersion === 1), true);
  assert.equal(new Set(requests.map((entry) => entry.command.clientMessageId)).size, requests.length, "legacy retries keep the established non-persisted v1 behavior");
});

test("capability-gated UI recovery never reads v2 storage in v1 and restores both stores only in v2", async () => {
  let startLoads = 0;
  let specialLoads = 0;
  let releaseCalls = 0;
  const pendingStart = Object.freeze({
    idempotencyKey: "start:recovered",
    businessUnitId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    departmentName: "Treasury",
    locale: "zh-Hant",
  });
  const pendingSpecial = nextTemplateCopilotV2PendingSpecialCommand({
    pending: null,
    sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    revision: 3,
    command: { operation: "defer" },
    createKey: () => "special:recovered",
  });
  const loadPendingV2Start = () => {
    startLoads += 1;
    return pendingStart;
  };
  const loadPendingV2Special = () => {
    specialLoads += 1;
    return pendingSpecial;
  };

  const legacy = await discoverTemplateCopilotV2Recovery({
    lifecycle: freshLifecycle(),
    discoverSchemaVersion: async () => 1,
    releaseLoadedV2AfterRollback: () => {
      releaseCalls += 1;
    },
    loadPendingV2Start,
    loadPendingV2Special,
  });
  assert.deepEqual(legacy, { schemaVersion: 1, pendingStart: null, pendingSpecial: null });
  assert.equal(startLoads, 0);
  assert.equal(specialLoads, 0);
  assert.equal(releaseCalls, 1);

  const v2 = await discoverTemplateCopilotV2Recovery({
    lifecycle: freshLifecycle(),
    discoverSchemaVersion: async () => 2,
    releaseLoadedV2AfterRollback: () => {
      releaseCalls += 1;
    },
    loadPendingV2Start,
    loadPendingV2Special,
  });
  assert.equal(v2.pendingStart, pendingStart);
  assert.equal(v2.pendingSpecial, pendingSpecial);
  assert.equal(startLoads, 1);
  assert.equal(specialLoads, 1);
  assert.equal(releaseCalls, 1, "v2 discovery never runs the rollback cleanup callback");
  assert.deepEqual(
    selectTemplateCopilotStartIntent(
      {
        businessUnitId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        departmentName: "Default department",
        locale: "en",
      },
      v2.pendingStart,
    ),
    {
      businessUnitId: pendingStart.businessUnitId,
      departmentName: pendingStart.departmentName,
      locale: pendingStart.locale,
    },
    "reload uses the immutable recovered scope instead of a reset selector default",
  );
});

test("loaded v2 rollback is fully released before a failed v1 Start and cannot later resurrect", async () => {
  for (const failureStatus of [null, 503]) {
    const lifecycleFence = createTemplateCopilotV2LifecycleFence();
    const events = [];
    const storage = new Map([
      ["start", { idempotencyKey: "start:stale-v2" }],
      ["special", { idempotencyKey: "special:stale-v2" }],
    ]);
    const loaded = {
      hasLoadedV2: true,
      pendingStart: { idempotencyKey: "start:stale-v2" },
      pendingSpecial: { idempotencyKey: "special:stale-v2" },
      pendingAnswer: { idempotencyKey: "turn:stale-v2" },
      activeAnswer: { idempotencyKey: "turn:stale-v2" },
      resolved: new Set(["turn:resolved"]),
      draftGenerations: new Map([["turn:stale-v2", 9]]),
      draftGeneration: 9,
      interview: { schemaVersion: 2 },
      messages: [{ id: "turn:stale-v2" }],
      locks: { answer: true, special: true, start: true, busy: true },
      selectorsLocked: true,
    };
    const releaseLoadedV2AfterRollback = () => releaseTemplateCopilotV2ClientAfterRollback({
      hasLoadedV2: () => loaded.hasLoadedV2,
      advanceLifecycleEpoch: () => {
        events.push("cleanup:epoch");
        lifecycleFence.invalidateCurrent();
      },
      markReleased: () => {
        events.push("cleanup:mark");
        loaded.hasLoadedV2 = false;
      },
      clearPendingStart: () => {
        events.push("cleanup:start");
        loaded.pendingStart = null;
        storage.delete("start");
      },
      clearPendingSpecial: () => {
        events.push("cleanup:special");
        loaded.pendingSpecial = null;
        storage.delete("special");
        loaded.selectorsLocked = false;
      },
      clearPendingAnswer: () => {
        events.push("cleanup:answer");
        loaded.pendingAnswer = null;
        loaded.activeAnswer = null;
      },
      clearCommandTracking: () => {
        events.push("cleanup:tracking");
        loaded.resolved.clear();
        loaded.draftGenerations.clear();
        loaded.draftGeneration = 0;
      },
      clearInterviewAndMessages: () => {
        events.push("cleanup:interview");
        loaded.interview = null;
        loaded.messages = [];
      },
      clearLocks: () => {
        events.push("cleanup:locks");
        loaded.locks = { answer: false, special: false, start: false, busy: false };
      },
    });

    const recovery = await discoverTemplateCopilotV2Recovery({
      lifecycle: lifecycleFence.capture(),
      discoverSchemaVersion: async () => {
        events.push("HEAD:1");
        return 1;
      },
      releaseLoadedV2AfterRollback,
      loadPendingV2Start: () => {
        throw new Error("schema 1 must not read stale v2 start storage");
      },
      loadPendingV2Special: () => {
        throw new Error("schema 1 must not read stale v2 special storage");
      },
    });
    assert.equal(recovery.schemaVersion, 1);

    await assert.rejects(
      () => executeTemplateCopilotStart({
        lifecycle: lifecycleFence.capture(),
        schemaVersion: 1,
        intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
        loadPendingV2: () => {
          throw new Error("v1 Start must not reload v2 storage");
        },
        installPendingV2: () => {
          throw new Error("v1 Start must not persist v2 state");
        },
        createKey: () => "start:v1-after-rollback",
        request: async () => {
          events.push(`POST:${failureStatus ?? "network"}`);
          const error = new Error("legacy start failed");
          if (failureStatus !== null) error.status = failureStatus;
          throw error;
        },
      }),
      /legacy start failed/,
    );

    assert.ok(events.indexOf("cleanup:locks") < events.indexOf(`POST:${failureStatus ?? "network"}`));
    assert.ok(events.indexOf("cleanup:epoch") < events.indexOf("cleanup:mark"), "rollback invalidates old continuations before clearing any v2 state");
    assert.equal(loaded.hasLoadedV2, false);
    assert.equal(loaded.pendingStart, null);
    assert.equal(loaded.pendingSpecial, null);
    assert.equal(loaded.pendingAnswer, null);
    assert.equal(loaded.activeAnswer, null);
    assert.equal(loaded.resolved.size, 0);
    assert.equal(loaded.draftGenerations.size, 0);
    assert.equal(loaded.draftGeneration, 0);
    assert.equal(loaded.interview, null);
    assert.deepEqual(loaded.messages, []);
    assert.deepEqual(loaded.locks, { answer: false, special: false, start: false, busy: false });
    assert.equal(loaded.selectorsLocked, false);
    assert.equal(storage.size, 0);

    const laterV2 = await discoverTemplateCopilotV2Recovery({
      lifecycle: lifecycleFence.capture(),
      discoverSchemaVersion: async () => 2,
      releaseLoadedV2AfterRollback: () => {
        throw new Error("v2 enablement must not run rollback cleanup");
      },
      loadPendingV2Start: () => storage.get("start") || null,
      loadPendingV2Special: () => storage.get("special") || null,
    });
    assert.equal(laterV2.pendingStart, null);
    assert.equal(laterV2.pendingSpecial, null);
  }

  const cleanV1Mutations = [];
  const cleanV1Released = releaseTemplateCopilotV2ClientAfterRollback({
    hasLoadedV2: () => false,
    advanceLifecycleEpoch: () => cleanV1Mutations.push("epoch"),
    markReleased: () => cleanV1Mutations.push("mark"),
    clearPendingStart: () => cleanV1Mutations.push("start"),
    clearPendingSpecial: () => cleanV1Mutations.push("special"),
    clearPendingAnswer: () => cleanV1Mutations.push("answer"),
    clearCommandTracking: () => cleanV1Mutations.push("tracking"),
    clearInterviewAndMessages: () => cleanV1Mutations.push("interview"),
    clearLocks: () => cleanV1Mutations.push("locks"),
  });
  assert.equal(cleanV1Released, false);
  assert.deepEqual(cleanV1Mutations, [], "a clean v1 client is not mutated unnecessarily");
});

test("v2 start still persists before mutation and retries the same key after network or 5xx failure", async () => {
  const lifecycleFence = createTemplateCopilotV2LifecycleFence();
  let stored = null;
  let createdKeys = 0;
  const requests = [];
  const installs = [];
  const execute = (request) => executeTemplateCopilotStart({
    lifecycle: lifecycleFence.capture(),
    schemaVersion: 2,
    intent: { businessUnitId: "business", departmentName: "Finance", locale: "en" },
    loadPendingV2: () => stored,
    installPendingV2: (pending) => {
      stored = pending;
      installs.push(pending);
    },
    createKey: () => `start:v2-${++createdKeys}`,
    request: async (command, expectedSchemaVersion) => {
      requests.push({ command, expectedSchemaVersion });
      return request(command);
    },
  });

  await assert.rejects(() => execute(async () => {
    const error = new Error("lost response");
    error.status = 503;
    throw error;
  }), /lost response/);
  const captured = stored;
  assert.ok(captured);
  assert.equal(installs[0], captured, "the exact command is installed before POST");
  assert.equal(stored, captured, "5xx retains the same immutable command");

  const recovered = await execute(async () => ({ sessionId: "v2-replayed" }));
  assert.equal(recovered.response.sessionId, "v2-replayed");
  assert.equal(stored, null);
  assert.equal(createdKeys, 1, "reload/retry does not mint a second key");
  assert.deepEqual(requests.map((entry) => entry.command.clientMessageId), [captured.idempotencyKey, captured.idempotencyKey]);
  assert.equal(requests.every((entry) => entry.expectedSchemaVersion === 2), true);
});

test("authoritative recovery preserves database microseconds and chronologically dedupes the recovered pair", () => {
  assert.equal(createTemplateCopilotClientChatMessage({
    clientMessageId: "turn:stable",
    role: "user",
    content: "Answer",
  }).id, "turn:stable");
  assert.equal(createTemplateCopilotClientChatMessage({
    clientMessageId: "turn:stable",
    role: "assistant",
    content: "Next question",
  }).id, "turn:stable-assistant");
  const earlier = createTemplateCopilotClientChatMessage({
    clientMessageId: "turn:earlier",
    role: "assistant",
    content: "Earlier prompt",
    createdAt: "2026-07-27T12:00:00.123454Z",
  });
  const optimistic = createTemplateCopilotClientChatMessage({
    clientMessageId: "special:lost",
    role: "user",
    content: "Optimistic text",
    createdAt: "2026-07-27T12:00:09.000Z",
  });
  const later = createTemplateCopilotClientChatMessage({
    clientMessageId: "turn:later",
    role: "user",
    content: "Later answer",
    createdAt: "2026-07-27T12:00:00.123458Z",
  });
  const authoritative = parseTemplateCopilotClientChatMessages([
    {
      id: "db-assistant",
      clientMessageId: "special:lost",
      role: "assistant",
      content: "Recovered reply",
      createdAt: "2026-07-27T12:00:00.123457Z",
    },
    {
      id: "db-user",
      clientMessageId: "special:lost",
      role: "user",
      content: "Recovered action",
      createdAt: "2026-07-27T12:00:00.123456Z",
    },
  ]);
  assert.ok(authoritative);
  const merged = mergeTemplateCopilotClientChatMessages([earlier, optimistic, later], authoritative);
  assert.deepEqual(
    merged.map((message) => [message.id, message.content, message.createdAt]),
    [
      ["turn:earlier-assistant", "Earlier prompt", "2026-07-27T12:00:00.123454Z"],
      ["special:lost", "Recovered action", "2026-07-27T12:00:00.123456Z"],
      ["special:lost-assistant", "Recovered reply", "2026-07-27T12:00:00.123457Z"],
      ["turn:later", "Later answer", "2026-07-27T12:00:00.123458Z"],
    ],
  );
});

test("a response-lost retry preserves the exact key, revision, question, and answer", () => {
  const first = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 4, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:one" });
  const retry = nextTemplateCopilotV2PendingCommand({ pending: first, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 4, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:two" });
  assert.equal(retry, first);
  assert.throws(() => nextTemplateCopilotV2PendingCommand({ pending: first, questionId: "v2.workflow.purpose.purpose", primaryDecisionId: "decision.workflow.purpose.purpose", revision: 5, answer: { kind: "text", text: "Different" }, createKey: () => "turn:three" }), /Retry or reload/);
});

test("stale and ambiguous outcomes reconcile before another answer is allowed", () => {
  assert.equal(templateCopilotV2FailureNeedsReconcile(409), true);
  assert.equal(templateCopilotV2FailureNeedsReconcile(503), true);
  assert.equal(templateCopilotV2FailureNeedsReconcile(null), true);
  assert.equal(templateCopilotV2FailureNeedsReconcile(422), false);
});

test("response-lost reconciliation clears only a command whose exact decision is present", () => {
  const pending = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:one" });
  const committedDecision = { kind: "text", answer: "Invoice approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:one" }] };
  const committed = reconcileTemplateCopilotV2PendingCommand({ pending, ledger: { atomicDecisions: { "decision.workflow.name.name": committedDecision } } });
  assert.deepEqual(committed, { pending: null, outcome: "committed" });
  const absent = reconcileTemplateCopilotV2PendingCommand({ pending, ledger: { atomicDecisions: {} } });
  assert.equal(absent.outcome, "replay_required");
  assert.equal(absent.pending, pending);
});

test("first-request recovery uses the captured command, clears it after a lost response, and cannot requeue it", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:one" });
  const resolved = new Set();
  // Simulates setPending(command), POST commits, the response is lost, then
  // GET has advanced to the next question. It must not read stale React state.
  const decision = { kind: "text", answer: "Invoice approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:one" }] };
  const committed = applyTemplateCopilotV2Reconciliation({ command, currentPending: command, resolvedCommandKeys: resolved, ledger: { atomicDecisions: { "decision.workflow.name.name": decision } } });
  assert.equal(committed.outcome, "committed");
  assert.equal(committed.pending, null);
  assert.equal(committed.markResolved, true);
  resolved.add(command.idempotencyKey);
  const lateDuplicate = applyTemplateCopilotV2Reconciliation({ command, currentPending: null, resolvedCommandKeys: resolved, ledger: { atomicDecisions: { "decision.workflow.name.name": decision } } });
  assert.equal(lateDuplicate.outcome, "already_committed");
  assert.equal(lateDuplicate.pending, null);
});

test("uncommitted recovery keeps the exact command for an identical replay", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:one" });
  const replay = applyTemplateCopilotV2Reconciliation({ command, currentPending: command, resolvedCommandKeys: new Set(), ledger: { atomicDecisions: {} } });
  assert.equal(replay.outcome, "replay_required");
  assert.equal(replay.pending, command);
});

test("recovery does not attribute another tab's decision to this command", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:mine" });
  const otherSame = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: { "decision.workflow.name.name": { kind: "text", answer: "Invoice approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } });
  assert.equal(otherSame.outcome, "superseded");
  const otherDifferent = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: { "decision.workflow.name.name": { kind: "text", answer: "Expense approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } });
  assert.equal(otherDifferent.outcome, "conflict");
  const choice = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.request.initiator_policy.who_can_start", primaryDecisionId: "decision.request.initiator_policy.who_can_start", revision: 1, answer: { kind: "choice", optionId: "any_employee" }, createKey: () => "turn:choice" });
  assert.equal(reconcileTemplateCopilotV2PendingCommand({ pending: choice, ledger: { atomicDecisions: { [choice.primaryDecisionId]: { kind: "choice", answer: "any_employee", optionId: "any_employee", provenance: [{ kind: "human_editor", sourceId: "answer:turn:choice" }] } } } }).outcome, "committed");
  assert.equal(reconcileTemplateCopilotV2PendingCommand({ pending: choice, ledger: { atomicDecisions: { [choice.primaryDecisionId]: { kind: "choice", answer: "any_employee", optionId: "any_employee", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } }).outcome, "superseded", "a conclusively replaced choice must not be replayed");
  assert.equal(reconcileTemplateCopilotV2PendingCommand({ pending: choice, ledger: { atomicDecisions: { [choice.primaryDecisionId]: { kind: "choice", answer: "selected_roles", optionId: "selected_roles", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } }).outcome, "conflict", "a different durable choice is visible for review, not resent");
});

test("definite validation failures clear only their command and restore editable text, while ambiguous failures reconcile", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "x".repeat(8001) }, createKey: () => "turn:invalid" });
  for (const status of [400, 422]) {
    const invalid = resolveTemplateCopilotV2Failure({ status, command, currentPending: command });
    assert.deepEqual(invalid, { shouldReconcile: false, pending: null, restoreText: command.answer.text, markResolved: true });
  }
  const other = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.purpose.purpose", primaryDecisionId: "decision.workflow.purpose.purpose", revision: 2, answer: { kind: "text", text: "Purpose" }, createKey: () => "turn:new" });
  const lateOldFailure = resolveTemplateCopilotV2Failure({ status: 400, command, currentPending: other });
  assert.equal(lateOldFailure.pending, other, "an old known-invalid failure cannot clear a newer command");
  assert.equal(lateOldFailure.restoreText, null, "an old known-invalid failure cannot overwrite a newer draft");
  for (const status of [409, 503, null]) {
    const ambiguous = resolveTemplateCopilotV2Failure({ status, command, currentPending: command });
    assert.equal(ambiguous.shouldReconcile, true, String(status));
    assert.equal(ambiguous.pending, command);
    assert.equal(ambiguous.restoreText, null);
  }
});

test("an explicit 409 without the original decision clears the stale key and only rebases the current question", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:stale" });
  const same = resolveTemplateCopilotV2ExplicitConflict({ command, currentPending: command, currentQuestionId: command.questionId, currentPrimaryDecisionId: command.primaryDecisionId });
  assert.deepEqual(same, { pending: null, markResolved: true, canRebase: true, restoreText: "Invoice approval" });
  const advanced = resolveTemplateCopilotV2ExplicitConflict({ command, currentPending: command, currentQuestionId: "v2.workflow.purpose.purpose", currentPrimaryDecisionId: "decision.workflow.purpose.purpose" });
  assert.deepEqual(advanced, { pending: null, markResolved: true, canRebase: false, restoreText: null });
});

test("explicit 409 reconciliation distinguishes my saved decision, another tab, and no decision", () => {
  const command = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Invoice approval" }, createKey: () => "turn:409" });
  const exact = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: { [command.primaryDecisionId]: { kind: "text", answer: "Invoice approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:409" }] } } } });
  assert.equal(exact.outcome, "committed");
  const sameOther = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: { [command.primaryDecisionId]: { kind: "text", answer: "Invoice approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } });
  assert.equal(sameOther.outcome, "superseded");
  const differentOther = reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: { [command.primaryDecisionId]: { kind: "text", answer: "Expense approval", provenance: [{ kind: "human_editor", sourceId: "answer:turn:other" }] } } } });
  assert.equal(differentOther.outcome, "conflict");
  assert.equal(reconcileTemplateCopilotV2PendingCommand({ pending: command, ledger: { atomicDecisions: {} } }).outcome, "replay_required");
});

test("late callbacks restore a draft only for their exact active command and unchanged draft generation", () => {
  const old = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name", revision: 1, answer: { kind: "text", text: "Old" }, createKey: () => "turn:old" });
  const newer = nextTemplateCopilotV2PendingCommand({ pending: null, questionId: "v2.workflow.purpose.purpose", primaryDecisionId: "decision.workflow.purpose.purpose", revision: 2, answer: { kind: "text", text: "New" }, createKey: () => "turn:new" });
  assert.equal(canRestoreTemplateCopilotV2Draft({ command: old, activeCommand: newer, commandDraftGeneration: 3, currentDraftGeneration: 3 }), false, "newer pending command owns the composer");
  assert.equal(canRestoreTemplateCopilotV2Draft({ command: old, activeCommand: null, commandDraftGeneration: 3, currentDraftGeneration: 3 }), false, "a newer completed command and new draft leaves no ownership for old callback");
  assert.equal(canRestoreTemplateCopilotV2Draft({ command: old, activeCommand: old, commandDraftGeneration: 3, currentDraftGeneration: 4 }), false, "typing during old reconciliation advances the draft generation");
  assert.equal(canRestoreTemplateCopilotV2Draft({ command: old, activeCommand: old, commandDraftGeneration: 3, currentDraftGeneration: 3 }), true, "the still-active same-question command may restore its answer");
});

test("late recovery snapshots cannot regress a newer session revision", () => {
  const revision3 = { sessionId: "session", revision: 3, question: "B" };
  const oldGet = { sessionId: "session", revision: 2, question: "A" };
  assert.equal(selectNewerTemplateCopilotV2Snapshot(revision3, oldGet), revision3);
  assert.equal(selectNewerTemplateCopilotV2Snapshot(oldGet, revision3), revision3);
  assert.equal(selectNewerTemplateCopilotV2Snapshot(revision3, { sessionId: "other", revision: 1, question: "other" }).sessionId, "other");
  assert.equal(canReplaceTemplateCopilotV2Transcript({ installedRevision: 3, snapshotRevision: 2, outcome: "committed" }), false, "a late revision-2 tail transcript cannot replace revision-3 chat");
  assert.equal(canReplaceTemplateCopilotV2Transcript({ installedRevision: 3, snapshotRevision: 3, outcome: "committed" }), true);
  assert.equal(canReplaceTemplateCopilotV2Transcript({ installedRevision: 3, snapshotRevision: 3, outcome: "replay_required" }), false);
});

test("special commands are immutable, session-scoped, reloadable, and block all interview mutations", () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const command = nextTemplateCopilotV2PendingSpecialCommand({ pending: null, sessionId, revision: 7, command: { operation: "not_applicable", reason: "No supplier file is used." }, createKey: () => "special:one" });
  assert.equal(nextTemplateCopilotV2PendingSpecialCommand({ pending: command, sessionId, revision: 8, command: { operation: "not_applicable", reason: "No supplier file is used." }, createKey: () => "special:two" }), command);
  assert.throws(() => nextTemplateCopilotV2PendingSpecialCommand({ pending: command, sessionId, revision: 8, command: { operation: "not_applicable", reason: "Changed" }, createKey: () => "special:two" }), /previous Copilot action/);
  assert.throws(() => nextTemplateCopilotV2PendingSpecialCommand({ pending: command, sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision: 8, command: command.command, createKey: () => "special:two" }), /previous Copilot action/);
  assert.deepEqual(parseTemplateCopilotV2PendingSpecialCommand(JSON.parse(JSON.stringify(command))), command);
  assert.equal(parseTemplateCopilotV2PendingSpecialCommand({ ...command, command: { operation: "not_applicable", reason: "😀".repeat(501) } }), null);
  assert.equal(parseTemplateCopilotV2PendingSpecialCommand({ ...command, sessionId: "------------------------------------" }), null);
  assert.equal(Object.isFrozen(command), true);
  assert.equal(Object.isFrozen(command.command), true);
  assert.equal(templateCopilotV2InterviewMutationBlocked({ pendingAnswer: null, pendingSpecial: command }), true);
  assert.equal(templateCopilotV2InterviewMutationBlocked({ pendingAnswer: null, pendingSpecial: null }), false);
});

test("special reconciliation clears every terminal result and preserves only truly ambiguous exact commands", () => {
  const command = nextTemplateCopilotV2PendingSpecialCommand({ pending: null, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 2, command: { operation: "reopen", decisionId: "decision.workflow.scope.excluded" }, createKey: () => "special:reopen" });
  for (const outcome of ["committed", "idempotency_conflict", "not_found"]) {
    const result = resolveTemplateCopilotV2SpecialReconciliation({ transportStatus: 503, outcome, command, currentPending: command });
    assert.equal(result.pending, null, outcome);
    assert.equal(result.terminal, true, outcome);
  }
  const stale = resolveTemplateCopilotV2SpecialReconciliation({ transportStatus: 409, outcome: "missing", command, currentPending: command });
  assert.equal(stale.pending, null);
  assert.equal(stale.result, "stale");
  for (const transportStatus of [null, 503]) {
    const ambiguous = resolveTemplateCopilotV2SpecialReconciliation({ transportStatus, outcome: "missing", command, currentPending: command });
    assert.equal(ambiguous.pending, command);
    assert.equal(ambiguous.terminal, false);
  }
  assert.equal(resolveTemplateCopilotV2SpecialReconciliation({ transportStatus: null, outcome: "unavailable", command, currentPending: command }).pending, command);
  const rollback = resolveTemplateCopilotV2SpecialReconciliation({ transportStatus: 404, outcome: "v2_unavailable", command, currentPending: command });
  assert.equal(rollback.pending, null);
  assert.equal(rollback.terminal, true);
  assert.equal(rollback.result, "v2_unavailable");
});
