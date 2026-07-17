import { createHash } from "node:crypto";
import type {
  WorkflowDocumentSamplePage,
  WorkflowTemplate,
} from "./types.ts";
import type { WorkspaceStateSnapshot } from "./workspace-persistence.ts";

export type WorkspaceSampleAsset = {
  bytes: Uint8Array;
  contentType: string;
  storagePath: string;
};

export type WorkspaceSampleAssetPlan = {
  snapshot: WorkspaceStateSnapshot;
  assets: WorkspaceSampleAsset[];
  removedBase64Bytes: number;
};

export function buildWorkspaceSampleAssetPlan(
  snapshot: WorkspaceStateSnapshot,
  ownerUserId: string,
): WorkspaceSampleAssetPlan {
  const assets = new Map<string, WorkspaceSampleAsset>();
  let removedBase64Bytes = 0;

  const compactPage = (
    page: WorkflowDocumentSamplePage,
  ): WorkflowDocumentSamplePage => {
    const imageBase64 = page.imageBase64?.trim();
    if (!imageBase64) {
      return page;
    }

    const normalizedBase64 = imageBase64.includes(",")
      ? imageBase64.slice(imageBase64.indexOf(",") + 1)
      : imageBase64;
    const bytes = Buffer.from(normalizedBase64, "base64");
    if (!bytes.length) {
      return page;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    const storagePath = `${ownerUserId}/workflow-samples/${digest}.${getImageExtension(
      page.mimeType,
    )}`;
    assets.set(storagePath, {
      bytes,
      contentType: page.mimeType || "application/octet-stream",
      storagePath,
    });
    removedBase64Bytes += imageBase64.length;
    const compactPageValue = { ...page };
    delete compactPageValue.imageBase64;
    return { ...compactPageValue, storagePath };
  };

  const compactTemplate = (template: WorkflowTemplate): WorkflowTemplate => ({
    ...template,
    documents: template.documents.map((document) =>
      document.sample
        ? {
            ...document,
            sample: {
              ...document.sample,
              previewPages: document.sample.previewPages.map(compactPage),
              pageImages: (document.sample.pageImages || []).map(compactPage),
            },
          }
        : document,
    ),
  });

  return {
    snapshot: {
      ...snapshot,
      workflowTemplates: snapshot.workflowTemplates.map(compactTemplate),
      approvalTasks: snapshot.approvalTasks.map((task) =>
        task.workflowTemplateSnapshot
          ? {
              ...task,
              workflowTemplateSnapshot: compactTemplate(
                task.workflowTemplateSnapshot,
              ),
            }
          : task,
      ),
    },
    assets: Array.from(assets.values()),
    removedBase64Bytes,
  };
}

function getImageExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}
