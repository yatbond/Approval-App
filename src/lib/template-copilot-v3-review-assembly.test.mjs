import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleTemplateCopilotV3Review,
  templateCopilotV3ReviewItemId,
  templateCopilotV3SemanticProjectionId,
} from "./template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3SourceSpanId,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
} from "./template-copilot-v3-evidence.ts";
import {
  templateCopilotV3SourceLocalNotificationItemIndexBase,
} from "./template-copilot-v3-provider-quotes.ts";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";

function span(messageId, text, quote, occurrence = 0) {
  let startCodeUnit = -1;
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    startCodeUnit = text.indexOf(quote, cursor);
    assert.notEqual(startCodeUnit, -1, `Missing quote: ${quote}`);
    cursor = startCodeUnit + quote.length;
  }
  const startCodePoint = Array.from(text.slice(0, startCodeUnit)).length;
  const endCodePoint = startCodePoint + Array.from(quote).length;
  const supplied = { messageId, startCodePoint, endCodePoint, exactText: quote };
  return Object.freeze({ spanId: templateCopilotV3SourceSpanId(supplied), ...supplied });
}

const slotByKind = {
  workflow_name: "identity_scope",
  governance_policy: "governance",
  request_field: "initiators_fields",
  attachment: "attachments",
  stage: "stages_participants",
  condition: "conditions_exceptions",
  notification: "visibility_notifications",
};

function located({ itemIndex, kind, messageId, text, anchorQuote = text, leaves, confidence = "high", ambiguity = "none", slot = slotByKind[kind], anchorExpanded = false, sameLocalClauseRecoveredLeafCount = 0 }) {
  return Object.freeze({
    itemIndex,
    kind,
    slot,
    anchor: span(messageId, text, anchorQuote),
    leaves: Object.freeze(leaves.map((leaf) => Object.freeze({ role: leaf.role, hint: leaf.hint ?? null, sourceSpan: span(messageId, text, leaf.quote, leaf.occurrence ?? 0), sameLocalClauseRecovered: leaf.sameLocalClauseRecovered ?? false }))),
    confidence,
    ambiguity,
    anchorExpanded,
    sameLocalClauseRecoveredLeafCount,
  });
}

function conditionAuthoritySymbols({
  caseId,
  field,
  route,
  itemIndexBase = 900_000,
}) {
  const fieldMessageId = `condition-symbol:${caseId}:field`;
  const stageMessageId = `condition-symbol:${caseId}:stage`;
  const fieldText = `必填${field}`;
  const stageText = `${route}审批申请人`;
  return Object.freeze({
    sourceMessages: Object.freeze({
      [fieldMessageId]: fieldText,
      [stageMessageId]: stageText,
    }),
    items: Object.freeze([
      located({
        itemIndex: itemIndexBase,
        kind: "request_field",
        messageId: fieldMessageId,
        text: fieldText,
        leaves: [
          { role: "label", quote: field },
          { role: "required", quote: "必填", hint: "true" },
        ],
      }),
      located({
        itemIndex: itemIndexBase + 1,
        kind: "stage",
        messageId: stageMessageId,
        text: stageText,
        leaves: [
          { role: "label", quote: route },
          { role: "kind", quote: "审批", hint: "approval" },
          {
            role: "participant_mode",
            quote: "申请人",
            hint: "requester",
          },
        ],
      }),
    ]),
  });
}

test("preserves a partial multilingual field without compiler defaults", () => {
  const messageId = "message-field-001";
  const text = "欄位：總額；必須；數字。";
  const messages = { [messageId]: text };
  const result = assembleTemplateCopilotV3Review({
    items: [located({ itemIndex: 0, kind: "request_field", messageId, text, leaves: [
      { role: "label", quote: "總額" },
      { role: "required", quote: "必須", hint: "true" },
      { role: "type", quote: "數字", hint: "number" },
    ] })],
    sourceMessages: messages,
  });
  const item = result.review.items[0];
  assert.deepEqual(item.value, { label: "總額", required: true, type: "number" });
  assert.deepEqual(item.missingPaths, ["/options"]);
  assert.equal(item.complete, false);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.defaulted, false);
  assert.equal(item.executable, false);
  assert.equal(result.envelope.fragments.length, 1);
  assert.ok(validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(result.envelope, messages));
});

test("distinguishes a complete review-only item from an open durable fragment", () => {
  const messageId = "message-field-002";
  const text = "Employee name text required no options";
  const result = assembleTemplateCopilotV3Review({
    items: [located({ itemIndex: 0, kind: "request_field", messageId, text, leaves: [
      { role: "label", quote: "Employee name" },
      { role: "type", quote: "text", hint: "text" },
      { role: "required", quote: "required", hint: "true" },
      { role: "option", quote: "no options" },
    ] })],
    sourceMessages: { [messageId]: text },
  });
  const item = result.review.items[0];
  assert.deepEqual(item.value, { label: "Employee name", options: [], required: true, type: "text" });
  assert.deepEqual(item.missingPaths, []);
  assert.equal(item.complete, true);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.fragmentId, null);
  assert.equal(item.persisted, false);
  assert.equal(result.envelope.fragments.length, 0);
});

test("groups only co-located complements, deduplicates evidence, and retains stable conflicting alternatives", () => {
  const messageId = "message-stage-001";
  const text = "Finance Review approve review requester first in parallel";
  const first = located({ itemIndex: 0, kind: "stage", messageId, text, leaves: [
    { role: "label", quote: "Finance Review" },
    { role: "kind", quote: "approve", hint: "approval" },
    { role: "participant_mode", quote: "requester", hint: "requester" },
    { role: "sequence", quote: "first" },
    { role: "relationship", quote: "in parallel", hint: "parallel" },
  ] });
  const second = located({ itemIndex: 1, kind: "stage", messageId, text, leaves: [
    { role: "label", quote: "Finance Review" },
    { role: "kind", quote: "review", hint: "review" },
    { role: "participant_mode", quote: "requester", hint: "requester" },
    { role: "sequence", quote: "first" },
    { role: "relationship", quote: "in parallel", hint: "parallel" },
  ] });
  const messages = { [messageId]: text };
  const assemble = (items) => assembleTemplateCopilotV3Review({ items, sourceMessages: messages });
  const result = assemble([first, { ...first, itemIndex: 2 }, second]);
  const reordered = assemble([
    { ...second, itemIndex: 41 },
    { ...first, itemIndex: 42 },
    { ...first, itemIndex: 40 },
  ]);

  assert.equal(result.review.items.length, 2);
  assert.equal(result.review.conflicts.length, 1);
  assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
  assert.deepEqual(new Set(result.review.items.map((item) => item.value.kind)), new Set(["approval", "review"]));
  assert.ok(result.review.items.every((item) => item.relationships.some((entry) => entry.relationship === "parallel")));
  assert.ok(result.review.items.every((item) => !item.semanticComplete));
  assert.ok(result.review.items.every((item) => item.ambiguity === "ambiguous"));
  assert.deepEqual(
    result.review.items.map((item) => item.reviewItemId).sort(),
    reordered.review.items.map((item) => item.reviewItemId).sort(),
  );
  assert.equal(result.review.conflicts[0].conflictId, reordered.review.conflicts[0].conflictId);
  assert.deepEqual(result.review.conflicts[0].reviewItemIds, reordered.review.conflicts[0].reviewItemIds);
});

test("keeps underspecified shared evidence separate from every conflicting alternative under all permutations", () => {
  const messageId = "message-stage-abc-conflict-001";
  const text = "Finance Review approve review requester in parallel";
  const alternatives = [
    located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "approve", hint: "approval" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ],
    }),
    located({
      itemIndex: 1,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "review", hint: "review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ],
    }),
    located({
      itemIndex: 2,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
        { role: "relationship", quote: "in parallel", hint: "parallel" },
      ],
    }),
  ];
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let baseline;
  for (const order of orders) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: text },
      items: order.map((sourceIndex, position) => ({
        ...alternatives[sourceIndex],
        itemIndex: 900 + position * 17,
      })),
    });
    assert.equal(result.review.items.length, 3);
    assert.equal(result.review.conflicts.length, 1);
    assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
    assert.ok(result.review.items.every((item) => item.ambiguity === "ambiguous"));
    assert.ok(result.review.items.every(
      (item) => templateCopilotV3ReviewItemId(item) === item.reviewItemId,
    ));

    const shared = result.review.items.find((item) => item.value.kind === undefined);
    assert.ok(shared);
    assert.deepEqual(
      shared.relationships.map((entry) => entry.relationship),
      ["parallel"],
    );
    assert.ok(
      result.review.items
        .filter((item) => item.value.kind !== undefined)
        .every((item) => item.relationships.length === 0),
    );

    const snapshot = {
      ids: result.review.items.map((item) => item.reviewItemId).sort(),
      conflictId: result.review.conflicts[0].conflictId,
      conflictPaths: result.review.conflicts[0].paths,
      conflictReviewItemIds: result.review.conflicts[0].reviewItemIds,
    };
    baseline ??= snapshot;
    assert.deepEqual(snapshot, baseline);
  }
});

test("groups notifications by verified event and recipient identity under every item order", () => {
  const listMessageId = "notification-grouping:event-list";
  const listText =
    "Notify directly involved people for assignment and completion.";
  const recipientMessageId = "notification-grouping:recipient-list";
  const recipientText =
    "Notify requester group for correction. Notify owner group for correction.";
  const items = [
    located({
      itemIndex: 40,
      kind: "notification",
      messageId: listMessageId,
      text: listText,
      leaves: [
        { role: "event", quote: "assignment", hint: "stage_assigned" },
        {
          role: "recipient",
          quote: "directly involved people",
          hint: "source_named_group",
        },
      ],
    }),
    located({
      itemIndex: 41,
      kind: "notification",
      messageId: listMessageId,
      text: listText,
      leaves: [
        { role: "event", quote: "completion", hint: "request_completed" },
        {
          role: "recipient",
          quote: "directly involved people",
          hint: "source_named_group",
        },
      ],
    }),
    located({
      itemIndex: 42,
      kind: "notification",
      messageId: recipientMessageId,
      text: recipientText,
      anchorQuote: "Notify requester group for correction",
      leaves: [
        {
          role: "event",
          quote: "correction",
          hint: "correction_requested",
        },
        {
          role: "recipient",
          quote: "requester group",
          hint: "source_named_group",
        },
      ],
    }),
    located({
      itemIndex: 43,
      kind: "notification",
      messageId: recipientMessageId,
      text: recipientText,
      anchorQuote: "Notify owner group for correction",
      leaves: [
        {
          role: "event",
          quote: "correction",
          hint: "correction_requested",
          occurrence: 1,
        },
        {
          role: "recipient",
          quote: "owner group",
          hint: "source_named_group",
        },
      ],
    }),
  ];
  const sourceMessages = {
    [listMessageId]: listText,
    [recipientMessageId]: recipientText,
  };
  const expectedPairs = [
    "assignment|directly involved people",
    "completion|directly involved people",
    "correction|owner group",
    "correction|requester group",
  ];
  let stableIds = null;
  for (const ordered of [items, [...items].reverse()]) {
    const result = assembleTemplateCopilotV3Review({
      items: ordered,
      sourceMessages,
      sourceMessageOrder: [listMessageId, recipientMessageId],
    });
    const notifications = result.review.items.filter(
      (item) => item.factId === "notifications.rules",
    );
    assert.equal(
      notifications.length,
      4,
      JSON.stringify({
        items: notifications.map((item) => item.semanticValue),
        rejections: result.review.rejections,
      }),
    );
    assert.ok(
      notifications.every((item) => item.semanticComplete),
      JSON.stringify({
        notifications: notifications.map((item) => ({
          value: item.semanticValue,
          semanticComplete: item.semanticComplete,
          blockingReason: item.blockingReason,
        })),
        rejections: result.review.rejections,
      }),
    );
    assert.deepEqual(
      notifications.map((item) =>
        `${item.semanticValue.event?.[0]}|${item.semanticValue.recipient?.[0]}`
      ).sort(),
      [...expectedPairs].sort(),
    );
    const ids = notifications.map((item) => item.reviewItemId).sort();
    if (stableIds === null) stableIds = ids;
    else assert.deepEqual(ids, stableIds);
  }
});

test("an uncovered sibling notification atomically blocks durable canonical-recipient leaves and duplicate masking", () => {
  const messageId = "notification-scope-coverage:canonical-recipient";
  const text =
    "Notify requester for rejection. Notify workflow owner for completion.";
  const first = located({
    itemIndex: 44,
    kind: "notification",
    messageId,
    text,
    anchorQuote: "Notify requester for rejection",
    leaves: [
      { role: "event", quote: "rejection", hint: "request_rejected" },
      { role: "recipient", quote: "requester", hint: "requester" },
    ],
  });
  const duplicate = Object.freeze({ ...first, itemIndex: 45 });
  for (const items of [[first], [first, duplicate], [duplicate, first]]) {
    const result = assembleTemplateCopilotV3Review({
      items,
      sourceMessages: { [messageId]: text },
      sourceMessageOrder: [messageId],
    });
    const notifications = result.review.items.filter(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notifications.length >= 1);
    assert.ok(notifications.every((item) => !item.semanticComplete));
    assert.ok(notifications.every((item) => item.fragmentId === null));
    assert.ok(notifications.every((item) => item.bindings.length === 0));
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.detail ===
            "notification:unrepresented_or_unsafe_action",
      ),
    );
    assert.equal(
      result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      false,
    );
  }
});

test("forged sibling hints and inflected sibling actions cannot satisfy notification coverage", () => {
  const forgedMessageId = "notification-scope-coverage:forged-sibling";
  const forgedText =
    "申請已提交時通知申請人。Notify workflow owner for completion.";
  const validFirst = located({
    itemIndex: 46,
    kind: "notification",
    messageId: forgedMessageId,
    text: forgedText,
    anchorQuote: "申請已提交時通知申請人",
    leaves: [
      { role: "event", quote: "申請已提交", hint: "request_submitted" },
      { role: "recipient", quote: "申請人", hint: "requester" },
    ],
  });
  const forgedSibling = located({
    itemIndex: 47,
    kind: "notification",
    messageId: forgedMessageId,
    text: forgedText,
    anchorQuote: "Notify workflow owner for completion",
    leaves: [
      { role: "event", quote: "completion", hint: "request_rejected" },
      { role: "recipient", quote: "workflow owner", hint: "requester" },
    ],
  });
  for (const items of [
    [validFirst, forgedSibling],
    [forgedSibling, validFirst],
  ]) {
    const result = assembleTemplateCopilotV3Review({
      items,
      sourceMessages: { [forgedMessageId]: forgedText },
      sourceMessageOrder: [forgedMessageId],
    });
    const notifications = result.review.items.filter(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notifications.length >= 1);
    assert.ok(notifications.every((item) => !item.semanticComplete));
    assert.ok(notifications.every((item) => item.fragmentId === null));
    assert.ok(notifications.every((item) => item.bindings.length === 0));
    assert.equal(
      result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      false,
    );
  }

  const duplicateRecipientSibling = located({
    itemIndex: 49,
    kind: "notification",
    messageId: forgedMessageId,
    text: forgedText,
    anchorQuote: "Notify workflow owner for completion",
    leaves: [
      { role: "event", quote: "completion", hint: "request_completed" },
      { role: "recipient", quote: "workflow owner", hint: "workflow_owner" },
      { role: "recipient", quote: "workflow owner", hint: "workflow_owner" },
    ],
  });
  const crossClauseAnchorSibling = located({
    itemIndex: 50,
    kind: "notification",
    messageId: forgedMessageId,
    text: forgedText,
    leaves: [
      { role: "event", quote: "completion", hint: "request_completed" },
      { role: "recipient", quote: "workflow owner", hint: "workflow_owner" },
    ],
  });
  const inconsistentRecoverySibling = located({
    itemIndex: 54,
    kind: "notification",
    messageId: forgedMessageId,
    text: forgedText,
    anchorQuote: "Notify workflow owner for completion",
    sameLocalClauseRecoveredLeafCount: 1,
    anchorExpanded: false,
    leaves: [
      { role: "event", quote: "completion", hint: "request_completed" },
      {
        role: "recipient",
        quote: "workflow owner",
        hint: "workflow_owner",
        sameLocalClauseRecovered: true,
      },
    ],
  });
  for (const sibling of [
    duplicateRecipientSibling,
    crossClauseAnchorSibling,
    inconsistentRecoverySibling,
  ]) {
    const result = assembleTemplateCopilotV3Review({
      items: [validFirst, sibling],
      sourceMessages: { [forgedMessageId]: forgedText },
      sourceMessageOrder: [forgedMessageId],
    });
    assert.ok(
      result.review.items
        .filter((item) => item.factId === "notifications.rules")
        .every(
          (item) =>
            !item.semanticComplete &&
            item.fragmentId === null &&
            item.bindings.length === 0,
        ),
    );
    assert.equal(result.envelope.fragments.length, 0);
  }

  const multipleRecipientMessageId =
    "notification-scope-coverage:multiple-recipients";
  const multipleRecipientText =
    "申請已提交時通知申請人。Notify requester and workflow owner for completion.";
  const multipleRecipientResult = assembleTemplateCopilotV3Review({
    items: [
      located({
        itemIndex: 51,
        kind: "notification",
        messageId: multipleRecipientMessageId,
        text: multipleRecipientText,
        anchorQuote: "申請已提交時通知申請人",
        leaves: [
          {
            role: "event",
            quote: "申請已提交",
            hint: "request_submitted",
          },
          { role: "recipient", quote: "申請人", hint: "requester" },
        ],
      }),
      located({
        itemIndex: 52,
        kind: "notification",
        messageId: multipleRecipientMessageId,
        text: multipleRecipientText,
        anchorQuote: "Notify requester and workflow owner for completion",
        leaves: [
          { role: "event", quote: "completion", hint: "request_completed" },
          { role: "recipient", quote: "requester", hint: "requester" },
          {
            role: "recipient",
            quote: "workflow owner",
            hint: "workflow_owner",
          },
        ],
      }),
    ],
    sourceMessages: { [multipleRecipientMessageId]: multipleRecipientText },
    sourceMessageOrder: [multipleRecipientMessageId],
  });
  assert.ok(
    multipleRecipientResult.review.items
      .filter((item) => item.factId === "notifications.rules")
      .every(
        (item) =>
          !item.semanticComplete &&
          item.fragmentId === null &&
          item.bindings.length === 0,
      ),
  );
  assert.equal(multipleRecipientResult.envelope.fragments.length, 0);

  const inflectedMessageId = "notification-scope-coverage:inflected-action";
  const inflectedText =
    "Request submitted notifies requester. Request completed notifies workflow owner.";
  const inflected = assembleTemplateCopilotV3Review({
    items: [located({
      itemIndex: 53,
      kind: "notification",
      messageId: inflectedMessageId,
      text: inflectedText,
      anchorQuote: "Request submitted notifies requester",
      leaves: [
        {
          role: "event",
          quote: "Request submitted",
          hint: "request_submitted",
        },
        { role: "recipient", quote: "requester", hint: "requester" },
      ],
    })],
    sourceMessages: { [inflectedMessageId]: inflectedText },
    sourceMessageOrder: [inflectedMessageId],
  });
  const inflectedNotification = inflected.review.items.find(
    (item) => item.factId === "notifications.rules",
  );
  assert.ok(inflectedNotification);
  assert.equal(inflectedNotification.semanticComplete, false);
  assert.equal(inflectedNotification.fragmentId, null);
  assert.deepEqual(inflectedNotification.bindings, []);
  assert.equal(inflected.envelope.fragments.length, 0);

  for (const [caseId, secondClause] of [
    ["alerts", "Request completed alerts workflow owner"],
    ["emails", "Request completed emails workflow owner"],
    [
      "notification-goes-to",
      "A request completion notification goes to workflow owner",
    ],
    ["receives-email", "Workflow owner receives email on completion"],
    ["is-sent-email", "Workflow owner is sent an email on completion"],
    ["will-be-sent-alert", "Workflow owner will be sent an alert on completion"],
    ["receives-alert", "Workflow owner receives an alert on completion"],
    ["passive-alerted", "Workflow owner is alerted on completion"],
    ["future-receive", "Workflow owner will receive an email on completion"],
    [
      "receives-notification",
      "Workflow owner receives a notification on completion",
    ],
    ["send-email", "Send email to workflow owner on completion"],
    ["send-double-object", "Send workflow owner an email on completion"],
    ["deliver-email", "Deliver an email to workflow owner on completion"],
    ["issue-alert", "Issue an alert to workflow owner on completion"],
    ["trigger-email", "Trigger an email to workflow owner on completion"],
    ["scheduled-email", "System schedules an email to workflow owner on completion"],
    ["queued-alert", "System queues an alert for workflow owner on completion"],
    ["forwarded-email", "System forwards an email to workflow owner on completion"],
    ["posted-notification", "System posts a notification to workflow owner on completion"],
    ["email-is-sent", "An email is sent to workflow owner on completion"],
    ["email-will-be-delivered", "An email will be delivered to Finance on rejection"],
    ["alert-is-dispatched", "An alert is dispatched to Finance on rejection"],
    ["notification-is-issued", "A notification is issued to Finance on rejection"],
    ["alert-is-generated", "An alert is generated for Finance on rejection"],
    ["copied-on-email", "Workflow owner is copied on an email on completion"],
    ["blind-copied-on-email", "Workflow owner is blind-copied on an email on completion"],
    ["progressive-send", "The system is sending an email to Finance on rejection"],
    ["supported-send", "Alert history supports sending an email to Finance on rejection"],
    ["supported-email", "Alert history supports emailing Finance on rejection"],
    ["future-receiving", "Finance will be receiving an email on rejection"],
    ["present-receiving", "Finance is receiving an alert on rejection"],
    ["cc-imperative", "CC Finance on rejection"],
    ["cc-passive", "Finance is cc'd on the rejection email"],
    ["send-reminder", "Send a reminder to Finance on rejection"],
    ["deliver-reminder", "Deliver a reminder to Finance on rejection"],
    ["broadcast-notification", "Broadcast a notification to Finance on rejection"],
    ["create-email", "Create an email for Finance on rejection"],
    ["relay-notification", "Relay a notification to Finance on rejection"],
    ["transmit-alert", "Transmit an alert to Finance on rejection"],
    ["raise-alert", "Raise an alert for Finance on rejection"],
    ["passive-triggered-email", "An email is triggered for Finance on rejection"],
    ["passive-broadcast-notification", "A notification is broadcast to Finance on rejection"],
    ["passive-raised-alert", "An alert is raised for Finance on rejection"],
    ["passive-sent-reminder", "A reminder is sent to Finance on rejection"],
    ["subject-notify", "We notify workflow owner on completion"],
    ["metadata-and-send", "Email services store audit records and send an email to workflow owner on completion"],
    ["scheduled-double-object", "System schedules workflow owner an email on completion"],
    ["forwarded-double-object", "System forwards workflow owner an email on completion"],
    ["curly-cc-passive", "Workflow owner is cc’d on an email on completion"],
    ["included-on-email", "Workflow owner is included on an email on completion"],
    ["mails-recipient", "System mails workflow owner on completion"],
    ["remind-imperative", "Remind workflow owner on completion"],
    ["reminds-subject", "The system reminds workflow owner on completion"],
    ["reminded-passive", "Workflow owner is reminded on completion"],
    ["metadata-subject-email-action", "Email templates email workflow owner on completion"],
    ["metadata-subject-remind-action", "Notification settings remind workflow owner on completion"],
    ["TC-metadata-subject-notify-action", "通知服務通知流程負責人"],
    ["SC-metadata-subject-notify-action", "通知服务通知流程负责人"],
    ["send-alert", "On completion, send an alert to workflow owner"],
    ["TC-send-email", "完成後向流程負責部門發送電郵"],
    ["SC-send-email", "完成后向流程负责部门发送电邮"],
    ["TC-receive-notification", "流程負責人會在完成時收到通知"],
    ["SC-receive-notification", "流程负责人会在完成时收到通知"],
    ["TC-receive-obtain", "流程負責人會在完成時接獲通知"],
    ["SC-receive-arrive", "流程负责人会在完成时接到通知"],
    ["TC-event-first-notify", "完成後通知流程負責人"],
    ["SC-event-first-notify", "完成后通知流程负责人"],
    ["TC-event-first-remind", "逾期時提醒流程負責人"],
    ["SC-event-first-remind", "逾期时提醒流程负责人"],
    ["TC-passive-notified", "流程負責人會在完成時被通知"],
    ["SC-passive-notified", "流程负责人会在完成时被通知"],
    ["TC-mail-email", "向流程負責部門寄送電郵"],
    ["SC-mail-email", "向流程负责部门寄送电邮"],
    ["TC-push-notification", "向流程負責部門推送通知"],
    ["SC-push-notification", "向流程负责部门推送通知"],
    ["TC-directed-inform", "向流程負責部門告知結果"],
    ["SC-directed-inform", "向流程负责部门告知结果"],
    ["TC-system-notify", "完成後，系統會通知流程負責人"],
    ["SC-system-notify", "完成后，系统会通知流程负责人"],
    ["TC-passive-system", "流程負責人會在完成時被系統通知"],
    ["SC-passive-system", "流程负责人会在完成时被系统通知"],
    ["TC-system-email-verb", "拒絕後系統會電郵財務"],
    ["TC-receive-system-reminder", "拒絕後財務會收到系統提醒"],
    ["TC-obtain-notification", "拒絕後財務將獲通知"],
    ["SC-send-mail", "拒绝后系统会向财务发送邮件"],
    ["SC-mail-notify", "拒绝后系统会邮件通知财务"],
    ["TC-receive-mail", "流程負責人會在完成時收到郵件"],
    ["SC-receive-mail", "流程负责人会在完成时收到邮件"],
    ["SC-give-send-mail", "完成后系统会给流程负责人发送邮件"],
    ["TC-mail-reminder", "拒絕後把提醒寄給財務"],
    ["TC-receive-system-notification", "拒絕後財務會收到系統通知"],
    ["TC-issued-email", "拒絕後財務將獲發電郵"],
    ["SC-short-send-mail", "拒绝后系统给财务发邮件"],
    ["SC-receive-system-notification", "拒绝后财务会接到系统通知"],
    ["SC-short-send-notification", "拒绝后系统给财务发通知"],
    ["SC-short-send-reminder", "拒绝后给财务发提醒"],
    ["TC-obtain-informing", "流程負責人將獲知會"],
    ["TC-system-cc", "系統會抄送流程負責人"],
    ["TC-send-electronic-mail", "系統會發送電子郵件給流程負責人"],
    ["TC-passive-system-email", "電郵會由系統發送給流程負責人"],
    ["TC-immediate-completion", "申請完成便通知流程負責人"],
    ["TC-immediate-approval", "申請獲批即通知流程負責人"],
    ["TC-metadata-and-notify", "通知服務記錄傳送指標並通知流程負責人"],
    ["SC-metadata-and-notify", "通知服务记录发送指标并通知流程负责人"],
    ["TC-receive-electronic-mail", "流程負責人會在完成時收到電子郵件"],
    ["SC-receive-electronic-mail", "流程负责人会在完成时收到电子邮件"],
    ["TC-send-electronic-mail-directed", "完成後系統會向流程負責人發送電子郵件"],
    ["SC-send-electronic-mail-directed", "完成后系统会向流程负责人发送电子邮件"],
    ["TC-mail-one-message", "完成後系統會寄一封郵件給流程負責人"],
    ["SC-mail-one-message", "完成后系统会寄一封邮件给流程负责人"],
    ["TC-metadata-plus-action", "通知路由指標保留作審計記錄並在拒絕後向財務發送通知"],
    ["SC-metadata-plus-action", "通知路由指标保留作审计记录并在拒绝后向财务发送通知"],
    ["TC-metadata-then-action", "通知路由指標保留作審計記錄，然後向財務知會拒絕結果"],
    ["SC-metadata-then-action", "通知路由指标保留作审计记录，然后向财务知会拒绝结果"],
    ["EN-metadata-plus-passive-action", "Email routing metrics are retained for audit and Finance is alerted on rejection"],
    ["EN-metadata-then-action", "Alert history is retained for audit, then notify Finance on rejection"],
    ["EN-action-then-metadata", "Notify Finance on rejection and alert history is retained for audit"],
  ]) {
    const actionMessageId = `notification-scope-coverage:${caseId}`;
    const actionText =
      `Request submitted notifies requester. ${secondClause}.`;
    const result = assembleTemplateCopilotV3Review({
      items: [located({
        itemIndex: 55,
        kind: "notification",
        messageId: actionMessageId,
        text: actionText,
        anchorQuote: "Request submitted notifies requester",
        leaves: [
          {
            role: "event",
            quote: "Request submitted",
            hint: "request_submitted",
          },
          { role: "recipient", quote: "requester", hint: "requester" },
        ],
      })],
      sourceMessages: { [actionMessageId]: actionText },
    });
    const notification = result.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, caseId);
    assert.equal(notification.semanticComplete, false, caseId);
    assert.equal(notification.fragmentId, null, caseId);
    assert.deepEqual(notification.bindings, [], caseId);
    assert.equal(result.envelope.fragments.length, 0, caseId);
  }

  for (const entry of [
    {
      caseId: "literal-notify-tail-action-after",
      text:
        "Notify only Finance Team for rejection. The word notify remains in audit history and notify workflow owner on completion.",
      anchorQuote: "Notify only Finance Team for rejection",
      event: "rejection",
      recipient: "Finance Team",
      visibility: "only",
    },
    {
      caseId: "literal-notify-tail-action-before",
      text:
        "The word notify remains in audit history and notify workflow owner on completion. Notify only Finance Team for rejection.",
      anchorQuote: "Notify only Finance Team for rejection",
      event: "rejection",
      recipient: "Finance Team",
      visibility: "only",
    },
    {
      caseId: "literal-email-tail-action",
      text:
        "Notify only Finance Team for rejection. The phrase email is visible in the audit records and email workflow owner on completion.",
      anchorQuote: "Notify only Finance Team for rejection",
      event: "rejection",
      recipient: "Finance Team",
      visibility: "only",
    },
    {
      caseId: "TC-closed-business-email-tail-action",
      text:
        "只通知財務營運團隊，事件包括拒絕。此通知規則已撤銷重複申請並電郵流程負責人。",
      anchorQuote: "只通知財務營運團隊，事件包括拒絕",
      event: "拒絕",
      recipient: "財務營運團隊",
      visibility: "只",
    },
    {
      caseId: "TC-closed-business-inform-tail-action",
      text:
        "只通知財務營運團隊，事件包括拒絕。此通知規則已撤銷重複申請並知會流程負責人。",
      anchorQuote: "只通知財務營運團隊，事件包括拒絕",
      event: "拒絕",
      recipient: "財務營運團隊",
      visibility: "只",
    },
    {
      caseId: "SC-closed-business-mail-tail-action",
      text:
        "仅通知财务运营团队，事件包括拒绝。该通知规则已经撤销重复申请并邮件流程负责人。",
      anchorQuote: "仅通知财务运营团队，事件包括拒绝",
      event: "拒绝",
      recipient: "财务运营团队",
      visibility: "仅",
    },
  ]) {
    const messageId = `notification-scope-composition:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      items: [located({
        itemIndex: 58,
        kind: "notification",
        messageId,
        text: entry.text,
        anchorQuote: entry.anchorQuote,
        leaves: [
          {
            role: "event",
            quote: entry.event,
            hint: "request_rejected",
          },
          {
            role: "recipient",
            quote: entry.recipient,
            hint: "source_named_group",
          },
          {
            role: "visibility",
            quote: entry.visibility,
            hint: "recipients_only",
          },
        ],
      })],
      sourceMessages: { [messageId]: entry.text },
    });
    const notification = result.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, entry.caseId);
    assert.equal(notification.semanticComplete, false, entry.caseId);
    assert.equal(notification.fragmentId, null, entry.caseId);
    assert.deepEqual(notification.bindings, [], entry.caseId);
    assert.equal(result.envelope.fragments.length, 0, entry.caseId);
  }

  const multiActionMessageId = "notification-scope-coverage:multi-action-range";
  const multiActionText =
    "申請已提交時通知申請人。Notify requester for rejection, then notify workflow owner for completion.";
  const multiActionFirst = located({
    itemIndex: 56,
    kind: "notification",
    messageId: multiActionMessageId,
    text: multiActionText,
    anchorQuote: "申請已提交時通知申請人",
    leaves: [
      { role: "event", quote: "申請已提交", hint: "request_submitted" },
      { role: "recipient", quote: "申請人", hint: "requester" },
    ],
  });
  const multiActionSibling = located({
    itemIndex: 57,
    kind: "notification",
    messageId: multiActionMessageId,
    text: multiActionText,
    anchorQuote:
      "Notify requester for rejection, then notify workflow owner for completion",
    leaves: [
      { role: "event", quote: "rejection", hint: "request_rejected" },
      { role: "recipient", quote: "requester", hint: "requester" },
    ],
  });
  for (const items of [
    [multiActionFirst, multiActionSibling],
    [multiActionSibling, multiActionFirst],
  ]) {
    const result = assembleTemplateCopilotV3Review({
      items,
      sourceMessages: { [multiActionMessageId]: multiActionText },
    });
    assert.ok(
      result.review.items
        .filter((item) => item.factId === "notifications.rules")
        .every(
          (item) =>
            !item.semanticComplete &&
            item.fragmentId === null &&
            item.bindings.length === 0,
        ),
    );
    assert.equal(result.envelope.fragments.length, 0);
  }

  for (const [caseId, secondClause, event, eventHint, recipient, visibility] of [
    [
      "omitted-event",
      "Notify workflow owner for rejection and completion",
      "rejection",
      "request_rejected",
      "workflow owner",
      null,
    ],
    [
      "omitted-recipient",
      "Notify requester and workflow owner for completion",
      "completion",
      "request_completed",
      "workflow owner",
      null,
    ],
    [
      "omitted-visibility",
      "Notify only workflow owner for completion",
      "completion",
      "request_completed",
      "workflow owner",
      null,
    ],
  ]) {
    const messageId = `notification-scope-coverage:${caseId}`;
    const text = `申請已提交時通知申請人。${secondClause}.`;
    const first = located({
      itemIndex: 59,
      kind: "notification",
      messageId,
      text,
      anchorQuote: "申請已提交時通知申請人",
      leaves: [
        { role: "event", quote: "申請已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    });
    const sibling = located({
      itemIndex: 60,
      kind: "notification",
      messageId,
      text,
      anchorQuote: secondClause,
      leaves: [
        { role: "event", quote: event, hint: eventHint },
        { role: "recipient", quote: recipient, hint: "workflow_owner" },
        ...(visibility
          ? [{ role: "visibility", quote: visibility, hint: "recipients_only" }]
          : []),
      ],
    });
    for (const items of [[first, sibling], [sibling, first]]) {
      const result = assembleTemplateCopilotV3Review({
        items,
        sourceMessages: { [messageId]: text },
      });
      assert.ok(
        result.review.items
          .filter((item) => item.factId === "notifications.rules")
          .every(
            (item) =>
              !item.semanticComplete &&
              item.fragmentId === null &&
              item.bindings.length === 0,
          ),
        caseId,
      );
      assert.equal(result.envelope.fragments.length, 0, caseId);
    }
  }

  for (const [caseId, text] of [
    [
      "represented-clause-omits-recipient",
      "Request submitted notifies requester and workflow owner",
    ],
    [
      "represented-clause-omits-visibility",
      "Request submitted notifies only requester",
    ],
    [
      "represented-clause-omits-exclusive-visibility",
      "Request submitted notifies requester exclusively",
    ],
    [
      "represented-clause-omits-no-one-else-visibility",
      "Request submitted notifies requester and no one else",
    ],
  ]) {
    const messageId = `notification-scope-coverage:${caseId}`;
    const result = assembleTemplateCopilotV3Review({
      items: [located({
        itemIndex: 61,
        kind: "notification",
        messageId,
        text,
        anchorQuote: text,
        leaves: [
          {
            role: "event",
            quote: "Request submitted",
            hint: "request_submitted",
          },
          { role: "recipient", quote: "requester", hint: "requester" },
        ],
      })],
      sourceMessages: { [messageId]: text },
    });
    const notification = result.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, caseId);
    assert.equal(notification.semanticComplete, false, caseId);
    assert.equal(notification.fragmentId, null, caseId);
    assert.deepEqual(notification.bindings, [], caseId);
    assert.equal(result.envelope.fragments.length, 0, caseId);
  }

  for (const [caseId, auditFact] of [
    ["archived-emails", "Outbound emails archived for audit"],
    ["logged-alerts", "System alerts logged for audit"],
    ["alerts-dashboard", "Email alerts dashboard shows aggregate counts"],
    ["alerts-configuration", "Email alerts configuration belongs to the audit module"],
    ["alerts-table", "System alerts table stores aggregate counts"],
    ["alerts-settings", "Email alerts settings are retained for history"],
    ["email-delivery-metrics", "Email delivery metrics appear on the dashboard"],
    ["issue-records", "Issue records include an alert history"],
    ["email-routing-metrics", "Email routing metrics are retained for audit"],
    ["email-routing-feed", "Email routing metrics feed the dashboard"],
    ["email-generation-power", "Email generation metrics power the dashboard"],
    ["email-sending-support", "Email sending metrics support audit reporting"],
    ["email-push-update", "Email push metrics update aggregate counts"],
    ["email-publication-populate", "Email publication metrics populate the dashboard"],
    ["alerts-for-history", "Alerts for audit history are retained"],
    ["emails-from-runs", "Emails from prior runs are retained for audit"],
    ["alerts-relating-records", "Alerts relating to legacy records are archived for audit"],
    ["email-alerts-policy", "Email alerts policy remains active"],
    ["email-alerts-guidance", "Email alerts guidance remains active"],
    ["TC-inform-policy", "知會政策仍然有效"],
    ["SC-inform-policy", "知会政策仍然有效"],
    ["email-routing-summarize", "Email routing metrics summarize delivery performance"],
    ["email-generation-measure", "Email generation metrics measure throughput"],
    ["email-push-provide", "Email push metrics provide audit evidence"],
    ["email-publication-supply", "Email publication metrics supply dashboard figures"],
    ["email-dispatch-surface", "Email dispatch metrics surface aggregate counts"],
    ["alert-metrics-routed", "Alert metrics are routed to the audit dashboard"],
    ["TC-notification-settings", "通知設定屬於審計模組"],
    ["SC-notification-settings", "通知设置属于审计模块"],
    ["TC-notification-verb-settings", "知會設定屬於審計模組"],
    ["TC-email-metrics", "電郵指標顯示在審計儀表板"],
    ["SC-email-metrics", "电邮指标显示在审计仪表板"],
    ["TC-email-delivery-metrics", "電郵傳送指標顯示於儀表板"],
    ["SC-email-delivery-metrics", "电邮发送指标显示在仪表板"],
    ["TC-email-alert-settings", "電郵警示設定保留於歷史"],
    ["system-alerts-documentation", "System alerts documentation is current"],
    ["notification-policy-global", "The notification policy applies globally"],
    ["notification-settings-locale", "Notification settings inherit the corporate locale"],
    ["email-templates-wording", "Email templates define the approved wording"],
    ["notification-provider-health", "Notification provider health is monitored"],
    ["email-content-guidance", "Email content follows legal guidance"],
    ["notification-policy-retention", "The notification policy governs audit retention"],
    ["reminder-settings-disabled", "Reminder settings default to disabled"],
    ["mail-templates-branding", "Mail templates use corporate branding"],
    ["email-history-encrypted", "Email history is encrypted at rest"],
    ["TC-inform-rules-updated", "知會規則已更新"],
    ["TC-inform-content-audit", "知會內容僅供審計參考"],
    ["TC-tell-guidance-updated", "告知指引已更新"],
    ["TC-tell-content-reference", "告知內容僅供參考"],
    ["TC-report-rules-updated", "通報規則已更新"],
    ["SC-inform-rules-updated", "知会规则已更新"],
    ["SC-inform-content-audit", "知会内容仅供审计参考"],
    ["SC-tell-guidance-updated", "告知指引已更新"],
    ["SC-tell-content-reference", "告知内容仅供参考"],
    ["SC-report-rules-updated", "通报规则已更新"],
    ["TC-notification-policy-departments", "通知政策適用於所有部門"],
    ["TC-notification-template-branding", "通知範本使用公司品牌"],
    ["TC-notification-settings-language", "通知設定沿用公司語言"],
    ["TC-email-content-translated", "電郵內容已翻譯成中文"],
    ["TC-notification-service-maintained", "通知服務由資訊科技部維護"],
    ["TC-notification-report-nightly", "通知報告每晚產生"],
    ["TC-reminder-policy-updated", "提醒政策已更新"],
    ["TC-mail-template-branding", "郵件範本使用公司品牌"],
    ["TC-email-history-encrypted", "電郵歷史已加密"],
    ["SC-notification-policy-departments", "通知政策适用于所有部门"],
    ["SC-notification-template-branding", "通知范本使用公司品牌"],
    ["SC-notification-settings-language", "通知设置沿用公司语言"],
    ["SC-email-content-translated", "电邮内容已翻译成中文"],
    ["SC-notification-service-maintained", "通知服务由资讯科技部维护"],
    ["SC-notification-report-nightly", "通知报告每晚产生"],
    ["SC-reminder-policy-updated", "提醒政策已更新"],
    ["SC-mail-template-branding", "邮件范本使用公司品牌"],
    ["SC-email-history-encrypted", "电邮历史已加密"],
  ]) {
    const messageId = `notification-scope-positive:${caseId}`;
    const text = `申請已提交時通知申請人。${auditFact}.`;
    const result = assembleTemplateCopilotV3Review({
      items: [located({
        itemIndex: 61,
        kind: "notification",
        messageId,
        text,
        anchorQuote: "申請已提交時通知申請人",
        leaves: [
          { role: "event", quote: "申請已提交", hint: "request_submitted" },
          { role: "recipient", quote: "申請人", hint: "requester" },
        ],
      })],
      sourceMessages: { [messageId]: text },
    });
    const notification = result.review.items.find(
      (item) => item.factId === "notifications.rules",
    );
    assert.ok(notification, caseId);
    assert.equal(notification.semanticComplete, true, caseId);
    assert.equal(result.envelope.fragments.length, 1, caseId);
  }
});

test("notification durable writers enforce slot and server-local provenance", () => {
  const messageId = "notification-slot-provenance";
  const text = "申請已提交時通知申請人";
  const notification = (slot, itemIndex) => located({
    itemIndex,
    kind: "notification",
    slot,
    messageId,
    text,
    leaves: [
      { role: "event", quote: "申請已提交", hint: "request_submitted" },
      { role: "recipient", quote: "申請人", hint: "requester" },
    ],
  });
  for (const [caseId, item] of [
    ["timing", notification("timing_escalation", 0)],
    ["provider-stage", notification("stages_participants", 0)],
  ]) {
    const result = assembleTemplateCopilotV3Review({
      items: [item],
      sourceMessages: { [messageId]: text },
    });
    const reviewItem = result.review.items.find(
      (entry) => entry.factId === "notifications.rules",
    );
    assert.ok(reviewItem, caseId);
    assert.equal(reviewItem.semanticComplete, false, caseId);
    assert.equal(reviewItem.fragmentId, null, caseId);
    assert.deepEqual(reviewItem.bindings, [], caseId);
    assert.equal(result.envelope.fragments.length, 0, caseId);
    assert.ok(
      result.review.rejections.some(
        (entry) =>
          entry.detail === "notification:unsupported_slot_provenance",
      ),
      caseId,
    );
  }

  const governedStageMessageId = "governed:stages_participants";
  const governedStage = assembleTemplateCopilotV3Review({
    items: [located({
      itemIndex: 0,
      kind: "notification",
      slot: "stages_participants",
      messageId: governedStageMessageId,
      text,
      leaves: [
        { role: "event", quote: "申請已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    })],
    sourceMessages: { [governedStageMessageId]: text },
  });
  const governedStageItem = governedStage.review.items.find(
    (entry) => entry.factId === "notifications.rules",
  );
  assert.ok(governedStageItem);
  assert.equal(governedStageItem.semanticComplete, true);
  assert.equal(governedStageItem.fragmentId, null);
  assert.deepEqual(governedStageItem.bindings, []);
  assert.equal(governedStage.envelope.fragments.length, 0);

  for (const noun of ["Notification", "Notifications"]) {
    const nounMessageId = `notification-noun:${noun}`;
    const nounText = `${noun} only Finance Team for rejection.`;
    const result = assembleTemplateCopilotV3Review({
      items: [located({
        itemIndex: 62,
        kind: "notification",
        messageId: nounMessageId,
        text: nounText,
        leaves: [
          { role: "event", quote: "rejection", hint: "request_rejected" },
          {
            role: "recipient",
            quote: "Finance Team",
            hint: "source_named_group",
          },
          { role: "visibility", quote: "only", hint: "recipients_only" },
        ],
      })],
      sourceMessages: { [nounMessageId]: nounText },
    });
    const item = result.review.items.find(
      (entry) => entry.factId === "notifications.rules",
    );
    assert.ok(item, noun);
    assert.equal(item.semanticComplete, false, noun);
    assert.equal(item.fragmentId, null, noun);
    assert.deepEqual(item.bindings, [], noun);
    assert.equal(result.envelope.fragments.length, 0, noun);
  }

  const invalidField = located({
    itemIndex: 58,
    kind: "request_field",
    slot: "governance",
    messageId: "unsupported-kind-slot",
    text: "Amount required",
    leaves: [
      { role: "label", quote: "Amount" },
      { role: "required", quote: "required", hint: "true" },
    ],
  });
  const invalidResult = assembleTemplateCopilotV3Review({
    items: [invalidField],
    sourceMessages: { "unsupported-kind-slot": "Amount required" },
  });
  assert.equal(invalidResult.review.items.length, 0);
  assert.equal(invalidResult.envelope.fragments.length, 0);
  assert.ok(
    invalidResult.review.rejections.some(
      (entry) => entry.detail === "request_field:unsupported_slot",
    ),
  );
});

test("keeps later-stage attachments, native forms, inflected FYI stages, grouped amounts, and raw Chinese thresholds", () => {
  const attachmentId = "message-attach-001";
  const attachmentText = "Supplier invoice PDF required up to 10 MB at Legal Review; invited colleagues may contribute; requester confirms";
  const formId = "message-attach-002";
  const formText = "Expense details native form optional";
  const stageId = "message-stage-003";
  const stageText = "Board FYI to Board members in parallel";
  const conditionId = "message-cond-001";
  const conditionText = "Total at least 50,000 routes to Legal Review otherwise complete the workflow";
  const chineseId = "message-cond-002";
  const chineseText = "總額大於一億元時配對財務審批，否則完成流程";
  const messages = { [attachmentId]: attachmentText, [formId]: formText, [stageId]: stageText, [conditionId]: conditionText, [chineseId]: chineseText };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: messages,
    sourceMessageOrder: Object.keys(messages),
    items: [
      located({ itemIndex: 0, kind: "attachment", messageId: attachmentId, text: attachmentText, leaves: [
        { role: "label", quote: "Supplier invoice" }, { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" }, { role: "format", quote: "PDF", hint: "pdf" },
        { role: "maximum_file_size_mb", quote: "10" }, { role: "stage", quote: "Legal Review", hint: "stage_reference" },
        { role: "contributor_policy", quote: "invited colleagues may contribute", hint: "allow_invited_contributors" }, { role: "confirmation_policy", quote: "requester confirms", hint: "requester_confirms" },
      ] }),
      located({ itemIndex: 1, kind: "attachment", messageId: formId, text: formText, leaves: [
        { role: "label", quote: "Expense details" }, { role: "kind", quote: "native form", hint: "form" }, { role: "required", quote: "optional", hint: "false" },
      ] }),
      located({ itemIndex: 2, kind: "stage", messageId: stageId, text: stageText, leaves: [
        { role: "label", quote: "Board FYI" }, { role: "kind", quote: "FYI", hint: "for_information" },
        { role: "participant", quote: "Board members" }, { role: "relationship", quote: "in parallel", hint: "parallel" },
      ] }),
      located({ itemIndex: 3, kind: "condition", messageId: conditionId, text: conditionText, leaves: [
        { role: "field", quote: "Total" }, { role: "operator", quote: "at least", hint: ">=" }, { role: "value", quote: "50,000" },
        { role: "matching_route", quote: "Legal Review", hint: "stage_reference" }, { role: "otherwise_route", quote: "complete the workflow", hint: "complete" },
      ] }),
      located({ itemIndex: 4, kind: "condition", messageId: chineseId, text: chineseText, leaves: [
        { role: "field", quote: "總額" }, { role: "operator", quote: "大於", hint: ">" }, { role: "value", quote: "一億元" },
        { role: "matching_route", quote: "財務審批", hint: "stage_reference" }, { role: "otherwise_route", quote: "完成流程", hint: "complete" },
      ] }),
    ],
  });
  const attachments = result.review.items.filter((item) => item.factId === "attachments.requirements");
  assert.equal(attachments.length, 2, JSON.stringify(result.review.rejections));
  assert.ok(attachments.every((item) => item.semanticComplete));
  const invoice = attachments.find((item) => item.semanticValue.kind?.includes("PDF"));
  assert.equal(invoice?.value.stage, "stage:Legal Review");
  assert.deepEqual(invoice?.semanticValue.format, ["PDF"]);
  assert.deepEqual(invoice?.semanticValue.maximum_file_size_mb, ["10"]);
  assert.deepEqual(invoice?.semanticValue.contributor_policy, ["invited colleagues may contribute"]);
  assert.deepEqual(invoice?.semanticValue.confirmation_policy, ["requester confirms"]);
  assert.equal(attachments.find((item) => item.semanticValue.kind?.includes("native form"))?.value.kind, undefined);
  const stage = result.review.items.find((item) => item.factId === "workflow.stages");
  assert.equal(stage?.semanticComplete, true);
  assert.deepEqual(stage?.semanticValue.kind, ["FYI"]);
  assert.equal(stage?.relationships[0].relationship, "parallel");
  const conditions = result.review.items.filter((item) => item.factId === "workflow.conditions");
  assert.equal(conditions.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(conditions.find((item) => item.semanticValue.value?.includes("50,000"))?.value.value, 50000);
  const chinese = conditions.find((item) => item.semanticValue.value?.includes("一億元"));
  assert.equal(chinese?.semanticComplete, true);
  assert.equal(chinese?.value.value, undefined);
  assert.deepEqual(chinese?.semanticValue.matching_route, ["財務審批"]);
});

test("isolates malformed spans while retaining notifications and review-only scalar and policy facts", () => {
  const notificationId = "message-note-001";
  const notificationText = "overdue notify requester";
  const nameId = "message-name-001";
  const nameText = "Supplier Onboarding";
  const policyId = "message-policy-001";
  const policyText = "Keep legitimate quoted requirements";
  const validNotification = located({ itemIndex: 0, kind: "notification", messageId: notificationId, text: notificationText, leaves: [
    { role: "event", quote: "overdue", hint: "overdue" }, { role: "recipient", quote: "requester", hint: "requester" },
  ] });
  const validName = located({ itemIndex: 1, kind: "workflow_name", messageId: nameId, text: nameText, leaves: [{ role: "description", quote: nameText }] });
  const validPolicy = located({ itemIndex: 2, kind: "governance_policy", messageId: policyId, text: policyText, leaves: [{ role: "rule", quote: policyText }] });
  const malformed = { ...validNotification, itemIndex: 3, anchor: { ...validNotification.anchor, endCodePoint: validNotification.anchor.endCodePoint + 1 } };
  const messages = { [notificationId]: notificationText, [nameId]: nameText, [policyId]: policyText };
  const result = assembleTemplateCopilotV3Review({ items: [malformed, validPolicy, validNotification, validName], sourceMessages: messages });
  assert.equal(result.review.items.filter((item) => item.factId === "notifications.rules").length, 1);
  assert.equal(result.review.items.find((item) => item.factId === "notifications.rules")?.semanticComplete, true);
  assert.equal(result.review.scalarFacts[0].factId, "workflow.name");
  assert.equal(result.review.policyItems[0].factId, "governance.policies");
  assert.equal(result.review.scalarFacts[0].executable, false);
  assert.ok(result.review.rejections.some((entry) => entry.itemIndex === 3 && entry.code === "untraceable_span"));
});

test("keeps a named-role stage semantically complete without inventing an explicit relationship or sequence", () => {
  const messageId = "message-stage-004";
  const text = "Manager Approval approves Finance Director";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex: 0, kind: "stage", messageId, text, leaves: [
      { role: "label", quote: "Manager Approval" },
      { role: "kind", quote: "approves", hint: "approval" },
      { role: "participant", quote: "Finance Director" },
    ] })],
  });
  const item = result.review.items[0];
  assert.equal(item.semanticComplete, true);
  assert.equal(item.complete, false);
  assert.equal(item.executable, false);
  assert.equal(item.persisted, false);
  assert.deepEqual(item.semanticValue.participant, ["Finance Director"]);
  assert.deepEqual(item.relationships, []);
  assert.ok(item.missingPaths.includes("/sequence"));
});
test("accepts an explicit matching condition route while leaving an unstated ordinary path unresolved", () => {
  const messageId = "message-cond-003";
  const text = "Amount greater than 100 routes to Manager Approval";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex: 0, kind: "condition", messageId, text, leaves: [
      { role: "field", quote: "Amount" },
      { role: "operator", quote: "greater than", hint: ">" },
      { role: "value", quote: "100" },
      { role: "matching_route", quote: "Manager Approval", hint: "stage_reference" },
    ] })],
  });
  const item = result.review.items[0];
  assert.equal(item.semanticComplete, true);
  assert.equal(item.executable, false);
  assert.ok(item.missingPaths.includes("/otherwiseRoute"));
  assert.equal(item.semanticValue.otherwise_route, undefined);
});
test("keeps identical labels from distinct source anchors isolated", () => {
  const firstId = "message-stage-isolated-001";
  const secondId = "message-stage-isolated-002";
  const firstText = "Finance Review approves requester";
  const secondText = "Finance Review audits requester";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [firstId]: firstText, [secondId]: secondText },
    items: [
      located({ itemIndex: 0, kind: "stage", messageId: firstId, text: firstText, leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "approves", hint: "approval" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ] }),
      located({ itemIndex: 1, kind: "stage", messageId: secondId, text: secondText, leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "audits", hint: "review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ] }),
    ],
  });

  assert.equal(result.review.items.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(result.review.conflicts.length, 0);
  assert.deepEqual(new Set(result.review.items.map((entry) => entry.semanticValue.kind?.[0])), new Set(["approves", "audits"]));
  assert.ok(result.review.items.every((entry) => entry.providerItemIndexes.length === 1));
});

test("rejects each internally conflicting provider item independent of leaf order while retaining a valid sibling", () => {
  const optionId = "message-field-conflict-001";
  const optionText = "Choice none Alpha";
  const stageId = "message-stage-conflict-001";
  const stageText = "Decision approve review Finance";
  const siblingId = "message-field-sibling-001";
  const siblingText = "Purpose text required no options";
  const messages = { [optionId]: optionText, [stageId]: stageText, [siblingId]: siblingText };
  const run = (reverse) => assembleTemplateCopilotV3Review({
    sourceMessages: messages,
    items: [
      located({ itemIndex: 0, kind: "request_field", messageId: optionId, text: optionText, leaves: [
        { role: "label", quote: "Choice" },
        ...(reverse
          ? [{ role: "option", quote: "Alpha" }, { role: "option", quote: "none" }]
          : [{ role: "option", quote: "none" }, { role: "option", quote: "Alpha" }]),
      ] }),
      located({ itemIndex: 1, kind: "stage", messageId: stageId, text: stageText, leaves: [
        { role: "label", quote: "Decision" },
        ...(reverse
          ? [{ role: "kind", quote: "review", hint: "review" }, { role: "kind", quote: "approve", hint: "approval" }]
          : [{ role: "kind", quote: "approve", hint: "approval" }, { role: "kind", quote: "review", hint: "review" }]),
        { role: "participant", quote: "Finance" },
      ] }),
      located({ itemIndex: 2, kind: "request_field", messageId: siblingId, text: siblingText, leaves: [
        { role: "label", quote: "Purpose" },
        { role: "type", quote: "text", hint: "text" },
        { role: "required", quote: "required", hint: "true" },
        { role: "option", quote: "no options" },
      ] }),
    ],
  });

  const forward = run(false);
  const reversed = run(true);
  for (const result of [forward, reversed]) {
    assert.equal(result.review.items.length, 1);
    assert.equal(result.review.items[0].value.label, "Purpose");
    assert.deepEqual(
      result.review.rejections.filter((entry) => entry.code === "conflicting_leaf").map(({ itemIndex, kind, code, detail }) => ({ itemIndex, kind, code, detail })),
      [
        { itemIndex: 0, kind: "request_field", code: "conflicting_leaf", detail: "request_field:/options" },
        { itemIndex: 1, kind: "stage", code: "conflicting_leaf", detail: "stage:/kind" },
      ],
    );
  }
  assert.deepEqual(forward.review.rejections, reversed.review.rejections);
});

test("canonicalizes and deduplicates semantic projection leaves before identity", () => {
  const messageId = "message-policy-canonical-001";
  const text = "Keep legitimate quotations and preserve exact requirements";
  const firstLeaf = { role: "rule", quote: "Keep legitimate quotations" };
  const secondLeaf = { role: "rule", quote: "preserve exact requirements" };
  const assemble = (itemIndex, leaves) => assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex, kind: "governance_policy", messageId, text, leaves })],
  }).review.policyItems[0];
  const forward = assemble(0, [secondLeaf, firstLeaf, secondLeaf]);
  const reversed = assemble(99, [firstLeaf, secondLeaf, firstLeaf]);

  assert.equal(forward.projectionId, reversed.projectionId);
  assert.equal(
    templateCopilotV3SemanticProjectionId(forward),
    forward.projectionId,
  );
  assert.equal(templateCopilotV3SemanticProjectionId(reversed), reversed.projectionId);
  assert.equal(forward.leaves.length, 2);
  assert.deepEqual(forward.leaves, reversed.leaves);
});

test("keeps unconditional optional uploads and safely holds conditional optional uploads", () => {
  const cases = [
    {
      scenarioId: "TC-05",
      anchorQuote: "可選擇上載變更指示 PDF",
      label: "變更指示",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選擇上載",
      blockingReason: null,
    },
    {
      scenarioId: "TC-06",
      anchorQuote: "可選上載法律意見 PDF",
      label: "法律意見",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選上載",
      blockingReason: null,
    },
    {
      scenarioId: "SC-07",
      anchorQuote: "申请签证时可选上传护照资料页",
      label: "护照资料页",
      kindQuote: "上传",
      kindOccurrence: 2,
      requiredQuote: "可选上传",
      blockingReason: "unsupported_semantics_not_executable",
    },
  ];

  for (const entry of cases) {
    const scenario = templateCopilotQualificationScenarios.find(
      (candidate) => candidate.id === entry.scenarioId,
    );
    assert.ok(scenario, entry.scenarioId);
    assert.ok(
      scenario.attachments.includes(entry.anchorQuote),
      `${entry.scenarioId}:anchor`,
    );
    const messageId = `optional-upload:${entry.scenarioId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: scenario.attachments },
      items: [located({
        itemIndex: 0,
        kind: "attachment",
        messageId,
        text: scenario.attachments,
        anchorQuote: entry.anchorQuote,
        leaves: [
          { role: "label", quote: entry.label },
          {
            role: "kind",
            quote: entry.kindQuote,
            occurrence: entry.kindOccurrence,
            hint: "attachment",
          },
          {
            role: "required",
            quote: entry.requiredQuote,
            hint: "false",
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, JSON.stringify(result.review.rejections));
    assert.equal(
      item.semanticComplete,
      entry.blockingReason === null,
      entry.scenarioId,
    );
    assert.equal(
      item.blockingReason,
      entry.blockingReason ?? undefined,
      entry.scenarioId,
    );
    if (entry.blockingReason !== null) {
      assert.equal(item.fragmentId, null, entry.scenarioId);
      assert.equal(result.envelope.fragments.length, 0, entry.scenarioId);
    }
    assert.equal(item.complete, false, entry.scenarioId);
    assert.equal(item.persisted, false, entry.scenarioId);
    assert.equal(item.executable, false, entry.scenarioId);
    assert.equal(item.defaulted, false, entry.scenarioId);
    assert.deepEqual(item.value, { label: entry.label }, entry.scenarioId);
    assert.ok(item.missingPaths.includes("/kind"), entry.scenarioId);
    assert.ok(item.missingPaths.includes("/required"), entry.scenarioId);
    assert.deepEqual(
      result.review.rejections.map(({ code, detail }) => ({ code, detail })),
      [],
      entry.scenarioId,
    );
  }
});

test("treats Go/No-Go as a review-only approval decision without granting durable kind authority", () => {
  const messageId = "message-stage-go-no-go-001";
  const text = "投標總監先作 Go/No-Go";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "投標總監" },
        { role: "kind", quote: "Go/No-Go", hint: "approval" },
        { role: "participant", quote: "投標總監" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.complete, false);
  assert.equal(item.value.kind, undefined);
  assert.ok(item.missingPaths.includes("/kind"));
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.deepEqual(
    result.review.rejections.map(({ code, detail }) => ({ code, detail })),
    [{ code: "unverifiable_leaf", detail: "stage:kind" }],
  );
});

test("blocks explicitly negated core semantics in English, Traditional Chinese, and Simplified Chinese without durable fragments", () => {
  const cases = [
    {
      caseId: "EN-attachment",
      kind: "attachment",
      text: "Do not upload the passport page.",
      leaves: [
        { role: "label", quote: "passport page" },
        { role: "kind", quote: "upload", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
    },
    {
      caseId: "EN-stage",
      kind: "stage",
      text: "Finance does not approve this request.",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "approve", hint: "approval" },
        { role: "participant", quote: "Finance" },
      ],
    },
    {
      caseId: "EN-notification",
      kind: "notification",
      text: "Do not notify the requester on completion.",
      leaves: [
        { role: "event", quote: "completion", hint: "request_completed" },
        { role: "recipient", quote: "requester", hint: "requester" },
      ],
    },
    {
      caseId: "TC-attachment",
      kind: "attachment",
      text: "不要上載護照資料頁。",
      leaves: [
        { role: "label", quote: "護照資料頁" },
        { role: "kind", quote: "上載", hint: "attachment" },
        { role: "required", quote: "上載", hint: "true" },
      ],
    },
    {
      caseId: "TC-stage",
      kind: "stage",
      text: "財務不批准此申請。",
      leaves: [
        { role: "label", quote: "財務" },
        { role: "kind", quote: "批准", hint: "approval" },
        { role: "participant", quote: "財務" },
      ],
    },
    {
      caseId: "TC-notification",
      kind: "notification",
      text: "不要通知申請人完成結果。",
      leaves: [
        { role: "event", quote: "完成", hint: "request_completed" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    },
    {
      caseId: "SC-attachment",
      kind: "attachment",
      text: "不要上传护照资料页。",
      leaves: [
        { role: "label", quote: "护照资料页" },
        { role: "kind", quote: "上传", hint: "attachment" },
        { role: "required", quote: "上传", hint: "true" },
      ],
    },
    {
      caseId: "SC-stage",
      kind: "stage",
      text: "财务不批准此申请。",
      leaves: [
        { role: "label", quote: "财务" },
        { role: "kind", quote: "批准", hint: "approval" },
        { role: "participant", quote: "财务" },
      ],
    },
    {
      caseId: "SC-notification",
      kind: "notification",
      text: "不要通知申请人完成结果。",
      leaves: [
        { role: "event", quote: "完成", hint: "request_completed" },
        { role: "recipient", quote: "申请人", hint: "requester" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`negation:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `negation:${entry.caseId}`,
        ...entry,
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("bare native and notification words cannot authorize context-dependent durable leaves", () => {
  const cases = [
    {
      caseId: "native-cad",
      kind: "attachment",
      text: "请上传原生 CAD 文件",
      leaves: [
        { role: "label", quote: "CAD 文件" },
        { role: "kind", quote: "原生", hint: "form" },
      ],
      path: "/kind",
      valueKey: "kind",
      rejectionDetail: "attachment:kind",
    },
    ...[
      ["not-completed", "申请未完成时通知直接相关人员", "完成", "request_completed"],
      ["not-rejected", "申请未被拒绝时通知直接相关人员", "拒绝", "request_rejected"],
      ["no-correction", "申请无需补正时通知直接相关人员", "补正", "correction_requested"],
      ["not-overdue", "申请未逾期时通知直接相关人员", "逾期", "overdue"],
      ["not-assigned", "申请未分配时通知直接相关人员", "分配", "stage_assigned"],
    ].map(([caseId, text, event, hint]) => ({
      caseId,
      kind: "notification",
      text,
      leaves: [
        { role: "event", quote: event, hint },
        { role: "recipient", quote: "直接相关人员", hint: "source_named_group" },
      ],
      path: "/event",
      valueKey: "event",
      rejectionDetail: "notification:event",
    })),
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`context-authority:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `context-authority:${entry.caseId}`,
        ...entry,
      }),
    ),
  });

  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.value[entry.valueKey], undefined, entry.caseId);
    assert.equal(
      item.bindings.some((binding) => binding.path === entry.path),
      false,
      entry.caseId,
    );
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === itemIndex &&
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === entry.rejectionDetail,
      ),
      entry.caseId,
    );
  }
});

test("rejects cross-sentence core splicing while preserving coordinated same-clause requirements", () => {
  const splicedMessageId = "message-field-spliced-001";
  const splicedText = "Purpose is optional. Amount is required.";
  const spliced = assembleTemplateCopilotV3Review({
    sourceMessages: { [splicedMessageId]: splicedText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: splicedMessageId,
      text: splicedText,
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  const splicedItem = spliced.review.items[0];
  assert.ok(splicedItem);
  assert.equal(splicedItem.semanticComplete, false);
  assert.equal(splicedItem.complete, false);
  assert.equal(splicedItem.fragmentId, null);
  assert.equal(spliced.envelope.fragments.length, 0);

  const coordinatedMessageId = "message-field-coordinated-001";
  const coordinatedText = "Purpose and amount are required";
  const coordinated = assembleTemplateCopilotV3Review({
    sourceMessages: { [coordinatedMessageId]: coordinatedText },
    items: ["Purpose", "amount"].map((label, itemIndex) =>
      located({
        itemIndex,
        kind: "request_field",
        messageId: coordinatedMessageId,
        text: coordinatedText,
        leaves: [
          { role: "label", quote: label },
          { role: "required", quote: "required", hint: "true" },
        ],
      })
    ),
  });
  assert.equal(coordinated.review.items.length, 2);
  assert.ok(
    coordinated.review.items.every((item) => item.semanticComplete === true),
  );
});

test("fails semantic completeness closed for same-anchor required conflicts and provider ambiguity", () => {
  const conflictMessageId = "message-field-required-conflict-001";
  const conflictText =
    "Purpose may be optional or required pending confirmation";
  const shared = {
    kind: "request_field",
    messageId: conflictMessageId,
    text: conflictText,
  };
  const conflicted = assembleTemplateCopilotV3Review({
    sourceMessages: { [conflictMessageId]: conflictText },
    items: [
      located({
        itemIndex: 0,
        ...shared,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "optional", hint: "false" },
        ],
      }),
      located({
        itemIndex: 1,
        ...shared,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
    ],
  });
  assert.equal(conflicted.review.items.length, 2);
  assert.equal(conflicted.review.conflicts.length, 1);
  assert.deepEqual(conflicted.review.conflicts[0].paths, ["/required"]);
  assert.ok(
    conflicted.review.items.every(
      (item) =>
        item.semanticComplete === false && item.ambiguity === "ambiguous",
    ),
  );

  const ambiguousMessageId = "message-field-ambiguous-001";
  const ambiguousText = "Purpose is required";
  const ambiguous = assembleTemplateCopilotV3Review({
    sourceMessages: { [ambiguousMessageId]: ambiguousText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: ambiguousMessageId,
      text: ambiguousText,
      ambiguity: "possible",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  assert.equal(ambiguous.review.items[0]?.semanticComplete, false);
  assert.equal(ambiguous.review.items[0]?.ambiguity, "possible");
});

test("does not let an unverifiable participant-mode hint satisfy stage completeness", () => {
  const messageId = "message-stage-participant-mode-unverified-001";
  const text = "Finance approves banana";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "approves", hint: "approval" },
        { role: "participant_mode", quote: "banana", hint: "requester" },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.value.participant, undefined);
  assert.ok(item.missingPaths.includes("/participant/mode"));
  assert.ok(
    result.review.rejections.some(
      ({ code, detail }) =>
        code === "unverifiable_leaf" && detail === "stage:participant_mode",
    ),
  );
});

test("preserves legitimate negative condition operators and the does-not-skip approval route", () => {
  const cases = [
    {
      caseId: "not-equal",
      text: "country not equal Hong Kong routes to Legal",
      field: "country",
      operator: "not equal",
      operatorHint: "!=",
      value: "Hong Kong",
      route: "Legal",
    },
    {
      caseId: "does-not-exceed",
      text: "amount does not exceed 100 routes to Finance",
      field: "amount",
      operator: "does not exceed",
      operatorHint: "<=",
      value: "100",
      route: "Finance",
      blockingReason: null,
    },
    {
      caseId: "does-not-skip",
      text: "Retrospective status does not skip approval",
      field: "Retrospective status",
      operator: "Retrospective",
      operatorHint: "=",
      value: "Retrospective status",
      route: "does not skip approval",
      blockingReason: "unsupported_semantics_not_executable",
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`legitimate-negative:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "condition",
        messageId: `legitimate-negative:${entry.caseId}`,
        text: entry.text,
        leaves: [
          { role: "field", quote: entry.field },
          {
            role: "operator",
            quote: entry.operator,
            hint: entry.operatorHint,
          },
          { role: "value", quote: entry.value },
          {
            role: "matching_route",
            quote: entry.route,
            hint: "stage_reference",
          },
        ],
      })
    ),
  });
  assert.equal(result.review.items.length, cases.length);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      item.semanticComplete,
      expectedBlockingReason === null,
      entry.caseId,
    );
    assert.equal(
      item.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
  }
});

test("verifies closed semantic aliases exercised by the fixed English, Traditional Chinese, and Simplified Chinese corpus", () => {
  const fieldCase = (caseId, text, label, required, requiredHint) => ({
    caseId, kind: "request_field", text, leaves: [
      { role: "label", quote: label },
      { role: "required", quote: required, hint: requiredHint },
    ],
  });
  const attachmentCase = (caseId, text, label, kind, kindHint, required, requiredHint) => ({
    caseId, kind: "attachment", text, leaves: [
      { role: "label", quote: label },
      { role: "kind", quote: kind, hint: kindHint },
      { role: "required", quote: required, hint: requiredHint },
    ],
  });
  const stageCase = (caseId, text, label, kind, kindHint) => ({
    caseId, kind: "stage", text, leaves: [
      { role: "label", quote: label },
      { role: "kind", quote: kind, hint: kindHint },
      { role: "participant", quote: label },
    ],
  });
  const conditionCase = (caseId, text, field, operator, operatorHint, value, route) => ({
    caseId, kind: "condition", text, leaves: [
      { role: "field", quote: field },
      { role: "operator", quote: operator, hint: operatorHint },
      { role: "value", quote: value },
      { role: "matching_route", quote: route, hint: "stage_reference" },
    ],
  });
  const notificationCase = (caseId, text, recipient, event, eventHint) => ({
    caseId, kind: "notification", text, leaves: [
      { role: "recipient", quote: recipient, hint: "source_named_group" },
      { role: "event", quote: event, hint: eventHint },
    ],
  });
  const cases = [
    fieldCase("EN-01-required", "Require purpose", "purpose", "Require", "true"),
    attachmentCase("EN-02-excel", "Allow an optional Excel line-item schedule", "line-item schedule", "Excel", "attachment", "optional", "false"),
    attachmentCase("EN-07-csv", "Require a data inventory CSV", "data inventory", "CSV", "attachment", "Require", "true"),
    attachmentCase("EN-03-image", "An optional image may show the proposed asset", "proposed asset", "image", "attachment", "optional", "false"),
    attachmentCase("EN-05-text", "Require one editable contract file as text", "editable contract file", "text", "attachment", "Require", "true"),
    {
      ...attachmentCase("EN-08-proof", "A retrospective request must also include proof of instruction", "proof of instruction", "proof", "attachment", "must also include", "true"),
      blockingReason: "unsupported_semantics_not_executable",
    },
    attachmentCase("EN-01-native", "Add a native justification form", "justification form", "native", "form", "Add", "true"),
    stageCase("EN-03-endorses", "Department Head endorses", "Department Head", "endorses", "approval"),
    stageCase("EN-02-compares", "the system compares invoice totals", "system", "compares", "review"),
    stageCase("EN-04-audits", "Finance audits receipts", "Finance", "audits", "review"),
    stageCase("EN-06-confirms", "Host confirms", "Host", "confirms", "approval"),
    conditionCase("EN-04-exceeds", "total exceeds 100 routes to Department Head", "total", "exceeds", ">", "100", "Department Head"),
    conditionCase("EN-08-over", "amount over 100000 routes to CEO", "amount", "over", ">", "100000", "CEO"),
    conditionCase("EN-05-boolean", "personal-data choice is Yes routes to Data Protection", "personal-data choice", "is Yes", "=", "Yes", "Data Protection"),
    conditionCase("EN-07-not-equal", "country other than Hong Kong routes to Legal", "country", "other than", "!=", "Hong Kong", "Legal"),
    notificationCase("EN-assignment", "directly involved people assignment", "directly involved people", "assignment", "stage_assigned"),
    notificationCase("EN-rejection", "directly involved people rejection", "directly involved people", "rejection", "request_rejected"),
    notificationCase("EN-correction", "directly involved people correction", "directly involved people", "correction", "correction_requested"),
    notificationCase("EN-completion", "directly involved people completion", "directly involved people", "completion", "request_completed"),

    fieldCase("TC-01-required", "必填公司中英文名稱", "公司中英文名稱", "必填", "true"),
    attachmentCase("TC-02-no-attachment", "一般年假毋須附件", "一般年假", "附件", "attachment", "毋須", "false"),
    attachmentCase("TC-01-native", "必須上載原生利益衝突聲明表", "利益衝突聲明表", "原生", "form", "必須上載", "true"),
    attachmentCase("TC-02-image", "要上載醫生證明圖片", "醫生證明", "圖片", "attachment", "要上載", "true"),
    attachmentCase("TC-05-photo", "必須上載進度照片", "進度", "照片", "attachment", "必須上載", "true"),
    stageCase("TC-review", "合規主任審查", "合規主任", "審查", "review"),
    stageCase("TC-panel-review", "質量主任評審", "質量主任", "評審", "review"),
    stageCase("TC-check", "HR 核對假期結餘", "HR", "核對", "review"),
    stageCase("TC-endorse", "商務總監認可", "商務總監", "認可", "approval"),
    stageCase("TC-confirm", "地盤工程師確認完成量", "地盤工程師", "確認", "approval"),
    { ...conditionCase("TC-over", "差異超過百分之五退回補正", "差異", "超過", ">", "百分之五", "補正"), blockingReason: "unsupported_semantics_not_executable" },
    conditionCase("TC-not-over", "總額不超過港幣二萬元完成", "總額", "不超過", "<=", "二萬元", "完成"),
    notificationCase("TC-assignment", "直接相關人士獲指派", "直接相關人士", "獲指派", "stage_assigned"),
    notificationCase("TC-rejection", "直接相關人士拒絕", "直接相關人士", "拒絕", "request_rejected"),
    notificationCase("TC-correction", "直接相關人士補正", "直接相關人士", "補正", "correction_requested"),
    notificationCase("TC-completion", "直接相關人士完成", "直接相關人士", "完成", "request_completed"),
    notificationCase("TC-overdue", "直接相關人士逾期", "直接相關人士", "逾期", "overdue"),

    fieldCase("SC-01-required", "必填項目", "項目", "必填", "true"),
    attachmentCase("SC-no-attachment", "一般申請毋须附件", "一般申請", "附件", "attachment", "毋须", "false"),
    attachmentCase("SC-native", "必须填写原生成本与工期影响表", "成本与工期影响表", "原生", "form", "必须填写", "true"),
    attachmentCase("SC-image", "必须上传文案和设计稿图片", "设计稿", "图片", "attachment", "必须上传", "true"),
    attachmentCase("SC-photo", "必须上传资产照片", "资产", "照片", "attachment", "必须上传", "true"),
    stageCase("SC-review", "品牌经理审查", "品牌经理", "审查", "review"),
    stageCase("SC-panel-review", "工程和安全并行评审", "工程和安全", "评审", "review"),
    stageCase("SC-check", "财务经理核对预算", "财务经理", "核对", "review"),
    stageCase("SC-endorse", "销售总监认可", "销售总监", "认可", "approval"),
    stageCase("SC-confirm", "部门主管确认事实", "部门主管", "确认", "approval"),
    { ...conditionCase("SC-over", "成本增加超过港币一百万元走额外审批", "成本增加", "超过", ">", "一百万元", "额外审批"), blockingReason: "unsupported_semantics_not_executable" },
    conditionCase("SC-not-over", "申请额度不超过港币一百万元由财务经理批准", "申请额度", "不超过", "<=", "一百万元", "财务经理"),
    notificationCase("SC-assignment", "直接相关人员分配", "直接相关人员", "分配", "stage_assigned"),
    notificationCase("SC-rejection", "直接相关人员拒绝", "直接相关人员", "拒绝", "request_rejected"),
    notificationCase("SC-correction", "直接相关人员补正", "直接相关人员", "补正", "correction_requested"),
    notificationCase("SC-completion", "直接相关人员完成", "直接相关人员", "完成", "request_completed"),
    notificationCase("SC-overdue", "直接相关人员逾期", "直接相关人员", "逾期", "overdue"),
  ];

  const sourceMessages = Object.fromEntries(cases.map((entry) => [`corpus:${entry.caseId}`, entry.text]));
  const items = cases.map((entry, itemIndex) => located({
    itemIndex,
    kind: entry.kind,
    messageId: `corpus:${entry.caseId}`,
    text: entry.text,
    leaves: entry.leaves,
  }));
  const result = assembleTemplateCopilotV3Review({ items, sourceMessages });
  for (const [itemIndex, entry] of cases.entries()) {
    const assembled = result.review.items.find((item) => item.providerItemIndexes.includes(itemIndex));
    assert.ok(assembled, `${entry.caseId}: ${JSON.stringify(result.review.rejections.filter((rejection) => rejection.itemIndex === itemIndex))}`);
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      assembled.semanticComplete,
      expectedBlockingReason === null,
      entry.caseId,
    );
    assert.equal(
      assembled.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
    if (expectedBlockingReason !== null) {
      assert.equal(assembled.fragmentId, null, entry.caseId);
    }
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
});

test("audits a bounded semantic operator for every fixed condition corpus entry without invented values", () => {
  const scenariosById = new Map(templateCopilotQualificationScenarios.map((scenario) => [scenario.id, scenario]));
  const audit = [
    { scenarioId: "EN-01", field: "total amount", operator: "below", operatorHint: "<", value: "HKD 50,000", route: "complete", routeHint: "complete" },
    { scenarioId: "EN-02", field: "invoice total", operator: "equals", operatorHint: "=", value: "PO total", route: "Finance Manager", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-03", field: "Board FYI", operator: "above", operatorHint: ">", value: "HKD 2,000,000", route: "Board FYI", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-04", field: "total", operator: "exceeds", operatorHint: ">", value: "HKD 10,000", route: "Department Head", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-05", field: "personal-data choice", operator: "is Yes", operatorHint: "=", value: "Yes", route: "Data Protection" },
    { scenarioId: "EN-06", field: "High-risk visits", operator: "High-risk", operatorHint: "=", value: "High-risk", route: "Site Manager" },
    { scenarioId: "EN-07", field: "country", operator: "other than", operatorHint: "!=", value: "Hong Kong", valueOccurrence: 1, route: "Legal" },
    { scenarioId: "EN-08", field: "amount", operator: "at most", operatorHint: "<=", value: "HKD 100,000", route: "General Manager" },
    { scenarioId: "TC-01", field: "註冊地或銀行所在地", operator: "註冊地或銀行所在地", operatorHint: "unsupported_predicate", value: "註冊地或銀行所在地", route: "法務審查", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-02", field: "病假日數", operator: "三日或以上", operatorHint: ">=", value: "三日", route: "醫生證明", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-03", field: "估算合約額", operator: "超過", operatorHint: ">", value: "港幣一億元", route: "董事會主席" },
    { scenarioId: "TC-04", field: "高風險工序", operator: "高風險", operatorHint: "=", value: "高風險", route: "公司安全主管" },
    { scenarioId: "TC-05", field: "差異", operator: "超過", operatorHint: ">", value: "百分之五", route: "退回分判商", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-06", field: "高風險或期限超過九十日", operator: "高風險或期限超過九十日", operatorHint: "unsupported_predicate", value: "高風險或期限超過九十日", route: "行政總裁批准", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-07", field: "費用", operator: "超過", operatorHint: ">", value: "港幣一萬元", route: "部門主管" },
    { scenarioId: "TC-08", field: "受限制區域", operator: "受限制區域", operatorHint: "=", value: "受限制區域", route: "資訊保安" },
    { scenarioId: "SC-01", field: "安全影响", operator: "为是", operatorHint: "=", value: "是", route: "安全评审" },
    { scenarioId: "SC-02", field: "生产数据库", operator: "生产数据库", operatorHint: "=", value: "生产数据库", route: "数据负责人", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-03", field: "客户名称", operator: "为是", operatorHint: "=", value: "是", route: "客户经理" },
    { scenarioId: "SC-04", field: "申请额度", operator: "不超过", operatorHint: "<=", value: "港币一百万元", route: "财务经理", blockingReason: "compound_predicate_not_executable" },
    { scenarioId: "SC-05", field: "含数据设备", operator: "含数据设备", operatorHint: "=", value: "含数据设备", route: "安全审批和清除证明", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-06", field: "严重程度为高或需要监管报告", operator: "严重程度为高或需要监管报告", operatorHint: "unsupported_predicate", value: "严重程度为高或需要监管报告", route: "高级管理层批准", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-07", field: "国际", operator: "国际", operatorHint: "=", value: "国际", route: "HR 和安全", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-08", field: "有关联人士", operator: "有关联人士", operatorHint: "=", value: "有关联人士", route: "独立高管" },
  ];
  assert.deepEqual(
    audit.map((entry) => entry.scenarioId).sort(),
    templateCopilotQualificationScenarios.map((scenario) => scenario.id).sort(),
  );

  const variants = [
    { caseId: "EN-not-in", text: "country not in Hong Kong routes to Legal", field: "country", operator: "not in", operatorHint: "!=", value: "Hong Kong", route: "Legal" },
    { caseId: "TC-or-above", text: scenariosById.get("TC-02").conditions, field: "病假日數", operator: "或以上", operatorHint: ">=", value: "三日", route: "醫生證明", blockingReason: "unsupported_semantics_not_executable" },
    { caseId: "TC-declared-conflict", text: scenariosById.get("TC-01").conditions, field: "利益衝突", operator: "申報有利益衝突", operatorHint: "=", value: "利益衝突", route: "高級管理層" },
    { caseId: "SC-declared-conflict", text: "申报有利益冲突时增加高级管理层审批", field: "利益冲突", operator: "有利益冲突", operatorHint: "=", value: "利益冲突", route: "高级管理层" },
    { caseId: "TC-related-party", text: "有關聯人士時增加獨立高管審批", field: "關聯人士", operator: "有關聯人士", operatorHint: "=", value: "關聯人士", route: "獨立高管" },
    { caseId: "TC-risk-high", text: "嚴重程度為高時增加高級管理層批准", field: "嚴重程度", operator: "為高", operatorHint: "=", value: "高", route: "高級管理層" },
  ];
  const cases = [
    ...audit.map((entry) => ({
      ...entry,
      caseId: entry.scenarioId,
      text: scenariosById.get(entry.scenarioId).conditions,
    })),
    ...variants,
  ];
  for (const entry of cases) {
    for (const quote of [entry.field, entry.operator, entry.value, entry.route]) {
      assert.ok(entry.text.includes(quote), `${entry.caseId}: missing source quote ${quote}`);
    }
  }

  const sourceMessages = Object.fromEntries(cases.map((entry) => [`operator-audit:${entry.caseId}`, entry.text]));
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) => located({
      itemIndex,
      kind: "condition",
      messageId: `operator-audit:${entry.caseId}`,
      text: entry.text,
      leaves: [
        { role: "field", quote: entry.field },
        { role: "operator", quote: entry.operator, hint: entry.operatorHint },
        { role: "value", quote: entry.value, occurrence: entry.valueOccurrence ?? 0 },
        { role: "matching_route", quote: entry.route, hint: entry.routeHint ?? "stage_reference" },
      ],
    })),
  });

  assert.equal(result.review.items.length, cases.length, JSON.stringify(result.review.rejections));
  for (const [itemIndex, entry] of cases.entries()) {
    const assembled = result.review.items.find((item) => item.providerItemIndexes.includes(itemIndex));
    assert.ok(assembled, entry.caseId);
    const expectedBlockingReason = entry.blockingReason ?? null;
    if (expectedBlockingReason !== null) {
      assert.equal(assembled.semanticComplete, false, entry.caseId);
      assert.equal(assembled.complete, false, entry.caseId);
      assert.equal(assembled.fragmentId, null, entry.caseId);
      assert.equal(
        assembled.blockingReason,
        expectedBlockingReason,
        entry.caseId,
      );
    } else {
      assert.equal(assembled.semanticComplete, true, entry.caseId);
    }
    assert.deepEqual(assembled.semanticValue.field, [entry.field], entry.caseId);
    assert.deepEqual(assembled.semanticValue.operator, [entry.operator], entry.caseId);
    assert.deepEqual(assembled.semanticValue.value, [entry.value], entry.caseId);
    assert.deepEqual(assembled.semanticValue.matching_route, [entry.route], entry.caseId);
    assert.equal(assembled.defaulted, false, entry.caseId);
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
});

test("closes only a structurally authoritative exact simplified CJK yes compound", () => {
  const positives = [
    {
      caseId: "leading-copula",
      text: "安全影响为是时安全评审必须阻塞流程",
      operator: "为",
    },
    {
      caseId: "overlapping-value",
      text: "安全影响为是时安全评审必须阻塞流程",
      operator: "是",
    },
    {
      caseId: "declarative-terminal",
      text: "安全影响为是时安全评审必须阻塞流程。",
      operator: "为",
    },
    {
      caseId: "governing-cjk-colon-payload",
      text: "引用并执行以下要求：安全影响为是时安全评审必须阻塞流程",
      operator: "为",
    },
    {
      caseId: "governing-cjk-quoted-payload",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”",
      operator: "为",
    },
    {
      caseId: "governing-english-ascii-quote",
      text:
        'Enforce the following quoted requirement: "安全影响为是时安全评审必须阻塞流程"',
      operator: "为",
    },
    {
      caseId: "quote-aware-terminal-inside-payload",
      text: "引用并执行以下要求：「安全影响为是时安全评审必须阻塞流程。」",
      operator: "为",
    },
  ];
  for (const [itemIndex, entry] of positives.entries()) {
    const messageId = "closed-cjk-yes:" + entry.caseId;
    const symbols = conditionAuthoritySymbols({
      caseId: entry.caseId,
      field: "安全影响",
      route: "安全评审",
    });
    const messages = {
      [messageId]: entry.text,
      ...symbols.sourceMessages,
    };
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: messages,
      items: [
        ...symbols.items,
        located({
          itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: entry.operator, hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(
      item,
      entry.caseId + ": " + JSON.stringify(result.review.rejections),
    );
    assert.equal(item.value.operator, "=", entry.caseId);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.deepEqual(
      new Set(item.semanticValue.operator),
      new Set([entry.operator, "为是"]),
      entry.caseId,
    );
    const operatorBinding = item.bindings.find(
      (binding) => binding.path === "/operator",
    );
    assert.ok(operatorBinding, entry.caseId);
    assert.deepEqual(
      operatorBinding.spanIds.map((spanId) =>
        item.sourceSpans.find((candidate) => candidate.spanId === spanId)
          ?.exactText
      ),
      ["为是"],
      entry.caseId,
    );
    assert.ok(
      validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(
        result.envelope,
        messages,
      ),
      entry.caseId,
    );
  }

  const rejected = [
    {
      caseId: "traditional-contract-not-authorized",
      text: "安全影響為是時安全評審必須阻塞流程",
      field: "安全影響",
      operator: "為",
      value: "是",
      route: "安全評審",
    },
    {
      caseId: "negated",
      text: "安全影响不为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "question-form",
      text: "安全影响为是否需要安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "question-terminator",
      text: "安全影响为是时安全评审必须阻塞流程？",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "semicolon-terminator",
      text: "安全影响为是时安全评审必须阻塞流程；",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "compound-predicate",
      text: "安全影响为是且地区为欧盟时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "unrelated-predicate-route",
      text: "安全影响为是用于记录，地区为欧盟时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "hedged-route",
      text: "安全影响为是时预计走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "arbitrary-same-unit-prefix",
      text: "背景资料：安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "arbitrary-same-unit-suffix",
      text: "安全影响为是时安全评审必须阻塞流程供讨论",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-swallows-nonauthoritative-prefix",
      text: "仅供参考安全影响为是时走安全评审",
      field: "仅供参考安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-swallows-nonauthoritative-suffix",
      text: "安全影响仅供参考为是时走安全评审",
      field: "安全影响仅供参考",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "route-swallows-nonauthoritative-prefix",
      text: "安全影响为是时走仅供参考安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "仅供参考安全评审",
      trustedRoute: "安全评审",
    },
    {
      caseId: "route-swallows-nonauthoritative-suffix",
      text: "安全影响为是时走安全评审仅供参考",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审仅供参考",
      trustedRoute: "安全评审",
    },
    {
      caseId: "extra-cross-kind-role",
      text: "安全影响为是时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
      extraLeaves: [
        { role: "participant", quote: "安全评审" },
      ],
    },
    {
      caseId: "inconsistent-recovered-leaf-metadata",
      text: "安全影响为是时走安全评审",
      field: "安全影响",
      operator: "为",
      operatorRecovered: true,
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "single-quotes-swallowed-at-edges",
      text: "'安全影响为是时走安全评审'",
      field: "'安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审'",
      trustedRoute: "安全评审",
    },
    {
      caseId: "backticks-swallowed-at-edges",
      text: "`安全影响为是时走安全评审`",
      field: "`安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审`",
      trustedRoute: "安全评审",
    },
    {
      caseId: "fullwidth-quotes-swallowed-at-edges",
      text: "＂安全影响为是时走安全评审＂",
      field: "＂安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审＂",
      trustedRoute: "安全评审",
    },
    {
      caseId: "bare-quote",
      text: "“安全影响为是时安全评审必须阻塞流程”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "unknown-wrapper",
      text: "Retain this text: 安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "prohibited-wrapper",
      text:
        "Do not execute the following requirement: 安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "mismatched-governing-quotes",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程」",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "governing-question-payload",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程？”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-adjacent-prefix",
      text: "任意说明。安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-adjacent-suffix",
      text: "安全影响为是时安全评审必须阻塞流程。任意说明",
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-governing-outside-suffix",
      text:
        "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”。任意说明",
      anchorQuote:
        "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "duplicate-comparator",
      text: "安全影响为是用于记录，安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-outside-anchor",
      text: "安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "route-outside-anchor",
      text: "安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "安全影响为是",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
  ];
  for (const [itemIndex, entry] of rejected.entries()) {
    const messageId = "closed-cjk-yes-reject:" + entry.caseId;
    const symbols = conditionAuthoritySymbols({
      caseId: "reject:" + entry.caseId,
      field: entry.trustedField ?? entry.field,
      route: entry.trustedRoute ?? entry.route,
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 100 + itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: entry.anchorQuote ?? entry.text,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: "=",
              sameLocalClauseRecovered: entry.operatorRecovered ?? false,
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
            },
            ...(entry.extraLeaves ?? []),
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(100 + itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.value.operator, undefined, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "condition:operator",
      ),
      entry.caseId + ": " + JSON.stringify(result.review.rejections),
    );
  }
});

test("same-local recovered condition evidence stays semantic review-only and fail closed", () => {
  const accepted = [
    {
      caseId: "en-operator",
      text: "If risk equals high, route to Safety Review",
      field: "risk",
      operator: "equals",
      operatorHint: "=",
      value: "high",
      route: "Safety Review",
      recoveredRoles: ["operator"],
    },
    {
      caseId: "tc-both",
      text: "若安全影響為是，則交由安全評審",
      field: "安全影響",
      operator: "為是",
      operatorHint: "=",
      value: "是",
      route: "安全評審",
      recoveredRoles: ["operator", "matching_route"],
    },
    {
      caseId: "sc-route",
      text: "如果成本增加超过一百万元则走财务总监",
      field: "成本增加",
      operator: "超过",
      operatorHint: ">",
      value: "一百万元",
      route: "财务总监",
      recoveredRoles: ["matching_route"],
    },
  ];
  for (const [itemIndex, entry] of accepted.entries()) {
    const messageId = `condition-local-recovery:${entry.caseId}`;
    const symbols = conditionAuthoritySymbols({
      caseId: entry.caseId,
      field: entry.field,
      route: entry.route,
      itemIndexBase: 910_000 + itemIndex * 10,
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorExpanded: true,
          sameLocalClauseRecoveredLeafCount: entry.recoveredRoles.length,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: entry.operatorHint,
              sameLocalClauseRecovered:
                entry.recoveredRoles.includes("operator"),
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
              sameLocalClauseRecovered:
                entry.recoveredRoles.includes("matching_route"),
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    const diagnostics = `${entry.caseId}:${JSON.stringify({
      item,
      rejections: result.review.rejections,
    })}`;
    assert.equal(item.semanticComplete, true, diagnostics);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
    if (entry.recoveredRoles.includes("operator")) {
      assert.equal(item.value.operator, undefined, entry.caseId);
    }
    if (entry.recoveredRoles.includes("matching_route")) {
      assert.equal(item.value.matchingRoute, undefined, entry.caseId);
    }
    assert.equal(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === itemIndex &&
          rejection.code === "unverifiable_leaf",
      ),
      false,
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }

  for (const [itemIndex, entry] of [
    {
      caseId: "ambiguous",
      text: "If risk equals high, route to Safety Review",
      field: "risk",
      operator: "equals",
      value: "high",
      route: "Safety Review",
      ambiguity: "possible",
    },
    {
      caseId: "compound",
      text:
        "If risk equals high and cost exceeds 100, route to Safety Review",
      field: "risk",
      operator: "equals",
      value: "high",
      route: "Safety Review",
      ambiguity: "none",
    },
  ].entries()) {
    const messageId = `condition-local-recovery-reject:${entry.caseId}`;
    const symbols = conditionAuthoritySymbols({
      caseId: `reject-${entry.caseId}`,
      field: entry.field,
      route: entry.route,
      itemIndexBase: 920_000 + itemIndex * 10,
    });
    const conditionIndex = 100 + itemIndex;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: conditionIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          ambiguity: entry.ambiguity,
          anchorExpanded: true,
          sameLocalClauseRecoveredLeafCount: 1,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: "=",
              sameLocalClauseRecovered: true,
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(conditionIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.value.operator, undefined, entry.caseId);
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === conditionIndex &&
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "condition:operator",
      ),
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }
});

test("recovered condition evidence preserves unsupported semantic holds", () => {
  const messageId = "condition-local-recovery:unsupported";
  const text =
    "If retrospective status equals yes, no approval may be bypassed";
  const field = "retrospective status";
  const route = "no approval may be bypassed";
  const symbols = conditionAuthoritySymbols({
    caseId: "unsupported-recovery",
    field,
    route,
    itemIndexBase: 930_000,
  });
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [messageId]: text,
      ...symbols.sourceMessages,
    },
    items: [
      ...symbols.items,
      located({
        itemIndex: 930_002,
        kind: "condition",
        messageId,
        text,
        anchorExpanded: true,
        sameLocalClauseRecoveredLeafCount: 1,
        leaves: [
          { role: "field", quote: field },
          {
            role: "operator",
            quote: "equals",
            hint: "=",
            sameLocalClauseRecovered: true,
          },
          { role: "value", quote: "yes" },
          {
            role: "matching_route",
            quote: route,
            hint: "unsupported_outcome",
          },
        ],
      }),
    ],
  });
  const item = result.review.items.find((candidate) =>
    candidate.providerItemIndexes.includes(930_002)
  );
  assert.ok(item);
  assert.equal(item.value.operator, undefined);
  assert.equal(item.complete, false);
  assert.equal(item.executable, false);
  assert.equal(item.blockingReason, "unsupported_semantics_not_executable");
});

test("requires clean unique first-pass field and stage symbols for split operator recovery", () => {
  const messageId = "condition-symbol-gate:condition";
  const text = "安全影响为是时走安全评审";
  const condition = located({
    itemIndex: 777,
    kind: "condition",
    messageId,
    text,
    leaves: [
      { role: "field", quote: "安全影响" },
      { role: "operator", quote: "为", hint: "=" },
      { role: "value", quote: "是" },
      {
        role: "matching_route",
        quote: "安全评审",
        hint: "stage_reference",
      },
    ],
  });
  const symbols = conditionAuthoritySymbols({
    caseId: "symbol-gate",
    field: "安全影响",
    route: "安全评审",
  });
  const [fieldSymbol, stageSymbol] = symbols.items;
  assert.ok(fieldSymbol);
  assert.ok(stageSymbol);
  const sourceMessages = {
    [messageId]: text,
    ...symbols.sourceMessages,
  };
  const assemble = (symbolItems, extraMessages = {}) =>
    assembleTemplateCopilotV3Review({
      sourceMessages: { ...sourceMessages, ...extraMessages },
      items: [...symbolItems, condition],
    });
  const recoveredOperator = (result) =>
    result.review.items.find((item) =>
      item.providerItemIndexes.includes(777)
    )?.value.operator;
  assert.equal(recoveredOperator(assemble(symbols.items)), "=");

  const unrelatedMessageId = "condition-symbol-gate:unrelated-rejection";
  const unrelatedText = "unrelated";
  const unrelatedRejectedItem = located({
    itemIndex: fieldSymbol.itemIndex,
    kind: "notification",
    messageId: unrelatedMessageId,
    text: unrelatedText,
    leaves: [{ role: "label", quote: unrelatedText }],
  });
  assert.equal(
    recoveredOperator(
      assemble(
        [unrelatedRejectedItem, ...symbols.items],
        { [unrelatedMessageId]: unrelatedText },
      ),
    ),
    "=",
    "a rejection with a colliding batch-local item index",
  );

  const recoveredFieldSymbol = Object.freeze({
    ...fieldSymbol,
    sameLocalClauseRecoveredLeafCount: 1,
    leaves: Object.freeze(fieldSymbol.leaves.map((leaf, index) =>
      Object.freeze({
        ...leaf,
        sameLocalClauseRecovered: index === 0,
      })
    )),
  });
  const rejectedFieldSymbol = Object.freeze({
    ...fieldSymbol,
    leaves: Object.freeze([
      ...fieldSymbol.leaves,
      Object.freeze({
        ...fieldSymbol.leaves[0],
        role: "event",
      }),
    ]),
  });
  const duplicateMessageId = "condition-symbol-gate:duplicate-field";
  const duplicateText = "必填安全影响";
  const duplicateField = located({
    itemIndex: 900_002,
    kind: "request_field",
    messageId: duplicateMessageId,
    text: duplicateText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  const unsafeSymbolSets = [
    [stageSymbol],
    [fieldSymbol],
    [{ ...fieldSymbol, slot: "conditions_exceptions" }, stageSymbol],
    [fieldSymbol, { ...stageSymbol, slot: "conditions_exceptions" }],
    [{ ...fieldSymbol, ambiguity: "possible" }, stageSymbol],
    [fieldSymbol, { ...stageSymbol, anchorExpanded: true }],
    [recoveredFieldSymbol, stageSymbol],
    [rejectedFieldSymbol, stageSymbol],
  ];
  for (const [index, symbolItems] of unsafeSymbolSets.entries()) {
    assert.equal(
      recoveredOperator(assemble(symbolItems)),
      undefined,
      "unsafe symbol set " + index,
    );
  }
  const duplicateResult = assemble(
    [...symbols.items, duplicateField],
    { [duplicateMessageId]: duplicateText },
  );
  assert.equal(
    recoveredOperator(duplicateResult),
    undefined,
    "duplicate field definition: " + JSON.stringify({
      rejections: duplicateResult.review.rejections,
      fields: duplicateResult.review.items.filter(
        (item) => item.factId === "request.fields",
      ).map((item) => ({
        value: item.value,
        semanticComplete: item.semanticComplete,
        ambiguity: item.ambiguity,
        sourceAnchors: item.sourceAnchors.map((span) => span.exactText),
      })),
    }),
  );

  const trailingRequiredId = "condition-symbol-gate:trailing-required";
  const trailingRequiredText = "安全影响必填";
  const trailingRequiredField = located({
    itemIndex: 900_003,
    kind: "request_field",
    messageId: trailingRequiredId,
    text: trailingRequiredText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  assert.equal(
    recoveredOperator(assemble(
      [trailingRequiredField, stageSymbol],
      { [trailingRequiredId]: trailingRequiredText },
    )),
    "=",
    "an exact label followed immediately by its required marker",
  );

  const neutralPrefixId = "condition-symbol-gate:neutral-field-prefix";
  const neutralPrefixText = "系统说明安全影响必填";
  const neutralPrefixField = located({
    itemIndex: 900_004,
    kind: "request_field",
    messageId: neutralPrefixId,
    text: neutralPrefixText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  assert.equal(
    recoveredOperator(assemble(
      [neutralPrefixField, stageSymbol],
      { [neutralPrefixId]: neutralPrefixText },
    )),
    undefined,
    "neutral prose before a field cannot seed condition authority",
  );

  for (const [index, [opening, closing]] of [
    ['"', '"'],
    ["“", "”"],
    ["《", "》"],
    ["【", "】"],
    ["`", "`"],
    ["'", "'"],
    ["[", "]"],
    ["«", "»"],
    ["〝", "〞"],
    ["❝", "❞"],
    ["❛", "❜"],
    ["｟", "｠"],
    ["⟪", "⟫"],
    ["﹁", "﹂"],
    ["<", ">"],
    ["＜", "＞"],
    ["> ", ""],
    ["′", "′"],
    ["″", "″"],
    ["‵", "‵"],
    ["‶", "‶"],
  ].entries()) {
    for (const cropped of [false, true]) {
      const quotedFieldId =
        `condition-symbol-gate:quoted-field:${index}:${cropped}`;
      const quotedFieldInner = "必填安全影响";
      const quotedFieldText = opening + quotedFieldInner + closing;
      const quotedField = located({
        itemIndex: 910_000 + index * 10 + Number(cropped),
        kind: "request_field",
        messageId: quotedFieldId,
        text: quotedFieldText,
        anchorQuote: cropped ? quotedFieldInner : quotedFieldText,
        leaves: [
          { role: "label", quote: "安全影响" },
          { role: "required", quote: "必填", hint: "true" },
        ],
      });
      assert.equal(
        recoveredOperator(
          assemble(
            [quotedField, stageSymbol],
            { [quotedFieldId]: quotedFieldText },
          ),
        ),
        undefined,
        `quoted field ${index}:${cropped}`,
      );

      const quotedStageId =
        `condition-symbol-gate:quoted-stage:${index}:${cropped}`;
      const quotedStageInner = "安全评审审批申请人";
      const quotedStageText = opening + quotedStageInner + closing;
      const quotedStage = located({
        itemIndex: 920_000 + index * 10 + Number(cropped),
        kind: "stage",
        messageId: quotedStageId,
        text: quotedStageText,
        anchorQuote: cropped ? quotedStageInner : quotedStageText,
        leaves: [
          { role: "label", quote: "安全评审" },
          { role: "kind", quote: "审批", hint: "approval" },
          {
            role: "participant_mode",
            quote: "申请人",
            hint: "requester",
          },
        ],
      });
      assert.equal(
        recoveredOperator(
          assemble(
            [fieldSymbol, quotedStage],
            { [quotedStageId]: quotedStageText },
          ),
        ),
        undefined,
        `quoted stage ${index}:${cropped}`,
      );
    }
  }


  const metaPrefixes = [...new Set([
    "示例",
    "例子",
    "例如",
    "历史",
    "歷史",
    "供参考",
    "供參考",
    "参考资料",
    "參考資料",
    "背景资料",
    "背景資料",
    "示意",
    "摘录",
    "摘錄",
    "原文",
    "以下为引述",
    "以下為引述",
    "草稿",
    "旧版",
    "舊版",
    "存档",
    "存檔",
    "演示",
    "样本",
    "樣本",
    "假设",
    "假設",
    "备忘",
    "備忘",
    "转述",
    "轉述",
    "节选",
    "節選",
    "摘自",
  ].flatMap((prefix) => [
    "",
    " ",
    "\u200B",
    "\u2060",
    "\uFE00",
    "\u0301",
    "\u20DD",
    "\u00AD",
    "\t",
  ].map((joiner) => Array.from(prefix).join(joiner))))];
  for (const [index, prefix] of metaPrefixes.entries()) {
    for (const [variantIndex, fieldText] of [
      `${prefix}安全影响必填`,
      `必填${prefix}、安全影响`,
    ].entries()) {
      const fieldId =
        `condition-symbol-gate:meta-field:${index}:${variantIndex}`;
      const metaField = located({
        itemIndex: 930_000 + index * 10 + variantIndex,
        kind: "request_field",
        messageId: fieldId,
        text: fieldText,
        leaves: [
          { role: "label", quote: "安全影响" },
          { role: "required", quote: "必填", hint: "true" },
        ],
      });
      assert.equal(
        recoveredOperator(assemble(
          [metaField, stageSymbol],
          { [fieldId]: fieldText },
        )),
        undefined,
        `meta field ${index}:${variantIndex}`,
      );
    }

    const exactStageId = `condition-symbol-gate:meta-stage-exact:${index}`;
    const exactStageText = `${prefix}：安全评审审批申请人`;
    const exactStage = located({
      itemIndex: 940_000 + index,
      kind: "stage",
      messageId: exactStageId,
      text: exactStageText,
      leaves: [
        { role: "label", quote: "安全评审" },
        { role: "kind", quote: "审批", hint: "approval" },
        { role: "participant_mode", quote: "申请人", hint: "requester" },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, exactStage],
        { [exactStageId]: exactStageText },
      )),
      undefined,
      `meta exact stage ${index}`,
    );

    const compositeStageId =
      `condition-symbol-gate:meta-stage-composite:${index}`;
    const compositeStageText =
      `${prefix}：工程、商务和安全并行评审各自影响`;
    const compositeStage = located({
      itemIndex: 950_000 + index,
      kind: "stage",
      messageId: compositeStageId,
      text: compositeStageText,
      leaves: [
        { role: "label", quote: "安全" },
        { role: "kind", quote: "评审", hint: "review" },
        { role: "participant", quote: "安全" },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, compositeStage],
        { [compositeStageId]: compositeStageText },
      )),
      undefined,
      `meta composite stage ${index}`,
    );
  }

  for (const [index, entry] of [
    {
      text: "工程、商务和安 全并行评审各自影响",
      label: "安 全",
      kind: "评审",
    },
    {
      text: "工程、商务和安\u200B全并行评审各自影响",
      label: "安\u200B全",
      kind: "评审",
    },
    {
      text: "工程、商务和安全并行评 审各自影响",
      label: "安全",
      kind: "评 审",
    },
    {
      text: "工程、商务和安全并行评\u200B审各自影响",
      label: "安全",
      kind: "评\u200B审",
    },
  ].entries()) {
    const stageId = `condition-symbol-gate:obscured-stage-part:${index}`;
    const obscuredStage = located({
      itemIndex: 960_000 + index,
      kind: "stage",
      messageId: stageId,
      text: entry.text,
      leaves: [
        { role: "label", quote: entry.label },
        { role: "kind", quote: entry.kind, hint: "review" },
        { role: "participant", quote: entry.label },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, obscuredStage],
        { [stageId]: entry.text },
      )),
      undefined,
      `obscured stage part ${index}`,
    );
  }
});

test("requires independently compiled adjacent authority units for the real SC-01 and SC-03 split conditions", () => {
  const sc01Id = "condition-authority:sc01";
  const sc01Text =
    "安全影响为是时安全评审必须阻塞流程。成本增加超过港币一百万元走额外审批。紧急选项不能跳过审批。任何拒绝退回修改。";
  const sc01Symbols = conditionAuthoritySymbols({
    caseId: "sc01",
    field: "安全影响",
    route: "安全评审",
  });
  const sc01Items = [
    ...sc01Symbols.items,
    located({
      itemIndex: 0,
      kind: "condition",
      messageId: sc01Id,
      text: sc01Text,
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      leaves: [
        { role: "field", quote: "安全影响" },
        { role: "operator", quote: "为", hint: "=" },
        { role: "value", quote: "是" },
        {
          role: "matching_route",
          quote: "安全评审",
          hint: "stage_reference",
        },
      ],
    }),
    located({
      itemIndex: 1,
      kind: "condition",
      messageId: sc01Id,
      text: sc01Text,
      anchorQuote: "成本增加超过港币一百万元走额外审批",
      leaves: [
        { role: "field", quote: "成本增加" },
        { role: "operator", quote: "超过", hint: ">" },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "unsupported_outcome",
        },
      ],
    }),
  ];
  for (const items of [sc01Items, [...sc01Items].reverse()]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc01Id]: sc01Text,
        ...sc01Symbols.sourceMessages,
      },
      items,
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(0)
    );
    assert.equal(split?.value.operator, "=", "SC-01 item order");
    assert.equal(split?.semanticComplete, true, "SC-01 item order");
  }

  const sc03Id = "condition-authority:sc03";
  const sc03Text =
    "性能声明必须经过法务和产品审批。客户名称为是时增加客户经理。若目标地区不是香港，增加当地合规审查。拒绝退回修改。";
  const sc03Symbols = conditionAuthoritySymbols({
    caseId: "sc03",
    field: "客户名称",
    route: "客户经理",
  });
  const sc03StageSymbolId = "condition-authority:sc03:stage-symbol";
  const sc03StageSymbolText = "涉及客户名称时客户经理也审批";
  const sc03StageSymbol = located({
    itemIndex: 900_020,
    kind: "stage",
    messageId: sc03StageSymbolId,
    text: sc03StageSymbolText,
    leaves: [
      { role: "label", quote: "客户经理" },
      { role: "kind", quote: "审批", hint: "approval" },
      { role: "participant", quote: "客户经理" },
    ],
  });
  const sc03SymbolItems = [sc03Symbols.items[0], sc03StageSymbol];
  const sc03Items = [
    ...sc03SymbolItems,
    located({
      itemIndex: 10,
      kind: "condition",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "客户名称为是时增加客户经理",
      leaves: [
        { role: "field", quote: "客户名称" },
        { role: "operator", quote: "为", hint: "=" },
        { role: "value", quote: "是" },
        {
          role: "matching_route",
          quote: "客户经理",
          hint: "stage_reference",
        },
      ],
    }),
    located({
      itemIndex: 11,
      kind: "stage",
      slot: "conditions_exceptions",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "性能声明必须经过法务和产品审批",
      leaves: [
        { role: "label", quote: "法务和产品" },
        { role: "kind", quote: "审批", hint: "approval" },
        { role: "participant", quote: "法务和产品" },
      ],
    }),
    located({
      itemIndex: 12,
      kind: "condition",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "若目标地区不是香港，增加当地合规审查",
      leaves: [
        { role: "field", quote: "目标地区" },
        { role: "operator", quote: "不是", hint: "!=" },
        { role: "value", quote: "香港" },
        {
          role: "matching_route",
          quote: "当地合规审查",
          hint: "stage_reference",
        },
      ],
    }),
  ];
  for (const items of [sc03Items, [...sc03Items].reverse()]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc03Id]: sc03Text,
        [sc03StageSymbolId]: sc03StageSymbolText,
        ...sc03Symbols.sourceMessages,
      },
      items,
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(10)
    );
    assert.equal(split?.value.operator, "=", "SC-03 item order");
    assert.equal(split?.semanticComplete, true, "SC-03 item order");
  }
  for (const omittedItemIndex of [11, 12]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc03Id]: sc03Text,
        [sc03StageSymbolId]: sc03StageSymbolText,
        ...sc03Symbols.sourceMessages,
      },
      items: sc03Items.filter(
        (item) => item.itemIndex !== omittedItemIndex,
      ),
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(10)
    );
    assert.equal(
      split?.value.operator,
      undefined,
      "SC-03 missing " + omittedItemIndex,
    );
    assert.equal(split?.semanticComplete, false);
  }
});

test("does not let incomplete, unsafe, remote, connector-led, or deferred siblings provide condition authority", () => {
  const baseId = "condition-authority:unsafe-neighbor";
  const baseText =
    "安全影响为是时走安全评审。成本增加超过一百万元走额外审批";
  const baseSymbols = conditionAuthoritySymbols({
    caseId: "unsafe-neighbor",
    field: "安全影响",
    route: "安全评审",
  });
  const split = located({
    itemIndex: 20,
    kind: "condition",
    messageId: baseId,
    text: baseText,
    anchorQuote: "安全影响为是时走安全评审",
    leaves: [
      { role: "field", quote: "安全影响" },
      { role: "operator", quote: "为", hint: "=" },
      { role: "value", quote: "是" },
      {
        role: "matching_route",
        quote: "安全评审",
        hint: "stage_reference",
      },
    ],
  });
  const neighbor = (overrides = {}) =>
    located({
      itemIndex: 21,
      kind: "condition",
      messageId: baseId,
      text: baseText,
      anchorQuote: "成本增加超过一百万元走额外审批",
      leaves: [
        { role: "field", quote: "成本增加" },
        { role: "operator", quote: "超过", hint: ">" },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "stage_reference",
        },
      ],
      ...overrides,
    });

  const incomplete = neighbor({
    leaves: [
      { role: "field", quote: "成本增加" },
      { role: "operator", quote: "超过", hint: ">" },
      { role: "value", quote: "一百万元" },
    ],
  });
  const unsafeNeighbors = [
    incomplete,
    neighbor({ ambiguity: "possible" }),
    neighbor({ anchorExpanded: true }),
    neighbor({
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        { role: "field", quote: "成本增加" },
        {
          role: "operator",
          quote: "超过",
          hint: ">",
          sameLocalClauseRecovered: true,
        },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "stage_reference",
        },
      ],
    }),
  ];
  for (const [index, unsafeNeighbor] of unsafeNeighbors.entries()) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [baseId]: baseText,
        ...baseSymbols.sourceMessages,
      },
      items: [...baseSymbols.items, split, unsafeNeighbor],
    });
    const splitItem = result.review.items.find((item) =>
      item.providerItemIndexes.includes(20)
    );
    assert.equal(splitItem?.value.operator, undefined, "unsafe " + index);
    assert.equal(splitItem?.semanticComplete, false, "unsafe " + index);
  }

  for (const [index, entry] of [
    {
      text:
        "安全影响为是时走安全评审。背景资料：成本增加超过一百万元走额外审批",
      neighborAnchor: "背景资料：成本增加超过一百万元走额外审批",
    },
    {
      text:
        "安全影响为是时走安全评审。“成本增加超过一百万元走额外审批”",
      neighborAnchor: "“成本增加超过一百万元走额外审批”",
    },
  ].entries()) {
    const messageId = "condition-authority:meta-neighbor:" + index;
    const symbols = conditionAuthoritySymbols({
      caseId: "meta-neighbor:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 40 + index * 2,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 41 + index * 2,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: entry.neighborAnchor,
          leaves: [
            { role: "field", quote: "成本增加" },
            { role: "operator", quote: "超过", hint: ">" },
            { role: "value", quote: "一百万元" },
            {
              role: "matching_route",
              quote: "额外审批",
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const splitItem = result.review.items.find((item) =>
      item.providerItemIndexes.includes(40 + index * 2)
    );
    assert.equal(splitItem?.value.operator, undefined, "meta " + index);
    assert.equal(splitItem?.semanticComplete, false, "meta " + index);
  }

  const stageMetaId = "condition-authority:stage-meta-neighbor";
  const stageMetaText =
    "背景资料：性能声明必须经过法务和产品审批。客户名称为是时增加客户经理";
  const stageMetaSymbols = conditionAuthoritySymbols({
    caseId: "stage-meta-neighbor",
    field: "客户名称",
    route: "客户经理",
  });
  const stageMetaResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [stageMetaId]: stageMetaText,
      ...stageMetaSymbols.sourceMessages,
    },
    items: [
      ...stageMetaSymbols.items,
      located({
        itemIndex: 50,
        kind: "condition",
        messageId: stageMetaId,
        text: stageMetaText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 51,
        kind: "stage",
        slot: "conditions_exceptions",
        messageId: stageMetaId,
        text: stageMetaText,
        anchorQuote: "背景资料：性能声明必须经过法务和产品审批",
        leaves: [
          { role: "label", quote: "法务和产品" },
          { role: "kind", quote: "审批", hint: "approval" },
          { role: "participant", quote: "法务和产品" },
        ],
      }),
    ],
  });
  const stageMetaSplit = stageMetaResult.review.items.find((item) =>
    item.providerItemIndexes.includes(50)
  );
  assert.equal(stageMetaSplit?.value.operator, undefined);
  assert.equal(stageMetaSplit?.semanticComplete, false);

  for (const [index, stageUnit] of [
    "法务仅供参考审批",
    "仅供参考但必须经过法务审批",
    "这是示例但必须经过法务审批",
    "不要执行但必须经过法务审批",
  ].entries()) {
    const messageId = "condition-authority:stage-laundering:" + index;
    const text = "安全影响为是时走安全评审。" + stageUnit;
    const symbols = conditionAuthoritySymbols({
      caseId: "stage-laundering:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 60 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 61 + index * 2,
          kind: "stage",
          slot: "conditions_exceptions",
          messageId,
          text,
          anchorQuote: stageUnit,
          leaves: [
            { role: "label", quote: "法务" },
            { role: "kind", quote: "审批", hint: "approval" },
            { role: "participant", quote: "法务" },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(60 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "stage " + index);
    assert.equal(target?.semanticComplete, false, "stage " + index);
  }

  for (const [index, entry] of [
    {
      neighbor: "仅供参考成本增加超过100走额外审批",
      field: "仅供参考成本增加",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加仅供参考超过100走额外审批",
      field: "成本增加仅供参考",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过100走仅供参考额外审批",
      field: "成本增加",
      route: "仅供参考额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过100走额外审批仅供参考",
      field: "成本增加",
      route: "额外审批仅供参考",
      routeHint: "unsupported_outcome",
    },
    {
      neighbor: "成本增加背景资料100走额外审批",
      field: "成本增加",
      operator: "背景资料",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加背 景 资 料100走额外审批",
      field: "成本增加",
      operator: "背 景 资 料",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加草稿100走额外审批",
      field: "成本增加",
      operator: "草稿",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过背景资料100走额外审批",
      field: "成本增加",
      value: "背景资料100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过背景资料100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过草稿100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过任意说明100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "[成本增加超过100走额外审批]",
      field: "[成本增加",
      route: "额外审批]",
      routeHint: "stage_reference",
    },
    {
      neighbor: "«成本增加超过100走额外审批»",
      field: "«成本增加",
      route: "额外审批»",
      routeHint: "stage_reference",
    },
  ].entries()) {
    const messageId = "condition-authority:swallowed-neighbor:" + index;
    const text = "安全影响为是时走安全评审。" + entry.neighbor;
    const symbols = conditionAuthoritySymbols({
      caseId: "swallowed-neighbor:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 200 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 201 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: entry.neighbor,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator ?? "超过",
              hint: entry.operatorHint ?? ">",
            },
            { role: "value", quote: entry.value ?? "100" },
            {
              role: "matching_route",
              quote: entry.route,
              hint: entry.routeHint,
            },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(200 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "condition " + index);
    assert.equal(target?.semanticComplete, false, "condition " + index);
  }

  for (const [index, entry] of [
    { unit: "法务仅供参考审批", actor: "法务仅供参考" },
    { unit: "仅供参考法务审批", actor: "仅供参考法务" },
    { unit: "示例法务审批", actor: "示例法务" },
  ].entries()) {
    const messageId = "condition-authority:swallowed-stage:" + index;
    const text = "安全影响为是时走安全评审。" + entry.unit;
    const symbols = conditionAuthoritySymbols({
      caseId: "swallowed-stage:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 300 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 301 + index * 2,
          kind: "stage",
          slot: "conditions_exceptions",
          messageId,
          text,
          anchorQuote: entry.unit,
          leaves: [
            { role: "label", quote: entry.actor },
            { role: "kind", quote: "审批", hint: "approval" },
            { role: "participant", quote: entry.actor },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(300 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "stage swallow " + index);
    assert.equal(target?.semanticComplete, false, "stage swallow " + index);
  }

  const remoteId = "condition-authority:remote-neighbor";
  const remoteText = "成本增加超过一百万元走额外审批";
  const remoteNeighbor = located({
    itemIndex: 22,
    kind: "condition",
    messageId: remoteId,
    text: remoteText,
    leaves: [
      { role: "field", quote: "成本增加" },
      { role: "operator", quote: "超过", hint: ">" },
      { role: "value", quote: "一百万元" },
      {
        role: "matching_route",
        quote: "额外审批",
        hint: "stage_reference",
      },
    ],
  });
  const remoteResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [baseId]: baseText,
      [remoteId]: remoteText,
      ...baseSymbols.sourceMessages,
    },
    items: [...baseSymbols.items, split, remoteNeighbor],
  });
  const remoteSplit = remoteResult.review.items.find((item) =>
    item.providerItemIndexes.includes(20)
  );
  assert.equal(remoteSplit?.value.operator, undefined);
  assert.equal(remoteSplit?.semanticComplete, false);

  const connectorId = "condition-authority:connector";
  const connectorText =
    "安全影响为是时走安全评审。且成本增加超过一百万元走额外审批";
  const connectorSymbols = conditionAuthoritySymbols({
    caseId: "connector",
    field: "安全影响",
    route: "安全评审",
  });
  const connectorResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [connectorId]: connectorText,
      ...connectorSymbols.sourceMessages,
    },
    items: [
      ...connectorSymbols.items,
      located({
        itemIndex: 23,
        kind: "condition",
        messageId: connectorId,
        text: connectorText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 24,
        kind: "condition",
        messageId: connectorId,
        text: connectorText,
        anchorQuote: "且成本增加超过一百万元走额外审批",
        leaves: [
          { role: "field", quote: "成本增加" },
          { role: "operator", quote: "超过", hint: ">" },
          { role: "value", quote: "一百万元" },
          {
            role: "matching_route",
            quote: "额外审批",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const connectorSplit = connectorResult.review.items.find((item) =>
    item.providerItemIndexes.includes(23)
  );
  assert.equal(connectorSplit?.value.operator, undefined);
  assert.equal(connectorSplit?.semanticComplete, false);

  const circularId = "condition-authority:circular";
  const circularText =
    "安全影响为是时走安全评审。客户名称为是时增加客户经理。成本增加超过一百万元走额外审批";
  const circularFirstSymbols = conditionAuthoritySymbols({
    caseId: "circular:first",
    field: "安全影响",
    route: "安全评审",
  });
  const circularSecondSymbols = conditionAuthoritySymbols({
    caseId: "circular:second",
    field: "客户名称",
    route: "客户经理",
    itemIndexBase: 900_010,
  });
  const circularResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [circularId]: circularText,
      ...circularFirstSymbols.sourceMessages,
      ...circularSecondSymbols.sourceMessages,
    },
    items: [
      ...circularFirstSymbols.items,
      ...circularSecondSymbols.items,
      located({
        itemIndex: 25,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是", occurrence: 0 },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 26,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          { role: "operator", quote: "为", hint: "=", occurrence: 1 },
          { role: "value", quote: "是", occurrence: 1 },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 27,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "成本增加超过一百万元走额外审批",
        leaves: [
          { role: "field", quote: "成本增加" },
          { role: "operator", quote: "超过", hint: ">" },
          { role: "value", quote: "一百万元" },
          {
            role: "matching_route",
            quote: "额外审批",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  for (const itemIndex of [25, 26]) {
    const item = circularResult.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.equal(item?.value.operator, undefined, "circular " + itemIndex);
    assert.equal(item?.semanticComplete, false, "circular " + itemIndex);
  }

  const disguisedId = "condition-authority:disguised-circular";
  const disguisedText =
    "安全影响为是时走安全评审。客户名称为是时增加客户经理";
  const disguisedSymbols = conditionAuthoritySymbols({
    caseId: "disguised-circular",
    field: "安全影响",
    route: "安全评审",
  });
  const disguisedResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [disguisedId]: disguisedText,
      ...disguisedSymbols.sourceMessages,
    },
    items: [
      ...disguisedSymbols.items,
      located({
        itemIndex: 80,
        kind: "condition",
        messageId: disguisedId,
        text: disguisedText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是", occurrence: 0 },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 81,
        kind: "condition",
        messageId: disguisedId,
        text: disguisedText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          {
            role: "operator",
            quote: "为",
            hint: "unsupported_predicate",
            occurrence: 1,
          },
          { role: "value", quote: "是", occurrence: 1 },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const disguisedTarget = disguisedResult.review.items.find((item) =>
    item.providerItemIndexes.includes(80)
  );
  assert.equal(disguisedTarget?.value.operator, undefined);
  assert.equal(disguisedTarget?.semanticComplete, false);
});

test("treats a blank line as an authority block boundary", () => {
  const messageId = "condition-authority:blank-block";
  const text =
    "任意非权威说明\n\n安全影响为是时安全评审必须阻塞流程";
  const symbols = conditionAuthoritySymbols({
    caseId: "blank-block",
    field: "安全影响",
    route: "安全评审",
  });
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [messageId]: text,
      ...symbols.sourceMessages,
    },
    items: [
      ...symbols.items,
      located({
        itemIndex: 30,
        kind: "condition",
        messageId,
        text,
        anchorQuote: "安全影响为是时安全评审必须阻塞流程",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const item = result.review.items.find((candidate) =>
    candidate.providerItemIndexes.includes(30)
  );
  assert.equal(item?.value.operator, "=");
  assert.equal(item?.semanticComplete, true);
});


test("keeps semantic aliases closed and advisory hints non-authoritative", () => {
  const cases = [
    { kind: "request_field", text: "purpose prerequisite", leaves: [
      { role: "label", quote: "purpose" }, { role: "required", quote: "prerequisite", hint: "true" },
    ] },
    { kind: "attachment", text: "photographic evidence required", leaves: [
      { role: "label", quote: "evidence" }, { role: "kind", quote: "photographic", hint: "attachment" }, { role: "required", quote: "required", hint: "true" },
    ] },
    { kind: "stage", text: "Finance previews requester", leaves: [
      { role: "label", quote: "Finance" }, { role: "kind", quote: "previews", hint: "review" }, { role: "participant_mode", quote: "requester", hint: "requester" },
    ] },
    { kind: "condition", text: "turnover 100 routes to Finance", leaves: [
      { role: "field", quote: "turnover" }, { role: "operator", quote: "turnover", hint: ">" }, { role: "value", quote: "100" }, { role: "matching_route", quote: "Finance", hint: "stage_reference" },
    ] },
    { kind: "notification", text: "team reassignment", leaves: [
      { role: "recipient", quote: "team", hint: "source_named_group" }, { role: "event", quote: "reassignment", hint: "stage_assigned" },
    ] },
    { kind: "condition", text: "status is Yes routes to Finance", leaves: [
      { role: "field", quote: "status" }, { role: "operator", quote: "is", hint: "=" }, { role: "value", quote: "Yes" }, { role: "matching_route", quote: "Finance", hint: "stage_reference" },
    ] },
    { kind: "condition", text: "申報有利益衝突增加審批", leaves: [
      { role: "field", quote: "利益衝突" }, { role: "operator", quote: "有", hint: "=" }, { role: "value", quote: "利益衝突" }, { role: "matching_route", quote: "審批", hint: "stage_reference" },
    ] },
    { kind: "condition", text: "状态是高时增加审批", leaves: [
      { role: "field", quote: "状态" }, { role: "operator", quote: "是", hint: "=" }, { role: "value", quote: "高" }, { role: "matching_route", quote: "审批", hint: "stage_reference" },
    ] },
  ];
  const sourceMessages = Object.fromEntries(cases.map((entry, index) => [`closed:${index}`, entry.text]));
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) => located({ itemIndex, messageId: `closed:${itemIndex}`, ...entry })),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.ok(result.review.items.every((entry) => entry.semanticComplete === false));
});

test("blocks no-need-to-upload wording in all supported locales without leaking open fragments", () => {
  const cases = [
    {
      caseId: "EN",
      text: "No need to upload the passport page.",
      label: "passport page",
      action: "upload",
    },
    {
      caseId: "zh-Hant",
      text: "無需上載護照資料頁。",
      label: "護照資料頁",
      action: "上載",
    },
    {
      caseId: "zh-Hans",
      text: "无需上传护照资料页。",
      label: "护照资料页",
      action: "上传",
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`no-upload:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "attachment",
        messageId: `no-upload:${entry.caseId}`,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: entry.action, hint: "attachment" },
          { role: "required", quote: entry.action, hint: "true" },
        ],
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
  }
});

test("treats semicolons as entity boundaries while preserving an adjacent standalone field marker", () => {
  const splicedId = "message-field-semicolon-spliced-001";
  const splicedText = "Field A is optional; Field B is required";
  const spliced = assembleTemplateCopilotV3Review({
    sourceMessages: { [splicedId]: splicedText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: splicedId,
      text: splicedText,
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  assert.equal(spliced.review.items[0]?.semanticComplete, false);
  assert.equal(spliced.review.items[0]?.complete, false);
  assert.equal(spliced.review.items[0]?.fragmentId, null);
  assert.equal(spliced.envelope.fragments.length, 0);

  const structuredId = "message-field-semicolon-structured-001";
  const structuredText = "Field: Field A; required; text";
  const structured = assembleTemplateCopilotV3Review({
    sourceMessages: { [structuredId]: structuredText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: structuredId,
      text: structuredText,
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
        { role: "type", quote: "text", hint: "text" },
      ],
    })],
  });
  assert.equal(structured.review.items[0]?.semanticComplete, true);
  assert.equal(structured.review.items[0]?.fragmentId !== null, true);
  assert.equal(structured.envelope.fragments.length, 1);
});

test("suppresses every open fragment for provider ambiguity and source conflicts", () => {
  const conflictId = "message-field-fragment-conflict-001";
  const conflictText = "Purpose may be optional or required";
  const ambiguousId = "message-field-fragment-ambiguous-001";
  const ambiguousText = "Amount is required";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [conflictId]: conflictText,
      [ambiguousId]: ambiguousText,
    },
    items: [
      located({
        itemIndex: 0,
        kind: "request_field",
        messageId: conflictId,
        text: conflictText,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "optional", hint: "false" },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "request_field",
        messageId: conflictId,
        text: conflictText,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "request_field",
        messageId: ambiguousId,
        text: ambiguousText,
        ambiguity: "possible",
        leaves: [
          { role: "label", quote: "Amount" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
    ],
  });

  assert.equal(result.review.conflicts.length, 1);
  assert.equal(result.review.items.length, 3);
  assert.equal(result.envelope.fragments.length, 0);
  assert.ok(
    result.review.items.every(
      (item) =>
        item.semanticComplete === false &&
        item.complete === false &&
        item.fragmentId === null,
    ),
  );
});

test("detects semantic-only stage-kind alternatives as a conflict and emits no fragments", () => {
  const messageId = "message-stage-semantic-kind-conflict-001";
  const text = "Finance Review approves requester and audits requester";
  const common = {
    kind: "stage",
    messageId,
    text,
  };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [
      located({
        itemIndex: 0,
        ...common,
        leaves: [
          { role: "label", quote: "Finance Review" },
          { role: "kind", quote: "approves", hint: "approval" },
          { role: "participant_mode", quote: "requester", hint: "requester" },
        ],
      }),
      located({
        itemIndex: 1,
        ...common,
        leaves: [
          { role: "label", quote: "Finance Review" },
          { role: "kind", quote: "audits", hint: "review" },
          {
            role: "participant_mode",
            quote: "requester",
            occurrence: 1,
            hint: "requester",
          },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(result.review.conflicts.length, 1);
  assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
  assert.equal(result.envelope.fragments.length, 0);
  assert.ok(result.review.items.every((item) => item.value.kind === undefined));
  assert.ok(
    result.review.items.every(
      (item) =>
        item.semanticComplete === false &&
        item.complete === false &&
        item.fragmentId === null &&
        item.ambiguity === "ambiguous",
    ),
  );
});

test("rejects role-specific cross-entity splicing for every governed core item kind", () => {
  const cases = [
    {
      caseId: "request-field",
      kind: "request_field",
      text: "Field A is optional; Field B is required",
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      caseId: "attachment",
      kind: "attachment",
      text: "Invoice PDF is listed. Passport upload is required.",
      leaves: [
        { role: "label", quote: "Invoice" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      caseId: "stage",
      kind: "stage",
      text: "Finance Review uses Finance team. Legal approves.",
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "participant", quote: "Finance team" },
        { role: "kind", quote: "approves", hint: "approval" },
      ],
    },
    {
      caseId: "condition",
      kind: "condition",
      text: "Amount exceeds the threshold. Budget is 100. Route to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
    },
    {
      caseId: "notification",
      kind: "notification",
      text: "Requester is listed. Completion sends an email.",
      leaves: [
        { role: "recipient", quote: "Requester", hint: "requester" },
        { role: "event", quote: "Completion", hint: "request_completed" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`cross-entity:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `cross-entity:${entry.caseId}`,
        ...entry,
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
  }
});

test("requires an exact entity phrase for supplemental attachment requirements", () => {
  const cases = [
    {
      caseId: "sibling-en",
      text: "Receipt PDF. The receipt log is required.",
      label: "Receipt",
      required: "required",
      expectedSemanticComplete: false,
    },
    {
      caseId: "exact-en",
      text: "Receipt PDF. Receipt is required.",
      label: "Receipt",
      required: "required",
      expectedSemanticComplete: true,
    },
    {
      caseId: "sibling-tc",
      text: "收據 PDF。收據記錄為必須。",
      label: "收據",
      required: "必須",
      expectedSemanticComplete: false,
    },
    {
      caseId: "exact-sc",
      text: "收据 PDF。收据是必须。",
      label: "收据",
      required: "必须",
      expectedSemanticComplete: true,
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [entry.caseId, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    sourceMessageOrder: cases.map((entry) => entry.caseId),
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "attachment",
        messageId: entry.caseId,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: entry.required, hint: "true" },
        ],
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(
    result.envelope.fragments.length,
    cases.filter((entry) => entry.expectedSemanticComplete).length,
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(
      item.semanticComplete,
      entry.expectedSemanticComplete,
      entry.caseId,
    );
    assert.equal(item.complete, false, entry.caseId);
    if (entry.expectedSemanticComplete) {
      assert.ok(item.fragmentId, entry.caseId);
    } else {
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("blocks English do-not-need-to-upload attachment semantics without weakening optional attachments or negative conditions", () => {
  const cases = [
    {
      caseId: "does-not-need",
      kind: "attachment",
      text: "The requester does not need to upload the Receipt PDF.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
      expectedSemanticComplete: false,
    },
    {
      caseId: "do-not-need",
      kind: "attachment",
      text: "Requesters do not need to upload the Receipt PDF.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
      expectedSemanticComplete: false,
    },
    {
      caseId: "optional",
      kind: "attachment",
      text: "The Receipt PDF is optional.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" },
      ],
      expectedSemanticComplete: true,
    },
    {
      caseId: "negative-condition",
      kind: "condition",
      text: "amount does not exceed 100 routes to Finance",
      leaves: [
        { role: "field", quote: "amount" },
        { role: "operator", quote: "does not exceed", hint: "<=" },
        { role: "value", quote: "100" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
      expectedSemanticComplete: true,
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [entry.caseId, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    sourceMessageOrder: cases.map((entry) => entry.caseId),
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: entry.caseId,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(
    result.envelope.fragments.length,
    cases.filter((entry) => entry.expectedSemanticComplete).length,
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(
      item.semanticComplete,
      entry.expectedSemanticComplete,
      entry.caseId,
    );
    assert.equal(item.complete, false, entry.caseId);
    if (entry.expectedSemanticComplete) {
      assert.ok(item.fragmentId, entry.caseId);
    } else {
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("blocks condition routes spliced from unrelated clauses", () => {
  const cases = [
    {
      caseId: "independent-predicate",
      text:
        "Amount exceeds 100 routes to Finance; Country equals US routes to Legal.",
      route: "Legal",
    },
    {
      caseId: "unrelated-statement",
      text:
        "Amount exceeds 100. Country policy sends the file to Legal approval.",
      route: "Legal",
    },
    {
      caseId: "same-hard-cross-predicate",
      text:
        "Amount exceeds 100 routes to Finance, if Country equals US routes to Legal.",
      route: "Legal",
    },
  ];
  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `message-condition-route-affinity-${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "condition",
        messageId,
        text: entry.text,
        leaves: [
          { role: "field", quote: "Amount" },
          { role: "operator", quote: "exceeds", hint: ">" },
          { role: "value", quote: "100" },
          {
            role: "matching_route",
            quote: entry.route,
            hint: "stage_reference",
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(result.envelope.fragments.length, 0, entry.caseId);
  }
});

test("blocks otherwise routes from unrelated lexical default entities", () => {
  const messageId = "message-condition-otherwise-entity-affinity-001";
  const text =
    "Amount exceeds 100 routes to Finance. Other countries route to Legal.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a delayed unrelated outcome from completing a decision branch", () => {
  const messageId = "message-condition-decision-delayed-outcome-001";
  const text =
    "Amount exceeds 100. If either Finance approver rejects the invitation, unrelated HR policy returns applications for correction.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance approver",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a lexical default from a different high-risk entity", () => {
  const messageId = "message-condition-default-high-risk-entity-001";
  const text =
    "High-risk expenses exceed 100 routes to Finance. Normal visits route to Legal.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "High-risk expenses" },
        { role: "operator", quote: "exceed", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks participant decision wording without a workflow outcome", () => {
  const messageId = "message-condition-decision-no-outcome-001";
  const text =
    "Amount exceeds 100. If either Finance approver rejects the invitation.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance approver",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("keeps source-bound condition route forms valid", () => {
  const cases = [
    {
      caseId: "same-clause",
      text: "Amount exceeds 100 routes to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "route-only",
      text: "Amount exceeds 100. Route to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "route-first-conditional",
      text:
        "Data Protection is required only when personal-data choice is Yes.",
      leaves: [
        { role: "field", quote: "personal-data choice" },
        { role: "operator", quote: "is Yes", hint: "=" },
        { role: "value", quote: "Yes" },
        {
          role: "matching_route",
          quote: "Data Protection",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "decision-subject",
      text:
        "Use total amount at least 50,000 as the high-value branch. If either high-value approver rejects, return for correction.",
      leaves: [
        { role: "field", quote: "total amount" },
        { role: "operator", quote: "at least", hint: ">=" },
        { role: "value", quote: "50,000" },
        {
          role: "matching_route",
          quote: "high-value approver",
          hint: "stage_reference",
        },
      ],
      blockingReason: "unsupported_semantics_not_executable",
    },
    {
      caseId: "explicit-default",
      text:
        "Amount exceeds 100 routes to Finance. Otherwise route to Legal.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "matching-only-threshold-branch",
      text:
        "If amount is at most 100, route to Manager; Above 100 route to CEO.",
      leaves: [
        { role: "field", quote: "amount" },
        { role: "operator", quote: "Above", hint: ">" },
        { role: "value", quote: "100", occurrence: 1 },
        {
          role: "matching_route",
          quote: "CEO",
          hint: "stage_reference",
        },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`condition-route-affinity:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "condition",
        messageId: `condition-route-affinity:${entry.caseId}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });
  assert.equal(
    result.review.items.length,
    cases.length,
    JSON.stringify(result.review.rejections),
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(
      item,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      item.semanticComplete,
      expectedBlockingReason === null,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    assert.equal(
      item.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
    if (expectedBlockingReason !== null) {
      assert.equal(item.complete, false, entry.caseId);
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("holds conditional attachments while retaining ordinary supplemental requirements and condition routes", () => {
  const receiptId = "message-attachment-entity-local-001";
  const receiptText =
    "The receipt document is required when the optional comments field is used";
  const conditionalId = "message-attachment-conditional-001";
  const conditionalText =
    "If the missing-receipt box is selected, require a native declaration form";
  const supplementalId = "message-attachment-supplemental-001";
  const supplementalText = "Receipt PDF. The receipt is required.";
  const conditionId = "message-condition-supplemental-route-001";
  const conditionText = "Amount exceeds 100. Matching requests route to Finance.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [receiptId]: receiptText,
      [conditionalId]: conditionalText,
      [supplementalId]: supplementalText,
      [conditionId]: conditionText,
    },
    items: [
      located({
        itemIndex: 0,
        kind: "attachment",
        messageId: receiptId,
        text: receiptText,
        leaves: [
          { role: "label", quote: "receipt document" },
          { role: "kind", quote: "document", hint: "attachment" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "attachment",
        messageId: conditionalId,
        text: conditionalText,
        leaves: [
          { role: "label", quote: "declaration form" },
          { role: "kind", quote: "native", hint: "form" },
          { role: "required", quote: "require", hint: "true" },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "attachment",
        messageId: supplementalId,
        text: supplementalText,
        leaves: [
          { role: "label", quote: "Receipt" },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 3,
        kind: "condition",
        messageId: conditionId,
        text: conditionText,
        leaves: [
          { role: "field", quote: "Amount" },
          { role: "operator", quote: "exceeds", hint: ">" },
          { role: "value", quote: "100" },
          { role: "matching_route", quote: "Finance", hint: "stage_reference" },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 4, JSON.stringify(result.review.rejections));
  const itemByProviderIndex = (itemIndex) =>
    result.review.items.find((item) =>
      item.providerItemIndexes.includes(itemIndex)
    );
  for (const itemIndex of [0, 1]) {
    const item = itemByProviderIndex(itemIndex);
    assert.ok(item, `conditional:${itemIndex}`);
    assert.equal(item.semanticComplete, false, `conditional:${itemIndex}`);
    assert.equal(
      item.blockingReason,
      "unsupported_semantics_not_executable",
      `conditional:${itemIndex}`,
    );
    assert.equal(item.fragmentId, null, `conditional:${itemIndex}`);
  }
  for (const itemIndex of [2, 3]) {
    const item = itemByProviderIndex(itemIndex);
    assert.ok(item, `retained:${itemIndex}`);
    assert.equal(item.semanticComplete, true, `retained:${itemIndex}`);
    assert.equal(item.blockingReason, undefined, `retained:${itemIndex}`);
  }
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
  assert.equal(result.envelope.fragments.length, 2);
});

test("keeps a Chinese route-only stage entity intact when its name begins with the character for local", () => {
  const messageId = "message-stage-local-compliance-001";
  const text = "若目标地区不是香港，增加当地合规审查";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "当地合规" },
        { role: "participant", quote: "当地合规" },
        { role: "kind", quote: "审查", hint: "review" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, true);
  assert.deepEqual(item.semanticValue.participant, ["当地合规"]);
  assert.deepEqual(item.semanticValue.kind, ["审查"]);
});

test("keeps a Traditional Chinese local stage entity intact", () => {
  const messageId = "message-stage-local-compliance-traditional-001";
  const text = "若目標地區不是香港，增加當地合規審查";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "當地合規" },
        { role: "participant", quote: "當地合規" },
        { role: "kind", quote: "審查", hint: "review" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, true);
  assert.deepEqual(item.semanticValue.participant, ["當地合規"]);
  assert.deepEqual(item.semanticValue.kind, ["審查"]);
});

test("keeps Chinese legitimate-process stage compounds intact", () => {
  const cases = [
    {
      caseId: "traditional",
      text: "正當程序團隊審查申請",
      participant: "正當程序團隊",
      kind: "審查",
    },
    {
      caseId: "simplified",
      text: "正当程序团队审查申请",
      participant: "正当程序团队",
      kind: "审查",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `message-stage-due-process-${entry.caseId}-001`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "stage",
        messageId,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.participant },
          { role: "participant", quote: entry.participant },
          { role: "kind", quote: entry.kind, hint: "review" },
        ],
      })],
    });

    const item = result.review.items[0];
    assert.ok(item, `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.deepEqual(item.semanticValue.participant, [entry.participant]);
    assert.deepEqual(item.semanticValue.kind, [entry.kind]);
  }
});

test("blocks a Traditional Chinese notification event-recipient splice at 當", () => {
  const messageId = "message-notification-traditional-when-splice-001";
  const text = "申請已提交時通知財務，當申請被拒絕時通知申請人";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "notification",
      messageId,
      text,
      leaves: [
        { role: "event", quote: "申請已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a Simplified Chinese notification event-recipient splice at 当", () => {
  const messageId = "message-notification-simplified-when-splice-001";
  const text = "申请已提交时通知财务，当申请被拒绝时通知申请人";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "notification",
      messageId,
      text,
      leaves: [
        { role: "event", quote: "申请已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申请人", hint: "requester" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("allows only exact-field or bounded operator-led threshold carry-forward", () => {
  const englishId = "message-condition-carry-en-001";
  const englishText =
    "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval.";
  const traditionalId = "message-condition-carry-tc-001";
  const traditionalText =
    "若申報金額與核實金額差異超過百分之五，退回確認。若核實金額超過港幣五百萬元，增加財務總監批准。";
  const simplifiedId = "message-condition-carry-sc-001";
  const simplifiedText =
    "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。";
  const localRiskId = "message-condition-carry-sc-002";
  const localRiskText =
    "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。";
  const sourceMessages = {
    [englishId]: englishText,
    [traditionalId]: traditionalText,
    [simplifiedId]: simplifiedText,
    [localRiskId]: localRiskText,
  };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: [
      located({
        itemIndex: 0,
        kind: "condition",
        messageId: englishId,
        text: englishText,
        leaves: [
          { role: "field", quote: "amount" },
          { role: "operator", quote: "Above", hint: ">" },
          { role: "value", quote: "HKD 100,000", occurrence: 1 },
          {
            role: "matching_route",
            quote: "CEO approval",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "condition",
        messageId: traditionalId,
        text: traditionalText,
        leaves: [
          { role: "field", quote: "核實金額", occurrence: 1 },
          { role: "operator", quote: "超過", occurrence: 1, hint: ">" },
          { role: "value", quote: "五百萬元" },
          {
            role: "matching_route",
            quote: "財務總監批准",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "condition",
        messageId: simplifiedId,
        text: simplifiedText,
        leaves: [
          { role: "field", quote: "申请额度" },
          { role: "operator", quote: "超过", occurrence: 2, hint: ">" },
          { role: "value", quote: "五百万元" },
          {
            role: "matching_route",
            quote: "行政总裁批准",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 3,
        kind: "condition",
        messageId: localRiskId,
        text: localRiskText,
        leaves: [
          { role: "field", quote: "总额" },
          { role: "operator", quote: "超过", occurrence: 1, hint: ">" },
          { role: "value", quote: "二万元", occurrence: 1 },
          {
            role: "matching_route",
            quote: "部门主管",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 4, JSON.stringify(result.review.rejections));
  for (const itemIndex of [0, 1, 2, 3]) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, `carry-forward:${itemIndex}`);
    assert.equal(
      item.semanticComplete,
      true,
      `carry-forward:${itemIndex}:${item.blockingReason ?? "unblocked"}:${JSON.stringify(result.review.rejections)}`,
    );
  }
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
});

test("direct assembly rejects malformed carried thresholds and invented otherwise routes", () => {
  const cases = [
    {
      caseId: "extra-first-subject",
      text:
        "申请额度不超过港币一百万元且国家额度超过二百万元由财务经理批准。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-first-policy",
      text:
        "申请额度不超过港币一百万元且国家政策已更新由财务经理批准。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-middle-comparison",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且超过二百万元由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 3,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "extra-middle-subject",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家额度超过二百万元由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 3,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "extra-target-tier-1-predicate",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家风险也低时由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-target-tier-2-predicate",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元且国家风险也低时再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "overbroad-value",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。",
      field: "申请额度",
      operator: "不超过",
      operatorHint: "<=",
      value: "一百万元且风险低时可在",
      route: "财务经理批准后完成",
    },
    {
      caseId: "overbroad-route",
      text:
        "申请额度超过港币一百万元由国家风险也低时由财务经理批准。",
      field: "申请额度",
      operator: "超过",
      value: "一百万元",
      route: "国家风险也低时由财务经理批准",
    },
    {
      caseId: "missing-tier-continuation",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "audit-gap",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；保留审计记录；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "reporting-tail",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准被记录。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "duplicate-target-operator",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过且超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "duplicate-target-value",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元和五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "numeric-prefix",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过一千五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "invented-otherwise-sc04",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
      otherwise: "财务经理批准后完成",
    },
    {
      caseId: "invented-otherwise-sc07",
      text:
        "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。",
      field: "总额",
      operator: "超过",
      operatorOccurrence: 1,
      value: "二万元",
      valueOccurrence: 1,
      route: "部门主管",
      otherwise: "财务后完成",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `condition-carry-attack:${entry.caseId}`;
    const leaves = [
      { role: "field", quote: entry.field },
      {
        role: "operator",
        quote: entry.operator,
        occurrence: entry.operatorOccurrence,
        hint: entry.operatorHint ?? ">",
      },
      {
        role: "value",
        quote: entry.value,
        occurrence: entry.valueOccurrence ?? 0,
      },
      {
        role: "matching_route",
        quote: entry.route,
        hint: "stage_reference",
      },
      ...(
        entry.otherwise
          ? [{
            role: "otherwise_route",
            quote: entry.otherwise,
            hint: "stage_reference",
          }]
          : []
      ),
    ];
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "condition",
        messageId,
        text: entry.text,
        leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(
      item,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(result.envelope.fragments.length, 0, entry.caseId);
  }
});

test("does not carry a threshold field into a clause that names a different entity", () => {
  const messageId = "message-condition-carry-adversarial-001";
  const text =
    "Amount is above 10. Budget exceeds 100 and routes to Finance.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("retains only closed non-executable provider hints as semantic observations", () => {
  const cases = [
    {
      kind: "attachment",
      text: "Conditional document uploaded file when needed",
      leaves: [
        { role: "label", quote: "Conditional document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        { role: "required", quote: "when needed", hint: "conditional" },
      ],
    },
    {
      kind: "attachment",
      text: "Extended document uploaded file required with more proof for high risk",
      leaves: [
        { role: "label", quote: "Extended document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        {
          role: "required",
          quote: "required with more proof for high risk",
          hint: "required_with_conditional_extension",
        },
      ],
    },
    {
      kind: "attachment",
      text: "Optional document uploaded file optional for ordinary requests",
      leaves: [
        { role: "label", quote: "Optional document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        {
          role: "required",
          quote: "optional for ordinary requests",
          hint: "optional_conditional",
        },
      ],
    },
    {
      kind: "condition",
      text: "High risk or overseas routes to Legal Review",
      leaves: [
        { role: "field", quote: "High risk or overseas" },
        {
          role: "operator",
          quote: "High risk or overseas",
          hint: "unsupported_predicate",
        },
        { role: "value", quote: "High risk" },
        {
          role: "matching_route",
          quote: "Legal Review",
          hint: "stage_reference",
        },
      ],
    },
    {
      kind: "condition",
      text: "Amount equals 10 adds executive review otherwise adds board review",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "equals", hint: "=" },
        { role: "value", quote: "10" },
        {
          role: "matching_route",
          quote: "executive review",
          hint: "unsupported_outcome",
        },
        {
          role: "otherwise_route",
          quote: "board review",
          hint: "unsupported_outcome",
        },
      ],
    },
    {
      kind: "notification",
      text: "Request submitted notifies Finance Team recipients only",
      leaves: [
        {
          role: "event",
          quote: "Request submitted",
          hint: "request_submitted",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "recipients only",
          hint: "recipients_only",
        },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry, index) => [`semantic-only:${index}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: `semantic-only:${itemIndex}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length, JSON.stringify(result.review.rejections));
  assert.equal(
    result.review.rejections.filter((entry) => entry.code === "unverifiable_leaf").length,
    0,
    JSON.stringify(result.review.rejections),
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, `${itemIndex}: ${JSON.stringify(result.review.rejections)}`);
    for (const leaf of entry.leaves.filter((candidate) =>
      [
        "conditional",
        "required_with_conditional_extension",
        "optional_conditional",
        "unsupported_predicate",
        "unsupported_outcome",
        "source_named_group",
      ].includes(candidate.hint)
    )) {
      assert.ok(
        item.semanticObservations.some((observation) =>
          observation.role === leaf.role &&
          observation.advisoryHint === leaf.hint &&
          observation.quote === leaf.quote
        ),
        `${itemIndex}:${leaf.role}:${leaf.hint}`,
      );
    }
  }
});

test("keeps ordinary required, kind, event, and stage leaves fail closed", () => {
  const cases = [
    {
      kind: "request_field",
      detail: "request_field:required",
      text: "Bad field sometimes",
      leaves: [
        { role: "label", quote: "Bad field" },
        { role: "required", quote: "sometimes", hint: "true" },
      ],
    },
    {
      kind: "attachment",
      detail: "attachment:required",
      text: "Bad requirement uploaded file sometimes",
      leaves: [
        { role: "label", quote: "Bad requirement" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        { role: "required", quote: "sometimes", hint: "true" },
      ],
    },
    {
      kind: "stage",
      detail: "stage:kind",
      text: "Finance mystery",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "mystery", hint: "review" },
        { role: "participant", quote: "Finance" },
      ],
    },
    {
      kind: "stage",
      detail: "stage:sequence",
      text: "Finance review then",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "review", hint: "review" },
        { role: "participant", quote: "Finance" },
        { role: "sequence", quote: "then" },
      ],
    },
    {
      kind: "condition",
      detail: "condition:operator",
      text: "Amount approximately 10 routes to Finance",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "approximately", hint: "=" },
        { role: "value", quote: "10" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
    },
    {
      kind: "condition",
      detail: "condition:matching_route",
      text: "Amount equals 10 does nothing",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "equals", hint: "=" },
        { role: "value", quote: "10" },
        { role: "matching_route", quote: "does nothing", hint: "complete" },
      ],
    },
    {
      kind: "attachment",
      detail: "attachment:kind",
      text: "Bad kind mystery required",
      leaves: [
        { role: "label", quote: "Bad kind" },
        { role: "kind", quote: "mystery", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      kind: "notification",
      detail: "notification:event",
      text: "Something happened Finance Team recipients only",
      leaves: [
        { role: "event", quote: "Something happened", hint: "request_submitted" },
        { role: "recipient", quote: "Finance Team", hint: "source_named_group" },
        { role: "visibility", quote: "recipients only", hint: "recipients_only" },
      ],
    },
    {
      kind: "notification",
      detail: "notification:stage",
      text: "Request submitted Finance Team recipients only Finance Review",
      leaves: [
        { role: "event", quote: "Request submitted", hint: "request_submitted" },
        { role: "recipient", quote: "Finance Team", hint: "source_named_group" },
        { role: "visibility", quote: "recipients only", hint: "recipients_only" },
        { role: "stage", quote: "Finance Review" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry, index) => [`fail-closed:${index}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: `fail-closed:${itemIndex}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  const rejectedDetails = new Set(
    result.review.rejections
      .filter((entry) => entry.code === "unverifiable_leaf")
      .map((entry) => entry.detail),
  );
  for (const entry of cases) {
    assert.ok(rejectedDetails.has(entry.detail), entry.detail);
  }
});

test("keeps exact direct semantic aliases review-only across supported locales", () => {
  const valueAtPath = (value, path) =>
    path.split("/").slice(1).reduce(
      (current, segment) =>
        current !== null && typeof current === "object"
          ? current[segment]
          : undefined,
      value,
    );
  const cases = [
    {
      caseId: "en-request-required",
      kind: "request_field",
      text: "Purpose must",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
      fallbackPaths: ["/required"],
      ordinaryPaths: ["/label"],
    },
    {
      caseId: "tc-attachment-core",
      kind: "attachment",
      text: "必須上載護照副本",
      leaves: [
        { role: "label", quote: "護照副本" },
        { role: "kind", quote: "上載", hint: "attachment" },
        { role: "required", quote: "必須上載", hint: "true" },
      ],
      fallbackPaths: ["/kind", "/required"],
      ordinaryPaths: ["/label"],
    },
    {
      caseId: "sc-attachment-core",
      kind: "attachment",
      text: "必须上传护照副本",
      leaves: [
        { role: "label", quote: "护照副本" },
        { role: "kind", quote: "上传", hint: "attachment" },
        { role: "required", quote: "必须上传", hint: "true" },
      ],
      fallbackPaths: ["/kind", "/required"],
      ordinaryPaths: ["/label"],
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `direct-review-only:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: entry.kind,
        messageId,
        text: entry.text,
        leaves: entry.leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, `${entry.caseId}:${JSON.stringify(result.review.rejections)}`);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
    assert.equal(item.defaulted, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    for (const path of entry.fallbackPaths) {
      assert.equal(
        item.bindings.some(
          (binding) =>
            binding.path === path || binding.path.startsWith(path + "/"),
        ),
        false,
        `${entry.caseId}:${path}:binding`,
      );
      assert.equal(
        valueAtPath(item.value, path),
        undefined,
        `${entry.caseId}:${path}:value`,
      );
    }
    if (entry.ordinaryPaths.length === 0) {
      assert.equal(item.fragmentId, null, entry.caseId);
      assert.deepEqual(result.envelope.fragments, [], entry.caseId);
    } else {
      assert.ok(item.fragmentId, entry.caseId);
      const fragment = result.envelope.fragments.find(
        (candidate) => candidate.fragmentId === item.fragmentId,
      );
      assert.ok(fragment, entry.caseId);
      assert.deepEqual(
        fragment.bindings.map((binding) => binding.path).sort(),
        [...entry.ordinaryPaths].sort(),
        `${entry.caseId}:ordinary-fragment-bindings`,
      );
      for (const path of entry.fallbackPaths) {
        assert.equal(
          fragment.bindings.some(
            (binding) =>
              binding.path === path || binding.path.startsWith(path + "/"),
          ),
          false,
          `${entry.caseId}:${path}:fragment-binding`,
        );
        assert.equal(
          valueAtPath(fragment.value, path),
          undefined,
          `${entry.caseId}:${path}:fragment-value`,
        );
      }
    }
    assert.deepEqual(result.review.rejections, [], entry.caseId);
  }
});

test("keeps ordinarily derivable direct core leaves on the binding path", () => {
  const cases = [
    {
      caseId: "request",
      kind: "request_field",
      text: "Amount required",
      leaves: [
        { role: "label", quote: "Amount" },
        { role: "required", quote: "required", hint: "true" },
      ],
      boundPaths: ["/required"],
    },
    {
      caseId: "attachment",
      kind: "attachment",
      text: "Contract PDF required",
      leaves: [
        { role: "label", quote: "Contract" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" },
      ],
      boundPaths: ["/kind", "/required"],
    },
    {
      caseId: "stage",
      kind: "stage",
      text: "財務審批申請人",
      leaves: [
        { role: "label", quote: "財務" },
        { role: "kind", quote: "審批", hint: "approval" },
        { role: "participant_mode", quote: "申請人", hint: "requester" },
      ],
      boundPaths: ["/kind", "/participant/mode"],
    },
    {
      caseId: "notification",
      kind: "notification",
      text: "申請已提交時通知申請人",
      leaves: [
        { role: "event", quote: "申請已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
      boundPaths: ["/event", "/recipients/0"],
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `direct-binding-control:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: entry.kind,
        messageId,
        text: entry.text,
        leaves: entry.leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    for (const path of entry.boundPaths) {
      assert.ok(
        item.bindings.some((binding) => binding.path === path),
        `${entry.caseId}:${path}`,
      );
    }
  }
});

test("direct notification fallback is atomic for conditional, adversative, not-only, and competing-recipient clauses", () => {
  const cases = [
    {
      caseId: "conditional",
      text: "If rejected, notify requester.",
      event: "rejected",
      eventHint: "request_rejected",
      recipient: "requester",
      recipientHint: "requester",
    },
    {
      caseId: "adversative",
      text: "Rejection notifies Finance, but Legal receives completion.",
      event: "Rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "EN-not-only",
      text: "Rejection not only notifies Finance.",
      event: "Rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-not-only-zhi",
      text: "拒絕不只通知財務部。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-not-only-jin",
      text: "拒絕不僅通知財務部。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-not-merely",
      text: "拒絕非僅通知財務部。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "SC-not-only",
      text: "拒绝不仅通知财务部。",
      event: "拒绝",
      eventHint: "request_rejected",
      recipient: "财务部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "SC-not-merely",
      text: "拒绝非仅通知财务部。",
      event: "拒绝",
      eventHint: "request_rejected",
      recipient: "财务部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "arbitrary-named-competing-recipient",
      text: "Notify Finance for rejection and Legal for completion.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "generic-plural-competing-recipient",
      text: "Notify only Finance Team and recipients for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance Team",
      recipientHint: "source_named_group",
      visibility: "only",
    },
    {
      caseId: "generic-singular-competing-recipient",
      text: "Notify only Finance Team or the recipient for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance Team",
      recipientHint: "source_named_group",
      visibility: "only",
    },
    {
      caseId: "compound-selected-recipient",
      text: "Notify Finance and Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance and Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "plus-symbol-compound-selected-recipient",
      text: "Notify Finance + Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance + Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "plus-word-compound-selected-recipient",
      text: "Notify Finance plus Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance plus Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "as-well-as-compound-selected-recipient",
      text: "Notify Finance as well as Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance as well as Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "in-addition-to-compound-selected-recipient",
      text: "Notify Finance in addition to Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance in addition to Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "besides-compound-selected-recipient",
      text: "Notify Finance besides Legal for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance besides Legal",
      recipientHint: "source_named_group",
    },
    {
      caseId: "mixed-script-confusable-compound-selected-recipient",
      text: "Notify Finance аnd Legal Team for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance аnd Legal Team",
      recipientHint: "source_named_group",
    },
    {
      caseId: "same-script-confusable-compound-selected-recipient",
      text: "Notify Finance ɑnd Legal Team for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance ɑnd Legal Team",
      recipientHint: "source_named_group",
    },
    ...[
      ["latin-y", "Finance y Legal Team"],
      ["latin-et", "Finance et Legal Team"],
      ["followed-by", "Finance followed by Legal Team"],
      ["then", "Finance then Legal Team"],
      ["following", "Finance following Legal Team"],
      ["after", "Finance after Legal Team"],
      ["before", "Finance before Legal Team"],
      ["subsequently", "Finance subsequently Legal Team"],
      ["excluding", "Finance excluding Legal Team"],
      ["without", "Finance without Legal Team"],
      ["rather-than", "Finance rather than Legal Team"],
      ["instead-of", "Finance instead of Legal Team"],
      ["title-following", "Finance Following Legal Team"],
      ["title-excluding", "Finance Excluding Legal Team"],
      ["title-rather-than", "Finance Rather Than Legal Team"],
      ["accompanied-by", "Finance Accompanied By Legal Team"],
      ["joined-by", "Finance Joined By Legal Team"],
      ["not", "Finance Not Legal Team"],
      ["only", "Only Finance Team"],
      ["indefinite-article", "A Finance Team"],
      ["indefinite-an", "An Operations Team"],
      ["numeric-prefix", "12 Finance Team"],
      ["numeric-middle", "Finance 12 Team"],
      ["another", "Another Finance Team"],
      ["word-number", "Eleven Finance Team"],
      ["various", "Various Finance Team"],
      ["adjacent-domains", "Finance Legal Team"],
      ["hr-legal-adjacent-domains", "HR Legal Team"],
      ["it-finance-adjacent-domains", "IT Finance Team"],
      ["compliance-procurement-adjacent-domains", "Compliance Procurement Team"],
      ["uppercase-adjacent-domains", "FINANCE LEGAL TEAM"],
      ["risk-legal-adjacent-domains", "RISK LEGAL TEAM"],
      ["security-legal-adjacent-domains", "SECURITY LEGAL TEAM"],
      ["engineering-finance-adjacent-domains", "ENGINEERING FINANCE TEAM"],
      ["operations-legal-adjacent-domains", "OPERATIONS LEGAL TEAM"],
      ["privacy-legal-adjacent-domains", "PRIVACY LEGAL TEAM"],
      ["development-legal-adjacent-domains", "DEVELOPMENT LEGAL TEAM"],
      ["management-legal-adjacent-domains", "MANAGEMENT LEGAL TEAM"],
      ["support-legal-adjacent-domains", "SUPPORT LEGAL TEAM"],
      ["finance-compliance-adjacent-domains", "FINANCE COMPLIANCE TEAM"],
      ["corporate-legal-finance-adjacent-domains", "CORPORATE LEGAL FINANCE TEAM"],
      ["enterprise-legal-finance-adjacent-domains", "ENTERPRISE LEGAL FINANCE TEAM"],
      ["finance-security-adjacent-domains", "FINANCE SECURITY TEAM"],
      ["finance-engineering-adjacent-domains", "FINANCE ENGINEERING TEAM"],
      ["legal-marketing-adjacent-domains", "LEGAL MARKETING TEAM"],
      ["hr-security-adjacent-domains", "HR SECURITY TEAM"],
      ["procurement-marketing-adjacent-domains", "PROCUREMENT MARKETING TEAM"],
      ["legal-risk-adjacent-domains", "LEGAL RISK TEAM"],
      ["extended-risk-compliance-alias", "RISK & COMPLIANCE AND LEGAL TEAM"],
      ["extended-mergers-acquisitions-alias", "MERGERS AND ACQUISITIONS AND LEGAL TEAM"],
      ["neutral-inside-supply-chain-finance", "SUPPLY SHARED CHAIN FINANCE TEAM"],
      ["neutral-inside-financial-planning", "FINANCIAL REGIONAL PLANNING TEAM"],
      ["neutral-inside-security-operations", "SECURITY CORPORATE OPERATIONS TEAM"],
      ["neutral-after-commercial-finance", "COMMERCIAL FINANCE CORPORATE TEAM"],
      ["fullwidth-and", "Finance ａｎｄ Legal Team"],
      ["zero-width-and", "Finance a​nd Legal Team"],
      ["fused", "FinanceAndLegalTeam"],
      ["plural-teams", "Teams"],
      ["plural-departments", "Departments"],
      ["plural-groups", "Groups"],
      ["finance-plural-teams", "Finance Teams"],
      ["number-finance-plural-teams", "2 Finance Teams"],
      ["number-legal-plural-departments", "3 Legal Departments"],
      ["finance-number-plural-teams", "Finance 2 Teams"],
      ["TC-adjacent-domains", "財務法務團隊"],
      ["SC-adjacent-domains", "财务法务团队"],
      ["TC-compliance-adjacent-domains", "財務合規團隊"],
      ["SC-compliance-adjacent-domains", "财务合规团队"],
      ["TC-enterprise-legal-finance-adjacent-domains", "企業法務財務團隊"],
      ["SC-enterprise-legal-finance-adjacent-domains", "企业法务财务团队"],
      ["TC-regional-finance-legal-adjacent-domains", "亞太財務法務團隊"],
      ["SC-regional-finance-legal-adjacent-domains", "亚太财务法务团队"],
      ["TC-finance-security-adjacent-domains", "財務安全團隊"],
      ["SC-finance-security-adjacent-domains", "财务安全团队"],
      ["TC-legal-engineering-adjacent-domains", "法務工程團隊"],
      ["SC-legal-engineering-adjacent-domains", "法务工程团队"],
      ["TC-people-marketing-adjacent-domains", "人力營銷團隊"],
      ["SC-people-marketing-adjacent-domains", "人力营销团队"],
      ["TC-neutral-inside-supply-chain-finance", "供應全球鏈財務團隊"],
      ["SC-neutral-inside-supply-chain-finance", "供应全球链财务团队"],
      ["TC-neutral-inside-security-operations", "安全企業營運團隊"],
      ["SC-neutral-inside-security-operations", "安全企业运营团队"],
      ["TC-neutral-after-commercial-finance", "商務財務全球團隊"],
      ["SC-neutral-after-commercial-finance", "商务财务全球团队"],
      ["TC-risk-legal-adjacent-domains", "風險法務團隊"],
      ["SC-risk-legal-adjacent-domains", "风险法务团队"],
      ["TC-security-legal-adjacent-domains", "安全法務團隊"],
      ["SC-security-legal-adjacent-domains", "安全法务团队"],
      ["TC-final-composite-adjacent-domains", "財務法務部"],
      ["TC-review-legal-adjacent-domains", "審核法務團隊"],
      ["SC-review-legal-adjacent-domains", "审核法务团队"],
      ["TC-project-legal-adjacent-domains", "項目法務團隊"],
      ["SC-project-legal-adjacent-domains", "项目法务团队"],
      ["TC-workflow-legal-adjacent-domains", "流程法務團隊"],
      ["SC-workflow-legal-adjacent-domains", "流程法务团队"],
      ["TC-facilities-legal-adjacent-domains", "設施法務團隊"],
      ["SC-facilities-legal-adjacent-domains", "设施法务团队"],
      ["TC-records-legal-adjacent-domains", "記錄法務團隊"],
      ["SC-records-legal-adjacent-domains", "记录法务团队"],
      ["TC-change-legal-adjacent-domains", "更新法務團隊"],
      ["SC-change-legal-adjacent-domains", "更新法务团队"],
      ["TC-management-legal-adjacent-domains", "管理法務團隊"],
      ["SC-management-legal-adjacent-domains", "管理法务团队"],
      ["TC-service-legal-adjacent-domains", "服務法務團隊"],
      ["SC-service-legal-adjacent-domains", "服务法务团队"],
    ].map(([caseId, recipient]) => ({
      caseId: `${caseId}-compound-selected-recipient`,
      text: `Notify ${recipient} for rejection.`,
      event: "rejection",
      eventHint: "request_rejected",
      recipient,
      recipientHint: "source_named_group",
    })),
    {
      caseId: "event-like-named-competing-recipient",
      text: "Notify Finance and Completion for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "event-like-compound-selected-recipient",
      text: "Notify Finance and Completion for rejection.",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance and Completion",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-compound-selected-recipient",
      text: "通知財務部和法務部拒絕。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部和法務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-tung-compound-selected-recipient",
      text: "通知財務部同法務部拒絕。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部同法務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-ji-compound-selected-recipient",
      text: "通知財務部暨法務部拒絕。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部暨法務部",
      recipientHint: "source_named_group",
    },
    {
      caseId: "TC-also-have-compound-selected-recipient",
      text: "通知財務部還有法務部拒絕。",
      event: "拒絕",
      eventHint: "request_rejected",
      recipient: "財務部還有法務部",
      recipientHint: "source_named_group",
    },
    ...[
      ["TC-suffix-free-he", "財務和法務"],
      ["TC-suffix-free-ji", "財務及法務"],
      ["SC-suffix-free-he", "财务和法务"],
      ["TC-one-head-compound", "財務和法務團隊"],
      ["TC-lian-tong-compound", "財務連同法務團隊"],
      ["TC-jia-shang-compound", "財務加上法務團隊"],
      ["TC-hui-tong-compound", "財務會同法務團隊"],
      ["TC-sui-hou-compound", "財務隨後法務團隊"],
      ["TC-jie-xu-compound", "財務接續法務團隊"],
      ["TC-tung-maai-compound", "財務同埋法務團隊"],
      ["SC-lian-tong-compound", "财务连同法务团队"],
      ["SC-jia-shang-compound", "财务加上法务团队"],
      ["SC-hui-tong-compound", "财务会同法务团队"],
      ["SC-sui-hou-compound", "财务随后法务团队"],
      ["SC-jie-xu-compound", "财务接续法务团队"],
      ["TC-xie-tong-compound", "財務偕同法務團隊"],
      ["SC-xie-tong-compound", "财务偕同法务团队"],
      ["TC-huo-tong-compound", "財務夥同法務團隊"],
      ["SC-huo-tong-compound", "财务伙同法务团队"],
      ["TC-coordination-compound", "財務協同法務團隊"],
      ["SC-coordination-compound", "财务协同法务团队"],
      ["TC-wai-gaa-compound", "財務外加法務團隊"],
      ["SC-wai-jia-compound", "财务外加法务团队"],
      ["TC-ling-jia-compound", "財務另加法務團隊"],
      ["SC-ling-jia-compound", "财务另加法务团队"],
      ["TC-two-departments", "兩部"],
      ["TC-three-departments", "三部"],
      ["TC-each-department", "各部"],
      ["TC-each-office", "各處"],
      ["SC-each-office", "各处"],
      ["TC-each-group", "各組"],
      ["SC-each-group", "各组"],
      ["TC-each-full-department", "各部門"],
      ["TC-finance-two-departments", "財務兩部"],
      ["TC-finance-three-departments", "財務三部"],
      ["TC-finance-each-department", "財務各部"],
      ["TC-legal-each-office", "法務各處"],
      ["SC-legal-each-office", "法务各处"],
      ["TC-legal-each-group", "法務各組"],
      ["SC-legal-each-group", "法务各组"],
      ["TC-finance-each-full-department", "財務各部門"],
    ].map(([caseId, recipient]) => ({
      caseId,
      text: `通知${recipient}拒絕。`,
      event: "拒絕",
      eventHint: "request_rejected",
      recipient,
      recipientHint: "source_named_group",
    })),
    {
      caseId: "recipient-action-event-order",
      text: "Finance notifies rejection",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "event-recipient-action-order",
      text: "Rejection Finance notifies",
      event: "Rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "action-event-recipient-order",
      text: "Notify rejection Finance",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
    },
    {
      caseId: "visibility-scopes-event-before",
      text: "Only Rejection notifies Finance",
      event: "Rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
      visibility: "Only",
    },
    {
      caseId: "visibility-scopes-event-prefix",
      text: "Notify Finance for only rejection",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
      visibility: "only",
    },
    {
      caseId: "visibility-scopes-event-suffix",
      text: "Notify Finance for rejection only",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance",
      recipientHint: "source_named_group",
      visibility: "only",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `direct-notification-atomic:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "notification",
        messageId,
        text: entry.text,
        leaves: [
          { role: "event", quote: entry.event, hint: entry.eventHint },
          {
            role: "recipient",
            quote: entry.recipient,
            hint: entry.recipientHint,
          },
          ...(entry.visibility
            ? [{
                role: "visibility",
                quote: entry.visibility,
                hint: "recipients_only",
              }]
            : []),
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.value.event, undefined, entry.caseId);
    assert.equal(item.value.recipients, undefined, entry.caseId);
    assert.equal(item.value.visibility, undefined, entry.caseId);
    assert.equal(item.bindings.length, 0, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      entry.caseId,
    );
    const notificationRejections = result.review.rejections.filter(
      (rejection) => rejection.detail.startsWith("notification:"),
    );
    assert.ok(notificationRejections.length > 0, entry.caseId);
    assert.ok(
      notificationRejections.every((rejection) =>
        /^notification:(?:event|recipient|visibility)$/u.test(rejection.detail)
      ),
      `${entry.caseId}:${JSON.stringify(notificationRejections)}`,
    );
  }
});

test("assembly independently rejects forged recovered notification scope", () => {
  const messageId = "forged-recovered-notification-scope";
  const text = "Notify Finance for rejection and Legal for completion.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 500_000,
      kind: "notification",
      messageId,
      text,
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance",
          hint: "source_named_group",
          sameLocalClauseRecovered: true,
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.value.event, undefined);
  assert.equal(item.value.recipients, undefined);
  assert.equal(item.bindings.length, 0);
  assert.equal(item.fragmentId, null);
  assert.ok(
    !result.envelope.fragments.some(
      (fragment) => fragment.factId === "notifications.rules",
    ),
  );
  assert.ok(
    result.review.rejections.some(
      (rejection) =>
        rejection.code === "unverifiable_leaf" &&
        rejection.detail.startsWith("notification:"),
    ),
  );
});

test("assembly independently rejects generic competing recovered recipients", () => {
  const cases = [
    ["plural", "Notify only Finance Team and recipients for rejection."],
    ["singular", "Notify only Finance Team or the recipient for rejection."],
  ];
  for (const [index, [caseId, text]] of cases.entries()) {
    const messageId = `forged-recovered-generic-recipient:${caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: text },
      items: [located({
        itemIndex: 500_100 + index,
        kind: "notification",
        messageId,
        text,
        anchorExpanded: true,
        sameLocalClauseRecoveredLeafCount: 2,
        leaves: [
          {
            role: "event",
            quote: "rejection",
            hint: "request_rejected",
          },
          {
            role: "recipient",
            quote: "Finance Team",
            hint: "source_named_group",
            sameLocalClauseRecovered: true,
          },
          {
            role: "visibility",
            quote: "only",
            hint: "recipients_only",
            sameLocalClauseRecovered: true,
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, caseId);
    assert.equal(item.semanticComplete, false, caseId);
    assert.equal(item.value.event, undefined, caseId);
    assert.equal(item.value.recipients, undefined, caseId);
    assert.equal(item.bindings.length, 0, caseId);
    assert.equal(item.fragmentId, null, caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      caseId,
    );
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail.startsWith("notification:"),
      ),
      caseId,
    );
  }
});

test("assembly independently rejects a forged whole compound recovered recipient", () => {
  const messageId = "forged-recovered-compound-recipient";
  const text = "Notify Finance in addition to Legal for rejection.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 500_001,
      kind: "notification",
      messageId,
      text,
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance in addition to Legal",
          hint: "source_named_group",
          sameLocalClauseRecovered: true,
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.value.event, undefined);
  assert.equal(item.value.recipients, undefined);
  assert.equal(item.bindings.length, 0);
  assert.equal(item.fragmentId, null);
  assert.ok(
    !result.envelope.fragments.some(
      (fragment) => fragment.factId === "notifications.rules",
    ),
  );
  assert.ok(
    result.review.rejections.some(
      (rejection) =>
        rejection.code === "unverifiable_leaf" &&
        rejection.detail.startsWith("notification:"),
    ),
  );
});

test("assembly independently rejects a forged mixed-script recovered recipient", () => {
  const messageId = "forged-recovered-mixed-script-recipient";
  const text = "Notify Finance аnd Legal Team for rejection.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 500_002,
      kind: "notification",
      messageId,
      text,
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance аnd Legal Team",
          hint: "source_named_group",
          sameLocalClauseRecovered: true,
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.value.event, undefined);
  assert.equal(item.value.recipients, undefined);
  assert.equal(item.bindings.length, 0);
  assert.equal(item.fragmentId, null);
  assert.ok(
    !result.envelope.fragments.some(
      (fragment) => fragment.factId === "notifications.rules",
    ),
  );
  assert.ok(
    result.review.rejections.some(
      (rejection) =>
        rejection.code === "unverifiable_leaf" &&
        rejection.detail.startsWith("notification:"),
    ),
  );
});

test("assembly independently rejects word-segmented forged compound recipients", () => {
  const cases = [
    ["same-script-confusable", "Finance ɑnd Legal Team"],
    ["latin-y", "Finance y Legal Team"],
    ["latin-et", "Finance et Legal Team"],
    ["followed-by", "Finance followed by Legal Team"],
    ["then", "Finance then Legal Team"],
    ["following", "Finance following Legal Team"],
    ["after", "Finance after Legal Team"],
    ["before", "Finance before Legal Team"],
    ["subsequently", "Finance subsequently Legal Team"],
    ["excluding", "Finance excluding Legal Team"],
    ["without", "Finance without Legal Team"],
    ["rather-than", "Finance rather than Legal Team"],
    ["instead-of", "Finance instead of Legal Team"],
    ["title-following", "Finance Following Legal Team"],
    ["title-excluding", "Finance Excluding Legal Team"],
    ["title-rather-than", "Finance Rather Than Legal Team"],
    ["accompanied-by", "Finance Accompanied By Legal Team"],
    ["joined-by", "Finance Joined By Legal Team"],
    ["not", "Finance Not Legal Team"],
    ["only", "Only Finance Team"],
    ["indefinite-article", "A Finance Team"],
    ["indefinite-an", "An Operations Team"],
    ["numeric-prefix", "12 Finance Team"],
    ["numeric-middle", "Finance 12 Team"],
    ["another", "Another Finance Team"],
    ["word-number", "Eleven Finance Team"],
    ["various", "Various Finance Team"],
    ["adjacent-domains", "Finance Legal Team"],
    ["hr-legal-adjacent-domains", "HR Legal Team"],
    ["it-finance-adjacent-domains", "IT Finance Team"],
    ["compliance-procurement-adjacent-domains", "Compliance Procurement Team"],
    ["uppercase-adjacent-domains", "FINANCE LEGAL TEAM"],
    ["risk-legal-adjacent-domains", "RISK LEGAL TEAM"],
    ["security-legal-adjacent-domains", "SECURITY LEGAL TEAM"],
    ["engineering-finance-adjacent-domains", "ENGINEERING FINANCE TEAM"],
    ["operations-legal-adjacent-domains", "OPERATIONS LEGAL TEAM"],
    ["privacy-legal-adjacent-domains", "PRIVACY LEGAL TEAM"],
    ["development-legal-adjacent-domains", "DEVELOPMENT LEGAL TEAM"],
    ["management-legal-adjacent-domains", "MANAGEMENT LEGAL TEAM"],
    ["support-legal-adjacent-domains", "SUPPORT LEGAL TEAM"],
    ["finance-compliance-adjacent-domains", "FINANCE COMPLIANCE TEAM"],
    ["corporate-legal-finance-adjacent-domains", "CORPORATE LEGAL FINANCE TEAM"],
    ["enterprise-legal-finance-adjacent-domains", "ENTERPRISE LEGAL FINANCE TEAM"],
    ["finance-security-adjacent-domains", "FINANCE SECURITY TEAM"],
    ["finance-engineering-adjacent-domains", "FINANCE ENGINEERING TEAM"],
    ["legal-marketing-adjacent-domains", "LEGAL MARKETING TEAM"],
    ["hr-security-adjacent-domains", "HR SECURITY TEAM"],
    ["procurement-marketing-adjacent-domains", "PROCUREMENT MARKETING TEAM"],
    ["legal-risk-adjacent-domains", "LEGAL RISK TEAM"],
    ["extended-risk-compliance-alias", "RISK & COMPLIANCE AND LEGAL TEAM"],
    ["extended-mergers-acquisitions-alias", "MERGERS AND ACQUISITIONS AND LEGAL TEAM"],
    ["neutral-inside-supply-chain-finance", "SUPPLY SHARED CHAIN FINANCE TEAM"],
    ["neutral-inside-financial-planning", "FINANCIAL REGIONAL PLANNING TEAM"],
    ["neutral-inside-security-operations", "SECURITY CORPORATE OPERATIONS TEAM"],
    ["neutral-after-commercial-finance", "COMMERCIAL FINANCE CORPORATE TEAM"],
    ["fullwidth-and", "Finance ａｎｄ Legal Team"],
    ["zero-width-and", "Finance a​nd Legal Team"],
    ["fused", "FinanceAndLegalTeam"],
    ["plural-teams", "Teams"],
    ["plural-departments", "Departments"],
    ["plural-groups", "Groups"],
    ["finance-plural-teams", "Finance Teams"],
    ["number-finance-plural-teams", "2 Finance Teams"],
    ["number-legal-plural-departments", "3 Legal Departments"],
    ["finance-number-plural-teams", "Finance 2 Teams"],
    ["TC-adjacent-domains", "財務法務團隊"],
    ["SC-adjacent-domains", "财务法务团队"],
    ["TC-compliance-adjacent-domains", "財務合規團隊"],
    ["SC-compliance-adjacent-domains", "财务合规团队"],
    ["TC-enterprise-legal-finance-adjacent-domains", "企業法務財務團隊"],
    ["SC-enterprise-legal-finance-adjacent-domains", "企业法务财务团队"],
    ["TC-regional-finance-legal-adjacent-domains", "亞太財務法務團隊"],
    ["SC-regional-finance-legal-adjacent-domains", "亚太财务法务团队"],
    ["TC-finance-security-adjacent-domains", "財務安全團隊"],
    ["SC-finance-security-adjacent-domains", "财务安全团队"],
    ["TC-legal-engineering-adjacent-domains", "法務工程團隊"],
    ["SC-legal-engineering-adjacent-domains", "法务工程团队"],
    ["TC-people-marketing-adjacent-domains", "人力營銷團隊"],
    ["SC-people-marketing-adjacent-domains", "人力营销团队"],
    ["TC-neutral-inside-supply-chain-finance", "供應全球鏈財務團隊"],
    ["SC-neutral-inside-supply-chain-finance", "供应全球链财务团队"],
    ["TC-neutral-inside-security-operations", "安全企業營運團隊"],
    ["SC-neutral-inside-security-operations", "安全企业运营团队"],
    ["TC-neutral-after-commercial-finance", "商務財務全球團隊"],
    ["SC-neutral-after-commercial-finance", "商务财务全球团队"],
    ["TC-risk-legal-adjacent-domains", "風險法務團隊"],
    ["SC-risk-legal-adjacent-domains", "风险法务团队"],
    ["TC-security-legal-adjacent-domains", "安全法務團隊"],
    ["SC-security-legal-adjacent-domains", "安全法务团队"],
    ["TC-final-composite-adjacent-domains", "財務法務部"],
    ["TC-review-legal-adjacent-domains", "審核法務團隊"],
    ["SC-review-legal-adjacent-domains", "审核法务团队"],
    ["TC-project-legal-adjacent-domains", "項目法務團隊"],
    ["SC-project-legal-adjacent-domains", "项目法务团队"],
    ["TC-workflow-legal-adjacent-domains", "流程法務團隊"],
    ["SC-workflow-legal-adjacent-domains", "流程法务团队"],
    ["TC-facilities-legal-adjacent-domains", "設施法務團隊"],
    ["SC-facilities-legal-adjacent-domains", "设施法务团队"],
    ["TC-records-legal-adjacent-domains", "記錄法務團隊"],
    ["SC-records-legal-adjacent-domains", "记录法务团队"],
    ["TC-change-legal-adjacent-domains", "更新法務團隊"],
    ["SC-change-legal-adjacent-domains", "更新法务团队"],
    ["TC-management-legal-adjacent-domains", "管理法務團隊"],
    ["SC-management-legal-adjacent-domains", "管理法务团队"],
    ["TC-service-legal-adjacent-domains", "服務法務團隊"],
    ["SC-service-legal-adjacent-domains", "服务法务团队"],
    ["TC-suffix-free-he", "財務和法務"],
    ["TC-suffix-free-ji", "財務及法務"],
    ["SC-suffix-free-he", "财务和法务"],
    ["TC-one-head-compound", "財務和法務團隊"],
    ["TC-lian-tong-compound", "財務連同法務團隊"],
    ["TC-jia-shang-compound", "財務加上法務團隊"],
    ["TC-hui-tong-compound", "財務會同法務團隊"],
    ["TC-sui-hou-compound", "財務隨後法務團隊"],
    ["TC-jie-xu-compound", "財務接續法務團隊"],
    ["TC-tung-maai-compound", "財務同埋法務團隊"],
    ["SC-lian-tong-compound", "财务连同法务团队"],
    ["SC-jia-shang-compound", "财务加上法务团队"],
    ["SC-hui-tong-compound", "财务会同法务团队"],
    ["SC-sui-hou-compound", "财务随后法务团队"],
    ["SC-jie-xu-compound", "财务接续法务团队"],
    ["TC-xie-tong-compound", "財務偕同法務團隊"],
    ["SC-xie-tong-compound", "财务偕同法务团队"],
    ["TC-huo-tong-compound", "財務夥同法務團隊"],
    ["SC-huo-tong-compound", "财务伙同法务团队"],
    ["TC-coordination-compound", "財務協同法務團隊"],
    ["SC-coordination-compound", "财务协同法务团队"],
    ["TC-wai-gaa-compound", "財務外加法務團隊"],
    ["SC-wai-jia-compound", "财务外加法务团队"],
    ["TC-ling-jia-compound", "財務另加法務團隊"],
    ["SC-ling-jia-compound", "财务另加法务团队"],
    ["TC-two-departments", "兩部"],
    ["TC-three-departments", "三部"],
    ["TC-each-department", "各部"],
    ["TC-each-office", "各處"],
    ["SC-each-office", "各处"],
    ["TC-each-group", "各組"],
    ["SC-each-group", "各组"],
    ["TC-each-full-department", "各部門"],
    ["TC-finance-two-departments", "財務兩部"],
    ["TC-finance-three-departments", "財務三部"],
    ["TC-finance-each-department", "財務各部"],
    ["TC-legal-each-office", "法務各處"],
    ["SC-legal-each-office", "法务各处"],
    ["TC-legal-each-group", "法務各組"],
    ["SC-legal-each-group", "法务各组"],
    ["TC-finance-each-full-department", "財務各部門"],
  ];
  for (const [index, [caseId, recipient]] of cases.entries()) {
    const messageId = `forged-recovered-segmented-recipient:${caseId}`;
    const text = `Notify ${recipient} for rejection.`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: text },
      items: [located({
        itemIndex: 501_000 + index,
        kind: "notification",
        messageId,
        text,
        anchorExpanded: true,
        sameLocalClauseRecoveredLeafCount: 1,
        leaves: [
          {
            role: "event",
            quote: "rejection",
            hint: "request_rejected",
          },
          {
            role: "recipient",
            quote: recipient,
            hint: "source_named_group",
            sameLocalClauseRecovered: true,
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, caseId);
    assert.equal(item.semanticComplete, false, caseId);
    assert.equal(item.value.event, undefined, caseId);
    assert.equal(item.value.recipients, undefined, caseId);
    assert.equal(item.bindings.length, 0, caseId);
    assert.equal(item.fragmentId, null, caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      caseId,
    );
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail.startsWith("notification:"),
      ),
      caseId,
    );
  }
});

test("assembly independently retains closed valid recipient names for forged recovery", () => {
  const recipients = [
    "Board of Directors",
    "Research and Development Team",
    "Research & Development Team",
    "People and Culture Team",
    "People & Culture Team",
    "Financial Planning and Analysis Team",
    "Financial Planning & Analysis Team",
    "R&D",
    "R&D Team",
    "Information Technology Department",
    "資訊科技部",
    "信息技术部",
    "Privacy",
    "Information Security Team",
    "Data Security Team",
    "Data Analytics Team",
    "IT Support Team",
    "Application Support Team",
    "Human Resources Department",
    "Customer Service Team",
    "Project Management Office",
    "Vendor Management Office",
    "Product Management Team",
    "Business Operations Team",
    "Digital Transformation Team",
    "Risk Management Team",
    "Enterprise Architecture Team",
    "資訊安全團隊",
    "信息安全团队",
    "資訊科技團隊",
    "信息技术团队",
    "軟體工程部",
    "软件工程部",
    "產品管理團隊",
    "产品管理团队",
    "風險管理團隊",
    "风险管理团队",
    "客戶服務團隊",
    "客户服务团队",
    "Data Governance Team",
    "Security Operations Team",
    "Sales Operations Team",
    "Marketing Operations Team",
    "People Analytics Team",
    "HR Operations Team",
    "Product Marketing Team",
    "Regulatory Compliance Team",
    "Customer Operations Team",
    "Vendor Risk Management Team",
    "Legal Operations Team",
    "Finance Review Team",
    "Corporate Legal Department",
    "Corporate Finance Team",
    "Enterprise Legal Team",
    "Enterprise Finance Team",
    "Executive Finance Team",
    "Commercial Finance Team",
    "Sales Finance Team",
    "Supply Chain Finance Team",
    "Legal Technology Team",
    "People Technology Team",
    "Customer Data Team",
    "Security Operations Center",
    "Security Operations Centre",
    "Shared Services Center",
    "Customer Experience Team",
    "Investor Relations Team",
    "Product Design Team",
    "Cloud Security Team",
    "Risk & Compliance Team",
    "Mergers and Acquisitions Team",
    "HR Technology Team",
    "Strategy and Operations Team",
    "Environmental Health and Safety Team",
    "Diversity and Inclusion Team",
    "Cyber Security Team",
    "IT Operations Team",
    "Information Technology Operations Team",
    "Product Security Team",
    "Finance Systems Team",
    "Marketing Technology Team",
    "Business Analytics Team",
    "Network Operations Center",
    "Global Research and Development Team",
    "Research and Development Center",
    "Center of Excellence",
    "Business Finance Team",
    "Finance Technology Team",
    "Finance Analytics Team",
    "Marketing Analytics Team",
    "Product Analytics Team",
    "Data Operations Team",
    "Engineering Operations Team",
    "Contract Operations Team",
    "Compliance Operations Team",
    "Vendor Risk Team",
    "Human Resources Operations Team",
    "Financial Operations Team",
    "Research & Development Centre",
    "Research and Development Centre",
    "R&D Center",
    "R&D Centre",
    "Finance Center of Excellence",
    "Corporate People and Culture Team",
    "Regional Financial Planning and Analysis Team",
    "Global R&D Team",
    "Business Development Team",
    "Product Development Team",
    "Learning and Development Team",
    "Talent Acquisition Team",
    "Revenue Operations Team",
    "Cybersecurity Team",
    "Data Science Team",
    "數據治理團隊",
    "数据治理团队",
    "安全營運團隊",
    "安全运营团队",
    "銷售營運團隊",
    "销售运营团队",
    "營銷營運團隊",
    "营销运营团队",
    "產品營銷團隊",
    "产品营销团队",
    "法規合規團隊",
    "法规合规团队",
    "客戶營運團隊",
    "客户运营团队",
    "法務營運團隊",
    "法务运营团队",
    "財務審核團隊",
    "财务审核团队",
    "企業合同管理部",
    "企业合同管理部",
    "企業法務部",
    "企业法务部",
    "企業財務部",
    "企业财务部",
    "亞太財務營運團隊",
    "亚太财务运营团队",
    "全球財務團隊",
    "全球财务团队",
    "區域法務團隊",
    "区域法务团队",
    "商務財務團隊",
    "商务财务团队",
    "銷售財務團隊",
    "销售财务团队",
    "供應鏈財務團隊",
    "供应链财务团队",
    "法務科技團隊",
    "法务科技团队",
    "人力科技團隊",
    "人力科技团队",
    "客戶數據團隊",
    "客户数据团队",
    "客戶體驗團隊",
    "客户体验团队",
    "數據私隱辦公室",
    "数据隐私办公室",
    "環境健康安全部",
    "环境健康安全部",
    "產品安全團隊",
    "产品安全团队",
    "資訊科技營運團隊",
    "信息技术运营团队",
    "財務系統團隊",
    "财务系统团队",
    "人力資源科技團隊",
    "人力资源科技团队",
    "財務科技團隊",
    "财务科技团队",
    "營銷科技團隊",
    "营销科技团队",
    "業務財務團隊",
    "业务财务团队",
    "產品開發團隊",
    "产品开发团队",
    "業務開發團隊",
    "业务开发团队",
    "學習與發展團隊",
    "学习与发展团队",
    "人才招聘團隊",
    "人才招聘团队",
    "網絡安全團隊",
    "网络安全团队",
    "數據科學團隊",
    "数据科学团队",
    "營收營運團隊",
    "营收运营团队",
  ];
  for (const [index, recipient] of recipients.entries()) {
    const messageId = `forged-recovered-exact-recipient-alias:${index}`;
    const text = `Notify ${recipient} for rejection.`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: text },
      items: [located({
        itemIndex: 502_000 + index,
        kind: "notification",
        messageId,
        text,
        anchorExpanded: true,
        sameLocalClauseRecoveredLeafCount: 1,
        leaves: [
          {
            role: "event",
            quote: "rejection",
            hint: "request_rejected",
          },
          {
            role: "recipient",
            quote: recipient,
            hint: "source_named_group",
            sameLocalClauseRecovered: true,
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, recipient);
    assert.equal(item.semanticComplete, true, recipient);
    assert.equal(item.value.event, undefined, recipient);
    assert.equal(item.value.recipients, undefined, recipient);
    assert.equal(item.bindings.length, 0, recipient);
    assert.equal(item.fragmentId, null, recipient);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      recipient,
    );
    assert.ok(
      !result.review.rejections.some((rejection) =>
        rejection.detail.startsWith("notification:")
      ),
      `${recipient}:${JSON.stringify(result.review.rejections)}`,
    );
  }
});

test("closed stage-local direct notifications remain atomic and review-only", () => {
  const messageId = "direct-stage-notification";
  const text = "Notify the requester at completion";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: templateCopilotV3SourceLocalNotificationItemIndexBase,
      kind: "notification",
      slot: "stages_participants",
      messageId,
      text,
      leaves: [
        {
          role: "event",
          quote: "completion",
          hint: "request_completed",
        },
        {
          role: "recipient",
          quote: "requester",
          hint: "requester",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.factId, "notifications.rules");
  assert.equal(item.semanticComplete, true);
  assert.equal(item.value.event, undefined);
  assert.equal(item.value.recipients, undefined);
  assert.equal(item.bindings.length, 0);
  assert.equal(item.fragmentId, null);
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.ok(
    !result.review.rejections.some((rejection) =>
      rejection.detail.startsWith("notification:")
    ),
    JSON.stringify(result.review.rejections),
  );
  assert.ok(
    !result.envelope.fragments.some(
      (fragment) => fragment.factId === "notifications.rules",
    ),
  );
});

test("stage-local provider evidence cannot impersonate reserved server notification provenance", () => {
  const cases = [
    {
      caseId: "actionless",
      text: "requester completion",
      event: "completion",
      eventHint: "request_completed",
      recipient: "requester",
      recipientHint: "requester",
    },
    {
      caseId: "actionless-marker",
      text: "requester at completion",
      event: "completion",
      eventHint: "request_completed",
      recipient: "requester",
      recipientHint: "requester",
    },
    {
      caseId: "actionless-named",
      text: "Finance Team rejection",
      event: "rejection",
      eventHint: "request_rejected",
      recipient: "Finance Team",
      recipientHint: "source_named_group",
    },
    {
      caseId: "detached-heading",
      text: "Example:\nOn completion, notify the requester.",
      anchorQuote: "On completion, notify the requester",
      event: "completion",
      eventHint: "request_completed",
      recipient: "requester",
      recipientHint: "requester",
    },
  ];
  for (const entry of cases) {
    const messageId = `direct-stage-provider:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex: 0,
        kind: "notification",
        slot: "stages_participants",
        messageId,
        text: entry.text,
        anchorQuote: entry.anchorQuote ?? entry.text,
        leaves: [
          {
            role: "event",
            quote: entry.event,
            hint: entry.eventHint,
          },
          {
            role: "recipient",
            quote: entry.recipient,
            hint: entry.recipientHint,
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.factId, "notifications.rules", entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.deepEqual(item.bindings, [], entry.caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      entry.caseId,
    );
  }
});

test("notification review independently rejects adjacent illustrative and revoked authority", () => {
  const cases = [
    {
      caseId: "server-stage-preceding-deprecated-example",
      itemIndex: templateCopilotV3SourceLocalNotificationItemIndexBase,
      slot: "stages_participants",
      text:
        "This is a deprecated example. Notify the requester at completion.",
      anchorQuote: "Notify the requester at completion",
      leaves: [
        {
          role: "event",
          quote: "completion",
          hint: "request_completed",
        },
        {
          role: "recipient",
          quote: "requester",
          hint: "requester",
        },
      ],
    },
    {
      caseId: "provider-policy-following-revocation",
      itemIndex: 0,
      slot: "visibility_notifications",
      text:
        "Notify only Finance Team for rejection. This rule is revoked.",
      anchorQuote: "Notify only Finance Team for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "only",
          hint: "recipients_only",
        },
      ],
    },
    {
      caseId: "server-policy-preceding-cjk-example",
      itemIndex: templateCopilotV3SourceLocalNotificationItemIndexBase,
      slot: "visibility_notifications",
      text: "以下僅為範例。只通知財務營運團隊，事件包括拒絕。",
      anchorQuote: "只通知財務營運團隊，事件包括拒絕",
      leaves: [
        {
          role: "event",
          quote: "拒絕",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "財務營運團隊",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "只",
          hint: "recipients_only",
        },
      ],
    },
    ...[
      "For reference only. Notify only Finance Team for rejection.",
      "This is merely illustrative. Notify only Finance Team for rejection.",
      "This rule has been repealed. Notify only Finance Team for rejection.",
      "This is a former policy. Notify only Finance Team for rejection.",
    ].map((text, index) => ({
      caseId: `provider-policy-preceding-natural-meta-${index + 1}`,
      itemIndex: index,
      slot: "visibility_notifications",
      text,
      anchorQuote: "Notify only Finance Team for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "only",
          hint: "recipients_only",
        },
      ],
    })),
    ...[
      "Notify only Finance Team for rejection. This rule must not be used.",
      "Notify only Finance Team for rejection. This rule is cancelled.",
      "Notify only Finance Team for rejection. This rule has been repealed.",
      "Notify only Finance Team for rejection. This rule does not apply.",
      "Notify only Finance Team for rejection. This rule is not in force.",
      "Notify only Finance Team for rejection. Update: Do not use this rule.",
    ].map((text, index) => ({
      caseId: `server-policy-following-natural-revocation-${index + 1}`,
      itemIndex:
        templateCopilotV3SourceLocalNotificationItemIndexBase + index,
      slot: "visibility_notifications",
      text,
      anchorQuote: "Notify only Finance Team for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "only",
          hint: "recipients_only",
        },
      ],
    })),
    {
      caseId: "server-policy-following-tc-wrapped-revocation",
      itemIndex: templateCopilotV3SourceLocalNotificationItemIndexBase,
      slot: "visibility_notifications",
      text:
        "只通知財務營運團隊，事件包括拒絕。更新：不要使用此規則。",
      anchorQuote: "只通知財務營運團隊，事件包括拒絕",
      leaves: [
        { role: "event", quote: "拒絕", hint: "request_rejected" },
        {
          role: "recipient",
          quote: "財務營運團隊",
          hint: "source_named_group",
        },
        { role: "visibility", quote: "只", hint: "recipients_only" },
      ],
    },
    {
      caseId: "provider-policy-following-sc-revocation",
      itemIndex: 0,
      slot: "visibility_notifications",
      text: "仅通知财务运营团队，事件包括拒绝。此规则不得使用。",
      anchorQuote: "仅通知财务运营团队，事件包括拒绝",
      leaves: [
        { role: "event", quote: "拒绝", hint: "request_rejected" },
        {
          role: "recipient",
          quote: "财务运营团队",
          hint: "source_named_group",
        },
        { role: "visibility", quote: "仅", hint: "recipients_only" },
      ],
    },
  ];
  for (const entry of cases) {
    const messageId = `notification-adjacent-authority:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex: entry.itemIndex,
        kind: "notification",
        slot: entry.slot,
        messageId,
        text: entry.text,
        anchorQuote: entry.anchorQuote,
        leaves: entry.leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.factId, "notifications.rules", entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.deepEqual(item.bindings, [], entry.caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      entry.caseId,
    );
  }
});

test("notification review keeps unrelated history and audit facts outside rule authority", () => {
  const cases = [
    ...[
      "Notify only Finance Team for rejection. Historical records remain visible to the workflow owner.",
      "Notify only Finance Team for rejection. The legacy request identifier is retained.",
      "Notify only Finance Team for rejection. Invalid requests remain in history.",
      "Notify only Finance Team for rejection. Revoked credentials trigger an audit.",
      "Notify only Finance Team for rejection. Withdrawn requests remain visible.",
      "Notify only Finance Team for rejection. Expired credentials trigger renewal.",
      "Notify only Finance Team for rejection. Cancelled requests remain visible.",
      "Notify only Finance Team for rejection. The outdated request identifier is retained.",
      "Notify only Finance Team for rejection. Disabled user accounts cannot sign in.",
      "The workflow owner reviews historical records. Notify only Finance Team for rejection.",
      "The Example field is required. Notify only Finance Team for rejection.",
      "This rule is not revoked. Notify only Finance Team for rejection.",
      "This rule remains valid and in force. Notify only Finance Team for rejection.",
      "This policy is active. Notify only Finance Team for rejection.",
    ].map((text, index) => ({
      caseId: `EN-unrelated-authority-word-${index + 1}`,
      itemIndex: index % 2 === 0
        ? index
        : templateCopilotV3SourceLocalNotificationItemIndexBase + index,
      text,
      anchorQuote: "Notify only Finance Team for rejection",
      event: "rejection",
      recipient: "Finance Team",
      visibility: "only",
    })),
    {
      caseId: "TC-unrelated-old-request-record",
      itemIndex: templateCopilotV3SourceLocalNotificationItemIndexBase,
      text:
        "只通知財務營運團隊，事件包括拒絕。舊申請記錄仍須保留。",
      anchorQuote: "只通知財務營運團隊，事件包括拒絕",
      event: "拒絕",
      recipient: "財務營運團隊",
      visibility: "只",
    },
    {
      caseId: "SC-unrelated-invalid-request-history",
      itemIndex: 0,
      text:
        "仅通知财务运营团队，事件包括拒绝。无效申请仍保留于历史。",
      anchorQuote: "仅通知财务运营团队，事件包括拒绝",
      event: "拒绝",
      recipient: "财务运营团队",
      visibility: "仅",
    },
  ];
  for (const entry of cases) {
    const messageId = `notification-unrelated-authority:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex: entry.itemIndex,
        kind: "notification",
        slot: "visibility_notifications",
        messageId,
        text: entry.text,
        anchorQuote: entry.anchorQuote,
        leaves: [
          {
            role: "event",
            quote: entry.event,
            hint: "request_rejected",
          },
          {
            role: "recipient",
            quote: entry.recipient,
            hint: "source_named_group",
          },
          {
            role: "visibility",
            quote: entry.visibility,
            hint: "recipients_only",
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.factId, "notifications.rules", entry.caseId);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.deepEqual(item.bindings, [], entry.caseId);
    assert.ok(
      !result.review.rejections.some((rejection) =>
        rejection.detail.startsWith("notification:")
      ),
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }
});

test("closed direct notification fallbacks remain semantic-complete and review-only", () => {
  const cases = [
    {
      caseId: "event-before-action",
      text: "Request submitted notifies Finance Team recipients only",
      leaves: [
        {
          role: "event",
          quote: "Request submitted",
          hint: "request_submitted",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "recipients only",
          hint: "recipients_only",
        },
      ],
    },
    {
      caseId: "compact-recipient-event",
      text: "directly involved people assignment",
      leaves: [
        {
          role: "recipient",
          quote: "directly involved people",
          hint: "source_named_group",
        },
        {
          role: "event",
          quote: "assignment",
          hint: "stage_assigned",
        },
      ],
    },
    {
      caseId: "action-recipient-event",
      text: "Notify Finance for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance",
          hint: "source_named_group",
        },
      ],
    },
    {
      caseId: "visibility-before-action-recipient-event",
      text: "Only notify Finance for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "Only",
          hint: "recipients_only",
        },
      ],
    },
    {
      caseId: "event-action-visibility-recipient",
      text: "Request submitted notifies only Finance",
      leaves: [
        {
          role: "event",
          quote: "Request submitted",
          hint: "request_submitted",
        },
        {
          role: "recipient",
          quote: "Finance",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "only",
          hint: "recipients_only",
        },
      ],
    },
    {
      caseId: "action-recipient-visibility-event",
      text: "Notify Finance only for rejection",
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: "Finance",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "only",
          hint: "recipients_only",
        },
      ],
    },
    ...[
      "Finance Director",
      "Compliance Officer",
      "Project Coordinator",
      "Data Protection Officer",
      "Senior Finance Risk Review Committee",
      "finance operations team",
      "Contract Management Department",
      "Procurement Approver",
      "People Operations Team",
      "HR",
      "HR Team",
      "Customer Success Team",
      "Software Engineering Team",
      "Quality Assurance Team",
      "Data Privacy Office",
      "Regulatory Affairs Department",
      "Supply Chain Team",
      "Accounts Payable Team",
      "Executive Leadership Team",
      "Board of Directors",
      "Research and Development Team",
      "Research & Development Team",
      "People and Culture Team",
      "People & Culture Team",
      "Financial Planning and Analysis Team",
      "Financial Planning & Analysis Team",
      "R&D",
      "R&D Team",
      "Information Technology Department",
      "Vendor Excellence Team",
      "Privacy",
      "Information Security Team",
      "Data Security Team",
      "Data Analytics Team",
      "IT Support Team",
      "Application Support Team",
      "Human Resources Department",
      "Customer Service Team",
      "Project Management Office",
      "Vendor Management Office",
      "Product Management Team",
      "Business Operations Team",
      "Digital Transformation Team",
      "Risk Management Team",
      "Enterprise Architecture Team",
      "Data Governance Team",
      "Security Operations Team",
      "Sales Operations Team",
      "Marketing Operations Team",
      "People Analytics Team",
      "HR Operations Team",
      "Product Marketing Team",
      "Regulatory Compliance Team",
      "Customer Operations Team",
      "Vendor Risk Management Team",
      "Legal Operations Team",
      "Finance Review Team",
      "Corporate Legal Department",
      "Corporate Finance Team",
      "Enterprise Legal Team",
      "Enterprise Finance Team",
      "Executive Finance Team",
      "Commercial Finance Team",
      "Sales Finance Team",
      "Supply Chain Finance Team",
      "Legal Technology Team",
      "People Technology Team",
      "Customer Data Team",
      "Security Operations Center",
      "Security Operations Centre",
      "Shared Services Center",
      "Customer Experience Team",
      "Investor Relations Team",
      "Product Design Team",
      "Cloud Security Team",
      "Risk & Compliance Team",
      "Mergers and Acquisitions Team",
      "HR Technology Team",
      "Strategy and Operations Team",
      "Environmental Health and Safety Team",
      "Diversity and Inclusion Team",
      "Cyber Security Team",
      "IT Operations Team",
      "Information Technology Operations Team",
      "Product Security Team",
      "Finance Systems Team",
      "Marketing Technology Team",
      "Business Analytics Team",
      "Network Operations Center",
      "Global Research and Development Team",
      "Research and Development Center",
      "Center of Excellence",
      "Business Finance Team",
      "Finance Technology Team",
      "Finance Analytics Team",
      "Marketing Analytics Team",
      "Product Analytics Team",
      "Data Operations Team",
      "Engineering Operations Team",
      "Contract Operations Team",
      "Compliance Operations Team",
      "Vendor Risk Team",
      "Human Resources Operations Team",
      "Financial Operations Team",
      "Research & Development Centre",
      "Research and Development Centre",
      "R&D Center",
      "R&D Centre",
      "Finance Center of Excellence",
      "Corporate People and Culture Team",
      "Regional Financial Planning and Analysis Team",
      "Global R&D Team",
      "Business Development Team",
      "Product Development Team",
      "Learning and Development Team",
      "Talent Acquisition Team",
      "Revenue Operations Team",
      "Cybersecurity Team",
      "Data Science Team",
      "合同管理部",
      "和諧服務中心",
      "及時支援團隊",
      "國際和平中心",
      "財務營運團隊",
      "人力資源部",
      "法務部",
      "法务部",
      "客戶成功團隊",
      "客户成功团队",
      "軟體工程團隊",
      "软件工程团队",
      "品質保證團隊",
      "质量保证团队",
      "法規事務部",
      "法规事务部",
      "供應鏈管理部",
      "供应链管理部",
      "公共關係部",
      "公共关系部",
      "研發部",
      "研发部",
      "資訊科技部",
      "信息技术部",
      "資訊安全團隊",
      "信息安全团队",
      "資訊科技團隊",
      "信息技术团队",
      "軟體工程部",
      "软件工程部",
      "產品管理團隊",
      "产品管理团队",
      "風險管理團隊",
      "风险管理团队",
      "客戶服務團隊",
      "客户服务团队",
      "數據治理團隊",
      "数据治理团队",
      "安全營運團隊",
      "安全运营团队",
      "銷售營運團隊",
      "销售运营团队",
      "營銷營運團隊",
      "营销运营团队",
      "產品營銷團隊",
      "产品营销团队",
      "法規合規團隊",
      "法规合规团队",
      "客戶營運團隊",
      "客户运营团队",
      "法務營運團隊",
      "法务运营团队",
      "財務審核團隊",
      "财务审核团队",
      "企業合同管理部",
      "企业合同管理部",
      "企業法務部",
      "企业法务部",
      "企業財務部",
      "企业财务部",
      "亞太財務營運團隊",
      "亚太财务运营团队",
      "全球財務團隊",
      "全球财务团队",
      "區域法務團隊",
      "区域法务团队",
      "商務財務團隊",
      "商务财务团队",
      "銷售財務團隊",
      "销售财务团队",
      "供應鏈財務團隊",
      "供应链财务团队",
      "法務科技團隊",
      "法务科技团队",
      "人力科技團隊",
      "人力科技团队",
      "客戶數據團隊",
      "客户数据团队",
      "客戶體驗團隊",
      "客户体验团队",
      "數據私隱辦公室",
      "数据隐私办公室",
      "環境健康安全部",
      "环境健康安全部",
      "產品安全團隊",
      "产品安全团队",
      "資訊科技營運團隊",
      "信息技术运营团队",
      "財務系統團隊",
      "财务系统团队",
      "人力資源科技團隊",
      "人力资源科技团队",
      "財務科技團隊",
      "财务科技团队",
      "營銷科技團隊",
      "营销科技团队",
      "業務財務團隊",
      "业务财务团队",
      "產品開發團隊",
      "产品开发团队",
      "業務開發團隊",
      "业务开发团队",
      "學習與發展團隊",
      "学习与发展团队",
      "人才招聘團隊",
      "人才招聘团队",
      "網絡安全團隊",
      "网络安全团队",
      "數據科學團隊",
      "数据科学团队",
      "營收營運團隊",
      "营收运营团队",
    ].map((recipient, index) => ({
      caseId: `single-named-recipient-${index + 1}`,
      text: `Notify ${recipient} for rejection`,
      leaves: [
        {
          role: "event",
          quote: "rejection",
          hint: "request_rejected",
        },
        {
          role: "recipient",
          quote: recipient,
          hint: "source_named_group",
        },
      ],
    })),
  ];
  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `direct-notification-valid:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "notification",
        messageId,
        text: entry.text,
        leaves: entry.leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.equal(item.bindings.length, 0, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(item.value.event, undefined, entry.caseId);
    assert.equal(item.value.recipients, undefined, entry.caseId);
    assert.ok(
      !result.envelope.fragments.some(
        (fragment) => fragment.factId === "notifications.rules",
      ),
      entry.caseId,
    );
    assert.ok(
      !result.review.rejections.some((rejection) =>
        rejection.detail.startsWith("notification:")
      ),
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }
});

test("direct review-only aliases fail closed for authority and scope adversaries", () => {
  const cases = [
    {
      caseId: "hint-mismatch",
      kind: "request_field",
      text: "Purpose sometimes",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "sometimes", hint: "true" },
      ],
      expectedDetail: "request_field:required",
    },
    {
      caseId: "hard-clause-sibling",
      kind: "request_field",
      text: "Purpose optional. Budget must",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
      expectedDetail: "request_field:required",
    },
    {
      caseId: "question",
      kind: "request_field",
      text: "Should Purpose be must?",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
      expectedDetail: "request_field:required",
    },
    {
      caseId: "example",
      kind: "request_field",
      text: "Example: Purpose must",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
      expectedDetail: "request_field:required",
    },
    {
      caseId: "instruction-negation",
      kind: "request_field",
      text: "Do not treat Purpose as must",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
      expectedDetail: "request_field:required",
    },
    {
      caseId: "multiple-recipients",
      kind: "notification",
      text: "Assignment alerts requester and workflow owner",
      leaves: [
        { role: "event", quote: "Assignment", hint: "stage_assigned" },
        { role: "recipient", quote: "requester", hint: "requester" },
        {
          role: "recipient",
          quote: "workflow owner",
          hint: "workflow_owner",
        },
      ],
      expectedDetail: "notification:event",
      forbiddenBindingPath: "/event",
    },
    {
      caseId: "condition-excluded",
      kind: "condition",
      text: "Status is Yes routes to Finance",
      leaves: [
        { role: "field", quote: "Status" },
        { role: "operator", quote: "is", hint: "=" },
        { role: "value", quote: "Yes" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
      expectedDetail: "condition:operator",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `direct-review-only-adversary:${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: entry.kind,
        messageId,
        text: entry.text,
        leaves: entry.leaves,
      })],
    });
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === entry.expectedDetail,
      ),
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
    assert.equal(
      result.review.items[0]?.semanticComplete ?? false,
      entry.expectedSemanticComplete ?? false,
      entry.caseId,
    );
    if (entry.forbiddenBindingPath) {
      assert.equal(
        result.review.items[0]?.bindings.some(
          (binding) => binding.path === entry.forbiddenBindingPath,
        ) ?? false,
        false,
        `${entry.caseId}:${entry.forbiddenBindingPath}`,
      );
    }
  }

  const duplicateId = "direct-review-only-adversary:duplicate";
  const duplicateText = "Purpose must and optional";
  const duplicate = assembleTemplateCopilotV3Review({
    sourceMessages: { [duplicateId]: duplicateText },
    items: [located({
      itemIndex: 100,
      kind: "request_field",
      messageId: duplicateId,
      text: duplicateText,
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
        { role: "required", quote: "optional", hint: "false" },
      ],
    })],
  });
  assert.ok(duplicate.review.rejections.length > 0);
  assert.equal(duplicate.review.items[0]?.semanticComplete, false);
  assert.equal(duplicate.review.items[0]?.fragmentId, null);
  assert.equal(duplicate.review.items[0]?.value.required, false);

  const ambiguousId = "direct-review-only-adversary:ambiguity";
  const ambiguousText = "Purpose must";
  const ambiguous = assembleTemplateCopilotV3Review({
    sourceMessages: { [ambiguousId]: ambiguousText },
    items: [located({
      itemIndex: 101,
      kind: "request_field",
      messageId: ambiguousId,
      text: ambiguousText,
      ambiguity: "possible",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "must", hint: "true" },
      ],
    })],
  });
  assert.equal(ambiguous.review.items[0]?.semanticComplete, false);
  assert.ok(
    ambiguous.review.rejections.some(
      (rejection) => rejection.detail === "request_field:required",
    ),
  );

  const mixedId = "direct-review-only-adversary:mixed-recovery";
  const mixedText = "财务核对申请人";
  const mixed = assembleTemplateCopilotV3Review({
    sourceMessages: { [mixedId]: mixedText },
    items: [located({
      itemIndex: 102,
      kind: "stage",
      messageId: mixedId,
      text: mixedText,
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        { role: "label", quote: "财务" },
        { role: "kind", quote: "核对", hint: "review" },
        {
          role: "participant_mode",
          quote: "申请人",
          hint: "requester",
          sameLocalClauseRecovered: true,
        },
      ],
    })],
  });
  assert.equal(mixed.review.items[0]?.semanticComplete, true);
  assert.equal(
    mixed.review.items[0]?.bindings.some((binding) => binding.path === "/kind"),
    false,
  );
  assert.ok(
    mixed.review.rejections.some(
      (rejection) => rejection.detail === "stage:kind",
    ),
  );

  const malformedId = "direct-review-only-adversary:malformed-sibling";
  const malformedText = "Purpose must";
  const malformedBase = located({
    itemIndex: 103,
    kind: "request_field",
    messageId: malformedId,
    text: malformedText,
    leaves: [
      { role: "label", quote: "Purpose" },
      { role: "required", quote: "must", hint: "true" },
    ],
  });
  const malformed = assembleTemplateCopilotV3Review({
    sourceMessages: { [malformedId]: malformedText },
    items: [Object.freeze({
      ...malformedBase,
      leaves: Object.freeze([
        Object.freeze({
          ...malformedBase.leaves[0],
          sourceSpan: Object.freeze({
            ...malformedBase.leaves[0].sourceSpan,
            exactText: "Purposx",
          }),
        }),
        malformedBase.leaves[1],
      ]),
    })],
  });
  assert.ok(
    malformed.review.rejections.some(
      (rejection) =>
        rejection.code === "untraceable_span" &&
        rejection.detail === "request_field:label",
    ),
  );
  assert.ok(
    malformed.review.rejections.some(
      (rejection) =>
        rejection.code === "unverifiable_leaf" &&
        rejection.detail === "request_field:required",
    ),
  );
  assert.ok(
    !(malformed.review.items[0]?.bindings ?? []).some(
      (binding) => binding.path === "/required",
    ),
  );
});

test("direct review-only fallback preserves unsupported semantic holds", () => {
  const messageId = "direct-review-only:unsupported-attachment";
  const text = "If urgent, upload proof";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "attachment",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "proof" },
        { role: "kind", quote: "upload", hint: "attachment" },
        { role: "required", quote: "upload", hint: "conditional" },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.blockingReason, "unsupported_semantics_not_executable");
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.equal(item.bindings.some((binding) => binding.path === "/kind"), false);
  assert.ok(
    result.review.rejections.some(
      (rejection) => rejection.detail === "attachment:kind",
    ),
  );
});

test("a blocked duplicate notification that dropped its only-qualifier cannot poison the qualified copy", () => {
  const messageId = "notification-duplicate:only-qualifier";
  const text =
    "Notify only directly involved people for assignment and completion.";
  const notification = (itemIndex, event, hint, withVisibility) =>
    located({
      itemIndex,
      kind: "notification",
      messageId,
      text,
      leaves: [
        { role: "event", quote: event, hint },
        {
          role: "recipient",
          quote: "directly involved people",
          hint: "source_named_group",
        },
        ...(withVisibility
          ? [{ role: "visibility", quote: "only", hint: "recipients_only" }]
          : []),
      ],
    });
  const qualified = [
    notification(50, "assignment", "stage_assigned", true),
    notification(51, "completion", "request_completed", true),
  ];
  const unqualifiedAssignment = notification(
    52,
    "assignment",
    "stage_assigned",
    false,
  );
  const assemble = (items) =>
    assembleTemplateCopilotV3Review({
      items,
      sourceMessages: { [messageId]: text },
      sourceMessageOrder: [messageId],
    }).review.items.filter((item) => item.factId === "notifications.rules");

  for (const ordered of [
    [...qualified, unqualifiedAssignment],
    [unqualifiedAssignment, ...qualified].reverse(),
  ]) {
    const notifications = assemble(ordered);
    assert.equal(notifications.length, 2);
    assert.ok(
      notifications.every((item) => item.semanticComplete),
      JSON.stringify(notifications.map((item) => item.semanticValue)),
    );
    assert.ok(
      notifications.every((item) =>
        item.semanticValue.visibility?.includes("only")
      ),
    );
  }

  // Without a qualified sibling the unqualified copy stays blocked.
  const alone = assemble([unqualifiedAssignment, qualified[1]]).find(
    (item) => item.semanticValue.event?.[0] === "assignment",
  );
  assert.notEqual(alone?.semanticComplete, true);
});

test("a verb quoted as the attachment kind is dropped only beside a verified format", () => {
  const withFormatId = "message-attachment-verb-kind";
  const withFormat = "Allow an optional Excel line-item schedule.";
  const withoutFormatId = "message-attachment-verb-kind-bare";
  const withoutFormat = "Allow an optional line-item schedule.";
  const messages = { [withFormatId]: withFormat, [withoutFormatId]: withoutFormat };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: messages,
    sourceMessageOrder: Object.keys(messages),
    items: [
      located({ itemIndex: 0, kind: "attachment", messageId: withFormatId, text: withFormat, leaves: [
        { role: "label", quote: "Excel line-item schedule" }, { role: "kind", quote: "Allow", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" }, { role: "format", quote: "Excel", hint: "excel_csv" },
      ] }),
      located({ itemIndex: 1, kind: "attachment", messageId: withoutFormatId, text: withoutFormat, leaves: [
        { role: "label", quote: "line-item schedule" }, { role: "kind", quote: "Allow", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" },
      ] }),
    ],
  });
  const [withFormatItem, withoutFormatItem] = [withFormatId, withoutFormatId].map((messageId) =>
    result.review.items.find((item) => item.sourceMessageIds.includes(messageId))
  );
  assert.equal(withFormatItem.semanticComplete, true);
  assert.deepEqual(withFormatItem.semanticLeaves.map((leaf) => leaf.role).sort(), ["format", "label", "required"]);
  assert.deepEqual(withFormatItem.observedRoles, ["format", "label", "required"]);
  // Without a format the unverified kind stays, and the item cannot complete.
  assert.equal(withoutFormatItem.semanticComplete, false);
  assert.ok(withoutFormatItem.semanticLeaves.some((leaf) => leaf.role === "kind"));
});
