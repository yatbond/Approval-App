# Normalized Supabase Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store approval workflow data in normalized Supabase tables while retaining `workspace_snapshots` as an autosave fallback.

**Architecture:** Keep the current Next route-handler backend-for-frontend pattern. Add a pure mapper for converting app workspace state to relational row shapes, then have `/api/workspace` write templates, requests, events, and attachment metadata to Supabase before saving the fallback snapshot.

**Tech Stack:** Next.js route handlers, `@supabase/ssr`, Supabase Postgres/RLS, Node test runner.

---

### Task 1: Pure Normalized Mapping

**Files:**
- Create: `src/lib/normalized-workspace.ts`
- Create: `src/lib/normalized-workspace.test.mjs`

- [ ] Add row types and conversion helpers for business units, departments, workflow template versions, approval requests, request events, and request attachments.
- [ ] Add a round-trip test that converts a workspace snapshot to normalized rows and restores the same app-facing data.
- [ ] Run `npm test` and confirm the new test fails before implementation, then passes after implementation.

### Task 2: Database Shape

**Files:**
- Modify: `supabase/approval_workflow_v2.sql`

- [ ] Add durable app-facing columns to `workflow_template_versions` and `approval_requests` for template key/version, task labels, owner email, and fallback snapshots.
- [ ] Add explicit grants and indexes for any new access path.
- [ ] Apply the same migration to the live Supabase project.

### Task 3: Workspace API

**Files:**
- Modify: `src/app/api/workspace/route.ts`
- Create: `src/lib/normalized-workspace-store.ts`

- [ ] On `POST`, write normalized records first and keep `workspace_snapshots` as fallback autosave.
- [ ] On `GET`, load normalized records first; if none exist, fall back to `workspace_snapshots`.
- [ ] Preserve RLS by using the signed-in route Supabase client, not a browser service key.

### Task 4: Verification

**Files:**
- Existing tests and live Supabase project

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Query Supabase to verify normalized rows exist.
- [ ] Reload the workflow page and check for console errors.
