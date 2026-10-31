export const templateCopilotOpenRouterRoutingProfileEnvironmentVariable =
  "TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE";

export const templateCopilotOpenRouterQualificationRoutingProfile =
  "qualification_throughput_single_attempt_v1" as const;

export type TemplateCopilotOpenRouterRoutingProfile =
  typeof templateCopilotOpenRouterQualificationRoutingProfile;

export type TemplateCopilotOpenRouterProviderRouting = Readonly<{
  require_parameters: true;
  zdr?: true;
  sort?: "throughput";
  ignore?: readonly ["akashml"];
  allow_fallbacks?: false;
}>;

export class TemplateCopilotOpenRouterRoutingProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateCopilotOpenRouterRoutingProfileError";
  }
}

export function resolveTemplateCopilotOpenRouterRouting({
  rawProfile,
  requireZdr,
  vercelEnvironment,
}: Readonly<{
  rawProfile: string | undefined;
  requireZdr: boolean;
  vercelEnvironment: string | undefined;
}>): Readonly<{
  profile: TemplateCopilotOpenRouterRoutingProfile | null;
  provider: TemplateCopilotOpenRouterProviderRouting;
}> {
  const profile = rawProfile?.trim() || null;
  if (
    profile !== null &&
    profile !== templateCopilotOpenRouterQualificationRoutingProfile
  ) {
    throw new TemplateCopilotOpenRouterRoutingProfileError(
      `${templateCopilotOpenRouterRoutingProfileEnvironmentVariable} must be ${templateCopilotOpenRouterQualificationRoutingProfile} or unset.`,
    );
  }
  if (profile !== null && vercelEnvironment === "production") {
    throw new TemplateCopilotOpenRouterRoutingProfileError(
      `${templateCopilotOpenRouterRoutingProfileEnvironmentVariable} is forbidden in Production.`,
    );
  }

  return Object.freeze({
    profile,
    provider: Object.freeze({
      require_parameters: true as const,
      ...(requireZdr ? { zdr: true as const } : {}),
      ...(profile === templateCopilotOpenRouterQualificationRoutingProfile
        ? {
            sort: "throughput" as const,
            ignore: Object.freeze(["akashml"] as const),
            allow_fallbacks: false as const,
          }
        : {}),
    }),
  });
}
