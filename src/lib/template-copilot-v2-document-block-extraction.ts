import type { TemplateCopilotV2AtomicProvider } from "./template-copilot-v2-atomic-candidates.ts";
import type { TemplateCopilotDocumentExtractionBlock } from "./template-copilot-safety.ts";

export const templateCopilotV2DocumentBlockConcurrency = 3 as const;
export const templateCopilotV2DocumentMaximumAtoms = 64 as const;

export type TemplateCopilotV2DocumentBlockExtractionSummary = Readonly<{
  attemptedBlockCount: number;
  completedBlockCount: number;
  failedBlockCount: number;
  retainedAtomCount: number;
  truncatedAtomCount: number;
}>;
export type TemplateCopilotV2DocumentAtomSourceScope = Readonly<{
  startCodeUnit: number;
  endCodeUnit: number;
}>;

export async function runTemplateCopilotV2DocumentBlockExtraction({
  blocks,
  request,
}: {
  blocks: readonly TemplateCopilotDocumentExtractionBlock[];
  request: (
    block: TemplateCopilotDocumentExtractionBlock,
  ) => Promise<Readonly<{ atoms: readonly TemplateCopilotV2AtomicProvider[] }>>;
}): Promise<Readonly<{
  output: Readonly<{
    atoms: readonly TemplateCopilotV2AtomicProvider[];
    sourceScopes: readonly TemplateCopilotV2DocumentAtomSourceScope[];
  }>;
  summary: TemplateCopilotV2DocumentBlockExtractionSummary;
}>> {
  if (!blocks.length) {
    throw new Error("A requirement document has no safe extraction blocks.");
  }
  const results: Array<
    | Readonly<{ status: "fulfilled"; atoms: readonly TemplateCopilotV2AtomicProvider[] }>
    | Readonly<{ status: "rejected"; error: unknown }>
    | undefined
  > = new Array(blocks.length);
  let nextIndex = 0;
  const workerCount = Math.min(
    templateCopilotV2DocumentBlockConcurrency,
    blocks.length,
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < blocks.length) {
        const index = nextIndex;
        nextIndex += 1;
        try {
          const output = await request(blocks[index]);
          results[index] = Object.freeze({
            status: "fulfilled",
            atoms: output.atoms,
          });
        } catch (error) {
          results[index] = Object.freeze({ status: "rejected", error });
        }
      }
    }),
  );

  const completed = results.flatMap((result) =>
    result?.status === "fulfilled" ? [result] : [],
  );
  if (!completed.length) {
    const firstFailure = results.find(
      (result) => result?.status === "rejected",
    );
    throw firstFailure && firstFailure.status === "rejected"
      ? firstFailure.error
      : new Error("Requirement document extraction did not complete.");
  }
  const allAtoms = results.flatMap((result, blockIndex) =>
    result?.status === "fulfilled"
      ? result.atoms.map((atom, atomIndex) => ({
          atom,
          blockIndex,
          atomIndex,
          sourceScope: Object.freeze({
            startCodeUnit: blocks[blockIndex].startCodeUnit,
            endCodeUnit: blocks[blockIndex].endCodeUnit,
          }),
        }))
      : [],
  );
  const atomsByBlock = Map.groupBy(allAtoms, (item) => item.blockIndex);
  const retainedAtoms: typeof allAtoms = [];
  for (
    let atomIndex = 0;
    retainedAtoms.length < templateCopilotV2DocumentMaximumAtoms;
    atomIndex += 1
  ) {
    let retainedInRound = false;
    for (const block of blocks) {
      const item = atomsByBlock.get(block.index)?.[atomIndex];
      if (!item) continue;
      retainedAtoms.push(item);
      retainedInRound = true;
      if (
        retainedAtoms.length >= templateCopilotV2DocumentMaximumAtoms
      ) {
        break;
      }
    }
    if (!retainedInRound) break;
  }
  retainedAtoms.sort(
    (left, right) =>
      left.blockIndex - right.blockIndex ||
      left.atomIndex - right.atomIndex,
  );
  return Object.freeze({
    output: Object.freeze({
      atoms: Object.freeze(retainedAtoms.map((item) => item.atom)),
      sourceScopes: Object.freeze(
        retainedAtoms.map((item) => item.sourceScope),
      ),
    }),
    summary: Object.freeze({
      attemptedBlockCount: blocks.length,
      completedBlockCount: completed.length,
      failedBlockCount: blocks.length - completed.length,
      retainedAtomCount: retainedAtoms.length,
      truncatedAtomCount: allAtoms.length - retainedAtoms.length,
    }),
  });
}
