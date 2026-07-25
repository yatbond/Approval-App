import type { WorkflowTemplate } from "./types.ts";

export type StoredPublishedTemplate = {
  template_key?: unknown;
  version_number?: unknown;
  is_active_version?: unknown;
  template_snapshot?: unknown;
};

export function collectTemplateAssignmentEmails(template: unknown) {
  if (!isRecord(template)) {
    return [];
  }

  const graph = isRecord(template.graph) ? template.graph : {};
  return Array.from(
    new Set(
      [
        ...collectEmails(template.steps, ["approverEmail", "escalationEmail"]),
        ...collectEmails(graph.nodes, ["assigneeEmail", "escalationEmail"]),
      ]
        .map(normalizeEmail)
        .filter(Boolean),
    ),
  );
}

export function collectPublishedAssignmentEmails(templates: WorkflowTemplate[]) {
  return Array.from(
    new Set(
      templates
        .filter(isActivePublishedTemplate)
        .flatMap(collectTemplateAssignmentEmails),
    ),
  );
}

export function collectAssignmentEmailsRequiringValidation(
  templates: WorkflowTemplate[],
  storedTemplates: StoredPublishedTemplate[],
) {
  const existingEmailsByVersion = new Map<string, Set<string>>();

  for (const storedTemplate of storedTemplates) {
    if (storedTemplate.is_active_version !== true) {
      continue;
    }
    const key = templateVersionKey(
      storedTemplate.template_key,
      storedTemplate.version_number,
    );
    if (!key) {
      continue;
    }
    existingEmailsByVersion.set(
      key,
      new Set(collectTemplateAssignmentEmails(storedTemplate.template_snapshot)),
    );
  }

  const emailsToValidate = new Set<string>();
  for (const template of templates) {
    if (!isActivePublishedTemplate(template)) {
      continue;
    }
    const key = templateVersionKey(template.id, template.version || 1);
    const existingEmails = key
      ? existingEmailsByVersion.get(key) || new Set<string>()
      : new Set<string>();
    for (const email of collectTemplateAssignmentEmails(template)) {
      if (!existingEmails.has(email)) {
        emailsToValidate.add(email);
      }
    }
  }

  return Array.from(emailsToValidate);
}

function isActivePublishedTemplate(template: WorkflowTemplate) {
  return (
    template.isDraft === false &&
    template.isActiveVersion === true &&
    template.isArchived !== true
  );
}

function collectEmails(value: unknown, keys: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    return keys.map((key) => entry[key]);
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function templateVersionKey(templateKey: unknown, versionNumber: unknown) {
  if (
    typeof templateKey !== "string" ||
    !templateKey.trim() ||
    typeof versionNumber !== "number" ||
    !Number.isInteger(versionNumber) ||
    versionNumber < 1
  ) {
    return "";
  }
  return `${templateKey.trim()}:${versionNumber}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
