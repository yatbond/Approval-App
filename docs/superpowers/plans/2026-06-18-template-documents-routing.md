# Template Documents Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the template builder so each workflow can define multiple required or optional document uploads, document format, document type, multiple extraction fields per document, and named approver/escalation routing by email.

**Architecture:** Add a pure template builder helper that converts UI form state into a `WorkflowTemplate`. Extend workflow types with document requirements and routing contact details while keeping legacy `documentTypes` for existing displays. Wire the existing Workflow tab to dynamic document and field rows.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Node test runner.

---

### Task 1: Template Builder Helper

**Files:**
- Create: `src/lib/template-builder.ts`
- Create: `src/lib/template-builder.test.mjs`
- Modify: `src/lib/types.ts`
- Modify: `package.json`

- [ ] **Step 1:** Write a failing test that creates a template with two document slots: required PDF invoice with two fields and optional image doctor slip with one field.
- [ ] **Step 2:** Test that the created approval step includes approver name/email, due hours, escalation name/email, and branch condition.
- [ ] **Step 3:** Implement the types and helper until tests pass.

### Task 2: Workflow UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Modify: `src/lib/mock-data.ts`
- Modify: `src/lib/supabase-data.ts`

- [ ] **Step 1:** Replace single document type input with dynamic document rows.
- [ ] **Step 2:** Add format dropdown options: Text file, PDF, Image, Excel/CSV.
- [ ] **Step 3:** Add per-document type text input and required/optional control.
- [ ] **Step 4:** Add dynamic fields under each document row.
- [ ] **Step 5:** Replace approver/escalation role inputs with person name and email fields.

### Task 3: Verification

**Files:**
- No new files.

- [ ] **Step 1:** Run `npm test`.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Run `npm run build`.
- [ ] **Step 4:** Confirm protected workflow route still redirects to login without a session.
