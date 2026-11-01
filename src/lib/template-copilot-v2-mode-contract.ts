import type { TemplateCopilotLocale } from "./template-copilot-plan.ts";

/** Browser-safe Step 6 contract. Keep server candidate normalization and
 * cryptographic hashing out of this module so UI bundles never pull Node APIs. */
export const templateCopilotV2AuthoringModes = ["guided", "describe_everything", "similar_template"] as const;
export type TemplateCopilotV2AuthoringMode = typeof templateCopilotV2AuthoringModes[number];

export type TemplateCopilotV2SourceSnapshot = Readonly<{
  versionId: string;
  versionNumber: number;
  templateKey: string;
  name: string;
  businessName: string;
  departmentName: string;
  capturedAt: string;
  snapshotHash: string;
  templateSnapshot: unknown;
}>;

export type TemplateCopilotV2ModeState = Readonly<{
  mode: TemplateCopilotV2AuthoringMode;
  sourceSnapshot?: TemplateCopilotV2SourceSnapshot;
}>;

export function templateCopilotV2ModeCopy(locale: TemplateCopilotLocale) {
  const copy = locale === "zh-Hant" ? {
    guide: "逐步引導", describe: "一次描述全部", similar: "從相近範本開始", switch: "切換建立方式", source: "來源範本版本", differs: "這個範本有甚麼不同？", fallback: "描述內容暫時無法分析；已改用逐步問題，不會遺失已儲存資料。"
  } : locale === "zh-Hans" ? {
    guide: "逐步引导", describe: "一次描述全部", similar: "从相近模板开始", switch: "切换创建方式", source: "来源模板版本", differs: "这个模板有什么不同？", fallback: "暂时无法分析描述内容；已改用逐步问题，不会丢失已保存的信息。"
  } : {
    guide: "Guide me step by step", describe: "Let me describe everything", similar: "Start from a similar template", switch: "Switch how you create this", source: "Source template version", differs: "What differs from this template?", fallback: "That description could not be analysed. Continue with guided gaps; nothing already saved was lost."
  };
  return Object.freeze(copy);
}
