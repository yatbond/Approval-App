import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceSampleAssetPlan } from "./workspace-sample-assets.ts";

function buildSnapshot(imageBase64) {
  return {
    selectedTemplateId: "template-1",
    approvalTasks: [],
    businessDirectory: [],
    workflowTemplates: [
      {
        id: "template-1",
        name: "Template",
        business: "Business",
        department: "Finance",
        documentTypes: ["Invoice"],
        documents: [
          {
            id: "document-1",
            documentType: "Invoice",
            format: "pdf",
            required: true,
            fields: [],
            sample: {
              fileName: "invoice.pdf",
              mimeType: "application/pdf",
              previewPages: [],
              pageImages: [
                {
                  pageNumber: 1,
                  mimeType: "image/png",
                  imageBase64,
                  pageText: "Invoice total",
                },
                {
                  pageNumber: 2,
                  mimeType: "image/png",
                  imageBase64,
                },
              ],
              savedAt: "2026-07-17T00:00:00.000Z",
            },
          },
        ],
        languages: ["English"],
        fields: [],
        steps: [],
      },
    ],
    userRoleAssignments: [],
    adminAuditEvents: [],
    formLibrary: [],
  };
}

test("replaces embedded workflow sample images with deterministic storage paths", () => {
  const imageBase64 = Buffer.from("sample-image").toString("base64");
  const plan = buildWorkspaceSampleAssetPlan(
    buildSnapshot(imageBase64),
    "owner-1",
  );
  const pages =
    plan.snapshot.workflowTemplates[0].documents[0].sample.pageImages;

  assert.equal(plan.assets.length, 1);
  assert.equal(plan.removedBase64Bytes, imageBase64.length * 2);
  assert.match(plan.assets[0].storagePath, /^owner-1\/workflow-samples\/[a-f0-9]{64}\.png$/);
  assert.equal(pages[0].imageBase64, undefined);
  assert.equal(pages[0].storagePath, plan.assets[0].storagePath);
  assert.equal(pages[0].pageText, "Invoice total");
  assert.equal(pages[1].storagePath, plan.assets[0].storagePath);
});

test("leaves already compacted sample pages unchanged", () => {
  const snapshot = buildSnapshot("");
  snapshot.workflowTemplates[0].documents[0].sample.pageImages[0] = {
    pageNumber: 1,
    mimeType: "image/png",
    storagePath: "owner-1/workflow-samples/existing.png",
  };
  const plan = buildWorkspaceSampleAssetPlan(snapshot, "owner-1");

  assert.equal(plan.assets.length, 0);
  assert.equal(plan.removedBase64Bytes, 0);
  assert.equal(
    plan.snapshot.workflowTemplates[0].documents[0].sample.pageImages[0]
      .storagePath,
    "owner-1/workflow-samples/existing.png",
  );
});
