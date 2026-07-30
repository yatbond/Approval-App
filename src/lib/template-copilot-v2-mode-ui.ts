import type { TemplateCopilotLocale } from "./template-copilot-plan.ts";
import type { TemplateCopilotV2AuthoringMode } from "./template-copilot-v2-mode-contract.ts";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";

export type TemplateCopilotV2ModeFlags = Readonly<{
  guided: boolean;
  describeEverything: boolean;
  similarTemplate: boolean;
}>;

export function getTemplateCopilotV2ModeUiContract({
  mode,
  flags,
  hasSourceSnapshot,
}: {
  mode: TemplateCopilotV2AuthoringMode;
  flags: TemplateCopilotV2ModeFlags | undefined;
  hasSourceSnapshot: boolean;
}) {
  const broadMode = mode === "describe_everything" || mode === "similar_template";
  return Object.freeze({
    availableModes: Object.freeze([
      ...(flags?.guided ? ["guided" as const] : []),
      ...(flags?.describeEverything ? ["describe_everything" as const] : []),
      ...(flags?.similarTemplate ? ["similar_template" as const] : []),
    ]),
    broadMode,
    composerLimit: broadMode ? 80_000 : 8_000,
    allowRequirementsDocument: flags?.describeEverything === true && mode === "describe_everything",
    showSourceSnapshot: hasSourceSnapshot,
  });
}

export function shouldSubmitTemplateCopilotComposerKey({
  key,
  shiftKey,
  isComposing,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}) {
  return key === "Enter" && !shiftKey && !isComposing;
}

export function getTemplateCopilotTranscriptPresentation(content: string) {
  const count = templateCopilotUnicodeCodePointCount(content);
  return Object.freeze({
    count,
    collapsed: count > 2_000,
    preview: count > 2_000 ? `${Array.from(content).slice(0, 600).join("")}…` : content,
  });
}

export function templateCopilotV2ModeUiCopy(locale: TemplateCopilotLocale) {
  if (locale === "zh-Hant") {
    return Object.freeze({
      describeLabel: "一次描述整個流程",
      describePlaceholder: "請用日常用語描述誰提出申請、需要甚麼資料或文件、每一步由誰處理，以及不同情況下應該怎樣做。",
      describeExample: "例如：員工提交採購申請和報價單；金額超過港幣 50,000 元時，財務部審批後再交總經理審批。",
      similarLabel: "說明與來源範本不同的地方",
      similarPlaceholder: "只需說明要保留、移除或更改的地方。",
      similarExample: "例如：保留所有步驟，但把金額上限改為港幣 100,000 元，並新增法務部審閱合約。",
      findSources: "選擇來源範本",
      useSource: "使用所選版本",
      sourceRetained: "已保留的來源範本版本（切換建立方式後仍會顯示）",
      reselectDocument: "重新選擇同一份檔案以檢查或重試上載",
      describeFileOnly: "在「一次描述全部」方式中，可上載文字、Markdown 或 PDF 需求文件。",
      documentLimit: "每次 Copilot 訪談最多可加入五份需求文件。",
      documentTooLarge: "文件超過 5 MB、100 頁 PDF 或 80,000 個擷取字元的限制。系統沒有分析部分內容；請把文件分拆後再上載。",
      modeReadOnly: "目前的建立方式是唯讀。你仍可查看已儲存的內容，或選擇另一個可用的建立方式。",
      tooLong: "請將描述限制在 80,000 個字元以內。",
      showFullMessage: "顯示完整的已儲存訊息",
      hideFullMessage: "隱藏完整訊息",
    });
  }
  if (locale === "zh-Hans") {
    return Object.freeze({
      describeLabel: "一次描述整个流程",
      describePlaceholder: "请用日常用语说明谁提出申请、需要哪些信息或文件、每一步由谁处理，以及不同情况下应如何处理。",
      describeExample: "例如：员工提交采购申请和报价单；金额超过港币 50,000 元时，先由财务部审批，再交总经理审批。",
      similarLabel: "说明与来源模板不同的地方",
      similarPlaceholder: "只需说明要保留、删除或更改的内容。",
      similarExample: "例如：保留所有步骤，但把金额上限改为港币 100,000 元，并新增法务部审核合同。",
      findSources: "选择来源模板",
      useSource: "使用所选版本",
      sourceRetained: "已保留的来源模板版本（切换创建方式后仍会显示）",
      reselectDocument: "重新选择同一文件以检查或重试上传",
      describeFileOnly: "在“一次描述全部”方式中，可上传文本、Markdown 或 PDF 需求文件。",
      documentLimit: "每次 Copilot 访谈最多可添加五份需求文件。",
      documentTooLarge: "文件超过 5 MB、100 页 PDF 或 80,000 个提取字符的限制。系统没有分析部分内容；请把文件拆分后再上传。",
      modeReadOnly: "当前的创建方式为只读。你仍可查看已保存的内容，或选择另一种可用的创建方式。",
      tooLong: "请将描述限制在 80,000 个字符以内。",
      showFullMessage: "显示完整的已保存消息",
      hideFullMessage: "隐藏完整消息",
    });
  }
  return Object.freeze({
    describeLabel: "Describe the whole workflow",
    describePlaceholder: "In everyday language, explain who submits the request, what information or documents are needed, who handles each step, and what should happen in different situations.",
    describeExample: "Example: An employee submits a purchase request and quotations. Over HKD 50,000, Finance approves before the General Manager.",
    similarLabel: "Describe what should differ from the source template",
    similarPlaceholder: "Only describe what to keep, remove, or change.",
    similarExample: "Example: Keep every step, change the limit to HKD 100,000, and add Legal review for the contract.",
    findSources: "Choose a source template",
    useSource: "Use selected version",
    sourceRetained: "Saved source template version (kept when you switch modes)",
    reselectDocument: "Reselect the same file to check or retry the upload",
    describeFileOnly: "In Describe everything mode, you can upload a text, Markdown, or PDF requirements document.",
    documentLimit: "A Copilot interview accepts at most five requirements documents.",
    documentTooLarge: "The file exceeds the 5 MB, 100-page PDF, or 80,000 extracted-character limit. No partial analysis was performed; split the file and upload the smaller parts.",
    modeReadOnly: "The current authoring mode is read-only. You can still review saved content or choose another available mode.",
    tooLong: "Keep the description to 80,000 characters or fewer.",
    showFullMessage: "Show the full saved message",
    hideFullMessage: "Hide the full message",
  });
}
