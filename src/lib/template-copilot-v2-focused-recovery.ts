import type { TemplateCopilotFactId } from "./template-copilot-v2-canonical-values.ts";
import type { TemplateCopilotV2ExtractionSection } from "./template-copilot-v2-extraction-context.ts";

export type TemplateCopilotV2FocusedRecoverySummary = Readonly<{
  attemptedFactCount: number;
  completedFactCount: number;
  failedFactCount: number;
}>;

export type TemplateCopilotV2FocusedRecoveryResult<Output> = Readonly<{
  outputs: readonly Readonly<{
    output: Output;
    allowedFactIds: readonly TemplateCopilotFactId[];
  }>[];
  recovery: TemplateCopilotV2FocusedRecoverySummary | null;
}>;

/**
 * A malformed structured response for one focused interview section is retried
 * once per canonical fact. Successful fact calls survive independently; a
 * failed fact remains unresolved. Provider outages/configuration failures and
 * broad all/document extraction are deliberately not multiplied.
 */
export async function runTemplateCopilotV2FocusedRecovery<Output>({
  section,
  allowedFactIds,
  request,
  isRecoverableFailure,
}: {
  section: TemplateCopilotV2ExtractionSection;
  allowedFactIds: readonly TemplateCopilotFactId[];
  request: (input: {
    allowedFactIds: readonly TemplateCopilotFactId[];
    phase: "primary" | "focused_recovery";
  }) => Promise<Output>;
  isRecoverableFailure: (error: unknown) => boolean;
}): Promise<TemplateCopilotV2FocusedRecoveryResult<Output>> {
  try {
    return Object.freeze({
      outputs: Object.freeze([
        Object.freeze({
          output: await request({ allowedFactIds, phase: "primary" }),
          allowedFactIds,
        }),
      ]),
      recovery: null,
    });
  } catch (primaryError) {
    if (
      section === "all" ||
      section === "document" ||
      !allowedFactIds.length ||
      !isRecoverableFailure(primaryError)
    ) {
      throw primaryError;
    }

    const attempts = await Promise.allSettled(
      allowedFactIds.map((factId) =>
        request({
          allowedFactIds: Object.freeze([factId]),
          phase: "focused_recovery",
        }),
      ),
    );
    const outputs = attempts.flatMap((attempt, index) =>
      attempt.status === "fulfilled"
        ? [Object.freeze({
            output: attempt.value,
            allowedFactIds: Object.freeze([allowedFactIds[index]]),
          })]
        : [],
    );
    if (!outputs.length) throw primaryError;

    return Object.freeze({
      outputs: Object.freeze(outputs),
      recovery: Object.freeze({
        attemptedFactCount: attempts.length,
        completedFactCount: outputs.length,
        failedFactCount: attempts.length - outputs.length,
      }),
    });
  }
}
