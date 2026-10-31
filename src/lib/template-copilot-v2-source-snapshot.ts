import { createHash } from "node:crypto";
import type { TemplateCopilotV2SourceSnapshot } from "./template-copilot-v2-modes.ts";

/** Server-only capture of the exact authorized version at import time. */
export function createTemplateCopilotV2SourceSnapshot(row: Record<string, unknown>): TemplateCopilotV2SourceSnapshot {
  const versionId = string(row.id, "version id");
  const templateSnapshot = record(row.template_snapshot, "template snapshot");
  // This is source-version metadata, not the time the browser happened to
  // select it.  In particular, it must never make an otherwise identical
  // lost-response retry hash differently on a later clock tick.
  const sourceVersionTimestamp = timestamp(row.updated_at) || timestamp(row.created_at) || "";
  const source = {
    versionId,
    versionNumber: integer(row.version_number, "version number"),
    templateKey: string(row.template_key, "template key"),
    name: string(templateSnapshot.name || row.name || row.template_name || "Template", "template name"),
    businessName: nonEmpty(row.business_name) || nonEmpty(templateSnapshot.business) || "Source template",
    departmentName: nonEmpty(row.department_name) || nonEmpty(templateSnapshot.department) || "Source template",
    capturedAt: sourceVersionTimestamp,
    templateSnapshot,
  };
  return Object.freeze({ ...source, snapshotHash: createHash("sha256").update(stableJson(source)).digest("hex") });
}

function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`); return value as Record<string, unknown>; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}.`); return value.trim(); }
function integer(value: unknown, label: string): number { if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`Invalid ${label}.`); return Number(value); }
function nonEmpty(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function timestamp(value: unknown) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : undefined; }
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}
