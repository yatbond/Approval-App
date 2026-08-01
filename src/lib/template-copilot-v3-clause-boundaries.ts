import { templateCopilotV3NormalizeLexicalText } from "./template-copilot-v3-evidence.ts";

const maximumLocalRequirementAuthorityCodeUnits = 1_000;

export function templateCopilotV3HardClauseSeparator(character: string) {
  return /[\r\n.!?;。！？；…]/u.test(character);
}

export function templateCopilotV3RoleClauseBoundaryPattern() {
  return /\b(?:but|whereas|while|when|if|unless|although|except)\b|(?:(?<!不)(?:但是|但係|但(?!書|书))|可是|然而|如果|若(?!干)|(?<![\p{L}\p{N}])[當当](?!地)|除非)/giu;
}

export function templateCopilotV3LocalClauseBoundaryPattern() {
  return /\b(?:but|whereas|while|when|if|unless|although|except|and\s+(?:an?\s+)?optional)\b|(?:(?<!不)(?:但是|但係|但(?!書|书))|可是|然而|如果|若(?!干)|(?<![\p{L}\p{N}])[當当](?!地)|除非|(?:及|和|與|与|並|并)(?:一份|一個|一个)?(?:可選擇|可选择|可選|可选|選填|选填))/giu;
}

export function templateCopilotV3NormalizedPrefixNegatesFollowingPredicate(
  value: string,
) {
  return /(?:\b(?:do|does|did|is|are|was|were|has|have|had|will|would|should|can|could|may|might|must|shall)\s+not|\b(?:don|doesn|didn|isn|aren|wasn|weren|hasn|haven|hadn|won|wouldn|shouldn|can|couldn|mayn|mightn|mustn|shalln|needn)(?:['’ʼ]|\s*)t|\bcannot|\bnever|\bno\s+need\s+to|\bneed\s+not|\bnot|\bwithout)(?:\s+(?:(?!only\b|merely\b|simply\b)[\p{Script=Latin}\p{M}\p{Pd}]*ly|ever|always|very|at\s+all|be|been|being|to|as|expected|intended|considered|deemed|regarded|treated|under\s+any\s+circumstances|in\s+any\s+circumstances|in\s+any\s+case|at\s+any\s+time))*\s*$/u
    .test(value) ||
    /(?:不|未|不要|不得|不准|禁止|切勿|毋須|毋须|無須|无须|毋需|無需|无需)(?:(?:直接|明確|明确|實際|实际|必然|一定|通常|一般|自動|自动))*\s*$/u
      .test(value);
}

export function templateCopilotV3NormalizedTextContainsNonAffirmativeAuthority(
  value: string,
) {
  // Requirement recovery is deliberately local. Oversized authority text is
  // not safe to classify with a long-distance regex and must stay review-only.
  if (value.length > maximumLocalRequirementAuthorityCodeUnits) return true;
  if (
    templateCopilotV3RequirementScopeIsUniversal(value) ||
    templateCopilotV3AuthorityTextIsAffirmativeContext(value)
  ) return false;
  return templateCopilotV3NormalizedTextContainsStructuralScope(value) ||
    templateCopilotV3NormalizedTextContainsLexicalHedge(value);
}

function templateCopilotV3NormalizedTextContainsStructuralScope(value: string) {
  if (
    templateCopilotV3RequirementScopeIsUniversal(value) ||
    templateCopilotV3AuthorityTextIsAffirmativeContext(value)
  ) return false;
  const scopedValue = value.replace(
    /\b(?:(?:for|solely\s+for|only\s+for)\s+(?:the\s+)?)?avoidance\s+of\s+doubt\b/gu,
    " ",
  ).replace(/(?:不但|不僅|不仅|不只)/gu, " ");
  const inlineEnglishScopes = [
    ...scopedValue.matchAll(
      /\b(?:for|in|among|on)\s+[\s\S]{1,80000}?(?=[,，]?\s+(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:required|mandatory|compulsory)\b)/gu,
    ),
  ];
  if (
    inlineEnglishScopes.some((scope) =>
      !templateCopilotV3RequirementScopeIsUniversal(scope[0]) &&
      !templateCopilotV3AuthorityTextIsAffirmativeContext(scope[0])
    )
  ) {
    return true;
  }
  if (
    /\b(?:(?:under|from|of|within|outside|across)\s+|with(?:\s+(?:the|prior|written|manager|finance|legal)){0,4}\s+(?:approval|permission|consent|authori[sz]ation|clearance)\b\s*|as\s+applicable\b|(?:contingent|conditional)\s+(?:on|upon)\s+|depending\s+upon\s+|based\s+on\s+|(?:limited|restricted|specific|exclusive)\s+to\s+|applies?\s+(?:only|solely|exclusively)\s+to\s+)[^.!?。！？;；]{0,80000}(?=[,，]?\s+(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:required|mandatory|compulsory)\b)/u
      .test(scopedValue)
  ) {
    return true;
  }
  const inlineCjkScopes = [
    ...scopedValue.matchAll(
      /(?:對|对|適用於|适用于)[\s\S]{1,80000}?(?=(?:時|时)?(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))/gu,
    ),
  ];
  if (
    inlineCjkScopes.some(
      (scope) => !templateCopilotV3RequirementScopeIsUniversal(scope[0]),
    )
  ) {
    return true;
  }
  const inlineCjkContainerScopes = [
    ...scopedValue.matchAll(
      /(?:在|於|于)[\s\S]{1,80000}?(?:中|內|内)(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))/gu,
    ),
  ];
  if (
    inlineCjkContainerScopes.some(
      (scope) => !templateCopilotV3RequirementScopeIsUniversal(scope[0]),
    )
  ) {
    return true;
  }
  if (
    /(?:在|於|于)[^。！？；;]{0,80000}(?:部分(?:情況|情况)|某些[^。！？；;]{0,80000}|有需要(?:時|时)|(?:情況|情况)下)[^。！？；;]{0,80000}(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|(?:限|經|经)[^。！？；;]{0,80000}(?:時|时|才)[^。！？；;]{0,80000}(?=(?:為|为|是)?(?:必填|必須|必须|需要))|(?:經批准|经批准|批准|審查|审查|獲批|获批)後[^。！？；;]{0,80000}(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|(?:視乎|视乎)[^。！？；;]{0,80000}(?:而定)?(?:時|时)?(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|酌情(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|由[^。！？；;]{0,80000}(?:決定是否|决定是否)(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|(?:應|应)[^。！？；;]{0,80000}(?:要求時|要求时)(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|按[^。！？；;]{0,80000}(?:風險|风险|情況|情况|需要|酌情|意願|意愿|偏好)[^。！？；;]{0,80000}(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|是否(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))|(?:視|视)[^。！？；;]{0,80000}(?:選擇|选择|需要)[^。！？；;]{0,80000}(?=(?:均)?(?:為|为|是)?(?:必填|必須|必须|需要))/u
      .test(scopedValue)
  ) {
    return true;
  }
  return false;
}

function templateCopilotV3NormalizedTextContainsLexicalHedge(value: string) {
  const scopedValue = value.replace(
    /\b(?:(?:for|solely\s+for|only\s+for)\s+(?:the\s+)?)?avoidance\s+of\s+doubt\b/gu,
    " ",
  ).replace(/(?:不但|不僅|不仅|不只)/gu, " ");
  return /(?:^|[^\p{L}\p{N}_])(?:not|never|neither|nor|without|cannot|hardly|scarcely|rarely|seldom|normally|generally|ordinarily|typically|usually|sometimes|occasionally|periodically|frequently|may|might|could|possibly|potentially|perhaps|maybe|whether|likely|unlikely|optional|exempt|waived|waiver|unnecessary|discretionary|voluntary|supposed|meant|question|doubt|conditional|conditionally|contingent|contingently|only|solely|exclusively|limited|restricted|specific|applicable|seem|seems|appear|appears|allegedly|purportedly|reportedly|ostensibly|supposedly|apparently|arguably|unverified|forbidden|prohibited|barred|disallowed|avoid|omit|waive|decline|refuse|unable|except)(?=$|[^\p{L}\p{N}_])|\bmore\s+often\s+than\s+not\b|(?:^|[^\p{L}\p{N}_])no(?=$|[\s,，:：;；.!?。！？])|\b(?:don|doesn|didn|isn|aren|wasn|weren|hasn|haven|hadn|won|wouldn|shouldn|can|couldn|mayn|mightn|mustn|shalln|needn)(?:['’ʼ]|\s*)t\b/u
    .test(scopedValue) ||
    /(?:不要|不得|不准|禁止|切勿|不需要|毋須|毋须|無須|无须|毋需|無需|无需|選填|选填|可選|可选|通常|一般|有時|有时|偶爾|偶尔|間中|间中|經常|经常|往往|未必|可能|也許|也许|或許|或许|預計|预计|擬|拟|暫定|暂定|暫時|暂时|或會|或会|有機會|有机会|部分情況|部分情况|僅|仅|只|限|才|不|未|無|无|毋|非)/u
      .test(scopedValue);
}

export function templateCopilotV3RequirementAuthorityPairIsNonAffirmative(
  value: string,
  subjectStartCodePoint: number,
  subjectEndCodePoint: number,
  markerStartCodePoint: number,
  markerEndCodePoint: number,
) {
  if (value.length > maximumLocalRequirementAuthorityCodeUnits) return true;
  const codePoints = Array.from(value);
  const validRange = (start: number, end: number) =>
    Number.isInteger(start) && Number.isInteger(end) &&
    start >= 0 && end >= start && end <= codePoints.length;
  if (
    !validRange(subjectStartCodePoint, subjectEndCodePoint) ||
    !validRange(markerStartCodePoint, markerEndCodePoint) ||
    !(
      subjectEndCodePoint <= markerStartCodePoint ||
      markerEndCodePoint <= subjectStartCodePoint
    )
  ) {
    return true;
  }
  const markerPrecedesSubject = markerEndCodePoint <= subjectStartCodePoint;
  const subjectRaw = codePoints
    .slice(subjectStartCodePoint, subjectEndCodePoint)
    .join("");
  let modifierText: string;
  if (markerPrecedesSubject) {
    const between = codePoints
      .slice(markerEndCodePoint, subjectStartCodePoint)
      .join("");
    const delimiters = [
      ...between.matchAll(/[,，、]|\b(?:and|or)\b|(?:及|和|與|与|並|并)/gu),
    ];
    const lastDelimiter = delimiters.at(-1);
    modifierText = lastDelimiter?.index === undefined
      ? between
      : between.slice(lastDelimiter.index + lastDelimiter[0].length);
    const syntheticSubjectAuthority =
      `${modifierText} ${subjectRaw} is required 是必填`;
    if (
      templateCopilotV3NormalizedTextContainsStructuralScope(
        templateCopilotV3NormalizeLexicalText(syntheticSubjectAuthority),
      )
    ) {
      return true;
    }
  } else {
    if (templateCopilotV3NormalizedTextContainsStructuralScope(value)) {
      return true;
    }
    modifierText = codePoints.map((character, index) =>
      (
          (index >= subjectStartCodePoint && index < subjectEndCodePoint) ||
          (index >= markerStartCodePoint && index < markerEndCodePoint)
        )
        ? " "
        : character
    ).join("");
  }
  if (templateCopilotV3RequirementAffirmativeContrast(value)) {
    return false;
  }
  const subject = templateCopilotV3NormalizeAuthorityContinuation(
    subjectRaw,
  );
  if (
    /^(?:maybe|perhaps|possibly|potentially|allegedly|reportedly|normally|usually|sometimes|no|not\s+any|neither)\b/u.test(subject) ||
    /^(?:可能|也許|也许|或許|或许|通常|一般|有時|有时|未必)/u.test(subject)
  ) {
    return true;
  }
  return templateCopilotV3NormalizedTextContainsLexicalHedge(
    templateCopilotV3NormalizeLexicalText(modifierText),
  );
}

export function templateCopilotV3NormalizedTextBeginsPostRequirementQualification(
  value: string,
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (templateCopilotV3AuthorityTextIsAffirmativeContext(normalized)) {
    return false;
  }
  return /^(?:maybe|perhaps|possibly|potentially|conditionally|contingently|unlikely|allegedly|purportedly|reportedly|ostensibly|supposedly|apparently|arguably|sometimes|occasionally|periodically|frequently|subjectively|unverified|pending)\b|^more\s+often\s+than\s+not\b|^not\s+(?:always|necessarily)\b|^only\s+(?:if|when|where|sometimes)\b|^(?:in\s+some\s+cases|according\s+to|subject(?:\s+(?:only|solely|exclusively|in\s+each\s+case))?\s+to|where(?:ver)?\s+applicable|if\s+applicable|as\s+(?:needed|necessary|appropriate|relevant|circumstances\s+dictate|directed\b[\s\S]{0,120}|dictated\b[\s\S]{0,120})|as\s+[^.!?。！？;；]{0,120}\bsees?\s+fit|where\s+needed|when\s+requested|unless|except|to\s+the\s+extent|insofar\s+as|at\s+times|at\s+(?:the\s+)?[^.!?。！？;；]{0,120}\b(?:discretion|option|request|direction|election|choice)|per\s+(?!\s*(?:(?:the|company|corporate)\s+)?(?:policy|law|rules?|requirements?)$)[^.!?。！？;；]{1,120}|(?:conditioned|dependent)\s+(?:on|upon)|barring|absent|save\s+for|other\s+than|based\s+upon|pursuant\s+to|so\s+long\s+as|should|were|assuming|given|throughout|amongst|inasmuch\s+as)\b/u
      .test(normalized) ||
    /^(?:可能|也許|也许|或許|或许|有時|有时|偶爾|偶尔|間中|间中|經常|经常|往往|預計|预计|擬|拟|暫定|暂定|暫時|暂时|或會|或会|有機會|有机会|視情況|视情况|視乎|视乎|視需要|视需要|按情況|按情况|按需要|按[^。！？；;]{0,80}(?:酌情|意願|意愿|偏好)|酌情|由[^。！？；;]{0,80}(?:決定是否|决定是否|酌情要求)|應[^。！？；;]{0,80}要求時|应[^。！？；;]{0,80}要求时|在(?:某些|有需要時|有需要时)|(?:經批准|经批准|批准|審查|审查|獲批|获批)後|如適用|如适用|待確認|待确认)/u
      .test(normalized);
}

function templateCopilotV3RequirementScopeIsUniversal(value: string) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  return /^(?:for|in|among|on|across)\s+(?:(?:all|every|each|any)\s+(?:requests?|submissions?|cases?|users?|employees?|applicants?)|(?:each\s+and\s+every|every\s+single|any\s+and\s+all)\s+(?:requests?|submissions?|cases?|users?|employees?|applicants?)|everyone|everybody)$/u
      .test(normalized) ||
    /^(?:in\s+)?every\s+instance$|^in\s+each\s+and\s+every\s+case$|^(?:without\s+exception|no\s+exceptions?)$/u
      .test(normalized) ||
    /^(?:(?:適用於|适用于|對|对|在)\s*)?(?:所有|全部)(?:申請|申请|提交|個案|个案|使用者|用戶|用户|員工|员工|申請人|申请人)$/u
      .test(normalized) ||
    /^(?:在)?(?:所有|任何)(?:情況|情况)下$/u
      .test(normalized) ||
    /^(?:於|于|在)(?:所有|全部)(?:申請|申请|提交|個案|个案|使用者|用戶|用户|員工|员工|申請人|申请人)(?:中|內|内)(?:均)?$/u
      .test(normalized) ||
    /^(?:每個|每个)(?:申請|申请|提交|個案|个案)$|^每位(?:使用者|用戶|用户|員工|员工|申請人|申请人)$|^(?:無一例外|无一例外|毫無例外|毫无例外|無條件|无条件)$/u
      .test(normalized);
}

export function templateCopilotV3RequirementAffirmativeContrast(value: string) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  return /\b(?:is|are|was|were)\s+(?:not|never)\s+(?:optional|discretionary|voluntary)\b[\s\S]{0,160}\b(?:but|and)\s+(?:(?:is|are|was|were)\s+)?(?:always\s+)?(?:required|mandatory|compulsory)$/u
      .test(normalized) ||
    /\b(?:cannot|can\s+not|must\s+not|may\s+not)\s+be\s+(?:waived|omitted|skipped)\b[\s\S]{0,160}\b(?:but|and)\s+(?:(?:is|are|was|were)\s+)?(?:always\s+)?(?:required|mandatory|compulsory)$/u
      .test(normalized) ||
    /(?:並非|并非|不是|非)(?:選填|选填|可選|可选)[\s\S]{0,80}(?:而是|但|且|並且|并且)[\s\S]{0,40}(?:必填|必須|必须|需要)$/u
      .test(normalized);
}

function templateCopilotV3AuthorityTextIsAffirmativeContext(value: string) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  return /^(?:(?:only|solely|exclusively|just)\s+)?for\s+(?:(?:the\s+)?(?:avoidance\s+of\s+doubt|clarity|completeness|reference|certainty|information|emphasis|record)|(?:audit(?:\s+purposes?)?|compliance|legal\s+compliance|tax\s+compliance|record\s+keeping|reporting|validation|operational\s+reasons?)(?:\s+purposes?)?)(?:\s+(?:only|solely|exclusively|just))?$/u
      .test(normalized) ||
    /^(?:in|for)\s+(?:(?:this|the)\s+)?(?:workflow|process|request|form|template)$/u
      .test(normalized) ||
    /^in\s+(?:summary|particular|accordance\s+with\s+(?:the\s+)?(?:policy|law|rules?|requirements?))$/u
      .test(normalized) ||
    /^(?:according\s+to|per|by|under|pursuant\s+to)\s+(?:the\s+|company\s+|corporate\s+)?(?:policy|law|rules?|requirements?)$|^as\s+(?:a\s+rule|stated|required\s+by\s+(?:the\s+|company\s+|corporate\s+)?(?:policy|law|rules?|requirements?))$/u
      .test(normalized) ||
    /^(?:to\s+be\s+clear|as\s+stated|please\s+note|please\s+be\s+advised|important|importantly|specifically|reminder|policy\s+reminder|requirement|mandatory\s+information|please|kindly|also|then|and|or|still|indeed|must|shall|will|has\s+to|is\s+required\s+to|continues?\s+to\s+be)$/u
      .test(normalized) ||
    /^(?:(?:the|corporate|company|approved|current)\s+)?(?:policy|law|regulation|rules?|requirements?|manager|administrator|company|workflow|process|template)\s+(?:requires|states|mandates|specifies)$/u
      .test(normalized) ||
    /^(?:按|依)(?:照)?(?:公司|本公司|相關|相关)?(?:政策|規定|规定|法例|法律|要求)$/u
      .test(normalized) ||
    /^(?:(?:公司|本公司|現行|现行|已批准)?(?:政策|規定|规定|法律|法例)|經理|经理|管理員|管理员|公司|流程|範本|范本)(?:要求|規定|规定|訂明|订明)$/u
      .test(normalized) ||
    /^(?:如上所述|當然|当然|僅為清楚起見|仅为清楚起见|只為清楚起見|只为清楚起见|為清楚起見|为清楚起见|為清晰起見|为清晰起见|總括而言|总括而言|概括而言|毫無疑問|毫无疑问|無疑|无疑|為免生疑|为免生疑|為免疑義|为免疑义|為免存疑|为免存疑|特此說明|特此说明|謹此說明|谨此说明|請注意|请注意|重要提示)$/u
      .test(normalized) ||
    /^(?:根據|根据|依據|依据|遵照)(?:公司|本公司|現行|现行|相關|相关)?(?:政策|規定|规定|法律|法例)$/u
      .test(normalized) ||
    /^(?:必須|必须|須|须|需|要|另須|另须|一律|一概)$/u
      .test(normalized);
}

export function templateCopilotV3RequirementGapIsAffirmative(value: string) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(
      /[,，]?\s+(?:is|are|was|were|becomes?|remains?)\s*$/u,
      "",
    )
    .replace(/(?<!而)(?:均)?(?:為|为|是)\s*$/u, "");
  return templateCopilotV3RequirementScopeIsUniversal(normalized) ||
    templateCopilotV3AuthorityTextIsAffirmativeContext(normalized) ||
    /^(?:不但|不僅|不仅|不只)$/u.test(normalized) ||
    /^(?:is|are|was|were)\s+(?:not|never)\s+(?:optional|discretionary|voluntary)\s+(?:but|and)(?:\s+(?:is|are|was|were))?(?:\s+always)?$/u
      .test(normalized) ||
    /^(?:cannot|can\s+not|must\s+not|may\s+not)\s+be\s+(?:waived|omitted|skipped)\s+(?:but|and)(?:\s+(?:is|are|was|were))?(?:\s+always)?$/u
      .test(normalized) ||
    /^(?:並非|并非|不是|非)(?:選填|选填|可選|可选)[,，]?(?:而是|但|且|並且|并且)$/u
      .test(normalized);
}

export function templateCopilotV3RequirementGapIsClosedPunctuation(
  value: string,
  followingText: string,
) {
  const gap = value.trim();
  if (/^(?::|：|,|，|-|\u2013|\u2014)$/u.test(gap)) return true;
  const closingByOpening = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["（", "）"],
    ["【", "】"],
  ] as const);
  const closing = closingByOpening.get(
    gap as "(" | "[" | "{" | "（" | "【",
  );
  return closing !== undefined && followingText.trimStart().startsWith(closing);
}

function templateCopilotV3WithoutPairedQuotedText(value: string) {
  const closingByOpening = new Map([
    ["“", "”"],
    ["「", "」"],
    ["『", "』"],
  ] as const);
  let closing = "";
  return Array.from(value).map((character) => {
    if (closing) {
      if (character === closing) closing = "";
      return " ";
    }
    if (character === '"') {
      closing = '"';
      return " ";
    }
    const pairedClosing = closingByOpening.get(
      character as "“" | "「" | "『",
    );
    if (pairedClosing !== undefined) {
      closing = pairedClosing;
      return " ";
    }
    return character;
  }).join("");
}

export function templateCopilotV3RequirementTextContainsSameSubjectContradiction(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const subject = templateCopilotV3NormalizeAuthorityContinuation(subjectText)
    .replace(/^(?:the|this|that)\s+/u, "");
  if (!subject) return false;
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const englishSubject = `(?:(?:the|this|that)\\s+)?${escaped}(?:\\s+(?:${genericNouns}))?`;
  const englishContradiction = new RegExp(
    `(?:^|[,，:：]\\s*)${englishSubject}\\s+(?:(?:(?:is|are|was|were|becomes?|remains?)\\s+)?(?:optional|elective|exempt|waived|unnecessary|discretionary|voluntary|not\\s+(?:required|needed|mandatory|compulsory|obligatory)|no\\s+longer\\s+(?:required|needed))|(?:may|might|can|could|should|would)\\s+(?:be\\s+)?(?:absent|omitted|waived|skipped|optional|elective|exempt|left\\s+(?:blank|empty|unfilled|out))|(?:need\\s+not|does?\\s+not\\s+(?:need|have)\\s+to)\\s+be\\s+(?:provided|required|included|entered|uploaded|filled(?:\\s+in)?))$`,
    "u",
  );
  const englishNegativeImperative = new RegExp(
    `(?:^|[,，:：]\\s*)(?:(?:do|does|did)\\s+not\\s+require|never\\s+require|without\\s+requiring)\\s+${englishSubject}$|(?:^|[,，:：]\\s*)no\\s+${englishSubject}\\s+(?:is\\s+)?required$`,
    "u",
  );
  const cjkSubject = `(?:該|该|此)?${escaped}(?:(?:要求|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目|附件|檔案|档案|文件|表格|表单))?`;
  const cjkContradiction = new RegExp(
    `(?:^|[,，:：]\\s*)${cjkSubject}(?:為|为|是)?(?:選填|选填|可選|可选|非必須|非必须|不需要(?:填寫|填写|上載|上传|提交|提供)?|(?:毋須|毋须|無須|无须|毋需|無需|无需)(?:填寫|填写|上載|上传|提交|提供)?|可豁免|可免除|可省略|可以不填|可留空|可以留空)$`,
    "u",
  );
  const cjkNegativeImperative = new RegExp(
    `(?:^|[,，:：]\\s*)(?:不要|不得|不准|切勿|毋須|毋须|無須|无须|毋需|無需|无需)(?:填寫|填写|上載|上传|提交|提供|要求)?${cjkSubject}$`,
    "u",
  );
  const englishCoordinationBeforeSameSubject = new RegExp(
    `\\s+\\b(?:and|or|but)\\b\\s+(?=${englishSubject}(?:\\s|$))`,
    "u",
  );
  const cjkCoordinationBeforeSameSubject = new RegExp(
    `(?:及|和|與|与|並|并|但)\\s*(?=${cjkSubject})`,
    "u",
  );
  return templateCopilotV3WithoutPairedQuotedText(value)
    .split(/[\r\n.!?;。！？；…]+/u)
    .flatMap((segment) => segment.split(englishCoordinationBeforeSameSubject))
    .flatMap((segment) => segment.split(cjkCoordinationBeforeSameSubject))
    .map((segment) =>
      templateCopilotV3NormalizeAuthorityContinuation(segment).replace(
        /(?:\b(?:and|or|but)\b|(?:及|和|與|与|並|并|但))\s*$/u,
        "",
      ).replace(/[,，:：]\s*$/u, "").trim()
    )
    .filter(Boolean)
    .some((segment) =>
      englishContradiction.test(segment) ||
      englishNegativeImperative.test(segment) ||
      cjkContradiction.test(segment) ||
      cjkNegativeImperative.test(segment)
    );
}

export function templateCopilotV3RequirementTextContainsUnresolvedSameSubjectAssertion(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const subject = templateCopilotV3NormalizeAuthorityContinuation(subjectText)
    .replace(/^(?:the|this|that)\s+/u, "");
  if (!subject) return false;
  const escaped = subject.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const englishSubject = `(?:(?:the|this|that)\\s+)?${escaped}(?:\\s+(?:${genericNouns}))?`;
  const englishAssertion = new RegExp(
    `^${englishSubject}\\s+(.+)$`,
    "u",
  );
  const cjkSubject = `(?:該|该|此)?${escaped}(?:(?:要求|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目|附件|檔案|档案|文件|表格|表单))?`;
  const cjkAssertion = new RegExp(`^${cjkSubject}(.+)$`, "u");
  return templateCopilotV3WithoutPairedQuotedText(value)
    .split(/[\r\n.!?;。！？；…]+/u)
    .map((segment) => templateCopilotV3NormalizeAuthorityContinuation(segment))
    .filter(Boolean)
    .some((segment) => {
      const englishPredicate = englishAssertion.exec(segment)?.[1];
      if (englishPredicate !== undefined) {
        if (
          !/^(?:is|are|was|were|becomes?|remains?|continues?|may|might|can|could|should|would|must|shall|will|has|have|had|needs?|need|does?|do|(?:isn|aren|wasn|weren|hasn|haven|hadn|doesn|don|can|couldn|shouldn|wouldn|mustn|needn)(?:['’ʼ]|\s*)t)\b/u.test(
            englishPredicate,
          )
        ) return false;
        if (
          /^(?:is|are|was|were|becomes?|remains?|continues?(?:\s+to\s+be)?|may|might|can|could|should|would|must|shall|will|has|have|had|needs?|need|does?|do)$/u.test(
            englishPredicate,
          )
        ) return false;
        if (
          /^(?:(?:is|are|was|were|becomes?|remains?|continues?\s+to\s+be|(?:has|have|had)\s+been)\s+)?(?:audited|reviewed|recorded|logged|tracked|verified|validated)$/u.test(
            englishPredicate,
          ) ||
          /^(?:(?:is|are|was|were|becomes?|remains?)\s+(?:(?:already|always)\s+)?(?:required|mandatory|compulsory)|(?:must|shall|will|has|have|needs?|need)\s+(?:always\s+)?(?:be\s+)?(?:provided|required|included|entered|uploaded|filled(?:\s+in)?))$/u.test(
            englishPredicate,
          ) ||
          /^(?:is|are|was|were)\s+(?:not|never)\s+(?:optional|elective|discretionary|voluntary)$/u.test(
            englishPredicate,
          )
        ) return false;
        return true;
      }
      const cjkPredicate = cjkAssertion.exec(segment)?.[1];
      if (cjkPredicate === undefined) return false;
      if (
        !/^(?:為|为|是|已|仍|繼續|继续|一律|一概|必填|必須|必须|須|须|需要|要|可|可以|不|未|毋|無|无|非|選填|选填)/u.test(
          cjkPredicate,
        )
      ) return false;
      if (
        /^(?:為|为|是|仍(?:為|为|是)?|一律|一概)?(?:必填|必須(?:填寫|填写|提供|上載|上传|提交)?|必须(?:填写|提供|上传|提交)?|須(?:填寫|填写|提供|上載|上传|提交)?|须(?:填写|提供|上传|提交)?|需要(?:填寫|填写|提供|上載|上传|提交)?)$/u.test(
          cjkPredicate,
        ) ||
        /^(?:已|仍|繼續|继续)?(?:審核|审核|審查|审查|記錄|记录|登記|登记|追蹤|追踪|驗證|验证)$/u.test(
          cjkPredicate,
        )
      ) return false;
      return true;
    });
}

export function templateCopilotV3RequirementPrefixNamesCompetingSibling(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  if (!/[,，]\s*$/u.test(value)) return false;
  const withoutTrailingDelimiter = value.replace(/[,，]\s*$/u, "");
  if (/[,，]/u.test(withoutTrailingDelimiter)) return false;
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(
    withoutTrailingDelimiter,
  );
  if (!normalized || normalized.length > 240) return false;
  const english = /^(.*?)\s+(?:(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:optional|exempt|waived|unnecessary|discretionary|voluntary|not\s+(?:required|needed|mandatory|compulsory))|(?:may|might|can|could|should|would)\s+(?:be\s+)?(?:omitted|waived|skipped|optional|exempt)|(?:need\s+not|does?\s+not\s+need\s+to)\s+be\s+(?:provided|required|included|entered|uploaded))$/u
    .exec(normalized);
  const cjk = /^(.{1,160}?)(?:為|为|是)?(?:選填|选填|可選|可选|非必須|非必须|不需要(?:填寫|填写|上載|上传|提交|提供)?|毋須|毋须|無須|无须|毋需|無需|无需|可豁免|可免除|可省略|可以不填)$/u
    .exec(normalized);
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(
    english?.[1] ?? cjk?.[1] ?? "",
  ).replace(/^(?:the|this|that)\s+/u, "");
  if (
    !candidate ||
    !/^[\p{L}\p{N}\p{M}_'’ʼ\p{Pd}\s]+$/u.test(candidate) ||
    /\b(?:if|when|where|unless|except|for|under|subject|depending|and|or)\b|(?:如果|若|當|当|除非|按|依|及|和|與|与|並|并)/u.test(candidate) ||
    /^(?:it|this|that|requirement|field|input|question|value|item|attachment|document|file|form|upload|該要求|该要求|此要求|欄位|栏位|字段|附件|文件)$/u.test(candidate)
  ) {
    return false;
  }
  const subject = templateCopilotV3NormalizeAuthorityContinuation(subjectText)
    .replace(/^(?:the|this|that)\s+/u, "");
  if (!subject || candidate === subject) return false;
  const escapedSubject = subject.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const candidateNamesTarget = /[\p{Script=Han}]/u.test(subject)
    ? candidate.includes(subject)
    : new RegExp(
      `(?:^|[^\\p{L}\\p{N}_])${escapedSubject}(?:$|[^\\p{L}\\p{N}_])`,
      "u",
    ).test(candidate);
  if (candidateNamesTarget) return false;
  const genericNouns = subjectKind === "attachment"
    ? /^(?:requirement|attachment|document|file|form|upload|item|要求|附件|檔案|档案|文件|表格|表单|項目|项目)$/u
    : /^(?:requirement|field|input|question|value|item|要求|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目)$/u;
  return !genericNouns.test(candidate);
}

export function templateCopilotV3RequirementGoverningPrefixIsNonAffirmative(
  value: string,
) {
  if (value.length > maximumLocalRequirementAuthorityCodeUnits) return true;
  const rawNormalized = templateCopilotV3NormalizeLexicalText(value).trim();
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (!normalized) return false;
  if (/\bnot\s+(?:only|merely|simply)\s*$/u.test(normalized)) return false;
  if (
    templateCopilotV3RequirementScopeIsUniversal(normalized) ||
    templateCopilotV3AuthorityTextIsAffirmativeContext(normalized)
  ) {
    return false;
  }
  if (templateCopilotV3PrefixIsClosedNominalCoordination(normalized)) {
    return false;
  }
  if (
    /[()[\]（）【】]/u.test(rawNormalized) ||
    /\/\s*$/u.test(rawNormalized)
  ) return true;
  if (/[,，:：\u2013\u2014-]\s*$/u.test(rawNormalized)) return true;
  if (/^(?:only|solely|exclusively|just)\b/u.test(normalized)) return true;
  return templateCopilotV3NormalizedPrefixNegatesFollowingPredicate(
    normalized,
  ) ||
    /^(?:(?:only|solely|exclusively|just)\s+)?(?:if|when|whenever|where|unless|except|after|before|following|upon|once|during|pending|provided(?:\s+that)?|subject\s+to|depending\s+on|as\s+needed|when\s+requested|for|in|among|at\s+times|occasionally|periodically|frequently|as\s+(?:necessary|appropriate|relevant)|barring|absent|save\s+for|other\s+than|should|were|assuming|given|throughout|amongst|inasmuch\s+as)\b[\s\S]*$/u
      .test(normalized) ||
    /^(?!(?:(?:the|a|an|all|every|each|any)\s+)?(?:requests?|submissions?|cases?|users?|vendors?|suppliers?|employees?|applicants?|contractors?|departments?|teams?)$)[\p{L}\p{N}\p{M}_'’ʼ\p{Pd}]+(?:\s+[\p{L}\p{N}\p{M}_'’ʼ\p{Pd}]+){0,7}\s+(?:requests?|submissions?|cases?|users?|vendors?|suppliers?|employees?|applicants?|contractors?|departments?|teams?)$/u.test(normalized) ||
    /(?:^|\b(?:and|but|or)\s+|[,，:;；\-\u2013\u2014]\s*)(?:subject\s+to|depending\s+on|pending|provided(?:\s+that)?)\b[\s\S]*$/u
      .test(normalized) ||
    /(?:^|[,，:\-\u2013\u2014]\s*)(?:maybe|perhaps|possibly|potentially|conditionally|allegedly|purportedly|reportedly|ostensibly|apparently|if\s+applicable|where(?:ver)?\s+applicable|subject\s+to|pending|depending\s+on)\b[\s\S]*$/u
      .test(normalized) ||
    /^(?:待|如|若|如果|當|当|僅|仅|只在|視|视|除非|偶爾|偶尔|間中|间中|經常|经常|往往|預計|预计|擬|拟|暫定|暂定|暫時|暂时|或會|或会|有機會|有机会)[\s\S]*$/u
      .test(normalized) ||
    /^(?:經|经)[^,，:：;；.!?。！？]{0,80}(?:審查|审查|審核|审核|評審|评审|批准|核准|確認|确认|驗證|验证|評估|评估)[\s\S]*$/u
      .test(normalized) ||
    /^(?:按|依)(?:情況|情况|需要|要求|批准|核准|審查|审查|審核|审核|[^。！？；;]{0,80}(?:意願|意愿|偏好))[\s\S]*$/u
      .test(normalized) ||
    /(?:時|时)$|(?:獲批|获批|批准|核准)後$/u.test(normalized) ||
    /^(?!(?:(?:該|该|所有|全部|每個|每个|每位|任何))?(?:申請|申请|提交|個案|个案|供應商|供应商|員工|员工|申請人|申请人|部門|部门|團隊|团队)$)[^。！？；;]{1,80}(?:申請|申请|提交|個案|个案|供應商|供应商|員工|员工|申請人|申请人|部門|部门|團隊|团队)$/u.test(normalized) ||
    /(?:可能|也許|也许|或許|或许|如適用|如适用|視情況|视情况|待確認|待确认)\s*$/u
      .test(normalized);
}

function templateCopilotV3PrefixIsClosedNominalCoordination(value: string) {
  if (
    !/(?:\b(?:and|or)|及|和|與|与|並|并)\s*$/u.test(value) ||
    !/^[\p{L}\p{N}\p{M}_'’ʼ\p{Pd},，\s]+$/u.test(value)
  ) {
    return false;
  }
  return !/\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|require|requires|required|optional|if|when|where|unless|except|for|under|subject|depending|maybe|perhaps|possibly|only|solely|exclusively|normally|usually|sometimes)\b/u
      .test(value) &&
    !/(?:是|為|为|需要|必須|必须|選填|选填|如果|若|當|当|除非|僅|仅|只|限|可能|也許|也许|或許|或许)/u
      .test(value);
}

function templateCopilotV3RequirementTailContainsOnlyBenignSameSubjectFacts(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const segments = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(/^(?:[,，]\s*|\b(?:and|or)\b\s*|(?:及|和|與|与|並|并)\s*)/u, "")
    .split(/\s*[,，]\s*|\s+\b(?:and|or)\b\s+|\s*(?:及|和|與|与|並|并)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  const aliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  );
  if (aliases.length === 0) return false;
  return segments.every((segment) => aliases.some(({ text: alias }) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `^(?:(?:the|this|that)\\s+)?${escaped}(?:\\s+(?:field|input|question|value|item|attachment|document|file|form|upload))?\\s+(?:(?:is|are|was|were|remains?|continues?\\s+to\\s+be)\\s+)?(?:audited|reviewed|recorded|logged|tracked|verified|validated)$`,
      "u",
    ).test(segment);
  }));
}

export function templateCopilotV3RequirementSameHardTailIsQualified(
  value: string,
  subjectText = "",
  subjectKind: "request_field" | "attachment" = "request_field",
  orientation: "marker_before_subject" | "subject_before_marker" | "unknown" =
    "unknown",
): boolean {
  const continuation = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (!continuation) return false;
  if (
    orientation === "marker_before_subject" &&
    /^(?:\s*[,，、]|\s+\b(?:and|or)\b|\s*(?:及|和|與|与|並|并))/u.test(value)
  ) {
    const strongCjkListDelimiter = /^\s*、/u.test(value);
    if (
      templateCopilotV3RequirementTailContainsExplicitSubjectQualification(
        continuation,
        subjectText,
        subjectKind,
      ) ||
      templateCopilotV3RequirementAnaphorIsQualified(
        continuation,
        subjectText,
        subjectKind,
      )
    ) {
      return true;
    }
    const firstSibling = templateCopilotV3NormalizeAuthorityContinuation(
      value.replace(
        /^(?:\s*[,，、]|\s+\b(?:and|or)\b|\s*(?:及|和|與|与|並|并))\s*/u,
        "",
      ),
    );
    if (strongCjkListDelimiter) {
      const firstListItem = firstSibling.split(/[、,，]/u, 1)[0] ?? "";
      return /(?:選填|选填|可選|可选|(?:可豁免|豁免|免除)(?:填寫|填写|上載|上传|提交|提供)?|不需要(?:填寫|填写|上載|上传|提交|提供)?|毋須|毋须|無須|无须|無需|无需|必填|必須|必须|需要(?:填寫|填写|上載|上传|提交|提供)?)\s*$/u
        .test(firstListItem);
    }
    if (
      templateCopilotV3ConditionalTailNamesCompetingEntity(
        firstSibling,
        subjectText,
        subjectKind,
      )
    ) {
      return false;
    }
    return templateCopilotV3NormalizedTextBeginsPostRequirementQualification(
      firstSibling,
    ) ||
      templateCopilotV3RequirementPredicateIsQualified(firstSibling) ||
      templateCopilotV3RequirementAnaphorIsQualified(
        firstSibling,
        subjectText,
        subjectKind,
      );
  }
  if (templateCopilotV3RequirementAffirmativeContrast(continuation)) {
    return false;
  }
  if (
    templateCopilotV3ConditionalTailNamesCompetingEntity(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return false;
  }
  const affirmativeScope =
    templateCopilotV3RequirementScopeIsUniversal(continuation) ||
    templateCopilotV3AuthorityTextIsAffirmativeContext(continuation);
  if (
    !affirmativeScope &&
    (
      /(?:\b(?:only|solely|exclusively|just)|(?:僅限|仅限|只限))$/u
        .test(continuation) ||
      /^(?:僅限|仅限|只限)[\s\S]+$/u.test(continuation)
    )
  ) {
    return true;
  }
  if (
    !affirmativeScope &&
    /^(?:(?:only|solely|exclusively|just)\s+)?(?:if|when|whenever|where|unless|except|after|before|following|upon|once|on|during|provided(?:\s+that)?|depending\s+(?:on|upon)|subject(?:\s+only)?\s+to|for|in|among|under|from|of|within|outside|across|with(?:\s+(?:the|prior|written|manager|finance|legal)){0,4}\s+(?:approval|permission|consent|authori[sz]ation|clearance)|as\s+applicable|to\s+the\s+extent|insofar\s+as|at\s+(?:the\s+)?[^.!?。！？;；]{0,120}\b(?:discretion|option)|contingent\s+(?:on|upon)|conditional\s+(?:on|upon)|based\s+on|(?:limited|restricted|specific|exclusive)\s+to)\b/u
      .test(continuation)
  ) {
    return true;
  }
  if (
    templateCopilotV3NormalizedTextBeginsPostRequirementQualification(
      continuation,
    )
  ) {
    return true;
  }
  if (templateCopilotV3RequirementPredicateIsQualified(continuation)) {
    return true;
  }
  if (
    /^(?:a\s+)?waiver\b[\s\S]{0,80000}\b(?:may|might|could|applies?|apply)\b/u
      .test(continuation)
  ) {
    return true;
  }
  if (
    templateCopilotV3RequirementAnaphorIsQualified(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  if (
    templateCopilotV3RequirementTailContainsUnscopedConditional(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  if (
    /^(?:視乎|视乎)[^。！？；;]{0,80000}(?:而定)?(?:時|时)?|^酌情|^由[^。！？；;]{0,80000}(?:決定是否|决定是否)|^(?:應|应)[^。！？；;]{0,80000}(?:要求時|要求时)|^(?:在|於|于)某些[^。！？；;]{0,80000}|^按[^。！？；;]{0,80000}酌情/u
      .test(continuation)
  ) {
    return true;
  }
  if (
    templateCopilotV3RequirementTailContainsExplicitSubjectQualification(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  if (
    templateCopilotV3RequirementTailContainsOnlyBenignSameSubjectFacts(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return false;
  }
  if (
    subjectKind === "request_field" &&
    /^(?:no\s+options?|without\s+options?|options?\s*:\s*none)$/u.test(
      continuation,
    )
  ) {
    return false;
  }
  if (
    subjectKind === "attachment" &&
    /^(?:up\s+to\s+[0-9]+(?:\.[0-9]+)?\s*(?:kb|mb|gb)(?:\s+at\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+(?:\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+){0,7})?|at\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+(?:\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+){0,7})$/u.test(
      continuation,
    )
  ) {
    return false;
  }
  if (affirmativeScope) return false;
  const connector = continuation.match(
    /^(?:but|although|yet|though|and)\b[,\s]*([\s\S]+)$/u,
  ) ?? continuation.match(
    /^(?:但係|但是|但|可是|然而|不過|不过|雖然|虽然|而|且|並且|并且)\s*([\s\S]+)$/u,
  );
  if (!connector) return orientation === "subject_before_marker";
  const remainder = connector[1];
  const conditionalRemainderNamesCompetingEntity =
    templateCopilotV3ConditionalTailNamesCompetingEntity(
      remainder,
      subjectText,
      subjectKind,
    );
  return (
    !conditionalRemainderNamesCompetingEntity &&
    /^(?:(?:only|solely|exclusively|just)\s+)?(?:if|when|whenever|where|unless|except|after|before|following|upon|once|on|during|provided(?:\s+that)?|depending\s+(?:on|upon)|subject(?:\s+only)?\s+to|for|in|among|under|from|of|within|outside|across|with(?:\s+(?:the|prior|written|manager|finance|legal)){0,4}\s+(?:approval|permission|consent|authori[sz]ation|clearance)|as\s+applicable|to\s+the\s+extent|insofar\s+as|at\s+(?:the\s+)?[^.!?。！？;；]{0,120}\b(?:discretion|option)|contingent\s+(?:on|upon)|conditional\s+(?:on|upon)|based\s+on|(?:limited|restricted|specific|exclusive)\s+to)\b/u
      .test(remainder)
  ) ||
    templateCopilotV3RequirementPredicateIsQualified(remainder) ||
    /^(?:a\s+)?waiver\b[\s\S]{0,80000}\b(?:may|might|could|applies?|apply)\b/u
      .test(remainder) ||
    templateCopilotV3RequirementAnaphorIsQualified(
      remainder,
      subjectText,
      subjectKind,
    );
}

function templateCopilotV3RequirementPredicateIsQualified(value: string) {
  return /^(?:(?:maybe|perhaps|possibly|potentially|conditionally|unlikely|explicitly|reportedly|allegedly|sometimes|usually|generally|ordinarily|typically)\s+)?(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:waived|optional|exempt|unnecessary|discretionary|voluntary|not\s+(?:(?:always|necessarily)\s+)?(?:required|needed|mandatory|compulsory)|no\s+longer\s+(?:required|needed))\b/u
    .test(value) ||
    /^(?:may|might|can|could|should|would|will)\s+be\s+(?:waived|omitted|skipped|optional|exempt|unnecessary|discretionary|voluntary|not\s+(?:required|needed))\b/u
      .test(value) ||
    /^(?:doesn|isn|aren|wasn|weren|needn)(?:['’ʼ]|\s*)t\s+(?:need\s+to\s+be\s+)?(?:required|provided|included|entered|uploaded)?\b/u
      .test(value) ||
    /^(?:optional|exempt|not\s+(?:required|needed))\s+(?:for|when|if|among|except)\b/u
      .test(value) ||
    /^(?:(?:可能|也許|也许|或許|或许)\s*)?(?:(?:為|为|是)\s*)?(?:選填|选填|可選|可选|非必須|非必须|不需要(?:填寫|填写|上載|上传|提交|提供)?|不再需要|毋須|毋须|無須|无须|毋需|無需|无需|可豁免|可以豁免|可能豁免|豁免|免除)(?:$|[\s,，])/u
      .test(value);
}

export function templateCopilotV3RequirementAuthorityContinuationIsQualified(
  value: string,
  subjectText = "",
  subjectKind: "request_field" | "attachment" = "request_field",
) {
  const codePoints = Array.from(value);
  let segmentStart = 0;
  while (
    segmentStart < codePoints.length &&
    /\s|[,，:：([\]{}（）【】\-\u2013\u2014]/u.test(codePoints[segmentStart])
  ) {
    segmentStart += 1;
  }
  const adjacentHardClause =
    segmentStart < codePoints.length &&
    templateCopilotV3HardClauseSeparator(codePoints[segmentStart]);
  if (adjacentHardClause) {
    while (
      segmentStart < codePoints.length &&
      (
        templateCopilotV3HardClauseSeparator(codePoints[segmentStart]) ||
        /\s|…|[,，:：([\]{}（）【】\-\u2013\u2014]/u.test(
          codePoints[segmentStart],
        )
      )
    ) {
      segmentStart += 1;
    }
  }
  let segmentEnd = segmentStart;
  while (
    segmentEnd < codePoints.length &&
    !templateCopilotV3HardClauseSeparator(codePoints[segmentEnd])
  ) {
    segmentEnd += 1;
  }

  const continuation = templateCopilotV3NormalizeAuthorityContinuation(
    codePoints.slice(segmentStart, segmentEnd).join(""),
  );
  if (!continuation) return false;
  if (adjacentHardClause) {
    let adjacentStart = segmentStart;
    let adjacentEnd = segmentEnd;
    let adjacentIndex = 0;
    let previousClauseResolvedToSubject = false;
    while (adjacentStart < codePoints.length) {
      const adjacent = templateCopilotV3NormalizeAuthorityContinuation(
        codePoints.slice(adjacentStart, adjacentEnd).join(""),
      );
      if (
        adjacent !== "" &&
        (
          templateCopilotV3RequirementTailContainsExplicitSubjectQualification(
            adjacent,
            subjectText,
            subjectKind,
          ) ||
          (
            adjacentIndex > 0 &&
            previousClauseResolvedToSubject &&
            templateCopilotV3RequirementAnaphorIsQualified(
              adjacent,
              subjectText,
              subjectKind,
            )
          ) ||
          (
            adjacentIndex === 0 &&
            templateCopilotV3AdjacentRequirementQualificationIsClosed(
              adjacent,
              subjectText,
              subjectKind,
            )
          ) ||
          (
            adjacentIndex > 1 &&
            templateCopilotV3RequirementExplicitSubjectIsQualified(
              adjacent,
              subjectText,
              subjectKind,
            )
          )
        )
      ) {
        return true;
      }
      previousClauseResolvedToSubject =
        templateCopilotV3ClauseResolvesToRequirementSubject(
          adjacent,
          subjectText,
          subjectKind,
        );
      adjacentStart = adjacentEnd;
      while (
        adjacentStart < codePoints.length &&
        (
          templateCopilotV3HardClauseSeparator(codePoints[adjacentStart]) ||
          /\s|…|[,，:：([\]{}（）【】\-\u2013\u2014]/u.test(
            codePoints[adjacentStart],
          )
        )
      ) {
        adjacentStart += 1;
      }
      adjacentEnd = adjacentStart;
      while (
        adjacentEnd < codePoints.length &&
        !templateCopilotV3HardClauseSeparator(codePoints[adjacentEnd])
      ) {
        adjacentEnd += 1;
      }
      adjacentIndex += 1;
    }
    return false;
  }
  return templateCopilotV3LocalRequirementBoundaryIsQualified(
    continuation,
    subjectText,
    subjectKind,
  ) ||
    templateCopilotV3RequirementSameHardTailIsQualified(
      continuation,
      subjectText,
      subjectKind,
    );
}

function templateCopilotV3AdjacentRequirementQualificationIsClosed(
  continuation: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  if (
    /^(?:maybe|perhaps|possibly|potentially|conditionally|unlikely|no|never|not\s+really|unclear|if\s+applicable|when\s+requested|unless\s+exempt)$/u
      .test(continuation) ||
    /^(?:(?:maybe|perhaps|possibly|potentially|conditionally|unlikely)\s+)?(?:waived|exempt|optional|not\s+(?:required|needed)|no\s+longer\s+(?:required|needed)|unnecessary)(?:\s+(?:for|when|if|among|except)\b[\s\S]{0,120})?$/u
      .test(continuation)
  ) {
    return true;
  }
  if (
    /^(?:可能|也許|也许|或許|或许|豁免|免除|如適用|如适用|如有需要|不清楚|不確定|不确定)$/u
      .test(continuation) ||
    templateCopilotV3RequirementPredicateIsQualified(continuation)
  ) {
    return true;
  }
  const withoutConnector = continuation.replace(
    /^(?:(?:however|but|although)\b[,\s]*|(?:但係|但是|但|可是|然而|不過|不过|雖然|虽然|而)\s*)/u,
    "",
  );
  return templateCopilotV3RequirementAnaphorIsQualified(
    withoutConnector,
    subjectText,
    subjectKind,
  ) ||
    /^(?:a\s+)?waiver\b[\s\S]{0,80000}\b(?:may|might|could|applies?|apply)\b/u
      .test(withoutConnector);
}

function templateCopilotV3LocalRequirementBoundaryIsQualified(
  continuation: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  if (
    /^(?:unless|except|if|when|whenever)\b|^(?:provided\s+that|depending\s+on)\b|^where\s+(?:applicable|requested|needed|exempt|waived)\b/u
      .test(continuation)
  ) {
    return true;
  }
  const connector = continuation.match(
    /^(?:but|although|whereas|while|however|yet)\s+([\s\S]+)$/u,
  ) ?? continuation.match(
    /^(?:但係|但是|但|可是|然而|不過|不过|雖然|虽然|而|且|並且|并且)\s*([\s\S]+)$/u,
  );
  if (!connector) return false;
  const remainder = connector[1];
  return templateCopilotV3RequirementPredicateIsQualified(remainder) ||
    /^(?:a\s+)?waiver\b[\s\S]{0,80000}\b(?:may|might|could|applies?|apply)\b/u
      .test(remainder) ||
    templateCopilotV3RequirementAnaphorIsQualified(
      remainder,
      subjectText,
      subjectKind,
    );
}

function templateCopilotV3StripIntroductoryAuthorityPrefix(value: string) {
  const anaphor = /(?:^|[,，:：]\s*)(?=(?:(?:it|this|that)\b|(?:the|this|that)\s+(?:requirement|field|input|question|value|item|attachment|document|file|form|upload)\b|(?:該|该|此)(?:要求|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目|附件|檔案|档案|文件|上載項目|上传项目)))/u
    .exec(value);
  const scoped = anaphor?.index === undefined
    ? value
    : value.slice(anaphor.index + anaphor[0].length);
  return scoped.replace(
    /^(?:(?:however|nevertheless|nonetheless|still|after\s+(?:review|assessment|consideration)|following\s+(?:review|assessment|consideration)|in\s+practice)\b[,\s]*|(?:然而|不過|不过|但|經審查後|经审查后|實際上|实际上)[,，\s]*)/u,
    "",
  );
}

function templateCopilotV3AnaphorPredicateHasClosedStart(value: string) {
  return /^(?:is|are|was|were|becomes?|remains?|may|might|can|could|should|will|would|shall|must|has|have|had|does|do|needs?|need|cannot|not)\b/u
      .test(value) ||
    /^(?:(?:possibly|potentially|reportedly|allegedly|conditionally|normally|generally|ordinarily|typically|usually|sometimes)\s+)?(?:optional|exempt|waived|unnecessary|discretionary|voluntary)(?:$|\s+(?:for|when|if|among|except)\b)/u
      .test(value) ||
    /^(?:為|为|是|可|可能|通常|一般|不|未|無|无|毋|非|選填|选填|豁免|免除)/u
      .test(value);
}

function templateCopilotV3RequirementAnaphorIsQualified(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const withoutModifier = templateCopilotV3StripIntroductoryAuthorityPrefix(
    value.replace(
      /^(?:(?:after|following|upon|during|following|despite)\s+(?:review|assessment|consideration|verification)|in\s+(?:practice|some\s+cases)|on\s+(?:review|assessment))\b[,\s]*/u,
      "",
    ),
  );
  const pronounMatch = withoutModifier.match(
    /^(it|this|that)\s+([\s\S]{1,80000})$/u,
  );
  const pronoun = pronounMatch?.[1];
  const pronounPredicate = pronounMatch?.[2];
  if (
    pronounPredicate !== undefined &&
    (
      pronoun === "it" ||
      templateCopilotV3AnaphorPredicateHasClosedStart(pronounPredicate)
    ) &&
    templateCopilotV3SubjectBoundPredicateIsQualified(
      pronounPredicate,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const genericPredicate = withoutModifier.match(
    new RegExp(
      `^(?:the|this|that)\\s+(?:${genericNouns})(?!\\s+for\\b)\\s+([\\s\\S]{1,80000})$`,
      "u",
    ),
  )?.[1];
  if (
    genericPredicate !== undefined &&
    templateCopilotV3SubjectBoundPredicateIsQualified(
      genericPredicate,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  const cjkGenericNouns = subjectKind === "attachment"
    ? "要求|附件|檔案|档案|文件|上載項目|上传项目|項目|项目"
    : "要求|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目";
  const cjkGenericPredicate = withoutModifier.match(
    new RegExp(
      `^(?:該|该|此)(?:${cjkGenericNouns})([\\s\\S]{1,80000})$`,
      "u",
    ),
  )?.[1];
  if (
    cjkGenericPredicate !== undefined &&
    templateCopilotV3SubjectBoundPredicateIsQualified(
      cjkGenericPredicate,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  return templateCopilotV3RequirementExplicitSubjectIsQualified(
    withoutModifier,
    subjectText,
    subjectKind,
  );
}

function templateCopilotV3RequirementExplicitSubjectIsQualified(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const scopedValue = templateCopilotV3NormalizeAuthorityContinuation(value);
  const subjectAliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  );
  if (subjectAliases.length === 0) return false;
  const fullGenericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const strippedGenericNouns = subjectKind === "attachment"
    ? "requirement|attachment|upload|item"
    : fullGenericNouns;
  const fullCjkGenericNouns = subjectKind === "attachment"
    ? "附件|檔案|档案|文件|表格|表单|上載項目|上传项目|項目|项目"
    : "欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目";
  const strippedCjkGenericNouns = subjectKind === "attachment"
    ? "附件|上載項目|上传项目|項目|项目"
    : fullCjkGenericNouns;
  for (const { text: subjectAlias, stripped } of subjectAliases) {
    const genericNouns = stripped ? strippedGenericNouns : fullGenericNouns;
    const cjkGenericNouns = stripped
      ? strippedCjkGenericNouns
      : fullCjkGenericNouns;
    const escapedSubject = subjectAlias.replace(
      /[.*+?^${}()|[\]\\]/gu,
      "\\$&",
    );
    const directMatch = scopedValue.match(
      new RegExp(
        `^(?:(?:the|this|that)\\s+)?${escapedSubject}(?:\\s+(${genericNouns}))?(?:\\s*[,，]\\s*(?:(?:according\\s+to|per|under|after|before|following|upon|during|subject\\s+to|depending\\s+on|for|in|on)\\b[^,，]{0,80000}|(?:根據|根据|按|依|在|經|经)[^,，]{0,80000})[,，]\\s*|\\s*[（(]\\s*(?:(?:according\\s+to|per|under|after|before|following|upon|during|subject\\s+to|depending\\s+on|for|in|on)\\b[^）)]{0,80000}|(?:根據|根据|按|依|在|經|经)[^）)]{0,80000})[）)]\\s*|\\s+)([\\s\\S]{1,80000})$`,
        "u",
      ),
    );
    const directPredicate = directMatch?.[2];
    if (
      directPredicate !== undefined &&
      templateCopilotV3PredicateHasClosedStart(directPredicate) &&
      templateCopilotV3SubjectBoundPredicateIsQualified(
        directPredicate,
        subjectText,
        subjectKind,
      )
    ) {
      return true;
    }
    const reversePredicate = scopedValue.match(
      new RegExp(
        `^(?:(?:the|this|that)\\s+)?(?:${genericNouns})\\s+for\\s+(?:(?:the|this|that)\\s+)?${escapedSubject}\\s+([\\s\\S]{1,80000})$`,
        "u",
      ),
    )?.[1];
    if (
      reversePredicate !== undefined &&
      templateCopilotV3PredicateHasClosedStart(reversePredicate) &&
      templateCopilotV3SubjectBoundPredicateIsQualified(
        reversePredicate,
        subjectText,
        subjectKind,
      )
    ) {
      return true;
    }
    const cjkMatch = scopedValue.match(
      new RegExp(
        `^(?:該|该|此)?${escapedSubject}(?:(${cjkGenericNouns}))?(?:(?:\\s*[,，]\\s*(?:(?:根據|根据|按|依|在|經|经)[^,，]{0,80000})[,，]\\s*)|(?:\\s*[（(]\\s*(?:(?:根據|根据|按|依|在|經|经)[^）)]{0,80000})[）)]\\s*))?([\\s\\S]{1,80000})$`,
        "u",
      ),
    );
    const cjkPredicate = cjkMatch?.[2];
    if (
      cjkPredicate !== undefined &&
      templateCopilotV3PredicateHasClosedStart(cjkPredicate) &&
      templateCopilotV3SubjectBoundPredicateIsQualified(
        cjkPredicate,
        subjectText,
        subjectKind,
      )
    ) {
      return true;
    }
  }
  return false;
}

function templateCopilotV3RequirementSubjectAliases(
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalizedSubject = templateCopilotV3NormalizeLexicalText(subjectText)
    .replace(/^(?:the|this|that)\s+/u, "");
  if (!normalizedSubject) return [];
  const strippedSubject = subjectKind === "attachment"
    ? normalizedSubject.replace(
      /(?:\s+(?:pdf|document|file|form|attachment|upload|image|photo|excel|csv|spreadsheet)|附件|檔案|档案|文件|表格|表单)$/u,
      "",
    )
    : normalizedSubject.replace(
      /(?:\s+(?:field|input|question|value|item)|欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目)$/u,
      "",
    );
  return [
    { text: normalizedSubject, stripped: false },
    ...(strippedSubject && strippedSubject !== normalizedSubject
      ? [{ text: strippedSubject, stripped: true }]
      : []),
  ] as const;
}

function templateCopilotV3ClauseResolvesToRequirementSubject(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (!normalized) return false;
  const genericAnaphor = subjectKind === "attachment"
    ? /^(?:(?:the|this|that)\s+)?(?:attachment|upload|item)\b|^(?:該|该|此)(?:附件|上載項目|上传项目|項目|项目)/u
    : /^(?:(?:the|this|that)\s+)?(?:field|input|question|value|item)\b|^(?:該|该|此)(?:欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目)/u;
  if (genericAnaphor.test(normalized)) return true;
  for (const { text: alias, stripped } of
    templateCopilotV3RequirementSubjectAliases(subjectText, subjectKind)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const generic = subjectKind === "attachment"
      ? stripped
        ? "requirement|attachment|upload|item"
        : "requirement|attachment|document|file|form|upload|item"
      : "requirement|field|input|question|value|item";
    if (
      new RegExp(
        `^(?:(?:the|this|that)\\s+)?${escaped}(?:\\s+(?:${generic}))?(?:$|[^\\p{L}\\p{N}_])`,
        "u",
      ).test(normalized) ||
      new RegExp(`^(?:該|该|此)?${escaped}`, "u").test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

function templateCopilotV3PredicateHasClosedStart(value: string) {
  return /^(?:is|are|was|were|becomes?|remains?|may|might|can|could|should|will|would|shall|must|has|have|had|does|do|needs?|need|cannot|optional|exempt|waived|not|possibly|potentially|reportedly|allegedly|conditionally|normally|generally|ordinarily|typically|usually|sometimes|for|under|after|before|following|upon|during|according\s+to|per|subject\s+to|depending\s+on|only|solely|exclusively|just)\b/u
    .test(value) ||
    /^(?:為|为|是|可|可能|通常|一般|不|未|無|无|毋|非|選填|选填|豁免|免除|對|对|按|依|經|经|在|於|于)/u
      .test(value);
}

function templateCopilotV3AliasMayBeginQualification(
  value: string,
  offset: number,
  subjectAlias: string,
  subjectKind: "request_field" | "attachment",
) {
  let cursor = offset + subjectAlias.length;
  while (cursor < value.length && /\s/u.test(value[cursor])) cursor += 1;
  if (value[cursor] === "," || value[cursor] === "，") {
    const delimiter = value[cursor];
    const closing = value.indexOf(delimiter, cursor + 1);
    if (closing < 0) return false;
    cursor = closing + 1;
  } else if (/[（(]/u.test(value[cursor] ?? "")) {
    const relativeClosing = value.slice(cursor + 1).search(/[）)]/u);
    const closing = relativeClosing < 0
      ? -1
      : cursor + 1 + relativeClosing;
    if (closing < 0) return false;
    cursor = closing + 1;
  }
  while (cursor < value.length && /\s/u.test(value[cursor])) cursor += 1;
  const genericNouns = subjectKind === "attachment"
    ? /^(?:requirement|attachment|document|file|form|upload|item)\b\s*/u
    : /^(?:requirement|field|input|question|value|item)\b\s*/u;
  const cjkGenericNouns = subjectKind === "attachment"
    ? /^(?:附件|檔案|档案|文件|表格|表单|上載項目|上传项目|項目|项目)/u
    : /^(?:欄位|栏位|字段|輸入|输入|問題|问题|值|項目|项目)/u;
  const preview = value.slice(cursor, Math.min(value.length, cursor + 256));
  const generic = genericNouns.exec(preview) ?? cjkGenericNouns.exec(preview);
  if (generic) cursor += generic[0].length;
  return templateCopilotV3PredicateHasClosedStart(
    value.slice(cursor, Math.min(value.length, cursor + 256)),
  );
}

function templateCopilotV3SubjectBoundPredicateIsQualified(
  value: string,
  subjectText = "",
  subjectKind: "request_field" | "attachment" = "request_field",
) {
  const deparenthesized = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(
      /^((?:is|are|was|were|becomes?|remains?|為|为|是))\s*[,，]\s*(?:(?:according\s+to|per|under|after|before|following|upon|during|subject\s+to|depending\s+on|for|in|on)\b[^,，]{0,80000}|(?:根據|根据|按|依|在|經|经)[^,，]{0,80000})[,，]\s*/u,
      "$1 ",
    ).replace(
      /^((?:is|are|was|were|becomes?|remains?|為|为|是))\s*[（(]\s*(?:(?:according\s+to|per|under|after|before|following|upon|during|subject\s+to|depending\s+on|for|in|on)\b[^）)]{0,80000}|(?:根據|根据|按|依|在|經|经)[^）)]{0,80000})[）)]\s*/u,
      "$1 ",
    );
  const subjectScoped = templateCopilotV3TruncateBeforeCompetingCoordination(
    deparenthesized,
    subjectText,
    subjectKind,
  );
  const phrase = templateCopilotV3NormalizeAuthorityContinuation(
    subjectScoped.split(/[,，:：;；]/u, 1)[0] ?? "",
  );
  if (!phrase) return false;
  if (
    /^(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:not|never)\s+(?:optional|exempt|waived|unnecessary|discretionary|voluntary)\b/u
      .test(phrase) ||
    /\bnot\s+(?:only|merely|simply)\s+required\b/u.test(phrase) ||
    /^(?:(?:cannot|can\s+not|may\s+not|must\s+not)\s+be\s+)(?:waived|omitted|skipped)\b/u
      .test(phrase) ||
    /^(?:並非|并非|不是|非)(?:選填|选填|可選|可选|豁免|免除)/u
      .test(phrase)
  ) {
    return false;
  }
  return templateCopilotV3RequirementPredicateIsQualified(phrase) ||
    /\b(?:optional|exempt|waived|waiver|unnecessary|discretionary|voluntary|conditional|conditionally|contingent|contingently)\b/u
      .test(phrase) ||
    /\bnot\s+(?:(?:always|necessarily)\s+)?(?:required|needed|mandatory|compulsory)\b|\bno\s+longer\s+(?:required|needed)\b/u
      .test(phrase) ||
    /\b(?:need\s+not\s+be|does?\s+not\s+need\s+to\s+be)\s+(?:provided|required|included|entered|uploaded)\b/u
      .test(phrase) ||
    /\b(?:(?:is|are|was|were|be|been|being)\s+)?(?:normally|generally|ordinarily|typically|usually|sometimes|possibly|potentially|reportedly|allegedly)\s+(?:(?:is|are|was|were|be|been|being)\s+)?(?:required|optional)\b/u
      .test(phrase) ||
    /\b(?:(?:only|solely|exclusively|just)\s+required|required\s+(?:only|solely|exclusively|just))\b/u
      .test(phrase) ||
    /(?:選填|选填|可選|可选|豁免|免除|不需要|非必須|非必须|未必|可能|通常|一般|有時|有时)/u
      .test(phrase) ||
    /(?:僅|仅|只)(?:在|於|于)?[\s\S]*(?:必填|必須|必须|需要)/u
      .test(phrase);
}

function templateCopilotV3TruncateBeforeCompetingCoordination(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const aliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  ).map(({ text }) => text);
  for (const connector of value.matchAll(
    /\b(?:and|but|while|whereas)\b|(?:而且|並且|并且|但係|但是|然而)/gu,
  )) {
    if (connector.index === undefined) continue;
    const remainder = value.slice(connector.index + connector[0].length);
    const competing = /([\p{L}\p{N}_'’\-]+(?:\s+[\p{L}\p{N}_'’\-]+){0,12})\s+(?:(?:is|are|was|were|becomes?|remains?)\s+|(?:may|might|can|could|should|would|will)\s+be\s+)(?:optional|exempt|waived|unnecessary|discretionary|voluntary|not\s+(?:required|needed|mandatory|compulsory))\b/u
      .exec(remainder);
    if (!competing) continue;
    const candidate = templateCopilotV3NormalizeAuthorityContinuation(
      competing[1],
    );
    const sameAnaphor = /^(?:it|this|that|(?:the|this|that)\s+(?:requirement|field|input|question|value|item|attachment|document|file|form|upload))$/u
      .test(candidate);
    const sameExactSubject = aliases.some((alias) =>
      candidate === alias ||
      candidate === `the ${alias}` ||
      candidate === `this ${alias}` ||
      candidate === `that ${alias}`
    );
    if (!sameAnaphor && !sameExactSubject) {
      return value.slice(0, connector.index);
    }
  }
  return value;
}

function templateCopilotV3RequirementTailContainsExplicitSubjectQualification(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (!normalized) return false;
  if (
    templateCopilotV3RequirementExplicitSubjectIsQualified(
      normalized,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  for (const { text: subjectAlias } of templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  )) {
    let cursor = 0;
    while (cursor <= normalized.length - subjectAlias.length) {
      const offset = normalized.indexOf(subjectAlias, cursor);
      if (offset < 0) break;
      const nextCursor = offset + Math.max(subjectAlias.length, 1);
      const nextSubjectOffset = normalized.indexOf(subjectAlias, nextCursor);
      const hardBoundaryOffset = normalized.slice(offset)
        .search(/[\r\n.!?;。！？；…]/u);
      const candidateEnd = Math.min(
        nextSubjectOffset < 0 ? normalized.length : nextSubjectOffset,
        hardBoundaryOffset < 0
          ? normalized.length
          : offset + hardBoundaryOffset,
      );
      const before = offset === 0
        ? ""
        : Array.from(normalized.slice(Math.max(0, offset - 2), offset)).at(-1) ??
          "";
      const prefix = normalized.slice(Math.max(0, offset - 80), offset);
      const precededByObjectPreposition =
        /\b(?:for|of|about|regarding)\s+(?:(?:the|this|that)\s+)?$/u
          .test(prefix);
      const canBeginSubject = !precededByObjectPreposition;
      const mayBeginQualification = canBeginSubject &&
        templateCopilotV3AliasMayBeginQualification(
          normalized,
          offset,
          subjectAlias,
          subjectKind,
        );
      if (
        (before === "" || !/[\p{L}\p{N}_]/u.test(before)) &&
        mayBeginQualification &&
        templateCopilotV3RequirementExplicitSubjectIsQualified(
          normalized.slice(offset, candidateEnd),
          subjectText,
          subjectKind,
        )
      ) {
        return true;
      }
      cursor = nextCursor;
    }
  }
  return false;
}

function templateCopilotV3RequirementTailContainsUnscopedConditional(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  const marker = normalized.match(
    /\b(?:unless|except|provided(?:\s+that)?|subject\s+to|depending\s+on)\b|(?:除非|如適用|如适用|視情況|视情况)/u,
  );
  if (marker?.index === undefined) return false;
  if (
    templateCopilotV3ConditionalTailNamesCompetingEntity(
      normalized.slice(marker.index),
      subjectText,
      subjectKind,
    )
  ) {
    return false;
  }
  const prefix = normalized.slice(0, marker.index);
  return !/\b(?:is|are|was|were|becomes?|remains?|requires?|required|optional|needs?|needed|uploads?|attaches?|submits?|provides?|includes?)\b/u
      .test(prefix) &&
    !/(?:是|為|为|需要|必須|必须|選填|选填|上載|上传|提交|提供|包括)/u
      .test(prefix);
}

function templateCopilotV3ConditionalTailNamesCompetingEntity(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  if (subjectKind !== "attachment" || !subjectText.trim()) return false;
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (
    /\b(?:replace|replaces|replacement|instead|substitute|substitution|alternative)\b|(?:取代|替代|代替|替換|替换)/u.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    !/^(?:if|when|whenever|where|unless|except|provided(?:\s+that)?|subject(?:\s+only)?\s+to|depending\s+(?:on|upon))\b/u.test(
      normalized,
    ) &&
    !/^(?:若|如果|如|當|当|除非|視乎|视乎|視情況|视情况)/u.test(normalized)
  ) {
    return false;
  }
  const candidates = [
    ...normalized.matchAll(
      /\b(?:upload|attach|submit|provide|include|add)\s+(?:(?:a|an|the|one)\s+)?([\p{L}\p{N}_'’ʼ\p{Pd}]+(?:\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+){0,7}\s+(?:pdf|document|file|form|attachment|upload|image|photo|excel|csv|spreadsheet|certificate|declaration)|(?:pdf|document|file|form|attachment|upload|image|photo|excel|csv|spreadsheet|certificate|declaration))\b/gu,
    ),
    ...normalized.matchAll(
      /(?:上載|上传|附上|提交|提供|加入|添加)([^,，。！？；;]{1,80}?(?:pdf|附件|檔案|档案|文件|表格|表单|圖片|图片|照片|證明|证明|聲明|声明))/gu,
    ),
  ].map((match) =>
    templateCopilotV3NormalizeAuthorityContinuation(match[1] ?? "")
  ).filter(Boolean);
  if (candidates.length === 0) return false;
  const aliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  ).map(({ text }) => text);
  if (
    candidates.some((candidate) =>
      aliases.some((alias) =>
        candidate === alias || candidate.includes(alias) || alias.includes(candidate)
      )
    )
  ) {
    return false;
  }
  return true;
}

function templateCopilotV3NormalizeAuthorityContinuation(value: string) {
  return templateCopilotV3NormalizeLexicalText(value)
    .replace(/^[^\p{L}\p{N}_]+/u, "")
    .replace(/[^\p{L}\p{N}_]+$/u, "")
    .trim();
}
