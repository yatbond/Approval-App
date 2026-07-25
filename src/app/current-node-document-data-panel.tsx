"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import type { ApprovalTask, WorkflowDocumentRequirement } from "@/lib/types";
import { NativeFormFieldInput } from "./native-form-field-input";
import { InfoTip } from "./ui-hint";

export function CurrentNodeDocumentDataPanel({
  task,
  documents,
  onSave,
}: {
  task: ApprovalTask;
  documents: WorkflowDocumentRequirement[];
  onSave: (values: Record<string, string>) => void;
}) {
  const visibleDocuments = documents.filter(
    (document) =>
      document.fields.length > 0 &&
      (task.attachments || []).some(
        (attachment) => attachment.documentId === document.id,
      ),
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      visibleDocuments.flatMap((document) =>
        document.fields.map((field) => [
          field.label,
          task.extractedFields[field.label] ?? task.extractedFields[field.name] ?? "",
        ]),
      ),
    ),
  );

  if (!visibleDocuments.length) return null;

  return (
    <section className="mt-3 rounded-md border border-[#e2e2e2] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Document data
        </h3>
        <InfoTip label="AI/OCR fills these values from the uploaded document. Check and correct them before approving." />
      </div>
      <div className="mt-3 space-y-4">
        {visibleDocuments.map((document) => (
          <div key={document.id}>
            <p className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              {document.documentType}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {document.fields.map((field) => (
                <NativeFormFieldInput
                  key={field.name}
                  field={field}
                  idPrefix={document.id}
                  value={values[field.label] || ""}
                  onFocus={() => undefined}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.label]: value }))
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(values)}
        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] hover:bg-[#df7f0a]"
      >
        <Save size={15} /> Save document data
      </button>
    </section>
  );
}
