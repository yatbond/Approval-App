import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatTemplateCopilotV2ReviewValue,
  selectTemplateCopilotV2OpenExtractionReview,
  templateCopilotV2ReviewFactLabel,
  templateCopilotV2ReviewPanelCopy,
} from "./template-copilot-v2-review-display.ts";

test("typed review display renders booleans, transformed enums, attachments, and stages in all supported locales", () => {
  const attachment = [{ label: "Invoice", required: true, formats: ["pdf", "image"], stage: "Finance" }];
  const stage = [{ label: "Finance review", kind: "review", participant: { mode: "directory_position", value: "Finance Manager" }, sequence: 1 }];
  const field = [{ label: "Supporting note", type: "checkbox", required: false, options: [] }];
  const initiator = { mode: "directory_role", description: "Finance staff" };
  const expected = {
    en: ["Attachments", "Invoice — required — formats: PDF, Image — stage: Finance", "1. Finance review — Review; assigned by directory position: Finance Manager", "Supporting note (Checkbox, optional)", "directory role — Finance staff"],
    "zh-Hant": ["附件要求", "Invoice — 必須 — 格式: PDF、圖片 — 階段: Finance", "1. Finance review — 審核; 分派方式 目錄職位: Finance Manager", "Supporting note (核取方塊, 可選)", "目錄角色 — Finance staff"],
    "zh-Hans": ["附件要求", "Invoice — 必须 — 格式: PDF、图片 — 阶段: Finance", "1. Finance review — 审核; 分配方式 目录职位: Finance Manager", "Supporting note (复选框, 可选)", "目录角色 — Finance staff"],
  };
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.equal(templateCopilotV2ReviewFactLabel("attachments.requirements", locale), expected[locale][0]);
    assert.equal(formatTemplateCopilotV2ReviewValue("attachments.requirements", attachment, locale), expected[locale][1]);
    assert.equal(formatTemplateCopilotV2ReviewValue("workflow.stages", stage, locale), expected[locale][2]);
    assert.equal(formatTemplateCopilotV2ReviewValue("request.fields", field, locale), expected[locale][3]);
    assert.equal(formatTemplateCopilotV2ReviewValue("request.initiator_policy", initiator, locale), expected[locale][4]);
  }
});

test("review copy localizes fact panels, actions, aria labels, and not-applicable values", () => {
  const expected = {
    en: ["Suggested fact", "Current value", "Proposed value", "Extracted facts awaiting confirmation", "Not applicable", "Keep existing", "Use proposed", "Extracted fact conflicts requiring review"],
    "zh-Hant": ["建議資料", "目前資料", "建議資料", "等待確認的擷取資料", "不適用", "保留目前資料", "採用建議", "需要審閱的擷取資料差異"],
    "zh-Hans": ["建议信息", "当前信息", "建议信息", "等待确认的提取信息", "不适用", "保留当前信息", "采用建议", "需要审核的提取信息差异"],
  };
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const copy = templateCopilotV2ReviewPanelCopy(locale);
    assert.deepEqual([copy.candidate, copy.current, copy.proposed, copy.candidateSectionAria], expected[locale].slice(0, 4));
    assert.equal(formatTemplateCopilotV2ReviewValue("workflow.scope", "not_applicable", locale), expected[locale][4]);
    assert.deepEqual([copy.keepExisting, copy.useProposed, copy.conflictSectionAria], expected[locale].slice(5));
  }
});

test("every canonical condition operator has a reader-facing label in English, Traditional Chinese, and Simplified Chinese", () => {
  const expected = {
    en: {
      "=": "Amount equals 10",
      "!=": "Amount does not equal 10",
      ">": "Amount is greater than 10",
      ">=": "Amount is greater than or equal to 10",
      "<": "Amount is less than 10",
      "<=": "Amount is less than or equal to 10",
      contains: "Amount contains 10",
    },
    "zh-Hant": {
      "=": "Amount 等於 10",
      "!=": "Amount 不等於 10",
      ">": "Amount 大於 10",
      ">=": "Amount 大於或等於 10",
      "<": "Amount 小於 10",
      "<=": "Amount 小於或等於 10",
      contains: "Amount 包含 10",
    },
    "zh-Hans": {
      "=": "Amount 等于 10",
      "!=": "Amount 不等于 10",
      ">": "Amount 大于 10",
      ">=": "Amount 大于或等于 10",
      "<": "Amount 小于 10",
      "<=": "Amount 小于或等于 10",
      contains: "Amount 包含 10",
    },
  };
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    for (const operator of ["=", "!=", ">", ">=", "<", "<=", "contains"]) {
      const formatted = formatTemplateCopilotV2ReviewValue("workflow.conditions", [{
        field: "Amount",
        operator,
        value: 10,
        matchingRoute: "Matched",
        otherwiseRoute: "Fallback",
      }], locale);
      assert.match(formatted, new RegExp(`^${expected[locale][operator].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`));
      if (operator !== "contains") {
        assert.equal(formatted.split(";")[0].split(" ").includes(operator), false, `${locale} leaked ${operator}`);
      }
    }
  }
});

test("every enum-bearing typed fact renders all canonical enum values through the three-locale label table", () => {
  const labels = {
    en: {
      any_employee: "any employee", directory_role: "directory role", requester_selected: "chosen by requester",
      text: "Text", long_text: "Long text", number: "Number", date: "Date", currency: "Currency", email: "Email", select: "Select", radio: "Single choice", checkbox: "Checkbox", table: "Table",
      pdf: "PDF", image: "Image", excel_csv: "Excel/CSV",
      approval: "Approval", review: "Review", for_information: "For information", submission: "Submission",
      fixed_email: "fixed email", directory_position: "directory position", request_field: "request field", requester: "requester", unassigned_at_template: "unassigned at template",
      return_for_correction: "Return for correction", close: "Close", route_to_stage: "Route to stage",
      in_app: "In-app",
    },
    "zh-Hant": {
      any_employee: "任何員工", directory_role: "目錄角色", requester_selected: "由申請人選擇",
      text: "文字", long_text: "長文字", number: "數字", date: "日期", currency: "貨幣", email: "電郵", select: "下拉選單", radio: "單選", checkbox: "核取方塊", table: "表格",
      pdf: "PDF", image: "圖片", excel_csv: "Excel/CSV",
      approval: "審批", review: "審核", for_information: "知會", submission: "提交",
      fixed_email: "固定電郵", directory_position: "目錄職位", request_field: "申請欄位", requester: "申請人", unassigned_at_template: "範本暫不指派",
      return_for_correction: "退回更正", close: "關閉", route_to_stage: "轉送階段",
      in_app: "應用程式內",
    },
    "zh-Hans": {
      any_employee: "任何员工", directory_role: "目录角色", requester_selected: "由申请人选择",
      text: "文本", long_text: "长文本", number: "数字", date: "日期", currency: "货币", email: "电子邮件", select: "下拉菜单", radio: "单选", checkbox: "复选框", table: "表格",
      pdf: "PDF", image: "图片", excel_csv: "Excel/CSV",
      approval: "审批", review: "审核", for_information: "知会", submission: "提交",
      fixed_email: "固定电子邮件", directory_position: "目录职位", request_field: "申请字段", requester: "申请人", unassigned_at_template: "模板暂不分配",
      return_for_correction: "退回更正", close: "关闭", route_to_stage: "转送阶段",
      in_app: "应用内",
    },
  };
  const cases = [
    ...["any_employee", "directory_role", "requester_selected"].map((token) => ({
      token,
      factId: "request.initiator_policy",
      value: { mode: token, description: "Allowed group" },
    })),
    ...["text", "long_text", "number", "date", "currency", "email", "select", "radio", "checkbox", "table"].map((token) => ({
      token,
      factId: "request.fields",
      value: [{ label: "Field", type: token, required: true, options: [] }],
    })),
    ...["text", "pdf", "image", "excel_csv"].map((token) => ({
      token,
      factId: "attachments.requirements",
      value: [{ label: "File", required: true, formats: [token] }],
    })),
    ...["approval", "review", "for_information", "submission"].map((token) => ({
      token,
      factId: "workflow.stages",
      value: [{ label: "Stage", kind: token, participant: { mode: "requester" }, sequence: 1 }],
    })),
    ...["fixed_email", "directory_position", "request_field", "requester", "unassigned_at_template"].map((token) => ({
      token,
      factId: "workflow.stages",
      value: [{ label: "Stage", kind: "review", participant: { mode: token, value: token === "requester" || token === "unassigned_at_template" ? undefined : "Assignee" }, sequence: 1 }],
    })),
    ...["return_for_correction", "close", "route_to_stage"].map((token) => ({
      token,
      factId: "workflow.rejection_policy",
      value: { action: token, ...(token === "route_to_stage" ? { route: "Prior stage" } : {}) },
    })),
    ...["in_app", "email"].map((token) => ({
      token,
      factId: "notifications.rules",
      value: [{ event: "Submitted", recipients: ["Requester"], channel: token }],
    })),
  ];
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    for (const fixture of cases) {
      const output = formatTemplateCopilotV2ReviewValue(fixture.factId, fixture.value, locale);
      assert.ok(output.includes(labels[locale][fixture.token]), `${locale}:${fixture.factId}:${fixture.token}`);
      if (fixture.token.includes("_")) {
        assert.equal(output.includes(fixture.token), false, `${locale} leaked canonical token ${fixture.token}`);
      }
    }
  }
});

test("only open candidates and conflicts receive review panels; confirmed and closed states are empty", () => {
  const openCandidate = { candidateId: "open", state: "open" };
  const confirmedCandidate = { candidateId: "confirmed", state: "confirmed" };
  const openConflict = { conflictId: "open-conflict", state: "open" };
  const closedConflict = { conflictId: "closed-conflict", state: "closed" };
  const selected = selectTemplateCopilotV2OpenExtractionReview({
    candidates: [confirmedCandidate, openCandidate],
    conflicts: [closedConflict, openConflict],
    history: [],
  });
  assert.deepEqual(selected.candidates, [openCandidate]);
  assert.deepEqual(selected.conflicts, [openConflict]);
  const empty = selectTemplateCopilotV2OpenExtractionReview({
    candidates: [confirmedCandidate],
    conflicts: [closedConflict],
    history: [],
  });
  assert.deepEqual(empty, { candidates: [], conflicts: [] });
});

test("review UI renders complete typed values and both open conflict alternatives before localized actions", async () => {
  const component = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  assert.match(component, /function ExtractionTypedValue/);
  assert.match(component, /templateCopilotV2ReviewFactLabel/);
  assert.match(component, /formatTemplateCopilotV2ReviewValue/);
  assert.match(component, /selectTemplateCopilotV2OpenExtractionReview/);
  assert.match(component, /extractionReview\.candidates\.length > 0/);
  assert.match(component, /extractionReview\.conflicts\.length > 0/);
  assert.match(component, /<ExtractionTypedValue factId=\{candidate\.factId\} value=\{candidate\.value\} locale=\{locale\} variant="candidate" \/>/);
  assert.match(component, /<ExtractionTypedValue factId=\{conflict\.factId\} value=\{conflict\.existing\.candidate\.value\} locale=\{locale\} variant="current" \/>/);
  assert.match(component, /<ExtractionTypedValue factId=\{conflict\.factId\} value=\{conflict\.existing\.value\} locale=\{locale\} variant="current" \/>/);
  assert.match(component, /<ExtractionTypedValue factId=\{conflict\.factId\} value=\{conflict\.incoming\.value\} locale=\{locale\} variant="proposed" \/>/);
  assert.match(component, /aria-label=\{`\$\{copy\[variant\]\}: \$\{label\}`\}/);
  assert.match(component, /aria-label=\{extractionReviewCopy\.candidateSectionAria\}/);
  assert.match(component, /aria-label=\{extractionReviewCopy\.conflictSectionAria\}/);
  assert.match(component, /aria-label=\{`\$\{extractionReviewCopy\.keepExisting\}: \$\{factLabel\}`\}/);
  assert.match(component, /aria-label=\{`\$\{extractionReviewCopy\.useProposed\}: \$\{factLabel\}`\}/);
});
