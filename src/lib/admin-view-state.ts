import type { BusinessUnit } from "./types.ts";

export function getAdminBusinessSelectionState({
  businessDirectory,
  selectedBusinessId,
}: {
  businessDirectory: BusinessUnit[];
  selectedBusinessId: string;
}) {
  const firstBusiness = businessDirectory[0];
  const selectedBusiness =
    businessDirectory.find((business) => business.id === selectedBusinessId) ||
    firstBusiness;

  return {
    selectedBusiness,
    selectedBusinessId: selectedBusiness?.id || "",
    businessNameDraft: selectedBusiness?.name || "",
    departments: selectedBusiness?.departments || [],
  };
}
