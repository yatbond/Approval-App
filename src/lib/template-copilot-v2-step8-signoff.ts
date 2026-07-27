import { z } from "zod";

function normalizedPlaceholderText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPlaceholderReviewer(value: string) {
  const normalized = normalizedPlaceholderText(value);
  return /^(?:tbd|todo|test(?: reviewer)?|example(?: reviewer)?|placeholder(?: reviewer)?|unknown(?: person)?|none|n a|na|xxx|john doe|jane doe)$/u.test(normalized)
    || /\b(?:tbd|todo|unassigned|pending|automated|placeholder)\b/u.test(normalized);
}

function isPlaceholderEvidence(value: string) {
  const normalized = normalizedPlaceholderText(value);
  return /^(?:tbd|todo|test(?: evidence| ticket| reference)?|example(?: evidence| ticket| reference)?|placeholder(?: evidence| ticket| reference)?|unknown|none|n a|na|xxx|pending|unassigned)$/u.test(normalized);
}

const accountableReviewerNameSchema = z.string().trim().min(2).max(160).refine(
  (value) => !/\b(?:ai|model|system)\b/iu.test(value) && !isPlaceholderReviewer(value),
  "A named accountable human reviewer is required.",
);

const durableEvidenceReferenceSchema = z.string().trim().min(3).max(240).refine(
  (value) => !isPlaceholderEvidence(value),
  "A durable non-placeholder evidence reference is required.",
);

const completedReviewFields = {
  reviewerName: accountableReviewerNameSchema,
  reviewedAt: z.string().datetime({ offset: true }),
  evidenceReference: durableEvidenceReferenceSchema,
  attestsAllRowsReviewed: z.literal(true),
} as const;

const localeSignoffSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("pending") }).strict(),
  z.object({
    decision: z.literal("approved"),
    ...completedReviewFields,
  }).strict(),
  z.object({
    decision: z.literal("rejected"),
    ...completedReviewFields,
    issuesSummary: z.string().trim().min(3).max(4_000),
  }).strict(),
]);

export const templateCopilotV2Step8SignoffSchema = z.object({
  schemaVersion: z.literal(1),
  candidateSourceRevision: z.literal("1ba6e8031d866b9d94a89863cc39303f9f935e61"),
  questionLibraryVersion: z.literal("v2.2"),
  conceptLibraryVersion: z.literal("concepts.v1.0"),
  reviewPackageRows: z.literal(1176),
  conceptContentFingerprint: z.literal("fnv1a64:18974b8087ddb5a4"),
  questionContentFingerprint: z.literal("fnv1a64:561391552a3ba191"),
  locales: z.object({
    en: localeSignoffSchema,
    "zh-Hant": localeSignoffSchema,
    "zh-Hans": localeSignoffSchema,
  }).strict(),
}).strict();

export type TemplateCopilotV2Step8Signoff = z.infer<typeof templateCopilotV2Step8SignoffSchema>;

export function validateTemplateCopilotV2Step8Signoff(input: unknown) {
  const parsed = templateCopilotV2Step8SignoffSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false as const,
      productionReady: false as const,
      issues: Object.freeze(parsed.error.issues.map((issue) => Object.freeze({
        path: issue.path.join("."),
        message: issue.message,
      }))),
    });
  }
  const decisions = Object.values(parsed.data.locales).map((review) => review.decision);
  return Object.freeze({
    valid: true as const,
    productionReady: decisions.every((decision) => decision === "approved"),
    signoff: Object.freeze(parsed.data),
    issues: Object.freeze([]),
  });
}
