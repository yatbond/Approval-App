import type { BusinessUnit } from "./types.ts";

export function getWorkflowTemplateBuilderBusinessState({
  businessDirectory,
  businessId,
}: {
  businessDirectory: BusinessUnit[];
  businessId: string;
}) {
  const firstBusiness = businessDirectory[0];
  const selectedBusiness =
    businessDirectory.find((business) => business.id === businessId) ||
    firstBusiness;

  return {
    selectedBusiness,
    selectedBusinessId: selectedBusiness?.id || "",
    departmentOptions: selectedBusiness?.departments || [],
    usesDepartmentSelect: Boolean(selectedBusiness?.departments.length),
  };
}

export function getDepartmentForBusiness(
  businessDirectory: BusinessUnit[],
  businessId: string,
) {
  const business = businessDirectory.find((item) => item.id === businessId);
  return business?.departments[0] || "";
}
