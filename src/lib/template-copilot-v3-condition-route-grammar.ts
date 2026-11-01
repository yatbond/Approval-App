import {
  templateCopilotV3NormalizeLexicalText,
} from "./template-copilot-v3-evidence.ts";

export type TemplateCopilotV3ConditionRouteHint =
  | "stage_reference"
  | "condition_reference"
  | "complete"
  | "return_for_correction"
  | "unsupported_outcome";

export type TemplateCopilotV3ConditionRouteClauseParts = Readonly<{
  prefix: string;
  route: string;
  suffix: string;
}>;

const boundaryPunctuation = /^[\s,，:：\-–—]+|[\s,，:：\-–—]+$/gu;
const explicitDefaultMarker =
  /^(?:otherwise|else|by\s+default)\b[\s,，:：\-–—]*|^(?:否則|否则)[\s,，:：\-–—]*/u;

export function templateCopilotV3SliceConditionRouteClause(
  clauseText: string,
  routeStartCodePoint: number,
  routeEndCodePoint: number,
): TemplateCopilotV3ConditionRouteClauseParts | null {
  const codePoints = Array.from(clauseText);
  if (
    !Number.isSafeInteger(routeStartCodePoint) ||
    !Number.isSafeInteger(routeEndCodePoint) ||
    routeStartCodePoint < 0 ||
    routeEndCodePoint > codePoints.length ||
    routeStartCodePoint >= routeEndCodePoint
  ) {
    return null;
  }
  return Object.freeze({
    prefix: codePoints.slice(0, routeStartCodePoint).join(""),
    route: codePoints.slice(routeStartCodePoint, routeEndCodePoint).join(""),
    suffix: codePoints.slice(routeEndCodePoint).join(""),
  });
}

export function templateCopilotV3MatchingRouteIsAffirmative(
  input: TemplateCopilotV3ConditionRouteClauseParts,
  hint: TemplateCopilotV3ConditionRouteHint,
) {
  const parts = normalizedParts(input);
  if (hint === "unsupported_outcome") {
    return conditionRouteIsUnsupportedOutcome(parts);
  }
  if (
    parts.route.length === 0 ||
    explicitDefaultMarker.test(parts.prefix) ||
    conditionRouteHasGeneralNegation(parts) ||
    !templateCopilotV3ConditionRouteTargetIsClosed(
      parts.route,
      hint,
    )
  ) {
    return conditionRouteIsClosedGuardOutcome(parts, hint);
  }
  if (conditionRouteIsGuardOutcomeShape(parts, hint)) {
    return conditionRouteIsClosedGuardOutcome(parts, hint);
  }
  if (
    hint === "complete" &&
    ["complete", "complete the workflow", "完成", "完成流程"].includes(
      parts.route,
    )
  ) {
    return /(?:^|\b)as$/u.test(parts.prefix) &&
      /^(?:|branches?)$/u.test(parts.suffix);
  }
  if (
    hint !== "stage_reference" &&
    hint !== "condition_reference"
  ) {
    return false;
  }

  const englishAction =
    /(?:^|\b)(?:(?:also\s+)?(?:adds?|requires?|seeks?|obtains?)|routes?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to|go(?:es)?(?:\s+from\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79})?\s+to|sends?(?:\s+(?:the\s+)?(?:request|workflow|it))?\s+to)$/u
      .test(parts.prefix);
  const englishSuffix =
    /^(?:|(?:for\s+)?(?:approval|review|stage|step)(?:\s+before\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79})?|after\s+both)$/u
      .test(parts.suffix);
  if (englishAction && englishSuffix) return true;
  if (
    /^is\s+(?:the\s+)?final\s+approver$/u.test(parts.suffix)
  ) {
    return true;
  }

  const cjkAction =
    /(?:增加|加入|增設|增设|要求|需要|走(?:額外|额外)?|(?:必須|必须)?再?(?:經|经)|由|再由|交由|送交|轉至|转至|完成|配對|配对|退回)$/u
      .test(parts.prefix);
  const cjkSuffix =
    /^(?:|(?:批准|審批|审批|審查|审查|核對|核对|路徑|路径)(?:(?:後|后)完成)?|(?:必須|必须)?阻塞流程|確認差異|确认差异|(?:否則|否则)(?:完成|完成流程)|(?:及|和|與|与)\s*[\p{L}\p{N}][\p{L}\p{N}\s]{0,31})$/u
      .test(parts.suffix);
  const cjkSelfDescribing =
    /(?:批准|審批|审批|審查|审查|核對|核对|路徑|路径|完成|完成流程|後完成|后完成|額外審批|额外审批|清除證明|清除证明)$/u
      .test(parts.route) && parts.suffix.length === 0;
  const cjkSubjectOutcome =
    /(?:時|时)$/u.test(parts.prefix) &&
    /^(?:必須|必须)?阻塞流程$/u.test(parts.suffix);
  const cjkSubjectCompletion =
    /在$/u.test(parts.prefix) &&
    /^(?:批准|審批|审批|審查|审查|核對|核对)(?:後|后)完成$/u
      .test(parts.suffix);
  if (
    (cjkAction && cjkSuffix) ||
    cjkSelfDescribing ||
    cjkSubjectOutcome ||
    cjkSubjectCompletion
  ) {
    return true;
  }

  return /^(?:退回)[\p{L}\p{N}\s]{1,64}$/u.test(parts.route) &&
    /(?:^|必須先|必须先|先)$/u.test(parts.prefix) &&
    /^(?:|確認差異|确认差异)$/u.test(parts.suffix);
}

export function templateCopilotV3RouteFirstPredicateIsAffirmative(
  input: TemplateCopilotV3ConditionRouteClauseParts,
) {
  const parts = normalizedParts(input);
  if (
    parts.route.length === 0 ||
    !/^(?:|the)$/u.test(parts.prefix) ||
    conditionRouteHasGeneralNegation(parts)
  ) {
    return false;
  }
  return /^(?:(?:is|are)\s+(?:required|added|included|used|applicable)\s+only\s+(?:when|if|above|below|at\s+least|at\s+most)|applies?\s+only\s+(?:when|if|above|below|at\s+least|at\s+most))\b/u
    .test(parts.suffix);
}

export function templateCopilotV3ImmediateDefaultRouteIsAffirmative(
  input: TemplateCopilotV3ConditionRouteClauseParts & Readonly<{
    hint: TemplateCopilotV3ConditionRouteHint;
    governingHardClauseIndex: number;
    routeHardClauseIndex: number;
  }>,
) {
  if (
    input.routeHardClauseIndex !== input.governingHardClauseIndex + 1
  ) {
    return false;
  }
  const parts = normalizedParts(input);
  const marker = parts.prefix.match(explicitDefaultMarker);
  if (!marker || marker.index !== 0) return false;
  const withoutMarker = Object.freeze({
    prefix: parts.prefix.slice(marker[0].length).replace(
      boundaryPunctuation,
      "",
    ),
    route: parts.route,
    suffix: parts.suffix,
  });
  if (input.hint === "complete") {
    return [
      "complete",
      "complete the workflow",
      "完成",
      "完成流程",
    ].includes(withoutMarker.route) &&
      withoutMarker.prefix.length === 0 &&
      /^(?:|after\s+[\p{L}\p{N}][\p{L}\p{N}\s'’&/()\-]{0,79})$/u
        .test(withoutMarker.suffix);
  }
  return templateCopilotV3MatchingRouteIsAffirmative(
    withoutMarker,
    input.hint,
  );
}

function conditionRouteIsUnsupportedOutcome(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
) {
  if (
    parts.route.length === 0 ||
    conditionRouteHasMetaNegation(parts)
  ) {
    return false;
  }
  if (
    /^(?:blocks?\s+submission|does\s+not\s+skip\s+approval|不可完成|不得結案|不得结案)$/u
      .test(parts.route)
  ) {
    return true;
  }
  const english =
    /\b(?:blocks?|prevents?|requires?|adds?|includes?|notifies?|returns?)\b/u
      .test(`${parts.prefix} ${parts.route} ${parts.suffix}`);
  const cjk =
    /(?:要求|需要|阻塞|不可|不得|退回|確認差異|确认差异|證明|证明|審批|审批|批准|知會|知会|完成)/u
      .test(`${parts.prefix}${parts.route}${parts.suffix}`);
  return (
    (english || cjk) &&
    !/\b(?:if|when|unless|provided\s+that)\b/u.test(parts.route) &&
    !/(?:若|如果|當|当).{0,32}(?:要求|需要|送交|轉至|转至)/u
      .test(parts.route)
  );
}

function normalizedParts(
  input: TemplateCopilotV3ConditionRouteClauseParts,
) {
  return Object.freeze({
    prefix: templateCopilotV3NormalizeLexicalText(input.prefix)
      .replace(boundaryPunctuation, ""),
    route: templateCopilotV3NormalizeLexicalText(input.route)
      .replace(boundaryPunctuation, ""),
    suffix: templateCopilotV3NormalizeLexicalText(input.suffix)
      .replace(boundaryPunctuation, ""),
  });
}

function conditionRouteIsClosedGuardOutcome(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
  hint: TemplateCopilotV3ConditionRouteHint,
) {
  return conditionRouteIsGuardOutcomeShape(parts, hint) &&
    !conditionRouteHasDirectGuardNegation(parts) &&
    !conditionRouteHasMetaNegation(parts);
}

function conditionRouteIsGuardOutcomeShape(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
  hint: TemplateCopilotV3ConditionRouteHint,
) {
  return (
    hint === "stage_reference" ||
    hint === "condition_reference"
  ) &&
    parts.suffix.length === 0 &&
    /^(?:blocks?\s+submission|does\s+not\s+skip\s+approval|不可完成|不得結案|不得结案)$/u
      .test(parts.route);
}

function conditionRouteHasDirectGuardNegation(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
) {
  const prefix = parts.prefix.trim();
  return /(?:\b(?:(?:do|does|did|is|are|was|were|will|would|should|can|could|may|might|must|shall)\s+not|(?:do|does|did|is|are|was|were|would|should|could|may|might|must|shall)n['’]t|won['’]t|cannot|can['’]t|not|never|in\s+no\s+way))(?:\s+(?:(?:directly|necessarily|automatically|therefore|thus|consequently|alone)|by\s+itself|on\s+its\s+own|in\s+itself|means?|implies?|indicates?|causes?|leads?\s+to|results?\s+in)){0,3}\s*$/u
    .test(prefix) ||
    /(?:不會|不会|並不|并不|並未|并未|不|未|毋|勿|無法|无法)(?:(?:直接|必然|一定|自動|自动|因此|從而|从而|本身|單獨|单独|導致|导致|造成|意味(?:著|着)?)){0,4}\s*$/u
      .test(prefix);
}

function conditionRouteHasMetaNegation(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
) {
  const context = `${parts.prefix} ${parts.suffix}`.trim();
  return /\b(?:(?:do|does|did)\s+not|(?:do|does|did)n['’]t)(?:\s+(?:directly|necessarily|explicitly|clearly|conclusively)){0,2}\s+(?:say|state|specify|require|mean|indicate|prove|demonstrate)\b|\b(?:is|are|was|were)\s+not(?:\s+(?:sufficient|adequate|enough|conclusive|direct|clear)){0,2}\s+(?:proof|evidence)(?:\s+that)?\b|\bnot\s+(?:stated|specified|required|indicated|proven|demonstrated)\b|\bno\s+(?:policy|rule|requirement|text|statement)\b.{0,48}\b(?:says?|states?|requires?|specifies?)\b|\bwithout\s+(?:saying|stating|specifying|requiring)\b/u
    .test(context) ||
    /(?:未|沒有|没有)(?:.{0,12})?(?:說|说|說明|说明|表示|規定|规定|要求|指明)|(?:(?:不|並不|并不)(?:直接|充分|足以|必然|一定|明確|明确){0,2}(?:表示|代表|意味|要求|證明|证明)|(?:並非|并非)(?:證明|证明|表示|代表|意味|要求))|(?:沒有|没有)(?:政策|規則|规则|文字|要求).{0,16}(?:說|说|說明|说明|規定|规定|要求)/u
      .test(context);
}

export function templateCopilotV3ConditionRouteTargetIsClosed(
  routeText: string,
  hint: TemplateCopilotV3ConditionRouteHint,
) {
  if (hint !== "stage_reference" && hint !== "condition_reference") {
    return true;
  }
  const route = templateCopilotV3NormalizeLexicalText(routeText)
    .replace(boundaryPunctuation, "");
  return !(
    /\b(?:if|when|unless|provided\s+that|only\s+if|then)\b/u
      .test(route) ||
    /\b(?:and|or)\b.{0,48}\b(?:is|are|equals?|exceeds?|requires?|routes?)\b/u
      .test(route) ||
    /(?:^|[\s,，:：\-–—])(?:若|如果|當|当)(?!地)/u
      .test(route) ||
    /(?:且|並且|并且|以及).{0,32}(?:由|再由|交由|送交|轉至|转至|增加|加入|要求|需要)/u
      .test(route) ||
    /(?:時|时)(?:可在|由|再由|交由|送交|轉至|转至|增加|加入|要求|需要)/u
      .test(route)
  );
}

function conditionRouteHasGeneralNegation(
  parts: TemplateCopilotV3ConditionRouteClauseParts,
) {
  const wording = `${parts.prefix} ${parts.route} ${parts.suffix}`.trim();
  return conditionRouteHasMetaNegation(parts) ||
    /\bnot\s*(?:>=|<=|>|<|=)(?=\s*[+-]?(?:\d|[零〇一二三四五六七八九十百千萬万億亿兆兩两]))/u
      .test(wording) ||
    /^(?:no|without)\b/u.test(parts.prefix) ||
    /\b(?:(?:do|does|did|is|are|was|were|will|would|should|can|could|may|might|must|shall)\s+not|(?:do|does|did|is|are|was|were|would|should|could|may|might|must|shall)n['’]t|won['’]t|cannot|can['’]t|never|not|in\s+no\s+way)(?:\s+(?:(?:directly|necessarily|automatically|therefore|thus|consequently|alone)|by\s+itself|on\s+its\s+own|in\s+itself)){0,3}\s+(?:routes?|go(?:es)?|sends?|adds?|requires?|approves?|reviews?|completes?|finishes?|returns?|blocks?|skips?)\b|\bnot\s+to\b/u
      .test(wording) ||
    /(?:不會|不会|並不|并不|並未|并未|不|未|毋|勿|無需|无需|無法|无法)(?:(?:是|直接|必然|一定|自動|自动|因此|從而|从而|本身|單獨|单独|導致|导致|造成)){0,3}\s*(?:由|再由|轉至|转至|送交|交由|提交|增加|加入|需要|要求|完成|走|經|经|批准|審批|审批|審查|审查)/u
      .test(wording);
}
