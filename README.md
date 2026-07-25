# Approval App

Configurable approval workflow platform for creating request forms, uploading and
parsing documents, routing sequential or parallel approvals, collaborating on
missing inputs, and tracking every decision.

## Current Capabilities

- Versioned workflow templates with Submit, Approval, FYI, Condition, and End boxes
- Native request forms and registered Microsoft Forms intake through Power Automate
- PDF, image, spreadsheet, and CSV uploads with editable AI/OCR extraction
- Request drafts, participant assignment, and multi-document submission
- Sequential, parallel, conditional, reject-return, reassignment, delegation, and escalation flows
- Inbox, tracking history, in-app notifications, email delivery, and administration
- Supabase Auth, Postgres, Storage, normalized persistence, and row-level security
- Responsive light and dark interfaces using the Chun Wo brand palette

## Stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS
- Supabase Auth, Postgres, and Storage
- OpenRouter or OpenAI-compatible document parsing
- PDF.js and SheetJS
- Resend transactional email
- Vercel deployment

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Authentication and persisted application data
require the Supabase variables in `.env.local`. Copy `.env.example` and add only
the provider credentials needed for the features being tested.

Primary application views use query-string tabs:

- `/?tab=queue`
- `/?tab=tracking`
- `/?tab=drafts`
- `/?tab=workflow`
- `/?tab=admin`

New Request opens the internal `upload` view from the `+ New` action; Upload is
intentionally not a separate navigation tab.

## Environment Groups

- `NEXT_PUBLIC_SUPABASE_*`: browser and SSR authentication/data access
- `SUPABASE_SERVICE_ROLE_KEY` and `FORM_INTAKE_WEBHOOK_SECRET`: server-only Microsoft Forms intake
- `OPENROUTER_*`, `OPENAI_*`, `AI_PROVIDER`, and `NEXT_PUBLIC_PDF_OCR_MODE`: document parsing
- `EMAIL_PROVIDER`, `EMAIL_LIVE`, `EMAIL_FROM`, `EMAIL_TEST_REDIRECT_TO`, and `RESEND_API_KEY`: email delivery

Never expose server-only keys to client code or commit local environment files.

## Database

The current database history is in `supabase/migrations/`; `supabase/schema.sql`
is the consolidated schema reference. Apply migrations with the linked Supabase
CLI project and review row-level security before using production identities.

## Verification

Run the same local gates used before deployment:

```bash
npm test
npx next typegen
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

Authenticated browser regression tests require test credentials and request IDs;
see the deployment runbook before invoking `npm run e2e:regression`.

## Documentation

- [Product requirements](PRD/approval-workflow-platform-prd.md)
- [Deployment runbook](docs/deployment-runbook.md)
- [Microsoft Forms and Power Automate setup](docs/microsoft-forms-power-automate.md)
- [Architecture refactor history](docs/architecture-refactor-log.md)
