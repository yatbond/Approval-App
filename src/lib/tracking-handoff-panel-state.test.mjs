import assert from "node:assert/strict";
import { test } from "node:test";
import { getTrackingHandoffPanelState } from "./tracking-handoff-panel-state.ts";

test("keeps the handoff and visibility panel hidden until expanded", () => {
  assert.deepEqual(
    getTrackingHandoffPanelState({
      isExpanded: false,
      participantCount: 2,
      hiddenFieldCount: 0,
      hiddenAttachmentCount: 0,
    }),
    {
      isVisible: false,
      toggleLabel: "Show",
      ariaLabel: "Show handoff and visibility",
      summary: "2 viewer(s)",
    },
  );
});

test("shows the handoff and visibility panel with hidden item context when expanded", () => {
  assert.deepEqual(
    getTrackingHandoffPanelState({
      isExpanded: true,
      participantCount: 3,
      hiddenFieldCount: 1,
      hiddenAttachmentCount: 2,
    }),
    {
      isVisible: true,
      toggleLabel: "Hide",
      ariaLabel: "Hide handoff and visibility",
      summary: "3 viewer(s), 1 hidden value(s), 2 hidden document(s)",
    },
  );
});
