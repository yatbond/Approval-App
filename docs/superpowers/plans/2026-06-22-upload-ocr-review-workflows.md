# Upload OCR Review Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support all three upload extraction workflows: user-defined fields before parsing, model-suggested fields after parsing, and document-preview highlight extraction.

**Architecture:** Keep `/api/parse` as the single extraction endpoint. Render PDFs/images client-side for preview and Qwen visual OCR, store preview page data in workspace state, and treat highlighted regions as cropped image files sent back through the existing parse client.

**Tech Stack:** Next.js 16 app route handlers, React client components, OpenRouter/Qwen vision model, pdfjs-dist, Node test runner.

---

### Task 1: Parser Suggested Fields

**Files:**
- Modify: `src/lib/parser.ts`
- Test: `src/lib/parser.test.mjs`

- [ ] Write failing tests showing structured parser output includes `suggestedFields` with label, value, confidence, and evidence.
- [ ] Run focused parser tests and verify they fail because `suggestedFields` is missing.
- [ ] Extend parser result types and JSON parsing to preserve suggested fields.
- [ ] Update the extraction prompt to request relevant extra field candidates separately from requested fields.
- [ ] Run focused parser tests and verify they pass.

### Task 2: Upload Parse Client and Review State

**Files:**
- Modify: `src/lib/workspace-file-api.ts`
- Modify: `src/lib/upload-view-state.ts`
- Test: `src/lib/workspace-file-api.test.mjs`
- Test: `src/lib/upload-view-state.test.mjs`

- [ ] Write failing tests for preserving `suggestedFields`, including a suggested field as an ad hoc field, and creating a field from a highlight label.
- [ ] Run focused tests and verify they fail for missing helpers/types.
- [ ] Add suggested-field payload types and upload review helpers.
- [ ] Run focused tests and verify they pass.

### Task 3: Preview and Highlight Extraction UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Modify: `src/app/upload-view.tsx`
- Create: `src/lib/document-preview.ts`
- Test: `src/lib/document-preview.test.mjs`

- [ ] Write failing tests for image preview page creation and crop rectangle conversion.
- [ ] Run focused tests and verify they fail for missing preview helpers.
- [ ] Add preview-page helpers for image files and cropped region files.
- [ ] Store preview pages after upload parsing and add an `extractHighlightedRegion` callback.
- [ ] Add preview display, drag rectangle selection, field-name input, and extract button to Upload view.
- [ ] Run focused tests and verify they pass.

### Task 4: Verification and Commit

**Files:**
- Modify: `tmp/refactor-Approval-workflow.md`

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Live-test `http://localhost:3000/?tab=upload` for field entry, suggested field UI, preview rendering controls, and no console errors.
- [ ] Update progress log.
- [ ] Commit the completed feature.
