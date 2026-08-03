import {
  templateCopilotV3HardClauseSeparator,
  templateCopilotV3RequirementGoverningPrefixIsNonAffirmative,
} from "./template-copilot-v3-clause-boundaries.ts";
import { templateCopilotV3NormalizeLexicalText } from "./template-copilot-v3-evidence.ts";
import { quarantineTemplateCopilotRequirementText } from "./template-copilot-safety.ts";

const notificationSectionHeadings = new Set([
  "notifications:",
  "notification rules:",
  "通知:",
  "通知規則:",
  "通知规则:",
]);

const authorityLabelSource =
  "(?:update|latest\\s+update|correction|clarification|amendment|revision|" +
  "note|please\\s+note|status|important|important\\s+notice|" +
  "effective\\s+immediately|" +
  "fyi|notice|policy\\s+update|status\\s+update|" +
  "更新|更正|修正|補充|补充|澄清|備註|备注|狀態|状态|重要|提醒|" +
  "最新更新|請注意|请注意|重要通知|修訂|修订|修訂版|修订版|" +
  "政策更新|狀態更新|状态更新)";
const authorityWrapperPattern = new RegExp(
  "^(?:(?:\\[\\s*" + authorityLabelSource + "\\s*\\]|" +
  "【\\s*" + authorityLabelSource + "\\s*】|" +
  "\\{\\s*" + authorityLabelSource + "\\s*\\})" +
  "(?:\\s*(?::|：|,|，|[-‐‑‒–—―−])\\s*)?|" +
  authorityLabelSource +
  "(?:\\s+\\d{4}(?:[-/.]\\d{1,2}){2})?\\s*" +
  "(?::|：|,|，|[-‐‑‒–—―−])\\s*)",
  "u",
);
const authorityBulletPattern =
  /^(?:(?:[-*+>•‣▪◦▶●☑📣📌🔴→]|[‐‑‒–—―−]|\p{Extended_Pictographic}\uFE0F?)+|(?:\d{1,3}[.)])|(?:[（(]?\d{1,3}[）)]))\s*/u;
const authorityNormalizedCircledNumberPattern =
  /^\d{1,3}\s+(?=(?:this|that|the|we|management|本公司|我們|我们|此|該|该|本|上述|前述|這|这))/u;
const authorityOpeningFormatPattern =
  /^(?:["'“”‘’「『（(\[【_`#~]+)\s*/u;
const authorityClosingFormatPattern =
  /\s*(?:["'“”‘’」』）)\]】_`#~]+)$/u;

const englishRuleSubjectSource =
  "(?:(?:this|that|these|those|all|both|such|the|our)\\s+" +
  "(?:(?:above|below|preceding|following|previous|prior|former|" +
  "shown\\s+(?:(?:immediately|directly)\\s+)?below|displayed\\s+below|set\\s+out\\s+below|" +
  "(?:immediately|directly)\\s+below|listed\\s+below)\\s+)?" +
  "(?:(?:notification\\s+)?rules?|polic(?:y|ies)|statements?|" +
  "instructions?|wording|behaviou?r)" +
  "(?:\\s+(?:above|below|shown\\s+(?:(?:immediately|directly)\\s+)?below|displayed\\s+below|" +
  "set\\s+out\\s+below|(?:immediately|directly)\\s+below|" +
  "listed\\s+below|that\\s+follows))?)";
const englishAuthorityAdverbSource =
  "(?:hereby|now|already|formally|officially|effectively|" +
  "currently|previously|permanently|temporarily)";
const englishNonCurrentStatusSource =
  "(?:deprecated|obsolete|retired|historical|legacy|revoked|withdrawn|" +
  "superseded|invalid|invalidated|void|cancelled|canceled|rescinded|" +
  "repealed|expired|abolished|discontinued|terminated|deactivated|" +
  "replaced|inactive|disabled|annulled|defunct|sunset|lapsed|ended|" +
  "phased\\s+out|obsoleted|scrapped|" +
  "false|out\\s+of\\s+date|not\\s+applicable|rendered\\s+obsolete|" +
  "no\\s+longer\\s+(?:applicable|valid|effective|operative|active|" +
  "in\\s+force|in\\s+effect|current|binding|used|applied|adopted|" +
  "implemented|followed)|" +
  "not\\s+(?:valid|effective|operative|active|" +
  "applicable|in\\s+force|in\\s+effect)|never\\s+valid|" +
  "ceased\\s+to\\s+apply)";
const englishIntransitiveNonCurrentStatusSource =
  "(?:expired|lapsed|ended|sunset|ceased\\s+to\\s+apply)";
const englishReplacementAgentSource =
  "(?:(?:a|an|the|this|that)\\s+)?" +
  "(?:(?:new|newer|current|replacement|updated)\\s+)?" +
  "(?:(?:notification\\s+)?rules?|polic(?:y|ies)|instructions?|" +
  "wording|workflow|process)";
const englishPassiveAuthorityTailSource =
  "(?:(?:\\s+by\\s+" + englishReplacementAgentSource + ")|" +
  "(?:\\s+as\\s+of\\s+(?:today|now|[^,，:：;；]{1,40}))|" +
  "(?:\\s+effective\\s+(?:today|now|immediately))|" +
  "(?:\\s+with\\s+immediate\\s+effect)|" +
  "(?:\\s+(?:immediately|from\\s+today|going\\s+forward|here|from\\s+use))|" +
  "(?:\\s+to\\s+(?:this|that|the)\\s+(?:workflow|process|system))|" +
  "(?:\\s+and\\s+(?:must|shall|should)\\s+not\\s+be\\s+" +
  "(?:used|applied|adopted|implemented)))?\\s*:?$";

const englishSubjectStatusPattern = new RegExp(
  "^" + englishRuleSubjectSource + "\\s+(?:" +
  "(?:is|are|was|were|remains?|stands?)\\s+(?:" + englishAuthorityAdverbSource +
  "\\s+)*(?:" + englishNonCurrentStatusSource + ")|" +
  "(?:has|have|had)\\s+(?:" + englishAuthorityAdverbSource +
  "\\s+)*(?:been\\s+(?:" + englishNonCurrentStatusSource + ")|" +
  englishIntransitiveNonCurrentStatusSource + ")|" +
  "(?:does|do|did)\\s+(?:not|no\\s+longer)\\s+apply|" +
  "(?:no\\s+longer\\s+applies|ceased\\s+to\\s+apply)|" +
  "(?:is|are|was|were)\\s+(?:(?:not|no\\s+longer)\\s+)?to\\s+be\\s+" +
  "(?:used|applied|adopted|implemented|followed|disregarded|ignored)|" +
  "(?:gets?|got|becomes?|became)\\s+(?:" + englishAuthorityAdverbSource +
  "\\s+)*(?:" + englishNonCurrentStatusSource + ")|" +
  "(?:must|shall|should|may|can|will|would)\\s+" +
  "(?:not|no\\s+longer)\\s+be\\s+" +
  "(?:used|applied|adopted|implemented))" +
  englishPassiveAuthorityTailSource,
  "u",
);

const englishActiveRevocationPattern = new RegExp(
  "^(?:(?:we|management|the\\s+company|the\\s+organi[sz]ation)\\s+" +
  "(?:(?:(?:have|has|had)\\s+)?(?:" + englishAuthorityAdverbSource +
  "\\s+)*(?:retired|revoked|withdrawn|superseded|cancelled|canceled|" +
  "rescinded|repealed|abolished|discontinued|terminated|deactivated|scrapped|" +
  "replaced|annulled|invalidated|sunset)|withdrew)\\s+" +
  englishRuleSubjectSource + ")\\s*:?$",
  "u",
);
const englishActorStoppedUsePattern = new RegExp(
  "^(?:we|management|the\\s+company|the\\s+organi[sz]ation)\\s+" +
  "(?:(?:no\\s+longer|do\\s+not|don['’]t|never)\\s+" +
  "(?:use|apply|adopt|implement|follow)|" +
  "(?:(?:have|has|had)\\s+)?(?:stopped|ceased)\\s+" +
  "(?:using|applying|adopting|implementing|following))\\s+" +
  englishRuleSubjectSource + "\\s*:?$",
  "u",
);
const englishReverseReplacementPattern = new RegExp(
  "^" + englishReplacementAgentSource + "\\s+" +
  "(?:(?:replaces?|supersedes?)|" +
  "(?:has|had)\\s+(?:replaced|superseded))\\s+" +
  englishRuleSubjectSource + "\\s*:?$",
  "u",
);
const englishReplacementDirectivePattern = new RegExp(
  "^(?:please\\s+)?use\\s+" + englishReplacementAgentSource +
  "\\s+instead\\s+of\\s+" + englishRuleSubjectSource + "\\s*:?$",
  "u",
);
const cjkNaturalNonCurrentStatusPattern =
  /^(?:(?:以下|下列|下述|下面|下方|上述|先前)(?:所列|各項|各项|的)?|(?:此|該|该|本|這|这|這些|这些|舊|旧|舊有|旧有|該項|该项|此項|此项|原|原有))(?:通知)?(?:規則|规则|政策|說明|说明|文字|內容|内容|要求|規定|规定)(?:(?:現已|现已|已經|已经|已)?(?:正式)?(?:撤銷|撤销|撤回|廢止|废止|廢除|废除|作廢|作废|停用|失效|無效|无效|不適用|不适用|過期|过期|取消|終止|终止|淘汰|註銷|注销|退役|結束|结束|宣告無效|宣告无效|告失效)|(?:(?:現已|现已|已經|已经|已)?不再(?:適用|适用|生效|有效|使用|運作|运作))|(?:已)?(?:於|于)(?:今日|今天|即日)(?:正式)?(?:撤銷|撤销|撤回|廢止|废止|取消|終止|终止)|(?:自|由|從|从)?即日起(?:正式)?(?:失效|無效|无效|不再(?:適用|适用|生效|有效))|(?:已)?停止生效|(?:已)?(?:被|遭)(?:正式)?(?:撤銷|撤销|撤回|廢止|废止|取消|終止|终止))(?:了)?\s*:?$/u;

function canonicalAuthorityUnit(value: string) {
  let authority = templateCopilotV3NormalizeLexicalText(value);
  for (let depth = 0; depth < 8; depth += 1) {
    const unwrapped = authority
      .replace(authorityBulletPattern, "")
      .replace(authorityNormalizedCircledNumberPattern, "")
      .replace(authorityWrapperPattern, "")
      .replace(authorityOpeningFormatPattern, "")
      .replace(authorityClosingFormatPattern, "")
      .trim();
    if (unwrapped === authority) break;
    authority = unwrapped;
  }
  return authority;
}

export function templateCopilotV3NotificationIsSectionHeading(value: string) {
  const normalized = canonicalAuthorityUnit(value);
  return notificationSectionHeadings.has(normalized);
}

export function templateCopilotV3NotificationAuthorityUnitIsNonAuthoritative(
  value: string,
) {
  const authority = canonicalAuthorityUnit(value);
  if (authority.length === 0) return false;
  return (
    /^(?:(?:examples?|samples?|illustrations?|demonstrations?)(?:\s+only)?(?:\s+(?:notification\s+)?(?:rules?|polic(?:y|ies)|statements?|instructions?))?|hypothetical|draft(?:\s+only)?|for\s+(?:reference|information|informational|illustration|illustrative|demonstration|examples?)\s+(?:purposes?\s+)?only|(?:(?:deprecated|obsolete|retired|historical|legacy|revoked|withdrawn|superseded|invalid|void|former|old|previous|outdated|expired|hypothetical)\s+(?:examples?|samples?|illustrations?|demonstrations?|(?:notification\s+)?(?:rules?|polic(?:y|ies)|statements?|instructions?)|workflow|process|system))(?:,\s*(?:not|no\s+longer)\s+applicable)?|(?:not|no\s+longer)\s+applicable)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:(?:this|that|the\s+(?:above|preceding|following))(?:\s+(?:content|material|text|wording|behaviou?r|(?:notification\s+)?rules?|polic(?:y|ies)|statements?|instructions?))?)\s+(?:is|was)\s+(?:(?:(?:merely|only|just)\s+)?(?:an?\s+)?(?:examples?|samples?|illustrations?|demonstrations?|illustrative|hypothetical)(?:\s+only)?|for\s+(?:reference|information|informational|illustration|illustrative|demonstration)\s+(?:purposes?\s+)?only)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:this|that|the\s+(?:above|preceding|following))\s+(?:is|was)\s+(?:an?\s+)?(?:deprecated|obsolete|retired|historical|legacy|former|old|previous|outdated)\s+(?:examples?|samples?|illustrations?|demonstrations?|(?:notification\s+)?(?:rules?|polic(?:y|ies)|statements?|instructions?))\s*:?$/u.test(
      authority,
    ) ||
    englishSubjectStatusPattern.test(authority) ||
    englishActiveRevocationPattern.test(authority) ||
    englishActorStoppedUsePattern.test(authority) ||
    englishReverseReplacementPattern.test(authority) ||
    englishReplacementDirectivePattern.test(authority) ||
    cjkNaturalNonCurrentStatusPattern.test(authority) ||
    /^(?:shown\s+as\s+an?\s+examples?\s+only|this\s+is\s+sample\s+wording\s*,\s*not\s+current\s+policy)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:this|that|the)\s+(?:wording|statement|text)\s+(?:is|was)\s+retained\s+for\s+(?:audit\s+history|history|archive|archival\s+purposes?)\s+only\s*:?$/u.test(
      authority,
    ) ||
    /^(?:please\s+)?(?:stop\s+using|disregard|ignore|never\s+(?:use|apply|adopt|implement)|do\s+not\s+(?:use|apply|adopt|implement)|don['’]t\s+(?:use|apply|adopt|implement))\s+(?:(?:this|that|the|the\s+(?:above|preceding|following))\s+(?:notification\s+)?(?:rules?|polic(?:y|ies)|statements?|instructions?))\s*:?$/u.test(
      authority,
    ) ||
    /^(?:(?:示例|範例|范例|例子|僅供參考|仅供参考|僅供說明|仅供说明|假設|假设|假想|草案)|(?:舊|旧|先前|過時|过时|已撤銷|已撤销|已撤回|已廢止|已废止|已廢除|已废除|已作廢|已作废|停用|無效|无效|不適用|不适用|不再適用|不再适用)\s*(?:通知)?(?:規則|规则|政策|說明|说明|示例|範例|范例|例子))\s*:?$/u.test(
      authority,
    ) ||
    /^(?:(?:以下(?:內容|内容)?|(?:此|該|该|上述|前述)(?:通知)?(?:規則|规则|政策|內容|内容|文字|說明|说明)?)(?:僅|仅|只)(?:供|作|為|为)(?:內部|内部)?(?:參考|参考|說明|说明|展示|示意|示例|範例|范例|例子|存檔|存档)|(?:這|这)(?:只|僅|仅)是(?:示例|範例|范例|例子|說明|说明|展示|示意)|此(?:為|为)(?:示例|範例|范例|例子|說明|说明|展示|示意)|本例(?:僅|仅|只)(?:供|作|為|为)(?:參考|参考|說明|说明|展示|示意)|(?:僅|仅)(?:供|作)(?:內部|内部)?(?:參考|参考|說明|说明|展示|示意|存檔|存档))\s*:?$/u.test(
      authority,
    ) ||
    /^(?:這|这)是(?:一個|一个)?(?:先前|舊|旧|過時|过时|已撤銷|已撤销|已廢止|已废止|已廢除|已废除|作廢|作废|停用|無效|无效|不適用|不适用|已過期|已过期|已取消|已終止|已终止|已淘汰|已被取代|已註銷|已注销|已退役)的?(?:舊|旧|先前)?(?:通知)?(?:規則|规则|政策|說明|说明|示例|範例|范例)?\s*:?$/u.test(
      authority,
    ) ||
    /^(?:(?:以下所列|這些|这些|該等|该等|這項|这项|所有|全部|此|該|该|上述|前述|下列|以下|本|這|这)?(?:通知)?(?:規則|规则|政策|說明|说明|文字|內容|内容))(?:(?:(?:已被|已由|已經由|已经由)[^。！？;；]{1,24}(?:取代|替代))|(?:(?:現已|现已|已經|已经|已被|已)?(?:撤銷|撤销|撤回|廢止|废止|廢除|废除|作廢|作废|停用|失效|無效|无效|過期|过期|取消|終止|终止|淘汰|取代|替代|註銷|注销|退役|結束|结束))|(?:(?:現已|现已|已經|已经|已)?不再(?:適用|适用|生效|有效|使用|運作|运作))|(?:自即日起(?:失效|無效|无效|不再(?:適用|适用|生效|有效)))|(?:不得|不應|不应|不可|不能|禁止)(?:再)?(?:使用|採用|采用|套用|應用|应用|執行|执行|用)|(?:應|应)?停止使用)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:(?:(?:請|请)?(?:勿|不要)|不得|切勿|停止|禁止|不能|不可)(?:再)?(?:使用|採用|采用|套用|應用|应用|執行|执行|用))(?:此|該|该|上述|前述|本)?(?:通知)?(?:規則|规则|政策|說明|说明)?\s*:?$/u.test(
      authority,
    ) ||
    /^(?:我們|我们|管理層|管理层|本公司|公司|本機構|本机构|機構|机构)(?:已|已經|已经|正式)?(?:撤銷|撤销|撤回|廢止|废止|廢除|废除|作廢|作废|停用|取消|終止|终止|淘汰|取代|註銷|注销|退役)(?:此|該|该|上述|前述|本)?(?:通知)?(?:規則|规则|政策|說明|说明)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:我們|我们|管理層|管理层|本公司|公司|本機構|本机构|機構|机构)(?:已|已經|已经|正式)?(?:不再|停止|不再繼續|不再继续)(?:使用|採用|采用|套用|應用|应用|執行|执行|遵循)(?:此|該|该|上述|前述|本)?(?:通知)?(?:規則|规则|政策|說明|说明)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:新|最新|現行|现行|目前|當前|当前)(?:通知)?(?:規則|规则|政策|說明|说明)(?:現已|现已|已經|已经|已)?(?:取代|替代|廢止|废止|撤銷|撤销)(?:了)?(?:以下所列|此|該|该|上述|前述|本|這些|这些|該等|该等|這項|这项|所有|全部)?(?:通知)?(?:規則|规则|政策|說明|说明)\s*:?$/u.test(
      authority,
    ) ||
    /^(?:請|请)?改用[^,，。！？;；]{1,40}(?:規則|规则|政策|說明|说明)\s*[,，]\s*(?:請|请)?不要(?:再)?(?:沿用|使用|採用|采用|套用|應用|应用|執行|执行)(?:此|該|该|上述|前述|本|這些|这些|該等|该等)?(?:通知)?(?:規則|规则|政策|說明|说明)\s*:?$/u.test(
      authority,
    )
  );
}

function codeUnitOffsetAtCodePoint(value: string, codePointIndex: number) {
  let codeUnitOffset = 0;
  let currentCodePoint = 0;
  while (codeUnitOffset < value.length && currentCodePoint < codePointIndex) {
    const codePoint = value.codePointAt(codeUnitOffset);
    if (codePoint === undefined) break;
    codeUnitOffset += String.fromCodePoint(codePoint).length;
    currentCodePoint += 1;
  }
  return currentCodePoint === codePointIndex ? codeUnitOffset : -1;
}

const authorityFollowingBridgePattern =
  /^(?:the\s+following\s+(?:behaviou?r|notification|rule|wording|instruction)\s+applies|以下(?:行為|行为|通知|規則|规则|文字|說明|说明)(?:適用|适用|生效))\s*:?$/u;
const independentNotificationActionUnitPattern =
  /(?:^|[,，:：;；]\s*|\b(?:and|then|also|otherwise)\s+)(?:(?:please\s+)?(?:(?:do\s+not|don['’]t|never)\s+)?)?(?:notif(?:y|ies|ied|ying)|inform(?:s|ed|ing)?)\b|\b(?:notif(?:ies|ied|ying)|inform(?:s|ed|ing))\b|\b(?:alerts|emails)\s+(?!(?:remain(?:s|ed)?|is|are|was|were|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|services?|providers?|templates?|layouts?|deliver(?:y|ies)|trigger(?:s|ed)?|archive(?:d)?|log(?:ged)?|stored|retained|visible|displayed|dashboard|reports?|records?|history|metrics?|counts?|shows?|showed)\b)[^,，:：;；.!?。！？]{1,80}|\b(?:deliver(?:s|ed|ing)?|dispatch(?:es|ed|ing)?|issu(?:e|es|ed|ing))\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\s+to\b|\b(?:send|sends|sent|deliver(?:s|ed|ing)?|dispatch(?:es|ed|ing)?|issu(?:e|es|ed|ing))\s+[^,，:：;；.!?。！？]{1,64}\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\b|\b(?:receives?|gets?)\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\b|\bnotifications?\s+(?:(?:will\s+)?go(?:es)?|went|(?:is|are|was|were)\s+(?:being\s+)?sent)\s+to\b|\b(?:send|sends|sent)\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\s+to\b|\b(?:[\p{L}\p{M}\p{N}&'’.-]+\s+){1,8}(?:is|was|will\s+be)\s+sent\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\b|\b(?:an?\s+)?(?:email|alert|notification)\s+(?:is|was|will\s+be)\s+sent\s+to\b|\b(?:will|shall|must|should|may|can|does|do|did)\s+(?:not\s+)?(?:notify|inform|alert|email)\b|(?:^|[,，:：;；]\s*|\b(?:and|then|also|otherwise)\s+)(?:email|alert)\s+(?!(?:alerts?|notifications?|messages?|records?|history|deliver(?:y|ies)|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|services?|providers?|templates?|layouts?|dashboards?|reports?|metrics?|counts?)\b)|(?:發送|发送|傳送|传送|寄送|寄發|寄发|發出|发出|推送|推播|發布|发布|發佈|送出)(?:電郵|电邮|通知|提醒)|(?:^|[,，:：;；]\s*|(?:並|并|然後|然后|另行|同時|同时))(?:(?:請|请)?(?:不要|勿|不得|切勿)?)(?:只|僅|仅)?(?:通知(?!(?:(?:警示|提醒|發送|发送|傳送|传送|寄送|寄發|寄发|系統|系统|電郵|电邮)?(?:規則|规则|政策|說明|说明|文字|內容|内容|記錄|记录|設定|设置|配置|指標|指标|歷史|历史|範本|范本|模板|系統|系统|服務|服务|模組|模块|儀表板|仪表板)))|知會|知会|告知|通報|通报)/u;

const independentEnglishNotificationDeliveryActionPattern =
  /\b(?:is|are|was|were|gets?|got|will\s+be|has\s+been|have\s+been|had\s+been)\s+(?:notified|informed|alerted|emailed)\b|\b(?:will|shall|must|should|may|can|does|do|did|is\s+to|are\s+to|was\s+to|were\s+to)\s+(?:not\s+)?(?:receive|get)\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\b|\b(?:emails?|alerts?|notifications?)\s+(?:(?:will\s+)?go(?:es)?|went)\s+to\b|\b(?:trigger(?:s|ed|ing)?|generat(?:e|es|ed|ing)|emit(?:s|ted|ting)?|push(?:es|ed|ing)?|rout(?:e|es|ed|ing)|fir(?:e|es|ed|ing)|publish(?:es|ed|ing)?)\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\s+to\b|\b(?:trigger(?:s|ed|ing)?|generat(?:e|es|ed|ing)|emit(?:s|ted|ting)?|push(?:es|ed|ing)?|rout(?:e|es|ed|ing)|fir(?:e|es|ed|ing)|publish(?:es|ed|ing)?)\s+[^,，:：;；.!?。！？]{1,64}\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\b/u;

const independentEnglishNotificationAdditionalDeliveryActionPattern =
  /\b(?:schedul(?:e|es|ed|ing)|queu(?:e|es|ed|ing)|forward(?:s|ed|ing)?|post(?:s|ed|ing)?)\s+(?:an?\s+)?(?:emails?|alerts?|notifications?)\s+(?:to|for)\b|\b(?:an?\s+)?(?:emails?|alerts?|notifications?)\s+(?:is|are|was|were|will\s+be|has\s+been|have\s+been|had\s+been)\s+(?:delivered|dispatched|issued|generated|emitted|pushed|routed|fired|published|scheduled|queued|forwarded|posted)\s+(?:to|for)\b|\b(?:is|are|was|were|will\s+be|has\s+been|have\s+been|had\s+been)\s+(?:copied|blind[- ]copied)\s+on\s+(?:an?\s+)?(?:emails?|notifications?)\b|\b(?:supports?|begins?|starts?|continues?|is|are|was|were)\s+(?:sending|emailing|alerting|notifying|informing|delivering|dispatching|issuing)\b|\b(?:is|are|was|were|will\s+be)\s+receiving\s+(?:an?\s+)?(?:emails?|alerts?|notifications?|reminders?)\b|(?:^|[,，:：;；]\s*)cc\s+[^,，:：;；.!?。！？]{1,48}|\b(?:is|are|was|were|will\s+be)\s+cc['’]d\s+on\b/u;

const independentCjkNotificationDeliveryActionPattern =
  /(?:會|会|將|将|已)?(?:在[^,，:：;；.!?。！？]{0,24})?(?:收到|接收|接獲|接获|接到|獲得|获得|收取)(?:了)?(?:一封|一則|一则|一個|一个)?(?:電郵|电邮|通知|提醒)|(?:會|会|將|将|已)?(?:在[^,，:：;；.!?。！？]{0,24})?被(?:通知|提醒|知會|知会|告知|通報|通报)|(?:電郵|电邮|通知|提醒)(?:已|會|会|將|将)?(?:被)?(?:發送|发送|傳送|传送|寄送|寄發|寄发|發出|发出|推送|推播|發布|发布|發佈|送出)(?:給|给|予|至|向)|(?:電郵|电邮|提醒)(?:給|给|向)[^,，:：;；.!?。！？]{1,48}|(?:向[^,，:：;；.!?。！？]{1,32})(?:發送|发送|傳送|传送|寄送|寄發|寄发|發出|发出|推送|推播|發布|发布|發佈|送出)(?:電郵|电邮|通知|提醒)|[^,，:：;；.!?。！？]{1,24}(?:後|后|時|时)\s*(?:(?:應|应|須|须|必須|必须|會|会|將|将)\s*)?(?:只|僅|仅)?(?:通知(?!(?:(?:警示|提醒|發送|发送|傳送|传送|寄送|寄發|寄发|系統|系统|電郵|电邮)?(?:規則|规则|政策|說明|说明|文字|內容|内容|記錄|记录|設定|设置|配置|指標|指标|歷史|历史|範本|范本|模板|系統|系统|服務|服务|模組|模块|儀表板|仪表板)))|知會|知会|告知|通報|通报|提醒(?!(?:設定|设置|配置|記錄|记录|指標|指标|歷史|历史|系統|系统|服務|服务|模組|模块|儀表板|仪表板))|電郵(?!(?:設定|配置|記錄|指標|歷史|系統|服務|模組|儀表板))|电邮(?!(?:设置|配置|记录|指标|历史|系统|服务|模块|仪表板)))/u;

const independentCjkNotificationDirectedActionPattern =
  /(?:向[^,，:：;；.!?。！？]{1,32})(?:告知|知會|知会|通報|通报|通知|提醒)[^,，:：;；.!?。！？]{0,48}|[^,，:：;；.!?。！？]{1,24}(?:後|后|時|时)[,，]?\s*(?:(?:系統|系统|平台|服務|服务)\s*)?(?:(?:應|应|須|须|必須|必须|會|会|將|将)\s*)?(?:通知(?!(?:(?:警示|提醒|發送|发送|傳送|传送|寄送|寄發|寄发|系統|系统|電郵|电邮)?(?:規則|规则|政策|說明|说明|文字|內容|内容|記錄|记录|設定|设置|配置|指標|指标|歷史|历史|範本|范本|模板|系統|系统|服務|服务|模組|模块|儀表板|仪表板)))|知會|知会|告知|通報|通报|提醒)|(?:會|会|將|将|已)?(?:在[^,，:：;；.!?。！？]{0,24})?(?:被|由)(?:(?:系統|系统|平台|服務|服务)\s*)?(?:通知|提醒|知會|知会|告知|通報|通报)/u;

const independentCjkNotificationAdditionalDeliveryActionPattern =
  /(?:向|給|给)[^,，:：;；.!?。！？]{1,32}(?:發送|发送|傳送|传送|寄送|寄發|寄发|發出|发出|推送|推播|發布|发布|發佈|送出)(?:一封|一則|一则|一個|一个)?(?:郵件|邮件)|[^,，:：;；.!?。！？]{1,32}(?:會|会|將|将)(?:在[^,，:：;；.!?。！？]{0,24})?(?:收到|接收|接獲|接获|接到|獲得|获得|獲|获|收取)(?:了)?(?:一封|一則|一则|一個|一个)?(?:(?:系統|系统)?提醒|通知|郵件|邮件)|(?:系統|系统|平台|服務|服务)(?:會|会|將|将|已)?(?:向|給|给)?[^,，:：;；.!?。！？]{0,32}(?:發送|发送|傳送|传送|寄送|寄發|寄发|發出|发出|推送|推播|發布|发布|發佈|送出)(?:一封|一則|一则|一個|一个)?(?:郵件|邮件)|(?:系統|系统|平台|服務|服务)(?:會|会|將|将|已)?(?:電郵|电邮|郵件通知|邮件通知)(?!(?:設定|设置|配置|記錄|记录|指標|指标|歷史|历史|服務|服务|模組|模块|儀表板|仪表板))[^,，:：;；.!?。！？]{1,32}/u;

const englishNotificationMetadataAssertionPattern =
  /^(?=[^.!?]{0,160}\b(?:emails?|alerts?|notifications?|reminders?)\b)(?=[^.!?]{0,160}\b(?:audit|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|services?|providers?|templates?|layouts?|routing|trigger|generation|emission|sending|delivery|dispatch|push|publication|reports?|records?|history|metrics?|counts?|dashboards?|polic(?:y|ies)|rules?|guidance|instructions?|requirements?|directions?|standards?|content|wording)\b)[^.!?]{0,160}(?:\b(?:belong(?:s|ed)?|remain(?:s|ed)?|include(?:s|d)?|contain(?:s|ed)?|show(?:s|ed)?|store(?:s|d)?|retain(?:s|ed)?|archive(?:s|d)?|log(?:s|ged)?|display(?:s|ed)?|appear(?:s|ed)?|record(?:s|ed)?|report(?:s|ed)?|track(?:s|ed)?|feed(?:s|ing)?|fed|power(?:s|ed|ing)?|support(?:s|ed|ing)?|update(?:s|d|ing)?|populate(?:s|d|ing)?|summari[sz](?:e|es|ed|ing)|measur(?:e|es|ed|ing)|provid(?:e|es|ed|ing)|suppl(?:y|ies|ied|ying)|surfac(?:e|es|ed|ing)|end(?:s|ed|ing)?)\b|\b(?:is|are|was|were)\s+(?:retained|archived|logged|stored|displayed|shown|visible|available|recorded|reported|tracked|included|contained|configured|kept|active|valid|effective|applicable|routed)\b)[^.!?]*$/u;

const englishNotificationLiteralMetadataAssertionPattern =
  /^(?:the\s+)?(?:word|term|phrase|label|text|wording)\s+(?:notify|notifies|notification|alert|email|inform)\s+(?:remains?|is|was)\s+(?:visible\s+)?(?:in|for)\s+(?:the\s+)?(?:audit|history|records?|archive)\b/u;

const englishNotificationMetadataSubjectAssertionPattern =
  /^(?=[^.!?]{0,200}\b(?:emails?|mails?|alerts?|notifications?|reminders?)\b)(?=[^.!?]{0,200}\b(?:audit|documentation|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|services?|providers?|health|templates?|layouts?|routing|trigger|generation|emission|sending|delivery|dispatch|push|publication|reports?|records?|history|metrics?|counts?|dashboards?|polic(?:y|ies)|rules?|guidance|instructions?|requirements?|directions?|standards?|content|wording)\b)[^.!?]{1,200}$/u;

const englishMetadataSubjectNotificationActionPattern =
  /\b(?:audit|documentation|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|services?|providers?|health|templates?|layouts?|routing|reports?|records?|history|metrics?|counts?|dashboards?|polic(?:y|ies)|rules?|guidance|instructions?|requirements?|directions?|standards?|content|wording)\b\s+(?:(?:will|shall|must|should|may|can|does|do|did|is|are|was|were|has|have|had|is\s+to|are\s+to|was\s+to|were\s+to)\s+)?(?:(?:automatically|directly|also|then|otherwise)\s+){0,2}(?:notif(?:y|ies|ied|ying)|inform(?:s|ed|ing)?|remind(?:s|ed|ing)?|email(?:s|ed|ing)?|mail(?:s|ed|ing)?|alert(?:s|ed|ing)?|cc)\b|\b(?:config(?:uration)?|settings?|preferences?|modules?|services?|providers?|templates?|routing|polic(?:y|ies)|rules?|instructions?|requirements?)\b\s+(?:(?:will|shall|must|should|may|can|does|do|did|is|are|was|were|has|have|had|is\s+to|are\s+to|was\s+to|were\s+to)\s+)?(?:(?:automatically|directly|also|then|otherwise)\s+){0,2}(?:send|sends|sent|sending|deliver(?:s|ed|ing)?|dispatch(?:es|ed|ing)?|issue(?:s|d|ing)?|broadcast(?:s|ed|ing)?|relay(?:s|ed|ing)?|transmit(?:s|ted|ting)?|raise(?:s|d|ing)?|schedule(?:s|d|ing)?|queue(?:s|d|ing)?|forward(?:s|ed|ing)?|post(?:s|ed|ing)?|trigger(?:s|ed|ing)?|generate(?:s|d|ing)?|emit(?:s|ted|ting)?|push(?:es|ed|ing)?|route(?:s|d|ing)?|fire(?:s|d|ing)?|publish(?:es|ed|ing)?|create(?:s|d|ing)?)\b/u;

const cjkNotificationMetadataAssertionPattern =
  /^(?=[^。！？]{0,160}(?:通知|電郵|电邮|電子郵件|电子邮件|郵件|邮件|提醒|警示|知會|知会|告知|通報|通报))(?=[^。！？]{0,160}(?:審計|审计|設定|设置|配置|表格|結構|结构|模組|模块|服務|服务|範本|范本|模板|版面|路由|觸發|触发|產生|产生|傳送|传送|發送|发送|寄送|推送|發布|发布|報告|报告|記錄|记录|歷史|历史|指標|指标|計數|计数|儀表板|仪表板|政策|規則|规则|內容|内容|要求|規定|规定|指南|指引|規範|规范))[^。！？]{0,160}(?:屬於|属于|保留|顯示|显示|儲存|存储|記錄|记录|歸檔|归档|列出|統計|统计|追蹤|追踪|仍然?(?:有效|生效|適用|适用)|維持(?:有效|生效|適用|适用))[^。！？]*$/u;

const cjkNotificationMetadataSubjectAssertionPattern =
  /^(?=[^。！？]{0,200}(?:通知|電郵|电邮|電子郵件|电子邮件|郵件|邮件|提醒|警示|知會|知会|告知|通報|通报))(?=[^。！？]{0,200}(?:審計|审计|文件|文檔|文档|設定|设置|配置|表格|結構|结构|模組|模块|服務|服务|範本|范本|模板|版面|路由|供應商|供应商|健康|報告|报告|記錄|记录|歷史|历史|指標|指标|計數|计数|儀表板|仪表板|政策|規則|规则|內容|内容|要求|規定|规定|指南|指引|規範|规范))[^。！？]{1,200}$/u;

const cjkMetadataSubjectNotificationActionPattern =
  /(?:審計|审计|文件|文檔|文档|設定|设置|配置|表格|結構|结构|模組|模块|服務|服务|範本|范本|模板|版面|路由|供應商|供应商|健康|報告|报告|記錄|记录|歷史|历史|指標|指标|計數|计数|儀表板|仪表板|政策|規則|规则|內容|内容|要求|規定|规定|指南|指引|規範|规范)[^。！？]{0,80}(?:通知|知會|知会|告知|通報|通报|提醒|警示|電郵|电邮|電子郵件|电子邮件|郵件|邮件|抄送|發送|发送|傳送|传送|寄送|寄給|寄给|發郵件|发邮件)/u;

const englishMetadataEmbeddedNotificationActionPattern =
  /\b(?:notif(?:y|ies|ied|ying)|inform(?:s|ed|ing)?)\b|(?:^|\b(?:and|then|also|otherwise)\b|[,，:：;；])\s*(?:(?:please\s+)?(?:(?:send|deliver|dispatch|trigger|generate|emit|push|route|fire|publish|schedule|queue|forward|post|broadcast|create|relay|transmit|raise|cc)\b|issue\b(?!\s+(?:records?|reports?|history|metrics?|counts?|tables?|schemas?)\b))|(?:email|alert)\s+(?!(?:alerts?|notifications?|messages?|services?|polic(?:y|ies)|rules?|guidance|instructions?|requirements?|directions?|standards?|content|wording|documentation|health|config(?:uration)?|settings?|preferences?|tables?|schemas?|modules?|providers?|templates?|layouts?|routing|trigger|generation|emission|sending|delivery|dispatch|push|publication|reports?|records?|history|metrics?|counts?|dashboards?)\b))/u;

const cjkMetadataEmbeddedNotificationActionPattern =
  /(?:並|并|然後|然后|另行|同時|同时)[,，]?\s*(?:在[^,，:：;；.!?。！？]{0,24})?(?:向|給|给)?[^,，:：;；.!?。！？]{0,32}(?:通知|知會|知会|告知|通報|通报|提醒|警示|電郵|电邮|電子郵件|电子邮件|郵件|邮件|抄送|發送|发送|傳送|传送|寄送|寄給|寄给|發|发)/u;

const notificationConceptPattern =
  /\b(?:emails?|mails?|mailed|mailing|alerts?|notifications?|reminders?|remind(?:s|ed|ing)?|notif(?:y|ies|ied|ying)|inform(?:s|ed|ing)?|cc|cc['’]d|blind[- ]cop(?:y|ies|ied|ying))\b|(?:通知|知會|知会|告知|通報|通报|提醒|警示|電郵|电邮|電子郵件|电子邮件|郵件|邮件|抄送|寄給|寄给)/u;

function notificationUnitIsClosedMetadataAssertion(value: string) {
  const literalMetadataMatch =
    englishNotificationLiteralMetadataAssertionPattern.exec(value);
  if (literalMetadataMatch) {
    const tail = value.slice(literalMetadataMatch[0].length).trim();
    return tail.length === 0 ||
      !notificationUnitContainsIndependentAction(tail);
  }
  if (
    englishNotificationMetadataAssertionPattern.test(value) ||
    englishNotificationMetadataSubjectAssertionPattern.test(value)
  ) {
    return !englishMetadataEmbeddedNotificationActionPattern.test(value) &&
      !englishMetadataSubjectNotificationActionPattern.test(value) &&
      !independentEnglishNotificationDeliveryActionPattern.test(value) &&
      !independentEnglishNotificationAdditionalDeliveryActionPattern.test(
        value,
      );
  }
  if (
    cjkNotificationMetadataAssertionPattern.test(value) ||
    cjkNotificationMetadataSubjectAssertionPattern.test(value)
  ) {
    return !cjkMetadataEmbeddedNotificationActionPattern.test(value) &&
      !cjkMetadataSubjectNotificationActionPattern.test(value) &&
      !independentCjkNotificationDeliveryActionPattern.test(value) &&
      !independentCjkNotificationDirectedActionPattern.test(value) &&
      !independentCjkNotificationAdditionalDeliveryActionPattern.test(value);
  }
  return false;
}

function notificationUnitContainsIndependentAction(value: string) {
  if (
    notificationUnitIsClosedMetadataAssertion(value) ||
    notificationUnitIsClosedBusinessAssertion(value)
  ) return false;
  return independentNotificationActionUnitPattern.test(value) ||
    independentEnglishNotificationDeliveryActionPattern.test(value) ||
    independentEnglishNotificationAdditionalDeliveryActionPattern.test(value) ||
    independentCjkNotificationDeliveryActionPattern.test(value) ||
    independentCjkNotificationDirectedActionPattern.test(value) ||
    independentCjkNotificationAdditionalDeliveryActionPattern.test(value) ||
    notificationConceptPattern.test(value);
}

const closedCjkNotificationBusinessAssertionPattern =
  /^(?:此|該|该|本|這|这)(?:通知)?(?:規則|规则|政策)(?:(?:現已|现已|已經|已经|已)?(?:正式)?|(?:已)?(?:於|于)(?:今日|今天|即日)(?:正式)?)(?:撤銷|撤销|取消|取代|替代)([^。！？;；]{1,48})\s*:?$/u;
const closedCjkNotificationBusinessControlNounPattern =
  /(?:通知|規則|规则|政策|指令|指示|提示|訊息|消息|控制|命令|知會|知会|告知|通報|通报|提醒|警示|電郵|电邮|電子郵件|电子邮件|郵件|邮件|抄送|寄給|寄给)/u;

function notificationUnitIsClosedBusinessAssertion(value: string) {
  const match = closedCjkNotificationBusinessAssertionPattern.exec(value);
  return match !== null &&
    !closedCjkNotificationBusinessControlNounPattern.test(match[1]);
}

export function templateCopilotV3NotificationSourceContainsUnsafeEmbeddedInstruction(
  sourceText: string,
) {
  if (sourceText.includes("\u0000") || /(?:```|~~~)/u.test(sourceText)) {
    return true;
  }
  const sanitized = quarantineTemplateCopilotRequirementText(sourceText);
  const unsafeReasonCount = Object.values(
    sanitized.summary.reasonCounts,
  ).reduce((total, count) => total + (count ?? 0), 0);
  return sanitized.summary.quarantinedBlockCount > 0 ||
    unsafeReasonCount > 0;
}

export function templateCopilotV3NotificationAdjacentAuthorityContextIsClosed({
  sourceText,
  clauseStartCodePoint,
  clauseEndCodePoint,
  representedClauseRanges = [],
}: Readonly<{
  sourceText: string;
  clauseStartCodePoint: number;
  clauseEndCodePoint: number;
  representedClauseRanges?: readonly Readonly<{
    startCodePoint: number;
    endCodePoint: number;
  }>[];
}>) {
  const sourceCodePointCount = Array.from(sourceText).length;
  if (
    clauseStartCodePoint < 0 ||
    clauseEndCodePoint < clauseStartCodePoint ||
    clauseEndCodePoint > sourceCodePointCount
  ) {
    return false;
  }
  const clauseStartCodeUnit = codeUnitOffsetAtCodePoint(
    sourceText,
    clauseStartCodePoint,
  );
  const clauseEndCodeUnit = codeUnitOffsetAtCodePoint(
    sourceText,
    clauseEndCodePoint,
  );
  if (clauseStartCodeUnit < 0 || clauseEndCodeUnit < clauseStartCodeUnit) {
    return false;
  }
  if (templateCopilotV3NotificationSourceContainsUnsafeEmbeddedInstruction(
    sourceText,
  )) {
    return false;
  }
  const representedCodeUnitRanges = representedClauseRanges.flatMap(
    (range) => {
      if (
        range.startCodePoint < 0 ||
        range.endCodePoint < range.startCodePoint ||
        range.endCodePoint > sourceCodePointCount
      ) return [];
      const startCodeUnit = codeUnitOffsetAtCodePoint(
        sourceText,
        range.startCodePoint,
      );
      const endCodeUnit = codeUnitOffsetAtCodePoint(
        sourceText,
        range.endCodePoint,
      );
      return startCodeUnit >= 0 && endCodeUnit >= startCodeUnit
        ? [{ startCodeUnit, endCodeUnit }]
        : [];
    },
  );
  const units: Array<Readonly<{ startCodeUnit: number; endCodeUnit: number }>> =
    [];
  let unitStartCodeUnit = 0;
  for (let codeUnitIndex = 0; codeUnitIndex < sourceText.length;) {
    const codePoint = sourceText.codePointAt(codeUnitIndex);
    if (codePoint === undefined) return false;
    const character = String.fromCodePoint(codePoint);
    if (templateCopilotV3HardClauseSeparator(character)) {
      units.push(Object.freeze({
        startCodeUnit: unitStartCodeUnit,
        endCodeUnit: codeUnitIndex,
      }));
      unitStartCodeUnit = codeUnitIndex + character.length;
    }
    codeUnitIndex += character.length;
  }
  units.push(Object.freeze({
    startCodeUnit: unitStartCodeUnit,
    endCodeUnit: sourceText.length,
  }));

  const precedingUnits: string[] = [];
  const followingUnits: string[] = [];
  for (const unit of units) {
    const segments: Array<Readonly<{
      value: string;
      before: boolean;
      startCodeUnit: number;
      endCodeUnit: number;
    }>> = [];
    if (unit.endCodeUnit <= clauseStartCodeUnit) {
      segments.push(Object.freeze({
        value: sourceText.slice(unit.startCodeUnit, unit.endCodeUnit),
        before: true,
        startCodeUnit: unit.startCodeUnit,
        endCodeUnit: unit.endCodeUnit,
      }));
    } else if (unit.startCodeUnit >= clauseEndCodeUnit) {
      segments.push(Object.freeze({
        value: sourceText.slice(unit.startCodeUnit, unit.endCodeUnit),
        before: false,
        startCodeUnit: unit.startCodeUnit,
        endCodeUnit: unit.endCodeUnit,
      }));
    } else {
      if (unit.startCodeUnit < clauseStartCodeUnit) {
        segments.push(Object.freeze({
          value: sourceText.slice(unit.startCodeUnit, clauseStartCodeUnit),
          before: true,
          startCodeUnit: unit.startCodeUnit,
          endCodeUnit: clauseStartCodeUnit,
        }));
      }
      if (unit.endCodeUnit > clauseEndCodeUnit) {
        segments.push(Object.freeze({
          value: sourceText.slice(clauseEndCodeUnit, unit.endCodeUnit),
          before: false,
          startCodeUnit: clauseEndCodeUnit,
          endCodeUnit: unit.endCodeUnit,
        }));
      }
    }
    for (const segment of segments) {
      if (templateCopilotV3NormalizeLexicalText(segment.value).length === 0) {
        continue;
      }
      if (segment.before) precedingUnits.push(segment.value);
      else followingUnits.push(segment.value);
      if (templateCopilotV3NotificationIsSectionHeading(segment.value)) {
        continue;
      }
      if (
        templateCopilotV3NotificationAuthorityUnitIsNonAuthoritative(
          segment.value,
        )
      ) {
        return false;
      }
      if (
        notificationUnitContainsIndependentAction(
          canonicalAuthorityUnit(segment.value),
        ) &&
        !representedCodeUnitRanges.some(
          (range) =>
            range.startCodeUnit >= unit.startCodeUnit &&
            range.endCodeUnit <= unit.endCodeUnit &&
            range.startCodeUnit < segment.endCodeUnit &&
            segment.startCodeUnit < range.endCodeUnit,
        )
      ) {
        return false;
      }
    }
  }

  for (let index = precedingUnits.length - 1; index >= 0; index -= 1) {
    const unit = precedingUnits[index];
    if (templateCopilotV3NotificationIsSectionHeading(unit)) continue;
    const normalized = canonicalAuthorityUnit(unit);
    if (
      !notificationUnitIsClosedMetadataAssertion(normalized) &&
      !notificationUnitIsClosedBusinessAssertion(normalized) &&
      templateCopilotV3RequirementGoverningPrefixIsNonAffirmative(normalized)
    ) {
      return false;
    }
    if (authorityFollowingBridgePattern.test(normalized)) continue;
    break;
  }
  for (const unit of followingUnits) {
    if (templateCopilotV3NotificationIsSectionHeading(unit)) continue;
    const normalized = canonicalAuthorityUnit(unit);
    if (
      !notificationUnitIsClosedMetadataAssertion(normalized) &&
      !notificationUnitIsClosedBusinessAssertion(normalized) &&
      templateCopilotV3RequirementGoverningPrefixIsNonAffirmative(normalized)
    ) {
      return false;
    }
    break;
  }
  return true;
}
