import {
  templateCopilotV3ProviderQuoteBatches,
  templateCopilotV3ProviderQuoteBatchIds,
  templateCopilotV3ProviderQuoteSlots,
  type TemplateCopilotV3LocatedQuoteItem,
  type TemplateCopilotV3ProviderQuoteBatchId,
  type TemplateCopilotV3ProviderQuoteSlot,
  type TemplateCopilotV3ProviderQuoteSourceSlot,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  assembleTemplateCopilotV3Review,
  type TemplateCopilotV3ReviewAssembly,
} from "./template-copilot-v3-review-assembly.ts";

/**
 * Production read path for the v3 quote-first reader: one source message per
 * Describe section, the five fixed provider batches, then deterministic review
 * assembly. A failed batch is asked again once; a batch that still fails is
 * reported as missing evidence (its facts become follow-up questions) instead
 * of failing the whole description. Configuration and privacy failures are
 * never retried: asking again cannot fix them.
 */

export type TemplateCopilotV3DescribeLocale = "en" | "zh-Hant" | "zh-Hans";

export type TemplateCopilotV3DescribeSection = Readonly<{
  slot: TemplateCopilotV3ProviderQuoteSlot;
  messageId: string;
  text: string;
}>;

export type TemplateCopilotV3BatchExtractor = (input: Readonly<{
  batchId: TemplateCopilotV3ProviderQuoteBatchId;
  sourceSlots: readonly TemplateCopilotV3ProviderQuoteSourceSlot[];
  locale: TemplateCopilotV3DescribeLocale;
}>) => Promise<Readonly<{
  accepted: readonly TemplateCopilotV3LocatedQuoteItem[];
  rejected: readonly unknown[];
}>>;

export type TemplateCopilotV3BatchOutcome = Readonly<{
  batchId: TemplateCopilotV3ProviderQuoteBatchId;
  status: "applied" | "failed";
  attempts: number;
  acceptedItemCount: number;
  rejectedItemCount: number;
  failureReason: string | null;
}>;

export type TemplateCopilotV3DescribeExtraction = Readonly<{
  sourceMessages: Readonly<Record<string, string>>;
  sourceMessageOrder: readonly string[];
  assembly: TemplateCopilotV3ReviewAssembly;
  batches: readonly TemplateCopilotV3BatchOutcome[];
}>;

export class TemplateCopilotV3DescribeExtractionError extends Error {
  readonly reasonCode: string;
  constructor(message: string, reasonCode: string) {
    super(message);
    this.name = "TemplateCopilotV3DescribeExtractionError";
    this.reasonCode = reasonCode;
  }
}

export const templateCopilotV3DescribeMaximumAttemptsPerBatch = 2;
export const templateCopilotV3DescribeMaximumConcurrentBatches = 1;

const unspecifiedSectionText: Readonly<Record<TemplateCopilotV3DescribeLocale, string>> = {
  en: "Not specified.",
  "zh-Hant": "未有說明。",
  "zh-Hans": "未说明。",
};

const nonRetryableReasons = new Set([
  "provider_configuration",
  "privacy_route_rejected",
]);

function failureReasonCode(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Readonly<Record<string, unknown>>)
      : {};
  if (typeof record.reasonCode === "string" && record.reasonCode) {
    return record.reasonCode.slice(0, 64);
  }
  if (error instanceof Error && /timeout|abort/i.test(`${error.name} ${error.message}`)) {
    return "timeout";
  }
  if (error instanceof Error && error.name === "TemplateCopilotConfigurationError") {
    return "provider_configuration";
  }
  return "provider_error";
}

export function templateCopilotV3DescribeSourceSlots(
  sections: readonly TemplateCopilotV3DescribeSection[],
) {
  const bySlot = new Map<TemplateCopilotV3ProviderQuoteSlot, TemplateCopilotV3DescribeSection>();
  for (const section of sections) {
    if (!templateCopilotV3ProviderQuoteSlots.includes(section.slot)) {
      throw new TemplateCopilotV3DescribeExtractionError(
        "A Describe section is not a known slot.",
        "invalid_section",
      );
    }
    if (bySlot.has(section.slot)) {
      throw new TemplateCopilotV3DescribeExtractionError(
        "A Describe section was supplied twice.",
        "invalid_section",
      );
    }
    bySlot.set(section.slot, section);
  }
  return bySlot;
}

export async function extractTemplateCopilotV3Description({
  sections,
  locale,
  extractBatch,
  maximumAttemptsPerBatch = templateCopilotV3DescribeMaximumAttemptsPerBatch,
  maximumConcurrentBatches = templateCopilotV3DescribeMaximumConcurrentBatches,
  shouldContinue = () => true,
}: Readonly<{
  sections: readonly TemplateCopilotV3DescribeSection[];
  locale: TemplateCopilotV3DescribeLocale;
  extractBatch: TemplateCopilotV3BatchExtractor;
  maximumAttemptsPerBatch?: number;
  maximumConcurrentBatches?: number;
  /** Lets the caller stop retrying near its own deadline. */
  shouldContinue?: () => boolean;
}>): Promise<TemplateCopilotV3DescribeExtraction> {
  const bySlot = templateCopilotV3DescribeSourceSlots(sections);
  if (![...bySlot.values()].some((section) => section.text.trim().length > 0)) {
    throw new TemplateCopilotV3DescribeExtractionError(
      "The description is empty.",
      "empty_description",
    );
  }
  const sourceMessageOrder = templateCopilotV3ProviderQuoteSlots.flatMap(
    (slot) => (bySlot.get(slot)?.text.trim() ? [bySlot.get(slot)!.messageId] : []),
  );
  const sourceMessages = Object.freeze(
    Object.fromEntries(
      [...bySlot.values()]
        .filter((section) => section.text.trim().length > 0)
        .map((section) => [section.messageId, section.text]),
    ),
  );

  type BatchRun = Readonly<{
    outcome: TemplateCopilotV3BatchOutcome;
    accepted: readonly TemplateCopilotV3LocatedQuoteItem[];
  }>;
  const runBatch = async (
    batchId: TemplateCopilotV3ProviderQuoteBatchId,
  ): Promise<BatchRun> => {
    const sourceSlots = templateCopilotV3ProviderQuoteBatches[batchId].slots.map(
      (slot) => {
        const section = bySlot.get(slot);
        // The provider needs every slot of its batch. An empty section is sent
        // as a neutral placeholder outside the source messages, so nothing
        // quoted from it can ever become evidence.
        return section?.text.trim()
          ? { slot, messageId: section.messageId, text: section.text }
          : {
              slot,
              messageId: `describe:${slot}:unspecified`,
              text: unspecifiedSectionText[locale],
            };
      },
    );
    if (sourceSlots.every((slot) => !(slot.messageId in sourceMessages))) {
      return {
        accepted: [],
        outcome: Object.freeze({
          batchId,
          status: "applied" as const,
          attempts: 0,
          acceptedItemCount: 0,
          rejectedItemCount: 0,
          failureReason: null,
        }),
      };
    }
    let attempts = 0;
    let failureReason: string | null = null;
    let result: Awaited<ReturnType<TemplateCopilotV3BatchExtractor>> | null = null;
    while (attempts < maximumAttemptsPerBatch && (attempts === 0 || shouldContinue())) {
      attempts += 1;
      try {
        result = await extractBatch({ batchId, sourceSlots, locale });
        failureReason = null;
        break;
      } catch (error) {
        failureReason = failureReasonCode(error);
        if (nonRetryableReasons.has(failureReason)) {
          throw new TemplateCopilotV3DescribeExtractionError(
            "The Copilot model is unavailable.",
            failureReason,
          );
        }
      }
    }
    return {
      accepted: result?.accepted ?? [],
      outcome: Object.freeze({
        batchId,
        status: result ? ("applied" as const) : ("failed" as const),
        attempts,
        acceptedItemCount: result?.accepted.length ?? 0,
        rejectedItemCount: result?.rejected.length ?? 0,
        failureReason,
      }),
    };
  };
  // The batches are independent reads of fixed sections, so a small number run
  // together (a self-hosted server has few slots; more would only queue and hit
  // the provider timeout). Results are merged in the fixed batch order.
  const runs: BatchRun[] = new Array(templateCopilotV3ProviderQuoteBatchIds.length);
  let nextBatch = 0;
  const lane = async () => {
    while (nextBatch < templateCopilotV3ProviderQuoteBatchIds.length) {
      const index = nextBatch;
      nextBatch += 1;
      runs[index] = await runBatch(templateCopilotV3ProviderQuoteBatchIds[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(maximumConcurrentBatches, templateCopilotV3ProviderQuoteBatchIds.length)) },
      lane,
    ),
  );
  const accepted: TemplateCopilotV3LocatedQuoteItem[] = runs.flatMap((run) => [...run.accepted]);
  const batches: TemplateCopilotV3BatchOutcome[] = runs.map((run) => run.outcome);
  const attempted = batches.filter((batch) => batch.attempts > 0);
  if (attempted.length > 0 && attempted.every((batch) => batch.status === "failed")) {
    throw new TemplateCopilotV3DescribeExtractionError(
      "The Copilot model did not answer.",
      attempted[0].failureReason ?? "provider_error",
    );
  }

  const assembly = assembleTemplateCopilotV3Review({
    items: accepted,
    sourceMessages,
    sourceMessageOrder,
  });
  return Object.freeze({
    sourceMessages,
    sourceMessageOrder: Object.freeze(sourceMessageOrder),
    assembly,
    batches: Object.freeze(batches),
  });
}
