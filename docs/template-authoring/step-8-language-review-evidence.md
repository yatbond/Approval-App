# Step 8 language-review evidence

The language-review source supplied for Step 8 is:

- Workbook: `Co-Pilot Language/2026-07-28 step-8-language-reviewed by ST.xlsx`
- Reviewer identifier supplied by the business: `ST`
- Workbook modified time used as the review timestamp: `2026-07-29T22:49:07+08:00`
- SHA-256: `1d5dc68702e39470c3ff519d363ec46d235a3328e96d662df273d5611fd993ed`
- Reviewed rows: 1,176
- Locale rows: 392 English, 392 Hong Kong Traditional Chinese, and 392 Simplified Chinese
- Accepted without correction: 1,169
- Yellow correction rows: 7

The workbook is authoritative because the adjacent CSV export replaced Chinese
characters with literal question marks. The workbook retained the original
Unicode text, yellow fills, and reviewer comments.

The seven corrections applied to the pinned candidate are:

| Row | Locale | Reviewed item | Yellow field | Corrected text |
| ---: | --- | --- | --- | --- |
| 44 | English | `copilot.governance.policies` | Primary text | `company policies` |
| 45 | Traditional Chinese | `copilot.governance.policies` | Primary text | `審閱責任及公司政策` |
| 46 | Simplified Chinese | `copilot.governance.policies` | Primary text | `审核责任及公司政策` |
| 78 | Traditional Chinese | `v2.workflow.stages.first_stage` | Primary text | `申請提交後的第一步是甚麼？` |
| 79 | Simplified Chinese | `v2.workflow.stages.first_stage` | Primary text | `申请提交后的第一步是什么？` |
| 156 | Traditional Chinese | `v2.timing.rules.overdue_action` | Explanation/tip phrase | `後備處理人` |
| 157 | Simplified Chinese | `v2.timing.rules.overdue_action` | Explanation/tip phrase | `后备处理人` |

The resulting content fingerprints are:

- Immutable corrected candidate commit: `884c70e0cac38744eade26557b5c99b3c6696232`
- Concept content: `fnv1a64:4a149e693daab18d`
- Localized question content: `fnv1a64:df415823535ac40f`

The human language review is complete.

## Authenticated Preview accessibility qualification

The isolated, non-Production Preview qualification passed:

- Evidence recorded: `2026-07-30T08:40:14+08:00`
- Exact source revision: `28ec3ab852501885375218e11521ec24fed1eef0`
- Vercel deployment: `dpl_4Ja4XsJXTajVjrAzTd9qWadQkH78`
- Deployment host: `approval-b5ger23zz-derrick-pangs-projects.vercel.app`
- Database: isolated Supabase branch `codex-server-authoritative-preview`
- Locales: English, Hong Kong Traditional Chinese, and Simplified Chinese
- Result: `template_copilot_v2_step8_browser=PASS`

The authenticated gate created genuine `v2.2` sessions pinned to
`concepts.v1.0` in all three locales. It verified exact deployment identity,
no locale fallback, keyboard open/close behavior, labelled help semantics,
minimum touch sizing, mobile overflow, long CJK and pseudo-localized content,
and axe scans in settled light and dark themes.

This evidence completes Step 8 qualification only. It does not authorize
Production rollout, Production environment changes, database-branch merging,
or migration of Production data. New Production sessions remain pinned to
`v2.1` until a separately authorized rollout.
