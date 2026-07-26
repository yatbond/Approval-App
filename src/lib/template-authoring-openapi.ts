export const templateAuthoringOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Approval Workflow Template Authoring API",
    version: "1.0.0",
    description:
      "Server-authoritative API for requirements dossiers, workflow drafts, validation, simulation, review, and immutable publication.",
  },
  servers: [{ url: "/" }],
  security: [{ cookieAuth: [] }],
  paths: {
    "/api/template-authoring/context": {
      get: operation("getAuthoringContext", "Read actor permissions and capabilities"),
    },
    "/api/template-authoring/families": {
      get: operation("listTemplateFamilies", "List visible workflow families", {
        parameters: [
          queryParameter("status", {
            type: "string",
            enum: ["active", "archived", "all"],
          }),
          queryParameter("limit", {
            type: "integer",
            minimum: 1,
            maximum: 100,
          }),
        ],
      }),
      post: operation("createTemplateFamily", "Create a family and initial draft", {
        requestBody: jsonRequest("CreateTemplateFamilyCommand"),
      }),
    },
    "/api/template-authoring/drafts/{draftId}": {
      get: operation("getTemplateDraft", "Read one visible authoring draft", {
        parameters: [pathParameter("draftId")],
      }),
      put: operation("replaceTemplateDraft", "Replace a draft at an expected revision", {
        parameters: [pathParameter("draftId")],
        requestBody: jsonRequest("ReplaceTemplateDraftCommand"),
      }),
    },
    "/api/template-authoring/families/{familyId}/drafts": {
      post: operation("createTemplateDraft", "Create the next editable family draft", {
        parameters: [pathParameter("familyId")],
        requestBody: jsonRequest("CreateTemplateDraftCommand"),
      }),
    },
    "/api/template-authoring/validate": {
      post: operation("validateTemplateDefinition", "Run coded validation", {
        requestBody: jsonRequest("TemplateDefinitionInput"),
      }),
    },
    "/api/template-authoring/simulate": {
      post: operation("simulateTemplateDefinition", "Simulate a workflow route", {
        requestBody: jsonRequest("TemplateSimulationCommand"),
      }),
    },
    "/api/template-authoring/diff": {
      post: operation("diffTemplateDefinitions", "Diff two executable definitions", {
        requestBody: jsonRequest("TemplateDiffCommand"),
      }),
    },
    "/api/template-authoring/drafts/{draftId}/publish-requests": {
      post: operation("requestTemplatePublication", "Submit a validated revision for review", {
        parameters: [pathParameter("draftId")],
        requestBody: jsonRequest("RequestTemplatePublishCommand"),
      }),
    },
    "/api/template-authoring/publish-requests/{requestId}/review": {
      post: operation("reviewTemplatePublication", "Approve, reject, or request changes", {
        parameters: [pathParameter("requestId")],
        requestBody: jsonRequest("ReviewTemplatePublishCommand"),
      }),
    },
    "/api/template-authoring/publish-requests/{requestId}/publish": {
      post: operation("publishTemplateVersion", "Create an immutable inactive version", {
        parameters: [pathParameter("requestId")],
        requestBody: jsonRequest("PublishTemplateDraftCommand"),
      }),
    },
    "/api/template-authoring/copilot/sessions": {
      get: operation("listTemplateCopilotSessions", "List saved Copilot interviews", {
        parameters: [
          queryParameter("view", {
            type: "string",
            enum: ["mine", "review"],
            default: "mine",
            description:
              "Employees can read mine. Review requires an active Admin or superuser role.",
          }),
          queryParameter("limit", {
            type: "integer",
            minimum: 1,
            maximum: 50,
            default: 20,
          }),
        ],
      }),
      post: operation("startTemplateCopilotSession", "Start a governed requirements interview", {
        requestBody: jsonRequest("TemplateCopilotStartCommand"),
      }),
    },
    "/api/template-authoring/copilot/sessions/{sessionId}": {
      get: operation("getTemplateCopilotSession", "Read an owner- or Admin-scoped transcript", {
        parameters: [pathParameter("sessionId")],
      }),
    },
    "/api/template-authoring/copilot/sessions/{sessionId}/messages": {
      post: operation("answerTemplateCopilotQuestion", "Answer the current governed interview question", {
        parameters: [pathParameter("sessionId")],
        requestBody: jsonRequest("TemplateCopilotTurnCommand"),
      }),
    },
    "/api/template-authoring/copilot/sessions/{sessionId}/documents": {
      post: operation("attachTemplateCopilotRequirements", "Attach a bounded untrusted requirements document", {
        parameters: [pathParameter("sessionId")],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "expectedRevision", "clientMessageId"],
                properties: {
                  file: { type: "string", format: "binary" },
                  expectedRevision: { type: "integer", minimum: 1 },
                  clientMessageId: boundedString(128),
                },
              },
            },
          },
        },
      }),
    },
    "/api/template-authoring/copilot/sessions/{sessionId}/create-draft": {
      post: operation("createTemplateCopilotDraft", "Generate and validate an editable draft after confirmation", {
        parameters: [pathParameter("sessionId")],
        requestBody: jsonRequest("TemplateCopilotCreateDraftCommand"),
      }),
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "sb-access-token",
        description:
          "Corporate Supabase session cookie. External agents should use the approved delegated-auth gateway.",
      },
    },
    schemas: {
      TemplateRequirementsDossierV1: {
        type: "object",
        required: [
          "schemaVersion",
          "dossierId",
          "title",
          "purpose",
          "businessScope",
          "initiation",
          "attachmentRequirements",
          "stages",
          "routes",
          "collaboration",
          "notifications",
          "governance",
          "assumptions",
          "openQuestions",
        ],
        properties: {
          schemaVersion: { const: 1 },
          dossierId: boundedString(120),
          title: boundedString(200),
          purpose: boundedString(4_000),
          businessScope: { type: "object" },
          initiation: { type: "object" },
          attachmentRequirements: { type: "array", maxItems: 100 },
          stages: { type: "array", minItems: 1, maxItems: 100 },
          routes: { type: "array", minItems: 1, maxItems: 300 },
          collaboration: { type: "object" },
          notifications: { type: "object" },
          governance: { type: "object" },
          assumptions: { type: "array", maxItems: 100 },
          openQuestions: { type: "array", maxItems: 100 },
          citations: {
            type: "array",
            maxItems: 300,
            items: {
              type: "object",
              required: ["id", "targetPath", "source"],
              properties: {
                id: boundedString(120),
                targetPath: boundedString(500),
                source: { type: "object" },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      TemplateDefinitionV1: {
        type: "object",
        required: ["schemaVersion", "template", "sourceDossierId", "generation"],
        properties: {
          schemaVersion: { const: 1 },
          template: { type: "object" },
          sourceDossierId: boundedString(120),
          generation: { type: "object" },
        },
        additionalProperties: false,
      },
      CreateTemplateFamilyCommand: {
        type: "object",
        required: [
          "familyKey",
          "name",
          "businessUnitId",
          "departmentId",
          "dossier",
          "definition",
          "changeReason",
          "idempotencyKey",
        ],
        properties: {
          familyKey: boundedString(120),
          name: boundedString(300),
          businessUnitId: { type: "string", format: "uuid" },
          departmentId: { type: "string", format: "uuid" },
          dossier: { $ref: "#/components/schemas/TemplateRequirementsDossierV1" },
          definition: { $ref: "#/components/schemas/TemplateDefinitionV1" },
          changeReason: boundedString(2_000),
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
      ReplaceTemplateDraftCommand: {
        type: "object",
        required: [
          "expectedRevision",
          "dossier",
          "definition",
          "changeReason",
          "idempotencyKey",
        ],
        properties: {
          expectedRevision: { type: "integer", minimum: 0 },
          dossier: { $ref: "#/components/schemas/TemplateRequirementsDossierV1" },
          definition: { $ref: "#/components/schemas/TemplateDefinitionV1" },
          changeReason: boundedString(2_000),
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
      CreateTemplateDraftCommand: {
        type: "object",
        required: ["dossier", "definition", "changeReason", "idempotencyKey"],
        properties: {
          dossier: { $ref: "#/components/schemas/TemplateRequirementsDossierV1" },
          definition: { $ref: "#/components/schemas/TemplateDefinitionV1" },
          changeReason: boundedString(2_000),
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
      TemplateDefinitionInput: {
        type: "object",
        required: ["dossier", "definition"],
        properties: {
          dossier: { $ref: "#/components/schemas/TemplateRequirementsDossierV1" },
          definition: { $ref: "#/components/schemas/TemplateDefinitionV1" },
        },
        additionalProperties: false,
      },
      TemplateSimulationCommand: {
        allOf: [
          { $ref: "#/components/schemas/TemplateDefinitionInput" },
          {
            type: "object",
            properties: {
              extractedFields: { type: "object", maxProperties: 200 },
              nodeDecisions: { type: "object", maxProperties: 100 },
            },
          },
        ],
      },
      TemplateDiffCommand: {
        type: "object",
        required: ["before", "after"],
        properties: {
          before: { $ref: "#/components/schemas/TemplateDefinitionV1" },
          after: { $ref: "#/components/schemas/TemplateDefinitionV1" },
        },
        additionalProperties: false,
      },
      RequestTemplatePublishCommand: {
        type: "object",
        required: ["expectedRevision", "idempotencyKey"],
        properties: {
          expectedRevision: { type: "integer", minimum: 0 },
          requestNote: boundedString(4_000),
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
      ReviewTemplatePublishCommand: {
        type: "object",
        required: ["decision", "idempotencyKey"],
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "request_changes", "reject"],
          },
          reviewNote: boundedString(4_000),
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
      PublishTemplateDraftCommand: {
        type: "object",
        required: ["idempotencyKey"],
        properties: { idempotencyKey: boundedString(128) },
        additionalProperties: false,
      },
      TemplateCopilotStartCommand: {
        type: "object",
        required: ["businessUnitId", "departmentName", "clientMessageId"],
        properties: {
          businessUnitId: { type: "string", format: "uuid" },
          departmentName: boundedString(200),
          clientMessageId: boundedString(128),
        },
        additionalProperties: false,
      },
      TemplateCopilotTurnCommand: {
        type: "object",
        required: ["expectedRevision", "message", "clientMessageId"],
        properties: {
          expectedRevision: { type: "integer", minimum: 1 },
          message: boundedString(16_000),
          clientMessageId: boundedString(128),
        },
        additionalProperties: false,
      },
      TemplateCopilotCreateDraftCommand: {
        type: "object",
        required: ["expectedRevision", "idempotencyKey"],
        properties: {
          expectedRevision: { type: "integer", minimum: 1 },
          idempotencyKey: boundedString(128),
        },
        additionalProperties: false,
      },
    },
  },
} as const;

function operation(
  operationId: string,
  summary: string,
  extra: Record<string, unknown> = {},
) {
  return {
    operationId,
    summary,
    ...extra,
    responses: {
      "200": { description: "Success" },
      "201": { description: "Created" },
      "400": { description: "Invalid request" },
      "401": { description: "Authentication required" },
      "403": { description: "Forbidden" },
      "409": { description: "Revision, state, or idempotency conflict" },
      "422": { description: "Coded validation or business precondition failed" },
      "503": { description: "Dependency unavailable" },
    },
  };
}

function jsonRequest(schemaName: string) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function pathParameter(name: string) {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
}

function queryParameter(name: string, schema: Record<string, unknown>) {
  return { name, in: "query", required: false, schema };
}

function boundedString(maxLength: number) {
  return { type: "string", minLength: 1, maxLength };
}
