# Approval App

Configurable web-based approval workflow platform for departments that need to upload, parse, review, endorse, approve, reject, reassign, delegate, and escalate document-based requests.

## MVP Scope

- Dynamic departments and workflow templates
- Upload workspace for images, PDFs, Excel files, and CSV files
- AI vision adapter for photos/images
- OCR integration slot for PDFs
- Excel table parsing
- Editable extracted fields so user corrections can become future extraction examples
- Approval queue with approve, approve with comment, reject with comment, reassign, and delegate actions
- In-app notifications
- Deadlines and escalation model
- Supabase schema for Auth, Postgres, Storage, RLS, workflows, tasks, notifications, and delegations

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Supabase Auth, Postgres, and Storage
- OpenAI Responses API adapter for image extraction
- Vercel deployment

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful routes:

- `/?tab=queue`
- `/?tab=upload`
- `/?tab=workflow`
- `/?tab=admin`

## Environment

Copy `.env.example` to `.env.local` and fill these after the live services are created:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
APP_ADMIN_EMAIL=
```

## Supabase

The initial database and storage model is in `supabase/schema.sql`.

Pending live setup:

1. Create a Supabase project in the selected organization and Singapore region.
2. Apply `supabase/schema.sql`.
3. Add the generated Supabase URL and publishable key to Vercel.
4. Add the service role key only to server-side environments.
5. Replace the MVP mock data with Supabase queries and mutations.

## Verification

```bash
npm run lint
npm run build
```
