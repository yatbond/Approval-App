import type { TemplateDefinitionV1 } from "./template-authoring-contracts.ts";

/**
 * General authoring routes represent a human or external edit. Only the
 * dedicated Copilot create-draft route may establish Copilot lineage.
 */
export function removeUntrustedCopilotLineage<
  T extends { definition: TemplateDefinitionV1 },
>(command: T): T {
  const generation = { ...command.definition.generation };
  delete generation.sourceSessionId;
  delete generation.sourceSessionRevision;
  return {
    ...command,
    definition: {
      ...command.definition,
      generation: {
        ...generation,
        mode: generation.mode === "copilot" ? "manual" : generation.mode,
      },
    },
  };
}
