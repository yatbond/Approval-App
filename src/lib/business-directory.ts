import type { BusinessUnit } from "@/lib/types";

export const seededBusinessDirectory: BusinessUnit[] = [
  {
    id: "asia-allied-infrastructure",
    name: "Asia Allied Infrastructure",
    departments: [
      "Administration",
      "Company Secretary",
      "Contracts & Legal",
      "Corporate Communications",
      "Finance",
      "Human Resources",
      "Information & Technology",
      "Internal Control & Process",
    ],
  },
  { id: "amain", name: "AMAIN", departments: [] },
  { id: "chun-wo-bus", name: "Chun Wo Bus", departments: [] },
  { id: "hong-kong-cyclotron", name: "Hong Kong Cyclotron", departments: [] },
  { id: "kwan-lee", name: "Kwan Lee", departments: [] },
  { id: "manbond", name: "Manbond", departments: [] },
  { id: "mattex", name: "Mattex", departments: [] },
  { id: "city-service-group", name: "City Service Group", departments: [] },
  { id: "chun-wo-property", name: "Chun Wo Property", departments: [] },
  { id: "vision-foundations", name: "Vision Foundations", departments: [] },
  { id: "allalign", name: "Allalign", departments: [] },
  { id: "hypath", name: "HyPath", departments: [] },
  { id: "see-change-education", name: "See Change Education", departments: [] },
  {
    id: "chun-wo-construction",
    name: "Chun Wo Construction",
    departments: [
      "Construction Finance",
      "BIM",
      "Claims & Dispute Resolution",
      "Commercial",
      "Compliance",
      "Human Resources",
      "Technical",
      "Maintenance",
      "Tendering",
    ],
  },
];

export function addBusiness(
  directory: BusinessUnit[],
  name: string,
): BusinessUnit[] {
  const cleanName = name.trim();
  if (!cleanName) {
    return directory;
  }

  return [
    ...directory,
    {
      id: uniqueBusinessId(directory, slugify(cleanName)),
      name: cleanName,
      departments: [],
    },
  ];
}

export function updateBusiness(
  directory: BusinessUnit[],
  businessId: string,
  name: string,
): BusinessUnit[] {
  const cleanName = name.trim();
  if (!cleanName) {
    return directory;
  }

  return directory.map((business) =>
    business.id === businessId ? { ...business, name: cleanName } : business,
  );
}

export function deleteBusiness(
  directory: BusinessUnit[],
  businessId: string,
): BusinessUnit[] {
  return directory.filter((business) => business.id !== businessId);
}

export function addDepartment(
  directory: BusinessUnit[],
  businessId: string,
  department: string,
): BusinessUnit[] {
  const cleanDepartment = department.trim();
  if (!cleanDepartment) {
    return directory;
  }

  return directory.map((business) =>
    business.id === businessId
      ? {
          ...business,
          departments: [...business.departments, cleanDepartment],
        }
      : business,
  );
}

export function updateDepartment(
  directory: BusinessUnit[],
  businessId: string,
  departmentIndex: number,
  department: string,
): BusinessUnit[] {
  const cleanDepartment = department.trim();
  if (!cleanDepartment) {
    return directory;
  }

  return directory.map((business) =>
    business.id === businessId
      ? {
          ...business,
          departments: business.departments.map((item, index) =>
            index === departmentIndex ? cleanDepartment : item,
          ),
        }
      : business,
  );
}

export function deleteDepartment(
  directory: BusinessUnit[],
  businessId: string,
  departmentIndex: number,
): BusinessUnit[] {
  return directory.map((business) =>
    business.id === businessId
      ? {
          ...business,
          departments: business.departments.filter((_, index) => index !== departmentIndex),
        }
      : business,
  );
}

function uniqueBusinessId(directory: BusinessUnit[], baseId: string) {
  const existingIds = new Set(directory.map((business) => business.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "business"
  );
}
