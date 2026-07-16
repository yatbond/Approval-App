import {
  createEmptyUploadRequestDraftStatus,
  getNamedSavedUploadRequestDrafts,
  getUploadDraftResumeItems,
  parseUploadRequestDraft,
  parseUploadRequestDraftList,
} from "./upload-request-draft-state.ts";

export function getLocalUploadDraftCount({
  activeDraftId,
  currentDraftJson,
  savedDraftsJson,
}: {
  activeDraftId: string;
  currentDraftJson: string;
  savedDraftsJson: string;
}) {
  const currentDraft = parseUploadRequestDraft(currentDraftJson);
  const savedDrafts = getNamedSavedUploadRequestDrafts(
    parseUploadRequestDraftList(savedDraftsJson),
  );

  return getUploadDraftResumeItems({
    activeDraftId,
    currentDraft,
    currentDraftStatus: createEmptyUploadRequestDraftStatus(currentDraft),
    savedDrafts,
    templates: [],
  }).length;
}
