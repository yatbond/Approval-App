import type {
  WorkflowDocumentSample,
  WorkflowDocumentSamplePage,
} from "./types.ts";

const sampleImageCache = new Map<string, Promise<string>>();

export function hasStoredWorkflowSampleAssets(
  sample?: WorkflowDocumentSample | null,
) {
  return [...(sample?.previewPages || []), ...(sample?.pageImages || [])].some(
    (page) => Boolean(page.storagePath && !page.imageBase64),
  );
}

export async function hydrateWorkflowDocumentSampleAssets(
  sample: WorkflowDocumentSample,
): Promise<WorkflowDocumentSample> {
  const hydratePage = async (
    page: WorkflowDocumentSamplePage,
  ): Promise<WorkflowDocumentSamplePage> => {
    if (page.imageBase64 || !page.storagePath) {
      return page;
    }

    let imagePromise = sampleImageCache.get(page.storagePath);
    if (!imagePromise) {
      imagePromise = downloadSampleImage(page.storagePath);
      sampleImageCache.set(page.storagePath, imagePromise);
    }
    return { ...page, imageBase64: await imagePromise };
  };

  return {
    ...sample,
    previewPages: await Promise.all(sample.previewPages.map(hydratePage)),
    pageImages: await Promise.all((sample.pageImages || []).map(hydratePage)),
  };
}

async function downloadSampleImage(storagePath: string) {
  const response = await fetch(
    `/api/attachments/file?path=${encodeURIComponent(storagePath)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Sample image download failed: ${response.status}`);
  }

  return readBlobAsBase64(await response.blob());
}

function readBlobAsBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Sample image read failed."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
