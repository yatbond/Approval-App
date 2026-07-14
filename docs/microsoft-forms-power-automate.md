# Microsoft Forms to Approval App

This runbook connects one registered Microsoft Form version to Approval App through Power Automate.

## Prerequisites

- Save the Microsoft Form in **Workflow > Forms** and confirm its status is **Ready**.
- Open **Power Automate setup values** for the saved version.
- Configure `FORM_INTAKE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` on the Vercel deployment.
- The Power Automate HTTP action may require a Premium Power Automate license.

## Flow

1. Create an automated cloud flow.
2. Add Microsoft Forms trigger **When a new response is submitted**.
3. Add Microsoft Forms action **Get response details** using the trigger response ID.
4. Add Microsoft Forms action **Get form details** and retain its modified date when available.
5. For each file-upload question, parse the JSON response and create an HTTPS download URL. The Approval App server must be able to fetch this URL when a registered field uses **AI from attachment**. Do not send binary file data in the webhook body.
6. Add an HTTP `POST` action to `https://<approval-app-domain>/api/form-intake`.
7. Add headers:

   ```text
   Authorization: Bearer <FORM_INTAKE_WEBHOOK_SECRET>
   Content-Type: application/json
   ```

8. Build the body using the saved setup values:

   ```json
   {
     "provider": "microsoft_forms",
     "workspaceOwnerEmail": "owner@example.com",
     "formKey": "registered-form-key",
     "formVersion": 1,
     "externalFormId": "microsoft-form-id",
     "externalResponseId": "<Response Id>",
     "responseMode": "complete_node",
     "schemaFingerprint": "<pinned schema fingerprint>",
     "approvalRequestNo": "<Approval Request Reference answer>",
     "formModifiedAt": "<form modified date>",
     "respondentName": "<respondent name>",
     "respondentEmail": "<respondent email>",
     "answers": {
       "registered_field_name": "<Get response details value>"
     },
     "attachments": [
       {
         "fieldName": "registered_upload_name",
         "fileName": "<uploaded file name>",
         "contentType": "image/jpeg",
         "downloadUrl": "<Microsoft 365 sharing/download link>",
         "driveItemId": "<Microsoft 365 drive item id>"
       }
     ]
   }
   ```

For `start_workflow`, use that response mode and omit `approvalRequestNo` unless a deterministic external request number is required. The registered form must provide every participant email that is not fixed in the workflow template.

## Matching and Safety

- `workspaceOwnerEmail`, `formKey`, and `formVersion` identify one pinned registration.
- `externalFormId` and `schemaFingerprint` must match that registration.
- `externalResponseId` is the idempotency key. Retried deliveries return the stored result and do not create another request.
- `complete_node` requires the form to be pinned to the request workflow and requires `approvalRequestNo`.
- Unknown questions, missing required questions, missing required uploads, or a changed fingerprint are stored as `schema_changed` and do not alter a request.
- A request data field sourced from **AI from attachment** is not expected in `answers`. Approval App downloads the matching registered attachment, parses it, and writes the result into that canonical field.
- Required AI-derived fields fail safely when the registered attachment or its `downloadUrl` is missing, or extraction returns no value.
- A completed-node response supplies values and files; it does not approve the workflow box. The box owner still makes the approval decision.

## Test Checklist

1. Send one valid response and confirm HTTP `200` with `status: processed`.
2. Send the same response ID again and confirm `duplicate: true`.
3. Change the fingerprint and confirm HTTP `422` with `status: schema_changed`.
4. Omit a required answer and required upload in separate tests; both must return `422`.
5. For complete-node mode, use an invalid request reference and confirm no request changes.
6. For start-workflow mode, omit one required participant email and confirm no request is created.
7. For a PDF or image attachment linked to an AI field, confirm the extracted value appears in Queue/Tracking and remains editable before the workflow decision.
8. Verify each Microsoft 365 attachment link opens for an authorized user.

## Operational Notes

- Microsoft 365 links shown to users may require Microsoft sign-in. The `downloadUrl` used for server-side AI extraction must be directly fetchable by Approval App and may be a separate time-limited URL.
- Server-side Microsoft Forms attachment extraction currently supports PDF and image files. Excel files can still be attached, but are not AI-parsed through this intake path.
- Create a new Form Library version after changing Microsoft Forms questions. Review and republish affected workflow templates before activating the new version.
- Keep the webhook secret server-only. Never place the service-role key or webhook secret in client-side variables.
