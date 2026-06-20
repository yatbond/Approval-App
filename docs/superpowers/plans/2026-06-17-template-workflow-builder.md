# Template Workflow Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let superusers manage business and department master data and create client-side approval workflow templates from that data.

**Architecture:** Add a pure business-directory helper for seeded data and CRUD-style state transitions. Keep template creation in the existing Workflow tab and superuser master-data controls in the Admin tab, backed by React state seeded from mock/config data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Node test runner.

---

### Task 1: Business Directory State

**Files:**
- Create: `src/lib/business-directory.ts`
- Create: `src/lib/business-directory.test.mjs`
- Modify: `src/lib/types.ts`
- Modify: `package.json`

- [ ] **Step 1:** Write failing tests for seeded businesses, Asia Allied Infrastructure departments, Chun Wo Construction departments, add/update/delete business, and add/update/delete department.
- [ ] **Step 2:** Run `node --experimental-strip-types src/lib/business-directory.test.mjs` and confirm it fails because the helper does not exist.
- [ ] **Step 3:** Implement types, seed data, and pure helper functions.
- [ ] **Step 4:** Add the helper test to `npm test` and confirm it passes with the existing approval-state tests.

### Task 2: Admin Master Data UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`

- [ ] **Step 1:** Add business-directory state in `ApprovalWorkspace`.
- [ ] **Step 2:** Replace the simple department cards with editable superuser controls for business and department CRUD.
- [ ] **Step 3:** Keep controls responsive with stacked mobile forms and wrapping-safe buttons.

### Task 3: Workflow Template Builder UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/mock-data.ts`
- Modify: `src/lib/supabase-data.ts`

- [ ] **Step 1:** Add `business` to workflow templates and map it from fallback/Supabase data.
- [ ] **Step 2:** Add client-side workflow-template state.
- [ ] **Step 3:** Add a Template Builder form for name, business, department, document types, extraction field, approver role, due hours, escalation role, and branch condition.
- [ ] **Step 4:** Append created templates to the displayed template list.

### Task 4: Verification

**Files:**
- No new files.

- [ ] **Step 1:** Run `npm test`.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Run `npm run build`.
- [ ] **Step 4:** Confirm `/`, `/login`, and `/?tab=workflow` route behavior on the running dev server.
