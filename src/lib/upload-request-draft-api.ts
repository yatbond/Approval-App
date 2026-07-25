import type { SavedUploadRequestDraft } from "./upload-request-draft-state.ts";

type Fetcher = typeof fetch;

export async function loadSavedUploadRequestDrafts({
  fetcher = fetch,
}: {
  fetcher?: Fetcher;
} = {}) {
  const response = await fetcher("/api/upload-drafts");
  const payload = await readDraftApiPayload(response);
  return Array.isArray(payload.drafts)
    ? (payload.drafts as SavedUploadRequestDraft[])
    : [];
}

export async function saveSavedUploadRequestDraft({
  draft,
  fetcher = fetch,
}: {
  draft: SavedUploadRequestDraft;
  fetcher?: Fetcher;
}) {
  const response = await fetcher("/api/upload-drafts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ draft }),
  });
  const payload = await readDraftApiPayload(response);
  return payload.draft as SavedUploadRequestDraft | undefined;
}

export async function deleteSavedUploadRequestDraft({
  draftId,
  fetcher = fetch,
}: {
  draftId: string;
  fetcher?: Fetcher;
}) {
  const response = await fetcher(
    `/api/upload-drafts?id=${encodeURIComponent(draftId)}`,
    {
      method: "DELETE",
    },
  );
  await readDraftApiPayload(response);
}

async function readDraftApiPayload(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    drafts?: unknown;
    draft?: unknown;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Upload draft request failed.");
  }

  return payload;
}
