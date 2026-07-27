"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from "react";
import type {
  TemplateCopilotFactId,
  TemplateCopilotV2Ledger,
} from "@/lib/template-copilot-facts";
import {
  canonicalizeTemplateCopilotV2MapEditorValue,
  getTemplateCopilotV2MapEditorContract,
  validateTemplateCopilotV2MapEditorValue,
} from "@/lib/template-copilot-v2-authoritative-map-contract";
import type {
  TemplateCopilotV2AuthoritativeProjection,
  TemplateCopilotV2ProjectedEvidence,
} from "@/lib/template-copilot-v2-authoritative-projection";
import {
  formatTemplateCopilotV2StructuredIssue,
  prepareTemplateCopilotV2StructuredEditorValue,
  templateCopilotV2StructuredFactIds,
  validateTemplateCopilotV2StructuredFacts,
  type TemplateCopilotV2StructuredFactId,
  type TemplateCopilotV2StructuredIssue,
} from "@/lib/template-copilot-v2-structured-facts";
import { TemplateCopilotV2StructuredFactEditor } from "./template-copilot-v2-structured-editors";

/* The editor is intentionally a small form-state layer around sixteen distinct
 * schema outputs. The authoritative Zod schema validates every value at its
 * boundary; `any` below is limited to mutable form drafts, never API data. */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Locale = "en" | "zh-Hant" | "zh-Hans";
type MapAction = "save" | "unknown" | "not_applicable";
export type TemplateCopilotV2MapTransition =
  | Readonly<{ action: "save"; canonicalValue: unknown }>
  | Readonly<{ action: "unknown" }>
  | Readonly<{ action: "not_applicable"; reason: string }>;

type Copy = Readonly<{
  edit: string;
  cancel: string;
  save: string;
  unknown: string;
  na: string;
  naReason: string;
  noDownstream: string;
  changing: string;
  authoritative: string;
  validation: string;
  add: string;
  remove: string;
  required: string;
  optional: string;
  label: string;
  description: string;
  rules: string;
  type: string;
  options: string;
  formats: string;
  stage: string;
  sequence: string;
  kind: string;
  personMode: string;
  personValue: string;
  field: string;
  operator: string;
  value: string;
  then: string;
  otherwise: string;
  action: string;
  route: string;
  dueHours: string;
  escalation: string;
  event: string;
  audience: string;
  channel: string;
  period: string;
  rationale: string;
  draft: string;
  publication: string;
  activation: string;
  ready: string;
  blocked: string;
  notReady: string;
  updateFailed: string;
  original: string;
  confirmed: string;
  conflict: string;
  history: string;
  readOnly: string;
}>;
const copyFor = (locale: Locale): Copy =>
  locale === "zh-Hant"
    ? {
        edit: "編輯已儲存事實",
        cancel: "取消",
        save: "儲存權威變更",
        unknown: "標示為未知",
        na: "標示為不適用",
        naReason: "不適用原因",
        noDownstream: "沒有下游事實",
        changing: "儲存後將重新開啟：",
        authoritative: "權威流程地圖",
        validation: "請修正以下欄位：",
        add: "新增",
        remove: "移除",
        required: "必填",
        optional: "選填",
        label: "名稱",
        description: "說明",
        rules: "規則",
        type: "類型",
        options: "選項（以逗號分隔）",
        formats: "可接受格式",
        stage: "階段",
        sequence: "次序（同一數字＝同時）",
        kind: "步驟類型",
        personMode: "處理人選取方式",
        personValue: "處理人／角色／欄位",
        field: "欄位",
        operator: "運算子",
        value: "值",
        then: "符合時前往",
        otherwise: "不符合時前往",
        action: "拒絕動作",
        route: "前往階段",
        dueHours: "預設時限（小時）",
        escalation: "逾期處理",
        event: "事件",
        audience: "通知對象（以逗號分隔）",
        channel: "管道",
        period: "保存期間",
        rationale: "原因",
        draft: "草稿",
        publication: "發佈",
        activation: "啟用",
        ready: "可進行",
        blocked: "受阻",
        notReady: "尚未就緒",
        updateFailed: "未能確認這項變更。請重試相同的已儲存編輯。",
        original: "原始說法",
        confirmed: "人員確認",
        conflict: "衝突替代值",
        history: "先前值",
        readOnly: "此專用編輯器目前為唯讀；已儲存設定不受影響。",
      }
    : locale === "zh-Hans"
      ? {
          edit: "编辑已保存事实",
          cancel: "取消",
          save: "保存权威更改",
          unknown: "标为未知",
          na: "标为不适用",
          naReason: "不适用原因",
          noDownstream: "没有下游事实",
          changing: "保存后将重新打开：",
          authoritative: "权威流程地图",
          validation: "请修正以下字段：",
          add: "新增",
          remove: "移除",
          required: "必填",
          optional: "选填",
          label: "名称",
          description: "说明",
          rules: "规则",
          type: "类型",
          options: "选项（用逗号分隔）",
          formats: "可接受格式",
          stage: "阶段",
          sequence: "顺序（同一数字＝同时）",
          kind: "步骤类型",
          personMode: "处理人选择方式",
          personValue: "处理人／角色／字段",
          field: "字段",
          operator: "运算符",
          value: "值",
          then: "符合时前往",
          otherwise: "否则前往",
          action: "拒绝操作",
          route: "前往阶段",
          dueHours: "默认时限（小时）",
          escalation: "逾期处理",
          event: "事件",
          audience: "通知对象（用逗号分隔）",
          channel: "渠道",
          period: "保存期限",
          rationale: "原因",
          draft: "草稿",
          publication: "发布",
          activation: "启用",
          ready: "可以继续",
          blocked: "已阻塞",
          notReady: "尚未就绪",
          updateFailed: "未能确认此更改。请重试相同的已保存编辑。",
          original: "原始说法",
          confirmed: "人工确认",
          conflict: "冲突备选值",
          history: "先前值",
          readOnly: "此专用编辑器目前为只读；已保存设置不受影响。",
        }
      : {
          edit: "Edit saved fact",
          cancel: "Cancel",
          save: "Save authoritative change",
          unknown: "Mark unknown",
          na: "Mark not applicable",
          naReason: "Why this does not apply",
          noDownstream: "No downstream facts",
          changing: "Saving will reopen:",
          authoritative: "Authoritative workflow map",
          validation: "Correct these fields:",
          add: "Add",
          remove: "Remove",
          required: "Required",
          optional: "Optional",
          label: "Label",
          description: "Description",
          rules: "Rules",
          type: "Type",
          options: "Options (comma-separated)",
          formats: "Accepted formats",
          stage: "Stage",
          sequence: "Sequence (same number = parallel)",
          kind: "Step kind",
          personMode: "Person resolution",
          personValue: "Person / role / field",
          field: "Field",
          operator: "Operator",
          value: "Value",
          then: "If true, go to",
          otherwise: "Otherwise, go to",
          action: "Rejection action",
          route: "Route to stage",
          dueHours: "Default due time (hours)",
          escalation: "Late-work action",
          event: "Event",
          audience: "Audience (comma-separated)",
          channel: "Channel",
          period: "Retention period",
          rationale: "Rationale",
          draft: "Draft",
          publication: "Publication",
          activation: "Activation",
          ready: "Ready",
          blocked: "Blocked",
          notReady: "Not ready",
          updateFailed:
            "The change was not confirmed. Retry the same saved edit.",
          original: "Original wording",
          confirmed: "Human confirmation",
          conflict: "Conflicting alternative",
          history: "Prior value",
          readOnly: "This purpose-built editor is currently read-only. Its saved settings are unchanged.",
        };
const optionText = (locale: Locale, value: string) => {
  const copy: Record<string, readonly [string, string, string]> = {
    any_employee: ["Any employee", "任何員工", "任何员工"],
    directory_role: ["Directory role", "目錄角色", "目录角色"],
    requester_selected: ["Requester-selected", "發起人選定", "发起人选定"],
    fixed_email: ["Fixed email", "固定電郵", "固定邮箱"],
    directory_position: ["Directory position", "目錄職位", "目录职位"],
    request_field: ["Request field", "申請欄位", "申请字段"],
    requester: ["Requester", "發起人", "发起人"],
    unassigned_at_template: ["Resolve later", "稍後指定", "稍后指定"],
    approval: ["Approval", "審批", "审批"],
    review: ["Review", "覆核", "复核"],
    for_information: ["For information", "供知悉", "供知悉"],
    submission: ["Submission", "提交", "提交"],
    text: ["Text", "文字", "文本"],
    long_text: ["Long text", "長文字", "长文本"],
    number: ["Number", "數字", "数字"],
    date: ["Date", "日期", "日期"],
    currency: ["Currency", "貨幣", "货币"],
    email: ["Email", "電郵", "邮箱"],
    select: ["Select list", "下拉選單", "下拉列表"],
    radio: ["Single choice", "單選", "单选"],
    checkbox: ["Checkbox", "核取方塊", "复选框"],
    table: ["Table", "表格", "表格"],
    return_for_correction: ["Return for correction", "退回更正", "退回更正"],
    close: ["Close", "結束", "结束"],
    route_to_stage: ["Route to a stage", "前往階段", "前往阶段"],
    in_app: ["In-app", "應用程式內", "应用内"],
    pdf: ["PDF", "PDF", "PDF"],
    image: ["Image", "圖片", "图片"],
    excel_csv: ["Spreadsheet / CSV", "試算表／CSV", "电子表格／CSV"],
    contains: ["Contains", "包含", "包含"],
  };
  const selected = copy[value];
  return selected
    ? selected[locale === "en" ? 0 : locale === "zh-Hant" ? 1 : 2]
    : value;
};

const isTextFact = (id: TemplateCopilotFactId) =>
  ["workflow.name", "workflow.purpose", "governance.owner"].includes(id);
const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const updateAt = <T,>(items: readonly T[], index: number, next: T) =>
  items.map((item, itemIndex) => (itemIndex === index ? next : item));
const defaults = (id: TemplateCopilotFactId): unknown => {
  if (isTextFact(id)) return "";
  if (
    ["workflow.scope", "collaboration.policy", "visibility.policy"].includes(id)
  )
    return { description: "", rules: [] };
  if (id === "request.initiator_policy")
    return { mode: "any_employee", description: "" };
  if (
    [
      "request.fields",
      "attachments.requirements",
      "workflow.stages",
      "workflow.conditions",
      "notifications.rules",
      "governance.policies",
    ].includes(id)
  )
    return [];
  if (id === "workflow.rejection_policy")
    return { action: "return_for_correction", route: "" };
  if (id === "timing.rules") return { defaultDueHours: 24 };
  if (id === "governance.retention") return { period: "", rationale: "" };
  return "";
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const nonAlwaysFacts = new Set<TemplateCopilotFactId>([
  "attachments.requirements",
  "workflow.conditions",
  "notifications.rules",
  "governance.owner",
  "governance.policies",
  "governance.retention",
]);
const isStructuredFact = (
  factId: TemplateCopilotFactId,
): factId is TemplateCopilotV2StructuredFactId =>
  templateCopilotV2StructuredFactIds.includes(
    factId as TemplateCopilotV2StructuredFactId,
  );
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-label"?: string }>(
    children,
  )
    ? cloneElement(children, {
        id: children.props.id || id,
        "aria-label": children.props["aria-label"] || label,
      })
    : children;
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="grid min-w-0 gap-1 text-xs font-medium text-neutral-800 dark:text-neutral-100"
    >
      <span id={`${id}-label`}>{label}</span>
      {control}
    </div>
  );
}
const control =
  "min-h-10 w-full rounded border border-neutral-400 bg-white px-2 py-1.5 text-sm text-neutral-950 dark:bg-neutral-800 dark:text-white";
function RuleList({
  value,
  onChange,
  copy,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  copy: Copy;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{copy.rules}</p>
      {value.map((rule, index) => (
        <div key={index} className="flex gap-2">
          <input
            aria-label={`${copy.rules} ${index + 1}`}
            className={control}
            value={rule}
            onChange={(event) =>
              onChange(updateAt(value, index, event.target.value))
            }
          />
          <button
            type="button"
            aria-label={`${copy.remove} ${copy.rules} ${index + 1}`}
            className="min-h-10 shrink-0 rounded border border-neutral-400 px-2 text-xs"
            onClick={() =>
              onChange(value.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            {copy.remove}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="min-h-10 rounded border border-neutral-400 px-2 text-xs"
        onClick={() => onChange([...value, ""])}
      >
        {copy.add}
      </button>
    </div>
  );
}
function PolicyEditor({
  value,
  onChange,
  copy,
}: {
  value: any;
  onChange: (next: any) => void;
  copy: Copy;
}) {
  const policy =
    value && typeof value === "object" ? value : { description: "", rules: [] };
  return (
    <div className="grid gap-3">
      <Field label={copy.description}>
        <textarea
          className={control}
          rows={3}
          value={policy.description || ""}
          onChange={(event) =>
            onChange({ ...policy, description: event.target.value })
          }
        />
      </Field>
      <RuleList
        copy={copy}
        value={Array.isArray(policy.rules) ? policy.rules : []}
        onChange={(rules) => onChange({ ...policy, rules })}
      />
    </div>
  );
}
function StructuredEditor({
  factId,
  value,
  onChange,
  copy,
  locale,
}: {
  factId: TemplateCopilotFactId;
  value: any;
  onChange: (next: unknown) => void;
  copy: Copy;
  locale: Locale;
}) {
  if (isTextFact(factId))
    return (
      <Field label={copy.description}>
        {factId === "workflow.name" || factId === "governance.owner" ? (
          <input
            className={control}
            autoFocus
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <textarea
            className={control}
            autoFocus
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    );
  if (
    ["workflow.scope", "collaboration.policy", "visibility.policy"].includes(
      factId,
    )
  )
    return <PolicyEditor value={value} onChange={onChange} copy={copy} />;
  if (factId === "request.initiator_policy") {
    const item = value || defaults(factId);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.personMode}>
          <select
            className={control}
            value={item.mode}
            onChange={(event) =>
              onChange({ ...item, mode: event.target.value })
            }
          >
            {["any_employee", "directory_role", "requester_selected"].map(
              (mode) => (
                <option key={mode} value={mode}>
                  {optionText(locale, mode)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={copy.description}>
          <textarea
            className={control}
            rows={3}
            value={item.description || ""}
            onChange={(event) =>
              onChange({ ...item, description: event.target.value })
            }
          />
        </Field>
      </div>
    );
  }
  if (factId === "request.fields") {
    const items = Array.isArray(value) ? value : [];
    return (
      <Repeater
        copy={copy}
        items={items}
        onChange={onChange}
        empty={() => ({
          label: "",
          type: "text",
          required: false,
          options: [],
        })}
      >
        {(item, index, set) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={copy.label}>
              <input
                className={control}
                value={item.label || ""}
                onChange={(event) =>
                  set({ ...item, label: event.target.value })
                }
              />
            </Field>
            <Field label={copy.type}>
              <select
                className={control}
                value={item.type || "text"}
                onChange={(event) => set({ ...item, type: event.target.value })}
              >
                {[
                  "text",
                  "long_text",
                  "number",
                  "date",
                  "currency",
                  "email",
                  "select",
                  "radio",
                  "checkbox",
                  "table",
                ].map((type) => (
                  <option key={type} value={type}>
                    {optionText(locale, type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.options}>
              <input
                className={control}
                value={(item.options || []).join(", ")}
                onChange={(event) =>
                  set({ ...item, options: split(event.target.value) })
                }
              />
            </Field>
            <label className="flex min-h-10 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.required === true}
                onChange={(event) =>
                  set({ ...item, required: event.target.checked })
                }
              />
              {item.required ? copy.required : copy.optional}
            </label>
          </div>
        )}
      </Repeater>
    );
  }
  if (factId === "attachments.requirements") {
    const items = Array.isArray(value) ? value : [];
    return (
      <Repeater
        copy={copy}
        items={items}
        onChange={onChange}
        empty={() => ({ label: "", required: false, formats: [], stage: "" })}
      >
        {(item, _index, set) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={copy.label}>
              <input
                className={control}
                value={item.label || ""}
                onChange={(event) =>
                  set({ ...item, label: event.target.value })
                }
              />
            </Field>
            <Field label={copy.stage}>
              <input
                className={control}
                value={item.stage || ""}
                onChange={(event) =>
                  set({ ...item, stage: event.target.value })
                }
              />
            </Field>
            <Field label={copy.formats}>
              <div className="flex flex-wrap gap-3">
                {["text", "pdf", "image", "excel_csv"].map((format) => (
                  <label
                    key={format}
                    className="flex items-center gap-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={(item.formats || []).includes(format)}
                      onChange={(event) =>
                        set({
                          ...item,
                          formats: event.target.checked
                            ? [...(item.formats || []), format]
                            : (item.formats || []).filter(
                                (current: string) => current !== format,
                              ),
                        })
                      }
                    />
                    {optionText(locale, format)}
                  </label>
                ))}
              </div>
            </Field>
            <label className="flex min-h-10 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.required === true}
                onChange={(event) =>
                  set({ ...item, required: event.target.checked })
                }
              />
              {item.required ? copy.required : copy.optional}
            </label>
          </div>
        )}
      </Repeater>
    );
  }
  if (factId === "workflow.stages") {
    const items = Array.isArray(value) ? value : [];
    return (
      <Repeater
        copy={copy}
        items={items}
        onChange={onChange}
        empty={() => ({
          label: "",
          kind: "approval",
          participant: { mode: "unassigned_at_template", value: "" },
          sequence: items.length + 1,
        })}
      >
        {(item, _index, set) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={copy.label}>
              <input
                className={control}
                value={item.label || ""}
                onChange={(event) =>
                  set({ ...item, label: event.target.value })
                }
              />
            </Field>
            <Field label={copy.sequence}>
              <input
                className={control}
                min="1"
                max="100"
                type="number"
                value={item.sequence || 1}
                onChange={(event) =>
                  set({ ...item, sequence: Number(event.target.value) })
                }
              />
            </Field>
            <Field label={copy.kind}>
              <select
                className={control}
                value={item.kind || "approval"}
                onChange={(event) => set({ ...item, kind: event.target.value })}
              >
                {["approval", "review", "for_information", "submission"].map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {optionText(locale, kind)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label={copy.personMode}>
              <select
                className={control}
                value={item.participant?.mode || "unassigned_at_template"}
                onChange={(event) =>
                  set({
                    ...item,
                    participant: {
                      ...item.participant,
                      mode: event.target.value,
                    },
                  })
                }
              >
                {[
                  "fixed_email",
                  "directory_position",
                  "request_field",
                  "requester",
                  "unassigned_at_template",
                ].map((mode) => (
                  <option key={mode} value={mode}>
                    {optionText(locale, mode)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.personValue}>
              <input
                className={control}
                value={item.participant?.value || ""}
                onChange={(event) =>
                  set({
                    ...item,
                    participant: {
                      ...item.participant,
                      value: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </div>
        )}
      </Repeater>
    );
  }
  if (factId === "workflow.conditions") {
    const items = Array.isArray(value) ? value : [];
    return (
      <Repeater
        copy={copy}
        items={items}
        onChange={onChange}
        empty={() => ({
          field: "",
          operator: "=",
          value: "",
          matchingRoute: "",
          otherwiseRoute: "",
        })}
      >
        {(item, _index, set) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={copy.field}>
              <input
                className={control}
                value={item.field || ""}
                onChange={(event) =>
                  set({ ...item, field: event.target.value })
                }
              />
            </Field>
            <Field label={copy.operator}>
              <select
                className={control}
                value={item.operator || "="}
                onChange={(event) =>
                  set({ ...item, operator: event.target.value })
                }
              >
                {["=", "!=", ">", ">=", "<", "<=", "contains"].map(
                  (operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label={copy.value}>
              <select
                className={control}
                value={typeof item.value === "number" ? "number" : "text"}
                onChange={(event) =>
                  set({
                    ...item,
                    value:
                      event.target.value === "number"
                        ? Number.isFinite(Number(item.value))
                          ? Number(item.value)
                          : 0
                        : String(item.value ?? ""),
                  })
                }
              >
                <option value="text">{optionText(locale, "text")}</option>
                <option value="number">{optionText(locale, "number")}</option>
              </select>
              <input
                className={control}
                type={typeof item.value === "number" ? "number" : "text"}
                value={item.value ?? ""}
                onChange={(event) =>
                  set({
                    ...item,
                    value:
                      typeof item.value === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                  })
                }
              />
            </Field>
            <Field label={copy.then}>
              <input
                className={control}
                value={item.matchingRoute || ""}
                onChange={(event) =>
                  set({ ...item, matchingRoute: event.target.value })
                }
              />
            </Field>
            <Field label={copy.otherwise}>
              <input
                className={control}
                value={item.otherwiseRoute || ""}
                onChange={(event) =>
                  set({ ...item, otherwiseRoute: event.target.value })
                }
              />
            </Field>
          </div>
        )}
      </Repeater>
    );
  }
  if (factId === "workflow.rejection_policy") {
    const item = value || defaults(factId);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.action}>
          <select
            className={control}
            value={item.action}
            onChange={(event) =>
              onChange({ ...item, action: event.target.value })
            }
          >
            {["return_for_correction", "close", "route_to_stage"].map(
              (action) => (
                <option key={action} value={action}>
                  {optionText(locale, action)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label={copy.route}>
          <input
            className={control}
            value={item.route || ""}
            onChange={(event) =>
              onChange({ ...item, route: event.target.value })
            }
          />
        </Field>
      </div>
    );
  }
  if (factId === "timing.rules") {
    const item = value || defaults(factId);
    const hasEscalation = isRecord(item.escalation);
    return (
      <div className="grid gap-3">
        <Field label={copy.dueHours}>
          <input
            className={control}
            type="number"
            min="1"
            max="8760"
            value={item.defaultDueHours ?? ""}
            onChange={(event) =>
              onChange({
                ...item,
                defaultDueHours:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
        </Field>
        <label className="flex min-h-10 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={hasEscalation}
            onChange={(event) => {
              const rest = { ...item };
              delete rest.escalation;
              onChange(
                event.target.checked
                  ? { ...item, escalation: { description: "", rules: [] } }
                  : rest,
              );
            }}
          />
          {copy.escalation}
        </label>
        {hasEscalation && (
          <PolicyEditor
            value={item.escalation}
            copy={copy}
            onChange={(escalation) => onChange({ ...item, escalation })}
          />
        )}
      </div>
    );
  }
  if (factId === "notifications.rules") {
    const items = Array.isArray(value) ? value : [];
    return (
      <Repeater
        copy={copy}
        items={items}
        onChange={onChange}
        empty={() => ({ event: "", recipients: [], channel: "in_app" })}
      >
        {(item, _index, set) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={copy.event}>
              <input
                className={control}
                value={item.event || ""}
                onChange={(event) =>
                  set({ ...item, event: event.target.value })
                }
              />
            </Field>
            <Field label={copy.audience}>
              <input
                className={control}
                value={(item.recipients || []).join(", ")}
                onChange={(event) =>
                  set({ ...item, recipients: split(event.target.value) })
                }
              />
            </Field>
            <Field label={copy.channel}>
              <select
                className={control}
                value={item.channel || "in_app"}
                onChange={(event) =>
                  set({ ...item, channel: event.target.value })
                }
              >
                {["in_app", "email"].map((channel) => (
                  <option key={channel} value={channel}>
                    {optionText(locale, channel)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Repeater>
    );
  }
  if (factId === "governance.policies") {
    const items = Array.isArray(value) ? value : [];
    return <RuleList copy={copy} value={items} onChange={onChange} />;
  }
  if (factId === "governance.retention") {
    const item = value || defaults(factId);
    return (
      <div className="grid gap-3">
        <Field label={copy.period}>
          <input
            className={control}
            value={item.period || ""}
            onChange={(event) =>
              onChange({ ...item, period: event.target.value })
            }
          />
        </Field>
        <Field label={copy.rationale}>
          <textarea
            className={control}
            rows={3}
            value={item.rationale || ""}
            onChange={(event) =>
              onChange({ ...item, rationale: event.target.value })
            }
          />
        </Field>
      </div>
    );
  }
  return null;
}
function Repeater<T extends Record<string, any>>({
  items,
  onChange,
  empty,
  children,
  copy,
}: {
  items: readonly T[];
  onChange: (next: T[]) => void;
  empty: () => T;
  children: (item: T, index: number, set: (next: T) => void) => ReactNode;
  copy: Copy;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <fieldset
          key={index}
          className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-700"
        >
          <legend className="px-1 text-xs font-medium">
            {copy.label} {index + 1}
          </legend>
          {children(item, index, (next) =>
            onChange(updateAt(items, index, next)),
          )}
          <button
            type="button"
            className="min-h-10 rounded border border-neutral-400 px-2 text-xs"
            onClick={() =>
              onChange(items.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            {copy.remove}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="min-h-10 rounded border border-neutral-400 px-2 text-xs"
        onClick={() => onChange([...items, empty()])}
      >
        {copy.add}
      </button>
    </div>
  );
}
function Evidence({
  evidence,
  copy,
  title,
  tone,
}: {
  evidence: TemplateCopilotV2ProjectedEvidence;
  copy: Copy;
  title?: string;
  tone: "conflict" | "history";
}) {
  return (
    <section
      className={`mt-2 break-words rounded border p-2 ${tone === "conflict" ? "border-rose-300 text-rose-800 dark:border-rose-800 dark:text-rose-200" : "border-amber-300 text-amber-900 dark:border-amber-800 dark:text-amber-200"}`}
    >
      <p className="font-medium">{title || evidence.stateLabel}</p>
      {evidence.invalidatedBy && <p>{evidence.invalidatedBy}</p>}
      <ul className="mt-1 list-disc pl-4">
        {evidence.lines.map((line, index) => (
          <li key={index} className="whitespace-pre-wrap">
            {line}
          </li>
        ))}
      </ul>
      {evidence.originalWording && (
        <p className="mt-1">
          {copy.original}: {evidence.originalWording}
        </p>
      )}
      {evidence.confirmation && <p className="mt-1">{evidence.confirmation}</p>}
      {evidence.provenance.map((source, index) => (
        <p key={index} className="mt-1">
          {source}
        </p>
      ))}
      {evidence.conflictAlternatives?.map((alternative, index) => (
        <div
          key={index}
          className="mt-2 rounded border border-rose-300 p-2 dark:border-rose-800"
        >
          <p className="font-medium">
            {copy.conflict} {index + 1}
          </p>
          <ul className="mt-1 list-disc pl-4">
            {alternative.lines.map((line, lineIndex) => (
              <li key={lineIndex}>{line}</li>
            ))}
          </ul>
          {alternative.provenance.map((source, sourceIndex) => (
            <p key={sourceIndex} className="mt-1">
              {source}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}

export function TemplateCopilotV2AuthoritativeMap({
  ledger,
  projection,
  editingEnabled,
  structuredEditorFlags,
  busy,
  onTransition,
}: {
  ledger: TemplateCopilotV2Ledger;
  projection?: TemplateCopilotV2AuthoritativeProjection;
  editingEnabled: boolean;
  structuredEditorFlags?: Readonly<{
    attachments: boolean;
    conditions: boolean;
    notifications: boolean;
  }>;
  busy: boolean;
  onTransition: (
    factId: TemplateCopilotFactId,
    transition: TemplateCopilotV2MapTransition,
  ) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState<TemplateCopilotFactId | null>(null);
  const [value, setValue] = useState<unknown>(undefined);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [structuredIssues, setStructuredIssues] = useState<
    readonly TemplateCopilotV2StructuredIssue[]
  >([]);
  const [status, setStatus] = useState("");
  const locale = ledger.locale as Locale;
  const copy = copyFor(locale);
  if (!projection) return null;
  const start = (id: TemplateCopilotFactId) => {
    setEditing(id);
    const initial = ledger.facts[id].canonicalValue ?? defaults(id);
    setValue(
      isStructuredFact(id)
        ? prepareTemplateCopilotV2StructuredEditorValue(id, initial)
        : initial,
    );
    setReason("");
    setError("");
    setStructuredIssues([]);
    setStatus("");
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `#copilot-map-editor-${id} input, #copilot-map-editor-${id} textarea, #copilot-map-editor-${id} select, #copilot-map-editor-${id} button`,
        )
        ?.focus(),
    );
  };
  const close = () => {
    const previous = editing;
    setEditing(null);
    setError("");
    setStructuredIssues([]);
    requestAnimationFrame(() =>
      document.getElementById(`copilot-map-edit-${previous}`)?.focus(),
    );
  };
  const submit = async (id: TemplateCopilotFactId, action: MapAction) => {
    const canonicalValue = canonicalizeTemplateCopilotV2MapEditorValue(
      id,
      value,
    );
    const nextStructuredIssues =
      action === "save" && isStructuredFact(id)
        ? validateTemplateCopilotV2StructuredFacts(ledger, {
            attachments:
              id === "attachments.requirements" ? canonicalValue : undefined,
            conditions:
              id === "workflow.conditions" ? canonicalValue : undefined,
            notifications:
              id === "notifications.rules" ? canonicalValue : undefined,
          })
        : [];
    setStructuredIssues(nextStructuredIssues);
    const validation =
      action === "save"
        ? isStructuredFact(id)
          ? nextStructuredIssues.map((issue) =>
              formatTemplateCopilotV2StructuredIssue(issue, locale),
            )
          : validateTemplateCopilotV2MapEditorValue(id, canonicalValue, locale)
        : action === "not_applicable" && !reason.trim()
          ? [copy.naReason]
          : [];
    if (validation.length) {
      setError(`${copy.validation} ${validation.join("; ")}`);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `#copilot-map-editor-${id} input, #copilot-map-editor-${id} textarea, #copilot-map-editor-${id} select`,
          )
          ?.focus(),
      );
      return;
    }
    const failure = await onTransition(
      id,
      action === "save"
        ? { action, canonicalValue }
        : action === "not_applicable"
          ? { action, reason: reason.trim() }
          : { action },
    );
    if (failure) {
      setError(locale === "en" ? failure : copy.updateFailed);
      return;
    }
    setStatus(
      locale === "en"
        ? "Authoritative change saved."
        : locale === "zh-Hant"
          ? "權威變更已儲存。"
          : "权威更改已保存。",
    );
    close();
  };
  const readinessLabel = (state: "ready" | "blocked" | "not_ready") =>
    state === "ready"
      ? copy.ready
      : state === "blocked"
        ? copy.blocked
        : copy.notReady;
  // The server-provided projection already contains every localized fact label.
  // Index it locally instead of importing server ledger/projection code into the
  // client component (those modules use server-only cryptographic helpers).
  const factLabels = new Map(
    projection.facts.map((fact) => [fact.factId, fact.label]),
  );
  const downstreamLabel = (factIds: readonly TemplateCopilotFactId[]) =>
    factIds.map((factId) => factLabels.get(factId) || factId).join(", ");
  return (
    <section aria-label={copy.authoritative} className="space-y-3">
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        {copy.authoritative} · {copy.draft}:{" "}
        {readinessLabel(projection.readiness.draft)}; {copy.publication}:{" "}
        {readinessLabel(projection.readiness.publication)}; {copy.activation}:{" "}
        {readinessLabel(projection.readiness.activation)}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {error || status}
      </p>
      <ul className="space-y-3">
        {projection.facts.map((row) => {
          const structuredEnabled = row.factId === "attachments.requirements"
            ? structuredEditorFlags?.attachments === true
            : row.factId === "workflow.conditions"
              ? structuredEditorFlags?.conditions === true
              : row.factId === "notifications.rules"
                ? structuredEditorFlags?.notifications === true
                : true;
          const rowEditingEnabled = editingEnabled && structuredEnabled;
          const hasOpenExtractionSidecar =
            ledger.extractionEvidence.candidates.some(
              (candidate) =>
                candidate.factId === row.factId && candidate.state === "open",
            ) ||
            ledger.extractionEvidence.conflicts.some(
              (conflict) =>
                conflict.factId === row.factId && conflict.state === "open",
            );
          const editor = getTemplateCopilotV2MapEditorContract({
            factId: row.factId,
            state: row.status,
            hasNotApplicableReason: Boolean(reason.trim()),
            hasOpenExtractionSidecar,
          });
          return (
            <li
              key={row.factId}
              className="min-w-0 rounded border border-neutral-100 p-3 text-xs dark:border-neutral-800"
            >
              <p className="font-medium text-neutral-900 dark:text-white">
                {row.label}
              </p>
              <ul className="mt-1 list-disc pl-4 text-neutral-700 dark:text-neutral-200">
                {row.lines.map((line, index) => (
                  <li key={index} className="break-words whitespace-pre-wrap">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-1 break-words text-neutral-600 dark:text-neutral-300">
                {row.stateLabel} · {row.provenance.join(" · ") || "—"}
              </p>
              {row.originalWording && (
                <p className="mt-1 break-words text-neutral-700 dark:text-neutral-200">
                  {copy.original}: {row.originalWording}
                </p>
              )}
              {row.confirmation && (
                <p className="mt-1 break-words text-neutral-700 dark:text-neutral-200">
                  {row.confirmation}
                </p>
              )}
              {row.conflictAlternatives.map((evidence, index) => (
                <Evidence
                  key={`conflict-${index}`}
                  evidence={evidence}
                  copy={copy}
                  title={`${copy.conflict} ${index + 1} · ${evidence.stateLabel}`}
                  tone="conflict"
                />
              ))}
              {row.history.map((evidence, index) => (
                <Evidence
                  key={`history-${index}`}
                  evidence={evidence}
                  copy={copy}
                  title={`${copy.history} ${index + 1} · ${evidence.stateLabel}`}
                  tone="history"
                />
              ))}
              <p className="mt-1 break-words text-neutral-600 dark:text-neutral-300">
                {row.downstreamImpact.length
                  ? `${copy.changing} ${downstreamLabel(row.downstreamImpact)}`
                  : copy.noDownstream}
              </p>
              {rowEditingEnabled && editing !== row.factId && (
                <button
                  id={`copilot-map-edit-${row.factId}`}
                  type="button"
                  disabled={busy}
                  onClick={() => start(row.factId)}
                  className="mt-2 min-h-10 rounded border border-neutral-400 px-2 text-xs disabled:opacity-50"
                >
                  {copy.edit}
                </button>
              )}
              {editingEnabled && isStructuredFact(row.factId) && !structuredEnabled && (
                <p className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                  {copy.readOnly}
                </p>
              )}
              {editing === row.factId && (
                <div
                  id={`copilot-map-editor-${row.factId}`}
                  className="mt-3 min-w-0 space-y-3 rounded border border-sky-300 bg-sky-50 p-3 dark:bg-neutral-900"
                >
                  {isStructuredFact(row.factId) ? (
                    <TemplateCopilotV2StructuredFactEditor
                      factId={row.factId}
                      value={value}
                      ledger={ledger}
                      onChange={setValue}
                      locale={locale}
                      issues={structuredIssues.filter(
                        (issue) => issue.factId === row.factId,
                      )}
                    />
                  ) : (
                    <StructuredEditor
                      factId={row.factId}
                      value={value}
                      onChange={setValue}
                      copy={copy}
                      locale={locale}
                    />
                  )}
                  <p className="text-amber-800 dark:text-amber-200">
                    {row.downstreamImpact.length
                      ? `${copy.changing} ${downstreamLabel(row.downstreamImpact)}.`
                      : copy.noDownstream}
                  </p>
                  {nonAlwaysFacts.has(row.factId) && (
                    <Field label={copy.naReason}>
                      <input
                        className={control}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || !editor.canSave}
                      onClick={() => void submit(row.factId, "save")}
                      className="min-h-10 rounded bg-emerald-700 px-3 text-xs text-white disabled:opacity-50"
                    >
                      {copy.save}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !editor.canMarkUnknown}
                      onClick={() => void submit(row.factId, "unknown")}
                      className="min-h-10 rounded border border-neutral-400 px-3 text-xs disabled:opacity-50"
                    >
                      {copy.unknown}
                    </button>
                    {nonAlwaysFacts.has(row.factId) && (
                      <button
                        type="button"
                        disabled={busy || !editor.canMarkNotApplicable}
                        onClick={() =>
                          void submit(row.factId, "not_applicable")
                        }
                        className="min-h-10 rounded border border-neutral-400 px-3 text-xs disabled:opacity-50"
                      >
                        {copy.na}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={close}
                      className="min-h-10 rounded border border-neutral-400 px-3 text-xs"
                    >
                      {copy.cancel}
                    </button>
                  </div>
                  {error && (
                    <p
                      className="break-words text-rose-700 dark:text-rose-300"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
