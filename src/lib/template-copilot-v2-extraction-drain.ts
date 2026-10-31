import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  processTemplateCopilotV2AnswerExtractionJob,
} from "./template-copilot-v2-server-data.ts";
import {
  isTemplateCopilotV2CandidateCreationEnabled,
  isTemplateCopilotV2Enabled,
} from "./template-copilot-v2-feature.ts";

type ExtractionDrainEnvironment = Record<string, string | undefined>;
type ExtractionJobProcessor = typeof processTemplateCopilotV2AnswerExtractionJob;
type ExtractionCandidateProvider = NonNullable<
  Parameters<ExtractionJobProcessor>[0]["dependencies"]["extractCandidates"]
>;

type DequeuedExtractionJob = Readonly<{
  jobId: string;
  ownerId: string;
  sessionId: string;
  leaseToken: string;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultBatchSize = 4;
const maximumBatchSize = 8;
const defaultConcurrency = 2;
const maximumConcurrency = 4;
const defaultTimeBudgetMs = 25_000;
const maximumTimeBudgetMs = 30_000;
const leaseSeconds = 60;

function boundedInteger(value: number, fallback: number, minimum: number, maximum: number) {
  return Number.isSafeInteger(value)
    ? Math.min(Math.max(value, minimum), maximum)
    : fallback;
}

function dequeueField(row: Record<string, unknown>, camel: string, snake: string) {
  const value = row[camel] ?? row[snake];
  return typeof value === "string" ? value : "";
}

function parseDequeuedJobs(value: unknown, expectedMaximum: number): DequeuedExtractionJob[] {
  if (!Array.isArray(value) || value.length > expectedMaximum) {
    throw new Error("The extraction job dequeue returned an invalid batch.");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("The extraction job dequeue returned an invalid binding.");
    }
    const row = entry as Record<string, unknown>;
    const job = Object.freeze({
      jobId: dequeueField(row, "jobId", "job_id"),
      ownerId: dequeueField(row, "ownerId", "owner_id"),
      sessionId: dequeueField(row, "sessionId", "session_id"),
      leaseToken: dequeueField(row, "leaseToken", "lease_token"),
    });
    if (
      !uuidPattern.test(job.jobId)
      || !uuidPattern.test(job.ownerId)
      || !uuidPattern.test(job.sessionId)
      || !uuidPattern.test(job.leaseToken)
      || seen.has(job.jobId)
    ) {
      throw new Error("The extraction job dequeue returned an invalid binding.");
    }
    seen.add(job.jobId);
    return job;
  });
}

async function defaultExtractCandidates(
  input: Parameters<ExtractionCandidateProvider>[0],
) {
  const { extractTemplateCopilotV2Candidates } = await import("./template-copilot-ai.ts");
  return extractTemplateCopilotV2Candidates(input);
}

function createExtractionServiceClient(env: ExtractionDrainEnvironment) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Server approval database credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Drains only due, already-durable extraction jobs. The database returns no
 * answer text here; the owner-bound claim inside the processor resolves the
 * private transcript after verifying the opaque owner/session/job binding.
 */
export async function drainTemplateCopilotV2ExtractionJobs({
  env = process.env,
  service,
  batchSize = defaultBatchSize,
  concurrency = defaultConcurrency,
  timeBudgetMs = defaultTimeBudgetMs,
  clock = Date.now,
  processJob = processTemplateCopilotV2AnswerExtractionJob,
  extractCandidates = defaultExtractCandidates,
}: {
  env?: ExtractionDrainEnvironment;
  service?: SupabaseClient;
  batchSize?: number;
  concurrency?: number;
  timeBudgetMs?: number;
  clock?: () => number;
  processJob?: ExtractionJobProcessor;
  extractCandidates?: ExtractionCandidateProvider;
} = {}) {
  if (
    !isTemplateCopilotV2Enabled(env)
    || !isTemplateCopilotV2CandidateCreationEnabled(env)
  ) {
    return {
      outcome: "disabled",
      dequeued: 0,
      attempted: 0,
      completed: 0,
      superseded: 0,
      retry: 0,
      failed: 0,
      busy: 0,
      deferred: 0,
      errors: 0,
      skipped: 0,
    } as const;
  }

  const boundedBatchSize = boundedInteger(
    batchSize,
    defaultBatchSize,
    1,
    maximumBatchSize,
  );
  const boundedConcurrency = boundedInteger(
    concurrency,
    defaultConcurrency,
    1,
    maximumConcurrency,
  );
  const boundedTimeBudgetMs = boundedInteger(
    timeBudgetMs,
    defaultTimeBudgetMs,
    1_000,
    maximumTimeBudgetMs,
  );
  const startedAt = clock();
  const database = service || createExtractionServiceClient(env);
  const { data, error } = await database.rpc(
    "dequeue_template_copilot_v2_answer_extraction_jobs",
    {
      p_limit: boundedBatchSize,
      p_lease_seconds: leaseSeconds,
    },
  );
  if (error) {
    throw new Error(`Template Copilot extraction dequeue failed: ${error.code || "unknown"}`);
  }
  const jobs = parseDequeuedJobs(data || [], boundedBatchSize);
  const totals = {
    outcome: "completed" as "completed" | "partial" | "time_budget_exhausted",
    dequeued: jobs.length,
    attempted: 0,
    completed: 0,
    superseded: 0,
    retry: 0,
    failed: 0,
    busy: 0,
    deferred: 0,
    errors: 0,
    skipped: 0,
  };
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      if (clock() - startedAt >= boundedTimeBudgetMs) return;
      const job = jobs[nextIndex];
      nextIndex += 1;
      totals.attempted += 1;
      try {
        const result = await processJob({
          session: database,
          service: database,
          actor: { id: job.ownerId },
          sessionId: job.sessionId,
          jobId: job.jobId,
          dependencies: {
            leaseToken: job.leaseToken,
            extractCandidates,
          },
          flag: { enabled: true },
        });
        const outcome = String((result as { outcome?: unknown }).outcome || "");
        if (outcome === "completed") totals.completed += 1;
        else if (outcome === "superseded") totals.superseded += 1;
        else if (outcome === "retry") totals.retry += 1;
        else if (outcome === "failed" || outcome === "exhausted") totals.failed += 1;
        else if (outcome === "busy" || outcome === "lost_lease") totals.busy += 1;
        else totals.deferred += 1;
      } catch {
        // The leased job remains recoverable after expiry. Never log the job,
        // owner, session, provider payload, or raw answer from this layer.
        totals.errors += 1;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(boundedConcurrency, jobs.length) },
      () => worker(),
    ),
  );
  totals.skipped = jobs.length - totals.attempted;
  totals.outcome = totals.errors > 0
    ? "partial"
    : totals.skipped > 0
      ? "time_budget_exhausted"
      : "completed";
  return totals;
}
