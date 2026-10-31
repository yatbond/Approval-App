import {
  templateCopilotV3NormalizeLexicalText,
  templateCopilotV3NormalizeTrimCollapseText,
} from "./template-copilot-v3-evidence.ts";

const maximumLocalRequirementAuthorityCodeUnits = 1_000;

const templateCopilotV3CjkDeicticSource =
  "(?:該|该|此|本|這|这|那)(?:個|个|項|项|份)?|" +
  "上述|前述|所述|同一|相同|目標|目标|原本|原來|原来|目前|當前|当前|相關|相关";
const templateCopilotV3CjkRequestGenericNounSource =
  "要求|欄位|栏位|欄|栏|字段|輸入|输入|問題|问题|值|項目|项目|項|项";
const templateCopilotV3CjkAttachmentGenericNounSource =
  "要求|附件|檔案|档案|檔|档|文件|表格|表单|上載項目|上传项目|項目|项目|項|项";
const templateCopilotV3CjkRequestSubjectNounSource =
  "欄位|栏位|欄|栏|字段|輸入|输入|問題|问题|值|項目|项目|項|项";
const templateCopilotV3CjkAttachmentSubjectNounSource =
  "附件|檔案|档案|檔|档|文件|表格|表单|上載項目|上传项目|項目|项目|項|项";
const templateCopilotV3CjkStrippedAttachmentSubjectNounSource =
  "附件|上載項目|上传项目|項目|项目|項|项";
const templateCopilotV3CjkAllGenericNounSource =
  `${templateCopilotV3CjkRequestGenericNounSource}|` +
  `${templateCopilotV3CjkAttachmentSubjectNounSource}`;
const templateCopilotV3EnglishHistoricalMarkerSource =
  "initially|originally|previously|formerly";
const templateCopilotV3EnglishHistoricalStatusSource =
  "required|mandatory|compulsory|obligatory|uploaded|provided|submitted";
const templateCopilotV3EnglishHistoricalRequirementDescriptorSource =
  "(?:" + templateCopilotV3EnglishHistoricalMarkerSource + ")\\s+" +
  "(?:(?:marked|listed|classified|designated|identified)(?:\\s+as)?\\s+)?" +
  "(?:" + templateCopilotV3EnglishHistoricalStatusSource + ")";
const templateCopilotV3EnglishHistoricalCopulaSource =
  "(?:had\\s+(?:(?:" + templateCopilotV3EnglishHistoricalMarkerSource +
  ")\\s+)?been(?:\\s+(?:" +
  templateCopilotV3EnglishHistoricalMarkerSource + "))?|" +
  "was(?:\\s+(?:" + templateCopilotV3EnglishHistoricalMarkerSource + "))?|" +
  "were(?:\\s+(?:" + templateCopilotV3EnglishHistoricalMarkerSource + "))?|" +
  "used\\s+to\\s+be)";
const templateCopilotV3EnglishHistoricalRelativeRequirementSource =
  "(?:(?:(?:(?:that|which)\\s+)?" +
  templateCopilotV3EnglishHistoricalCopulaSource + "\\s+" +
  "(?:(?:marked|listed|classified|designated|identified)(?:\\s+as)?\\s+)?" +
  "(?:" + templateCopilotV3EnglishHistoricalStatusSource + "))|" +
  "(?:" + templateCopilotV3EnglishHistoricalRequirementDescriptorSource +
  "))";
const templateCopilotV3EnglishPostnominalHistoricalRequirementSource =
  "(?:\\s+(?:" +
  templateCopilotV3EnglishHistoricalRelativeRequirementSource + ")|" +
  "\\s*[,，]\\s*(?:" +
  templateCopilotV3EnglishHistoricalRelativeRequirementSource +
  ")\\s*[,，]|\\s*[（(]\\s*(?:" +
  templateCopilotV3EnglishHistoricalRelativeRequirementSource +
  ")\\s*[）)])";
const templateCopilotV3EnglishDistinctClassifierSource =
  "(?:another|different|separate|unrelated|a\\s+(?:different|separate)|an\\s+unrelated|(?:the\\s+)?other)";
const templateCopilotV3CjkDistinctClassifierSource =
  "(?:另一(?:個|个|份|項|项)?|另外(?:一)?(?:個|个|份|項|项)?|其他|不同|別的|别的)";
const templateCopilotV3EnglishSubjectConnectorSource =
  "(?:(?:even\\s+)?though|although|because|despite|unless|when|whenever|where|if|once|" +
  "provided(?:\\s+that)?|assuming|given(?:\\s+that)?|supposing|as|since|but|and|" +
  "while|whereas|however|yet)";
const templateCopilotV3EnglishSubordinateSubjectConnectorSource =
  "(?:(?:even\\s+)?though|although|because|despite|unless|when|whenever|where|if|once|" +
  "provided(?:\\s+that)?|assuming|given(?:\\s+that)?|supposing|as|since)";
const templateCopilotV3CjkSubordinateSubjectConnectorSource =
  "(?:雖然|虽然|即使|即便|儘管|尽管|除非|如果|若|當|当|每當|每当|一旦|只要|" +
  "因為|因为|由於|由于)";
const templateCopilotV3LexicalCompoundHyphenSource =
  "[-\\u2010\\u2011]";
const templateCopilotV3EnglishLexicalContinuationSource =
  "[\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}/]";
const templateCopilotV3EnglishUnknownSubjectPredicateBridgeSource =
  "(?:\\s*[（(][^()（）\\r\\n.!?。！？;；]{1,160}[）)]\\s*|" +
  "\\s*[,，][^,，\\r\\n.!?。！？;；]{1,160}[,，]\\s*|" +
  "\\s*[,，:：\\u2010-\\u2015\\u2212]\\s*|\\s+-\\s+|\\s+)";
const templateCopilotV3CjkUnknownSubjectPredicateBridgeSource =
  "(?:\\s*[（(][^()（）\\r\\n.!?。！？;；]{1,160}[）)]\\s*|" +
  "\\s*[,，][^,，\\r\\n.!?。！？;；]{1,160}[,，]\\s*|" +
  "\\s*[,，:：\\u2010-\\u2015\\u2212]\\s*|\\s*)";

const templateCopilotV3EnglishUnknownSubjectPredicateStartSource =
  "(?:is|are|was|were|becomes?|remains?|exists?|existed|may|might|can|could|" +
  "should|will|would|shall|must|has|have|had|does|do|needs?|need|cannot|" +
  "optional|exempt|waived|not)";
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
  const cjkSubject = `(?:${templateCopilotV3CjkDeicticSource})?${escaped}(?:(?:${templateCopilotV3CjkAllGenericNounSource}))?`;
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
  const cjkSubject = `(?:${templateCopilotV3CjkDeicticSource})?${escaped}(?:(?:${templateCopilotV3CjkAllGenericNounSource}))?`;
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

function templateCopilotV3RequirementMarkerBeforeSubjectIsQualified(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  if (!normalized) return false;
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const cjkGenericNouns = subjectKind === "attachment"
    ? templateCopilotV3CjkAttachmentGenericNounSource
    : templateCopilotV3CjkRequestGenericNounSource;
  const englishQualification =
    "optional|elective|exempt|waived|unnecessary|discretionary|voluntary|" +
    "not\\s+(?:required|needed|mandatory|compulsory)";
  const cjkQualification =
    "選填|选填|可選|可选|非必須|非必须|不需要|免填|可豁免|可免除";

  for (
    const { text: alias } of
      templateCopilotV3RequirementSubjectAliases(subjectText, subjectKind)
  ) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const englishSubject =
      `(?:(?:the|this|that)\\s+)?${escaped}` +
      `(?:\\s+(?:${genericNouns}))?`;
    const leadingEnglish = new RegExp(
      `(?:^|(?:[,，、]\\s*|\\b(?:and|or)\\b\\s+))` +
        `(?:(?:a|an|one|some|the)\\s+)?` +
        `(?:${englishQualification})\\s+${englishSubject}` +
        `(?=$|[,，、]|\\s+\\b(?:and|or)\\b)`,
      "u",
    );
    const trailingEnglish = new RegExp(
      `(?:^|(?:[,，、]\\s*|\\b(?:and|or)\\b\\s+))${englishSubject}` +
        `(?:\\s+as\\s+(?:(?:a|an|the)\\s+)?|` +
          `[,，:：]\\s*(?:(?:a|an|one|some|the)\\s+)?)` +
        `(?:${englishQualification})` +
        `(?:\\s+(?:${genericNouns}))?(?=$|[,，、]|\\s+\\b(?:and|or)\\b)`,
      "u",
    );
    const relativeEnglish = new RegExp(
      `(?:^|(?:[,，、]\\s*|\\b(?:and|or)\\b\\s+))${englishSubject}` +
        `\\s*[,，]\\s*(?:which|that)\\s+` +
        `(?:is|are|was|were|becomes?|remains?)\\s+` +
        `(?:(?:a|an|the)\\s+)?(?:${englishQualification})` +
        `(?:\\s+(?:${genericNouns}))?(?=$|[,，、]|\\s+\\b(?:and|or)\\b)`,
      "u",
    );
    const relativePredicateEnglish = new RegExp(
      `(?:^|(?:[,，、]\\s*|\\b(?:and|or)\\b\\s+))${englishSubject}` +
        `\\s*[,，]\\s*(?:which|that)\\s+([\\s\\S]+)$`,
      "u",
    ).exec(normalized)?.[1];
    const cjkSubject =
      `(?:${templateCopilotV3CjkDeicticSource})?${escaped}` +
      `(?:(?:${cjkGenericNouns}))?`;
    const leadingCjk = new RegExp(
      `(?:^|[,，、]|(?:及|和|與|与|並|并))` +
        `(?:一(?:份|個|个|項|项))?` +
        `(?:${cjkQualification})(?:的)?${cjkSubject}`,
      "u",
    );
    const trailingCjk = new RegExp(
      `(?:^|[,，、]|(?:及|和|與|与|並|并))${cjkSubject}` +
        `(?:為|为|是)?(?:${cjkQualification})`,
      "u",
    );
    if (
      leadingEnglish.test(normalized) ||
      trailingEnglish.test(normalized) ||
      relativeEnglish.test(normalized) ||
      (
        relativePredicateEnglish !== undefined &&
        templateCopilotV3SubjectBoundPredicateIsQualified(
          relativePredicateEnglish,
          subjectText,
          subjectKind,
        )
      ) ||
      leadingCjk.test(normalized) ||
      trailingCjk.test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

function templateCopilotV3NormalizeLeadingOptionalSibling(value: string) {
  return templateCopilotV3NormalizeAuthorityContinuation(value).replace(
    /^(?:and|or)\s+(?=(?:(?:a|an|one|some|the)\s+)?(?:optional|elective|exempt|waived|unnecessary|discretionary|voluntary)\b)/u,
    "",
  );
}

function templateCopilotV3LeadingOptionalObjectDisposition(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
): TemplateCopilotV3ClauseSubjectDisposition | null {
  const normalized = templateCopilotV3NormalizeLeadingOptionalSibling(value);
  const optionalObject =
    /^(?:(?:a|an|one|some|the)\s+)?(?:optional|elective|exempt|waived|unnecessary|discretionary|voluntary)\s+([\s\S]+)$/u
      .exec(normalized);
  return optionalObject === null
    ? null
    : templateCopilotV3OptionalObjectDisposition(
      optionalObject[1],
      subjectText,
      subjectKind,
    );
}

function templateCopilotV3LeadingOptionalSpecificSiblingIsDistinct(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  if (
    templateCopilotV3LeadingOptionalObjectDisposition(
      value,
      subjectText,
      subjectKind,
    ) !== "distinct"
  ) {
    return false;
  }
  const normalized = templateCopilotV3NormalizeLeadingOptionalSibling(value);
  const matched =
    /^(?:(?:a|an|one|some|the)\s+)?(?:optional|elective|exempt|waived|unnecessary|discretionary|voluntary)\s+([\p{L}\p{N}_'’ʼ\p{Pd}]+(?:\s+[\p{L}\p{N}_'’ʼ\p{Pd}]+){0,11})$/u
      .exec(normalized);
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(
    matched?.[1] ?? "",
  );
  if (!candidate) return false;
  const word = "[\\p{L}\\p{N}_'’ʼ\\p{Pd}]+";
  const terminalNoun = subjectKind === "attachment"
    ? "pdf|document|file|form|attachment|upload|image|photo|excel|csv|" +
      "spreadsheet|certificate|declaration|schedule"
    : "field|input|question|value|item";
  return new RegExp(
    `^(?:${word}\\s+){1,11}(?:${terminalNoun})$`,
    "u",
  ).test(candidate);
}

function templateCopilotV3MarkerRelativeTailContainsDistinctOptionalSibling(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3NormalizeAuthorityContinuation(value);
  const aliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  ).map(({ text }) => text).sort(
    (left, right) => right.length - left.length,
  );
  for (const alias of aliases) {
    for (const prefix of [alias, `the ${alias}`, `this ${alias}`, `that ${alias}`]) {
      if (!normalized.startsWith(prefix)) continue;
      const remainder = normalized.slice(prefix.length);
      const sibling = /^(?:\s*[,，]\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)([\s\S]+)$/u
        .exec(remainder)?.[1];
      if (
        sibling !== undefined &&
        templateCopilotV3LeadingOptionalSpecificSiblingIsDistinct(
          sibling,
          subjectText,
          subjectKind,
        )
      ) {
        return true;
      }
    }
  }
  return false;
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
    templateCopilotV3MarkerRelativeTailContainsDistinctOptionalSibling(
      continuation,
      subjectText,
      subjectKind,
    )
  ) {
    return false;
  }
  if (
    orientation === "marker_before_subject" &&
    templateCopilotV3RequirementMarkerBeforeSubjectIsQualified(
      continuation,
      subjectText,
      subjectKind,
    )
  ) return true;
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
    const optionalSiblingDisposition =
      templateCopilotV3LeadingOptionalObjectDisposition(
        firstSibling,
        subjectText,
        subjectKind,
      );
    if (
      templateCopilotV3LeadingOptionalSpecificSiblingIsDistinct(
        firstSibling,
        subjectText,
        subjectKind,
      )
    ) {
      return false;
    }
    if (
      optionalSiblingDisposition !== null &&
      optionalSiblingDisposition !== "distinct"
    ) {
      return true;
    }
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
  return /^(?:(?:maybe|perhaps|possibly|potentially|conditionally|unlikely|explicitly|reportedly|allegedly|sometimes|usually|generally|ordinarily|typically)\s+)?(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:waived|optional|elective|exempt|unnecessary|discretionary|voluntary|not\s+(?:(?:always|necessarily)\s+)?(?:required|needed|mandatory|compulsory)|no\s+longer\s+(?:required|needed))\b/u
    .test(value) ||
    /^(?:may|might|can|could|should|would|will)\s+(?:(?:now|currently|henceforth)\s+)?be\s+(?:absent|omitted|waived|skipped|optional|elective|exempt|unnecessary|discretionary|voluntary|left\s+(?:blank|empty|unfilled|out)|not\s+(?:required|needed))\b/u
      .test(value) ||
    /^(?:doesn|isn|aren|wasn|weren|needn)(?:['’ʼ]|\s*)t\s+(?:need\s+to\s+be\s+)?(?:required|provided|included|entered|uploaded)?\b/u
      .test(value) ||
    /^(?:optional|exempt|not\s+(?:required|needed))\s+(?:for|when|if|among|except)\b/u
      .test(value) ||
    /^(?:(?:可能|也許|也许|或許|或许)\s*)?(?:(?:為|为|是)\s*)?(?:選填|选填|可選|可选|非必須|非必须|不需要(?:填寫|填写|上載|上传|提交|提供)?|不再需要|毋須|毋须|無須|无须|毋需|無需|无需|免填|自願填寫|自愿填写|可豁免|可以豁免|可能豁免|豁免|免除|可免除|可以免除|可省略|可以省略|可不填|可以不填|可留空|可以留空)(?:$|[\s,，])/u
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
  const optionalSibling = continuation.replace(
    /^(?:and|or)\s+/u,
    "",
  );
  const optionalSiblingDisposition =
    templateCopilotV3LeadingOptionalObjectDisposition(
      optionalSibling,
      subjectText,
      subjectKind,
    );
  if (
    templateCopilotV3LeadingOptionalSpecificSiblingIsDistinct(
      optionalSibling,
      subjectText,
      subjectKind,
    )
  ) {
    return false;
  }
  if (
    optionalSiblingDisposition !== null &&
    optionalSiblingDisposition !== "distinct"
  ) {
    return true;
  }
  if (adjacentHardClause) {
    let adjacentStart = segmentStart;
    let adjacentEnd = segmentEnd;
    let adjacentIndex = 0;
    let previousClauseSubjectDisposition: TemplateCopilotV3ClauseSubjectDisposition = "unknown";
    while (adjacentStart < codePoints.length) {
      const adjacent = templateCopilotV3NormalizeAuthorityContinuation(
        codePoints.slice(adjacentStart, adjacentEnd).join(""),
      );
      const rawAdjacent =
        templateCopilotV3NormalizeCasePreservingAuthorityContinuation(
          codePoints.slice(adjacentStart, adjacentEnd).join(""),
        );
      const inheritedSubjectDisposition:
        TemplateCopilotV3ClauseSubjectDisposition = adjacentIndex === 0
          ? "target"
          : previousClauseSubjectDisposition;
      const normalizedAdjacent =
        templateCopilotV3NormalizeAuthorityContinuation(adjacent);
      const adjacentStartsCorrection =
        templateCopilotV3StripCorrectionAuthorityPrefix(normalizedAdjacent) !==
          normalizedAdjacent;
      const adjacentSubjectDisposition:
        TemplateCopilotV3ClauseSubjectDisposition =
        templateCopilotV3ClauseIsStandaloneCorrectionMarker(adjacent)
          ? inheritedSubjectDisposition
          : templateCopilotV3ClauseRequirementSubjectDisposition(
            adjacent,
            subjectText,
            subjectKind,
            inheritedSubjectDisposition,
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
            (adjacentIndex > 0 || adjacentStartsCorrection) &&
            (
              templateCopilotV3ProvenSubjectGenericIsQualified(
                adjacent,
                subjectText,
                subjectKind,
                inheritedSubjectDisposition,
              ) ||
              (
                adjacentSubjectDisposition !== "distinct" &&
                templateCopilotV3RequirementAnaphorIsQualified(
                  adjacent,
                  subjectText,
                  subjectKind,
                  rawAdjacent,
                )
              )
            )
          ) ||
          (
            adjacentIndex === 0 &&
            adjacentSubjectDisposition !== "distinct" &&
            templateCopilotV3AdjacentRequirementQualificationIsClosed(
              adjacent,
              subjectText,
              subjectKind,
              rawAdjacent,
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
      previousClauseSubjectDisposition = adjacentSubjectDisposition;
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
  rawContinuation = continuation,
) {
  const imperativeDisposition =
    templateCopilotV3ImperativeOptionalObjectDisposition(
      "",
      continuation,
      subjectText,
      subjectKind,
    );
  if (imperativeDisposition !== null) {
    return imperativeDisposition !== "distinct";
  }
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
  const rawWithoutConnector = templateCopilotV3CasePreservingEquivalentSuffix(
    rawContinuation,
    withoutConnector,
  );
  return templateCopilotV3RequirementAnaphorIsQualified(
    withoutConnector,
    subjectText,
    subjectKind,
    rawWithoutConnector,
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

function templateCopilotV3StripCorrectionAuthorityPrefix(value: string) {
  return value.replace(
    /^(?:(?:correction|corrected|update|updated|revision|revised)\s*[:：\p{Pd}\u2212]\s*|(?:now\s+changed?|change(?:d)?)\s+to\s+|(?:更正|修正)\s*(?:[:：\p{Pd}\u2212]|為|为)\s*|(?:現改為|现改为|改為|改为)\s*)/u,
    "",
  );
}

function templateCopilotV3StripIntroductoryAuthorityPrefix(value: string) {
  const corrected = templateCopilotV3StripCorrectionAuthorityPrefix(value);
  const anaphor = new RegExp(
    `(?:^|[,，:：]\\s*)(?=` +
      `(?:(?:it|this|that)\\b|` +
      `(?:the|this|that)\\s+(?:requirement|field|input|question|value|item|attachment|document|file|form|upload)\\b|` +
      `(?:${templateCopilotV3CjkDeicticSource})(?:${templateCopilotV3CjkAllGenericNounSource})))`,
    "u",
  ).exec(corrected);
  const scoped = anaphor?.index === undefined
    ? corrected
    : corrected.slice(anaphor.index + anaphor[0].length);
  return scoped.replace(
    /^(?:(?:however|nevertheless|nonetheless|still|after\s+(?:review|assessment|consideration)|following\s+(?:review|assessment|consideration)|in\s+practice)\b[,\s]*|(?:然而|不過|不过|但|經審查後|经审查后|實際上|实际上)[,，\s]*)/u,
    "",
  );
}

function templateCopilotV3StripReferenceDiscourseBridge(value: string) {
  return templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(/^[,，\p{Pd}\u2212]\s*/u, "")
    .replace(
      /^(?:(?:however|nevertheless|nonetheless|still|instead|rather|now|currently|henceforth)\b|(?:現在|现在|如今|此後|此后|現|现|則|则|然而|不過|不过|可是|但|卻|却|反而))\s*[,，\p{Pd}\u2212]?\s*/u,
      "",
    );
}

function templateCopilotV3AnaphorPredicateHasClosedStart(value: string) {
  return /^(?:is|are|was|were|becomes?|remains?|may|might|can|could|should|will|would|shall|must|has|have|had|does|do|needs?|need|cannot|not)\b/u
      .test(value) ||
    /^(?:(?:possibly|potentially|reportedly|allegedly|conditionally|normally|generally|ordinarily|typically|usually|sometimes)\s+)?(?:optional|exempt|waived|unnecessary|discretionary|voluntary)(?:$|\s+(?:for|when|if|among|except)\b)/u
      .test(value) ||
    /^(?:仍|仍然|依然|為|为|是|可|可能|通常|一般|不|未|無|无|毋|非|選填|选填|免填|自願填寫|自愿填写|豁免|免除)/u
      .test(value);
}

function templateCopilotV3EnglishQuantifiedAnaphorSource(
  subjectKind: "request_field" | "attachment",
) {
  const genericPlural = subjectKind === "attachment"
    ? "requirements?|attachments?|documents?|files?|forms?|uploads?|items?"
    : "requirements?|fields?|inputs?|questions?|values?|items?";
  const cardinal =
    `(?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)` +
    `(?!${templateCopilotV3EnglishLexicalContinuationSource})`;
  const boundedOne =
    `one(?!${templateCopilotV3EnglishLexicalContinuationSource})`;
  const nominalSet =
    `(?:(?:the|these|those)\\s+)?(?:${genericPlural})`;
  const bareSet =
    `them|these(?!\\s+(?:${genericPlural})\\b)|` +
    `those(?!\\s+(?:${genericPlural})\\b)`;
  const setReference = `(?:${nominalSet}|${bareSet})`;
  const ofSet = `of\\s+(?:${setReference})`;
  const established =
    `(?:each|both|all)(?:\\s+(?:` +
      `(?:${cardinal})(?:\\s+${ofSet})?|` +
      `(?:${genericPlural})|${ofSet}))?`;
  const everySet = `every\\s+${boundedOne}(?:\\s+${ofSet})?`;
  const anySet =
    `any(?:\\s+${boundedOne}(?:\\s+${ofSet})?|\\s+${ofSet})`;
  const distributive =
    `(?:(?:either(?:\\s+one)?|one\\s+or\\s+more)` +
      `(?:\\s+${ofSet})?|${everySet}|${anySet})`;
  return `(?:${established}|${distributive})`;
}

function templateCopilotV3EnglishQuantifiedAnaphorPrefix(
  value: string,
  subjectKind: "request_field" | "attachment",
) {
  return new RegExp(
    `^${templateCopilotV3EnglishQuantifiedAnaphorSource(subjectKind)}` +
      `(?!${templateCopilotV3EnglishLexicalContinuationSource})`,
    "u",
  ).exec(value);
}

function templateCopilotV3CjkQuantifiedAnaphorPrefix(
  value: string,
  subjectKind: "request_field" | "attachment",
) {
  const genericNouns = subjectKind === "attachment"
    ? templateCopilotV3CjkAttachmentGenericNounSource
    : templateCopilotV3CjkRequestGenericNounSource;
  return new RegExp(
    `^(?:(?:(?:所有|全部|各)(?:${genericNouns}))|` +
      `(?:兩者|两者|二者|全部|全都|每(?:份|個|个|項|项)))` +
      "(?:均|皆|都)?",
    "u",
  ).exec(value);
}

function templateCopilotV3QuantifiedAnaphorPredicateCanBind(value: string) {
  return templateCopilotV3AnaphorPredicateHasClosedStart(value) ||
    templateCopilotV3NormalizedTextBeginsPostRequirementQualification(value) ||
    /^(?:up\s+to|at\s+most|no\s+more\s+than|maximum(?:\s+of)?|上限|最多|不超過|不超过)(?:$|[\s\d])/u
      .test(value);
}

function templateCopilotV3QuantifiedAnaphorTailIsQualified(
  tail: TemplateCopilotV3SubjectReferenceTail,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  return tail.bridgeRequiresHold ||
    (
      templateCopilotV3QuantifiedAnaphorPredicateCanBind(tail.predicate) &&
      templateCopilotV3SubjectBoundPredicateIsQualified(
        tail.predicate,
        subjectText,
        subjectKind,
      )
    );
}

type TemplateCopilotV3EnglishNominalReference =
  TemplateCopilotV3SubjectReferenceTail & {
    disposition: TemplateCopilotV3ClauseSubjectDisposition;
    end: number;
  };

function templateCopilotV3EnglishQuantifiedNominalReference(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  rawValue = value,
): TemplateCopilotV3EnglishNominalReference | null {
  if (!/^(?:each|every|any)\b/u.test(value)) return null;
  const word = "[\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}]+";
  const optionality =
    "optional|elective|exempt|waived|unnecessary|discretionary|voluntary";
  const quantifiedAnaphor = templateCopilotV3EnglishQuantifiedAnaphorPrefix(
    value,
    subjectKind,
  );
  const quantifiedAnaphorTail = quantifiedAnaphor === null
    ? null
    : templateCopilotV3ParseSubjectReferenceTail(
      value.slice(quantifiedAnaphor[0].length),
      true,
    );
  if (
    quantifiedAnaphorTail !== null &&
    templateCopilotV3QuantifiedAnaphorTailIsQualified(
      quantifiedAnaphorTail,
      subjectText,
      subjectKind,
    )
  ) {
    return null;
  }
  const quantifiedNominalSource =
    `^(?:each|every|any(?!\\s+one` +
      `(?!${templateCopilotV3EnglishLexicalContinuationSource})))\\s+` +
      `((?:(?:${optionality})\\s+)?${word}(?:\\s+${word}){0,11}?)` +
      `(?=${templateCopilotV3EnglishUnknownSubjectPredicateBridgeSource}` +
        `${templateCopilotV3EnglishUnknownSubjectPredicateStartSource}\\b)`;
  const match = new RegExp(quantifiedNominalSource, "u").exec(value);
  if (match === null) return null;
  const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
    value.slice(match[0].length),
  );
  if (parsedTail === null) return null;
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(
    match[1],
  ).replace(new RegExp(`^(?:${optionality})\\s+`, "u"), "");
  if (!candidate) return null;
  const rawReference = templateCopilotV3CasePreservingEquivalentSuffix(
    rawValue,
    value,
  );
  const rawMatch = new RegExp(quantifiedNominalSource, "iu").exec(rawReference);
  const rawCandidate = templateCopilotV3NormalizeCasePreservingAuthorityContinuation(
    rawMatch?.[1] ?? candidate,
  ).replace(new RegExp(`^(?:${optionality})\\s+`, "iu"), "");
  const predicateExpressesSubstitution =
    templateCopilotV3OptionalObjectExpressesSubstitution(parsedTail.predicate);
  return {
    ...parsedTail,
    bridgeRequiresHold: parsedTail.bridgeRequiresHold ||
      predicateExpressesSubstitution,
    disposition: predicateExpressesSubstitution
      ? "unknown"
      : templateCopilotV3OptionalObjectDisposition(
        candidate,
        subjectText,
        subjectKind,
        rawCandidate,
      ),
    end: match[0].length,
  };
}

function templateCopilotV3EnglishUnquantifiedNominalReference(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  rawValue = value,
): TemplateCopilotV3EnglishNominalReference | null {
  if (/^(?:each|every|any)\b/u.test(value)) return null;
  const word = "[\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}]+";
  const nominalSource =
    `^(${word}(?:\\s+${word}){0,11}?)` +
    `(?=${templateCopilotV3EnglishUnknownSubjectPredicateBridgeSource}` +
      `${templateCopilotV3EnglishUnknownSubjectPredicateStartSource}\\b)`;
  const match = new RegExp(nominalSource, "u").exec(value);
  if (match === null) return null;
  const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
    value.slice(match[0].length),
  );
  if (parsedTail === null) return null;
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(match[1]);
  if (!candidate) return null;
  const rawReference = templateCopilotV3CasePreservingEquivalentSuffix(
    rawValue,
    value,
  );
  const rawMatch = new RegExp(nominalSource, "iu").exec(rawReference);
  const rawCandidate =
    templateCopilotV3NormalizeCasePreservingAuthorityContinuation(
      rawMatch?.[1] ?? candidate,
    );
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const classifiableCandidate = candidate.replace(
    /^(?:a|an|the|some|one)\s+/u,
    "",
  );
  const classifiableRawCandidate = rawCandidate.replace(
    /^(?:a|an|the|some|one)\s+/iu,
    "",
  );
  const genericShape = templateCopilotV3GenericSiblingShape(
    classifiableCandidate,
    classifiableRawCandidate,
    genericNouns,
  );
  const governedTerminalTypeReference =
    templateCopilotV3GovernedTerminalTypeReference(
      classifiableCandidate,
      classifiableRawCandidate,
      subjectText,
      subjectKind,
    );
  if (
    (genericShape === null && !governedTerminalTypeReference) ||
    (genericShape?.stemTokens.some((token) =>
      /^(?:under|within|inside|outside|in|on|for|of|about|regarding|from|by|among|across|during|after|before|following|per|with|without|that|which|whose|where|when)$/u
        .test(token)
    ) ?? false)
  ) {
    return null;
  }
  const predicateExpressesSubstitution =
    templateCopilotV3OptionalObjectExpressesSubstitution(parsedTail.predicate);
  return {
    ...parsedTail,
    bridgeRequiresHold: parsedTail.bridgeRequiresHold ||
      predicateExpressesSubstitution,
    disposition: predicateExpressesSubstitution
      ? "unknown"
      : templateCopilotV3OptionalObjectDisposition(
        candidate,
        subjectText,
        subjectKind,
        rawCandidate,
      ),
    end: match[0].length,
  };
}
function templateCopilotV3RequirementAnaphorIsQualified(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  rawValue = value,
) {
  const withoutModifier = templateCopilotV3StripIntroductoryAuthorityPrefix(
    value.replace(
      /^(?:(?:after|following|upon|during|following|despite)\s+(?:review|assessment|consideration|verification)|in\s+(?:practice|some\s+cases)|on\s+(?:review|assessment))\b[,\s]*/u,
      "",
    ),
  );
  const rawWithoutModifier = templateCopilotV3CasePreservingEquivalentSuffix(
    rawValue,
    withoutModifier,
  );
  const pronounMatch = /^(it|this|that)\b/u.exec(withoutModifier);
  const pronoun = pronounMatch?.[1];
  const pronounTail = pronounMatch === null
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(
      withoutModifier.slice(pronounMatch[0].length),
      true,
    );
  if (
    pronounTail !== undefined &&
    pronounTail !== null &&
    (
      pronounTail.bridgeRequiresHold ||
      (
        (
          pronoun === "it" ||
          templateCopilotV3AnaphorPredicateHasClosedStart(pronounTail.predicate)
        ) &&
        templateCopilotV3SubjectBoundPredicateIsQualified(
          pronounTail.predicate,
          subjectText,
          subjectKind,
        )
      )
    )
  ) {
    return true;
  }
  const quantifiedNominal =
    templateCopilotV3EnglishQuantifiedNominalReference(
      withoutModifier,
      subjectText,
      subjectKind,
      rawWithoutModifier,
    );
  if (quantifiedNominal !== null) {
    return quantifiedNominal.disposition !== "distinct" &&
      (
        quantifiedNominal.bridgeRequiresHold ||
        templateCopilotV3SubjectBoundPredicateIsQualified(
          quantifiedNominal.predicate,
          subjectText,
          subjectKind,
        )
      );
  }
  const unquantifiedNominal =
    templateCopilotV3EnglishUnquantifiedNominalReference(
      withoutModifier,
      subjectText,
      subjectKind,
      rawWithoutModifier,
    );
  if (unquantifiedNominal !== null) {
    return unquantifiedNominal.disposition !== "distinct" &&
      (
        unquantifiedNominal.bridgeRequiresHold ||
        templateCopilotV3SubjectBoundPredicateIsQualified(
          unquantifiedNominal.predicate,
          subjectText,
          subjectKind,
        )
      );
  }
  const quantifiedMatch = templateCopilotV3EnglishQuantifiedAnaphorPrefix(
    withoutModifier,
    subjectKind,
  );
  const quantifiedTail = quantifiedMatch === null
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(
      withoutModifier.slice(quantifiedMatch[0].length),
      true,
    );
  if (
    quantifiedTail !== undefined &&
    quantifiedTail !== null &&
    templateCopilotV3QuantifiedAnaphorTailIsQualified(
      quantifiedTail,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  const cjkPronounMatch =
    /^(?:它|其|此|該項|该项)(?:本身)?/u.exec(withoutModifier);
  const cjkPronounTail = cjkPronounMatch === null
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(
      withoutModifier.slice(cjkPronounMatch[0].length),
      true,
    );
  if (
    cjkPronounTail !== undefined &&
    cjkPronounTail !== null &&
    (
      cjkPronounTail.bridgeRequiresHold ||
      (
        templateCopilotV3AnaphorPredicateHasClosedStart(
          cjkPronounTail.predicate,
        ) &&
        templateCopilotV3SubjectBoundPredicateIsQualified(
          cjkPronounTail.predicate,
          subjectText,
          subjectKind,
        )
      )
    )
  ) {
    return true;
  }
  const cjkQuantifiedMatch = templateCopilotV3CjkQuantifiedAnaphorPrefix(
    withoutModifier,
    subjectKind,
  );
  const cjkQuantifiedTail = cjkQuantifiedMatch === null
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(
      withoutModifier.slice(cjkQuantifiedMatch[0].length),
      true,
    );
  if (
    cjkQuantifiedTail !== undefined &&
    cjkQuantifiedTail !== null &&
    (
      cjkQuantifiedTail.bridgeRequiresHold ||
      (
        templateCopilotV3QuantifiedAnaphorPredicateCanBind(
          cjkQuantifiedTail.predicate,
        ) &&
        templateCopilotV3SubjectBoundPredicateIsQualified(
          cjkQuantifiedTail.predicate,
          subjectText,
          subjectKind,
        )
      )
    )
  ) {
    return true;
  }

  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const genericMatch = new RegExp(
    `^(?:the|this|that)\\s+(?:${genericNouns})\\b`,
    "u",
  ).exec(withoutModifier);
  const genericRemainder = genericMatch === null
    ? undefined
    : withoutModifier.slice(genericMatch[0].length);
  const genericTail = genericRemainder === undefined ||
      /^\s+for\b/u.test(genericRemainder)
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(genericRemainder);
  if (
    genericTail !== undefined &&
    genericTail !== null &&
    (
      genericTail.bridgeRequiresHold ||
      templateCopilotV3SubjectBoundPredicateIsQualified(
        genericTail.predicate,
        subjectText,
        subjectKind,
      )
    )
  ) {
    return true;
  }
  const cjkGenericNouns = subjectKind === "attachment"
    ? templateCopilotV3CjkAttachmentGenericNounSource
    : templateCopilotV3CjkRequestGenericNounSource;
  const cjkGenericMatch = new RegExp(
    `^(?:${templateCopilotV3CjkDeicticSource})(?:${cjkGenericNouns})`,
    "u",
  ).exec(withoutModifier);
  const cjkGenericTail = cjkGenericMatch === null
    ? undefined
    : templateCopilotV3ParseSubjectReferenceTail(
      withoutModifier.slice(cjkGenericMatch[0].length),
    );
  if (
    cjkGenericTail !== undefined &&
    cjkGenericTail !== null &&
    (
      cjkGenericTail.bridgeRequiresHold ||
      templateCopilotV3SubjectBoundPredicateIsQualified(
        cjkGenericTail.predicate,
        subjectText,
        subjectKind,
      )
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

type TemplateCopilotV3ClauseSubjectDisposition =
  | "target"
  | "distinct"
  | "unknown";

type TemplateCopilotV3ClauseSubjectReference = {
  offset: number;
  bridgeRequiresHold?: boolean;
  end: number;
  disposition: TemplateCopilotV3ClauseSubjectDisposition | "inherited";
  predicate: string;
};

function templateCopilotV3ClauseSubjectPositionIsAssertive(
  value: string,
  offset: number,
) {
  const prefix = value.slice(0, offset);
  return prefix === "" ||
    new RegExp(
      "(?:[,，:：;；]\\s*|\\b(?:" +
        templateCopilotV3EnglishSubjectConnectorSource +
        ")\\b[\\s,]*|(?:雖然|虽然|即使|即便|儘管|尽管|除非|如果|若|當|当|每當|每当|一旦|只要|因為|因为|由於|由于|否則|否则|但係|但是|但|而|然而|不過|不过|且|並且|并且)\\s*)$",
      "u",
    )
      .test(prefix);
}

function templateCopilotV3TargetAliasHasLeftBoundary(
  value: string,
  offset: number,
) {
  if (offset === 0) return true;
  const before =
    Array.from(value.slice(Math.max(0, offset - 2), offset)).at(-1) ?? "";
  if (!/[\p{L}\p{N}_]/u.test(before)) return true;
  return /(?:否則|否则|但係|但是|然而|不過|不过|可是|則|则|但|反而)\s*$/u
    .test(value.slice(Math.max(0, offset - 16), offset));
}

function templateCopilotV3TargetAliasHasExplicitDistinctLeftContext(
  value: string,
  offset: number,
) {
  const prefix = value.slice(Math.max(0, offset - 256), offset);
  return new RegExp(
    `(?:${templateCopilotV3EnglishDistinctClassifierSource})\\s+` +
      `(?:(?:${templateCopilotV3EnglishHistoricalRequirementDescriptorSource})\\s+)?$`,
    "u",
  ).test(prefix) ||
    new RegExp(
      `(?:${templateCopilotV3CjkDistinctClassifierSource})` +
        "(?:[^,，:：;；.!?。！？\\r\\n]{0,40}?的)?$",
      "u",
    ).test(prefix);
}

function templateCopilotV3SubjectReferenceBridgeRequiresHold(value: string) {
  const body = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(/^(?:which|that)\s+/u, "");
  if (!body) return false;
  if (
    /^(?:however|nevertheless|nonetheless|still|instead|rather|now|currently|henceforth|然而|不過|不过|可是|但|卻|却|反而)$/u
      .test(body)
  ) {
    return false;
  }
  const affirmativeNegation =
    templateCopilotV3AffirmativeNegationDisposition(body);
  if (affirmativeNegation === "closed_affirmative") return false;
  if (affirmativeNegation === "qualified_or_unknown") return true;
  return !(
    /^(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:(?:always|still|categorically|invariably)\s+)?(?:required|mandatory|compulsory|obligatory)$/u
      .test(body) ||
    /^(?:仍|仍然|依然|一律|一概|始終|始终)?(?:為|为|是)?(?:必填|必須(?:填寫|填写|提供|上載|上传|提交)?|必须(?:填写|提供|上传|提交)?|須(?:填寫|填写|提供|上載|上传|提交)?|须(?:填写|提供|上传|提交)?|需要(?:填寫|填写|提供|上載|上传|提交)?)$/u
      .test(body)
  );
}

type TemplateCopilotV3SubjectReferenceTail = {
  bridgeRequiresHold: boolean;
  predicate: string;
};

function templateCopilotV3ParseSubjectReferenceTail(
  value: string,
  allowOpenPredicate = false,
): TemplateCopilotV3SubjectReferenceTail | null {
  let remainder = value;
  let bridgeRequiresHold = false;
  let hasSubjectBoundary = false;
  const leadingWhitespace = /^\s+/u.exec(remainder);
  if (leadingWhitespace) {
    hasSubjectBoundary = true;
    remainder = remainder.slice(leadingWhitespace[0].length);
  }

  for (let bridgeCount = 0; bridgeCount < 4; bridgeCount += 1) {
    const parenthetical =
      /^[（(]\s*([^()（）\r\n.!?。！？;；]{1,80000}?)\s*[）)]\s*/u
        .exec(remainder);
    if (parenthetical) {
      hasSubjectBoundary = true;
      bridgeRequiresHold ||=
        templateCopilotV3SubjectReferenceBridgeRequiresHold(parenthetical[1]);
      remainder = remainder.slice(parenthetical[0].length);
      continue;
    }

    const commaBridge =
      /^[,，]\s*([^,，\r\n.!?。！？;；]{1,80000}?)\s*[,，]\s*/u
        .exec(remainder);
    if (commaBridge) {
      const bridgeTail = remainder.slice(commaBridge[0].length);
      if (templateCopilotV3ClauseReferencePredicate(bridgeTail) === null) {
        break;
      }
      hasSubjectBoundary = true;
      bridgeRequiresHold ||=
        templateCopilotV3SubjectReferenceBridgeRequiresHold(commaBridge[1]);
      remainder = remainder.slice(commaBridge[0].length);
      continue;
    }
    break;
  }

  const directUnicodeDelimiter = /^[：:\u2010-\u2015\u2212]\s*/u.exec(
    remainder,
  );
  if (directUnicodeDelimiter) {
    hasSubjectBoundary = true;
    remainder = remainder.slice(directUnicodeDelimiter[0].length);
  } else if (/^,|^，/u.test(remainder)) {
    hasSubjectBoundary = true;
    remainder = remainder.slice(1).replace(/^\s+/u, "");
  } else if (hasSubjectBoundary) {
    const asciiDash = /^-\s+/u.exec(remainder);
    if (asciiDash) {
      remainder = remainder.slice(asciiDash[0].length);
    }
  }

  if (/^[（(]/u.test(remainder)) {
    return { bridgeRequiresHold: true, predicate: "" };
  }
  if (!hasSubjectBoundary && !/^\p{Script=Han}/u.test(remainder)) {
    return null;
  }

  const predicate = templateCopilotV3ClauseReferencePredicate(remainder);
  if (predicate === null) {
    if (allowOpenPredicate) {
      const openPredicate =
        templateCopilotV3NormalizeAuthorityContinuation(remainder);
      if (openPredicate) {
        return {
          bridgeRequiresHold,
          predicate: openPredicate,
        };
      }
    }
    return bridgeRequiresHold ? { bridgeRequiresHold, predicate: "" } : null;
  }
  return { bridgeRequiresHold, predicate };
}

function templateCopilotV3OptionalObjectExpressesSubstitution(value: string) {
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(value);
  return /\b(?:replace|replaces|replacing|replacement|substitute|substitutes|substituting|substitution|alternative|copy|instead|obviate|obviates|obviating|obviated|remove|removes|removing|removed|supersede|supersedes|superseding|superseded|supplant|supplants|supplanting|supplanted|displace|displaces|displacing|displaced|satisfy|satisfies|satisfying|satisfied)\b|in\s+(?:lieu|place)\s+of|stand(?:s|ing|stood)?\s+(?:in\s+for|as\s+(?:a\s+)?proxy\s+for)|(?:act|acts|acting|acted|serve|serves|serving|served)\s+as\s+(?:(?:a|the)\s+)?(?:proxy|substitute|replacement|alternative|equivalent)\s+(?:for|of)|(?:proxy\s+for|equivalent\s+of)|(?:take|takes|taking|took|taken)\s+(?:(?:its|their|the|that|this)\s+)?place|make(?:s|ing)?[\s\S]{0,80}\bunnecessary\b|allow(?:s|ing)?[\s\S]{0,80}\bomission\b/u
    .test(candidate);
}
type TemplateCopilotV3GenericSiblingShape = {
  stemTokens: readonly string[];
  rawStemTokens: readonly string[];
};

function templateCopilotV3GenericSiblingShape(
  candidate: string,
  rawCandidate: string,
  genericNouns: string,
): TemplateCopilotV3GenericSiblingShape | null {
  const word = "[\\p{L}\\p{N}\\p{M}_\\p{Pd}\\u0027\\u2019\\u02BC]+";
  const genericBase =
    `(?:(?:${word})\\s+){0,11}(?:${genericNouns})s?`;
  const scopeLeader =
    "(?:under|within|inside|outside|in|on|for|from|by|among|across|during|" +
    "after|before|following|per|according\\s+to|subject\\s+to|with|without|" +
    "that|which|whose|where|when)";
  const scopedSource =
    `^(${genericBase})\\s+${scopeLeader}\\b[\\s\\S]{1,240}$`;
  const scoped = new RegExp(scopedSource, "u").exec(candidate);
  const rawScoped = new RegExp(scopedSource, "iu").exec(rawCandidate);
  const base = scoped?.[1] ?? candidate;
  const rawBase = rawScoped?.[1] ?? (scoped === null ? rawCandidate : base);
  const baseSource =
    `^(?:(${word}(?:\\s+${word}){0,10})\\s+)?(?:${genericNouns})s?$`;
  const baseMatch = new RegExp(baseSource, "u").exec(base);
  if (baseMatch === null) return null;
  const rawBaseMatch = new RegExp(baseSource, "iu").exec(rawBase);
  const stem = baseMatch[1] ?? "";
  const rawStem = rawBaseMatch?.[1] ?? stem;
  return {
    stemTokens: stem ? stem.split(/\s+/u) : [],
    rawStemTokens: rawStem ? rawStem.split(/\s+/u) : [],
  };
}

function templateCopilotV3GenericSiblingStatusToken(value: string) {
  const finalSegment = value.split(/\p{Pd}/u).at(-1) ?? value;
  return /(?:ed|en)$/u.test(finalSegment) ||
    /^(?:active|inactive|valid|invalid|available|unavailable|current|existing|pending|required|optional|mandatory|compulsory|obligatory|governed|authorized|verified|selected|configured|validated|screened|reviewed|certified|flagged|waived|exempt|elective|unnecessary|discretionary|voluntary|legacy|primary|secondary|opaque|unidentified|average|standard|unknown|high|low|medium|critical|elevated|reduced|quality|status|priority|risk|impact|urgency|severity|confidence|availability)$/u
      .test(finalSegment);
}

function templateCopilotV3GenericSiblingStemIsStatusLike(
  tokens: readonly string[],
) {
  if (tokens.length === 0) return true;
  const phrase = tokens.join(" ");
  if (
    /^(?:high|low|medium|critical|elevated|reduced)\s+(?:priority|risk|impact|urgency|severity)$/u
      .test(phrase) ||
    tokens.some((token) =>
      /^(?:high|low|medium|standard|average|critical|elevated|reduced)-(?:quality|risk|priority|impact|urgency|severity|confidence|availability)$/u
        .test(token)
    )
  ) {
    return true;
  }
  return templateCopilotV3GenericSiblingStatusToken(
    tokens[tokens.length - 1],
  );
}

function templateCopilotV3GenericSiblingTokenHasRecognizedIdentity(
  value: string,
) {
  return /^(?:excel|spreadsheet|schedule|redline|reference|certificate|declaration|image|photo|csv|pdf|order|receipt|notes?|comments?|remarks?|description|explanation|justification|reason|memo|message|title|name|email|phone|address|date|amount|currency|code|number|identifier|policy|narrative|evidence|report|minutes|summary|delivery|password|center|unit|jurisdiction|entity|category|owner|confirmation|assessment|onboarding|intake|diligence|registration)$/u
    .test(value);
}

function templateCopilotV3RawTokenHasStrongIdentifierShape(value: string) {
  const uppercaseCount = Array.from(value).filter((character) =>
    /\p{Lu}/u.test(character)
  ).length;
  if (uppercaseCount >= 2) return true;
  if (/\p{Lu}/u.test(value) && /\p{N}/u.test(value)) return true;
  return /\p{Ll}\p{Lu}|\p{Lu}[^\p{L}\p{N}]*\p{Lu}/u.test(value);
}

function templateCopilotV3GenericSiblingStemIsPositivelyNamed(
  tokens: readonly string[],
  rawTokens: readonly string[],
) {
  if (tokens.length === 0) return false;
  const finalToken = tokens[tokens.length - 1];
  if (tokens.length === 1) {
    const rawToken = rawTokens[0] ?? finalToken;
    const strongIdentifier =
      templateCopilotV3RawTokenHasStrongIdentifierShape(rawToken);
    if (/\p{Pd}/u.test(finalToken) && !strongIdentifier) return false;
    return templateCopilotV3GenericSiblingTokenHasRecognizedIdentity(
        finalToken,
      ) || strongIdentifier;
  }
  const rawNamedToken = rawTokens.some((rawToken, index) =>
    !templateCopilotV3GenericSiblingStatusToken(tokens[index] ?? "") &&
    (
      templateCopilotV3RawTokenHasStrongIdentifierShape(rawToken) ||
      (index > 0 && /\p{Lu}/u.test(rawToken))
    )
  );
  const boundedHyphenIdentity = tokens.some((token) =>
    /^(?:one-(?:way|page|time)|all-purpose)$/u.test(token)
  ) &&
    (
      templateCopilotV3GenericSiblingTokenHasRecognizedIdentity(finalToken) ||
      (tokens.includes("all-purpose") && finalToken === "supporting")
    );
  return rawNamedToken || boundedHyphenIdentity ||
    templateCopilotV3GenericSiblingTokenHasRecognizedIdentity(finalToken);
}

function templateCopilotV3GovernedTerminalTypeReference(
  candidate: string,
  rawCandidate: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const subjectAliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  );
  if (!subjectAliases.some(({ stripped }) => stripped)) return false;
  const fullAlias = subjectAliases.find(({ stripped }) => !stripped)?.text;
  const terminalType = fullAlias?.split(/\s+/u).at(-1);
  if (!terminalType) return false;
  const escapedTerminal = terminalType.replace(
    /[.*+?^${}()|[\]\\]/gu,
    "\\$&",
  );
  const word = "[\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}]+";
  const terminalReferenceSource =
    `^(?:(${word}(?:\\s+${word}){0,5})\\s+)?${escapedTerminal}s?` +
    `(?:\\s+(?:under|within|inside|outside|in|on|for|of|about|regarding|from|by|among|across|during|after|before|following|per|according\\s+to|subject\\s+to|with|without|that|which|whose|where|when)\\b[\\s\\S]{1,240})?$`;
  const match = new RegExp(terminalReferenceSource, "u").exec(candidate);
  if (match === null) return false;
  const rawMatch = new RegExp(terminalReferenceSource, "iu").exec(
    rawCandidate,
  );
  const prefixTokens = match[1]?.split(/\s+/u) ?? [];
  const rawPrefixTokens = rawMatch?.[1]?.split(/\s+/u) ?? prefixTokens;
  return !templateCopilotV3GenericSiblingStemIsPositivelyNamed(
    prefixTokens,
    rawPrefixTokens,
  );
}

function templateCopilotV3OptionalObjectDisposition(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  rawValue = value,
): TemplateCopilotV3ClauseSubjectDisposition {
  const candidate = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(
      /^(?:a|an|the|some|one)\s+/u,
      "",
    );
  const rawCandidate =
    templateCopilotV3NormalizeCasePreservingAuthorityContinuation(rawValue)
      .replace(
        /^(?:a|an|the|some|one)\s+/iu,
        "",
      );
  if (!candidate) return "unknown";
  if (templateCopilotV3OptionalObjectExpressesSubstitution(candidate)) {
    return "unknown";
  }
  if (
    new RegExp(
      `^(?:${templateCopilotV3EnglishDistinctClassifierSource})\\s+`,
      "u",
    ).test(candidate)
  ) {
    return "distinct";
  }

  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const subjectAliases = templateCopilotV3RequirementSubjectAliases(
    subjectText,
    subjectKind,
  );
  const aliases = subjectAliases.map(({ text }) => text);
  const lexicalBoundary = "[^\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}/]";
  const fullAlias = subjectAliases.find(({ stripped }) => !stripped)?.text;
  const candidateNamesFullAlias = fullAlias !== undefined &&
    !/[\p{Script=Han}]/u.test(fullAlias) &&
    new RegExp(
      `(?:^|${lexicalBoundary})` +
        `${fullAlias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}` +
        `(?:$|${lexicalBoundary})`,
      "u",
    ).test(candidate);
  const fullAliasTerminal = fullAlias?.split(/\s+/u).at(-1);
  if (
    templateCopilotV3GovernedTerminalTypeReference(
      candidate,
      rawCandidate,
      subjectText,
      subjectKind,
    )
  ) {
    return "unknown";
  }
  const compoundWord = "[\\p{L}\\p{N}\\p{M}_]+";
  const compoundBoundary =
    `(?:${templateCopilotV3LexicalCompoundHyphenSource}|\\s+)`;
  const namesSiblingCompound = subjectAliases.some(({ text: alias, stripped }) => {
    if (stripped && candidateNamesFullAlias) return false;
    if (/[\p{Script=Han}]/u.test(alias)) return false;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(?:^|${lexicalBoundary})(?:(?:${compoundWord})\\s+){0,8}` +
        `${escaped}${templateCopilotV3LexicalCompoundHyphenSource}` +
        `${compoundWord}(?:${compoundBoundary}${compoundWord}){0,4}?` +
        `${compoundBoundary}(?:${genericNouns})s?` +
        `(?:$|${lexicalBoundary})`,
      "u",
    ).test(candidate);
  });
  if (namesSiblingCompound) return "distinct";

  const namesSpacedSiblingCompound = subjectAliases.some(({ text: alias, stripped }) => {
    if (stripped && candidateNamesFullAlias) return false;
    if (/[\p{Script=Han}]/u.test(alias)) return false;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(?:^|${lexicalBoundary})(?:(?:${compoundWord})\\s+){0,8}` +
        `${escaped}\\s+${compoundWord}` +
        `(?:\\s+${compoundWord}){0,3}\\s+(?:${genericNouns})s?` +
        `(?:$|${lexicalBoundary})`,
      "u",
    ).test(candidate);
  });
  if (namesSpacedSiblingCompound) return "distinct";

  const competingDomainNouns = subjectKind === "attachment"
    ? "field|input|question|value"
    : "attachment|document|file|form|upload";
  if (
    new RegExp(
      `^requirements?\\s+(?:for|of)\\s+` +
        `(?:(?:the|any|all)\\s+)?(?:${competingDomainNouns})s?` +
        `(?:$|${lexicalBoundary})`,
      "u",
    ).test(candidate)
  ) {
    return "distinct";
  }

  const namesScopedSibling = subjectAliases.some(({ text: alias, stripped }) => {
    if (stripped && candidateNamesFullAlias) return false;
    if (/[\p{Script=Han}]/u.test(alias)) return false;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = new RegExp(
      `^requirements?\\s+(?:for|of)\\s+(?:the\\s+)?${escaped}` +
        `(?=$|${lexicalBoundary})([\\s\\S]*)$`,
      "u",
    ).exec(candidate);
    if (match === null) return false;
    return !new RegExp(
      `^(?:\\s+(?:${genericNouns})s?)?` +
        `(?:\\s+(?:under|within|inside|outside|in|on|for|from|by|among|across|during|after|before|following|per|according\\s+to|subject\\s+to|with|without|that|which|whose|where|when)\\b[\\s\\S]*)?$`,
      "u",
    ).test(match[1]);
  });
  if (namesScopedSibling) return "distinct";

  const namesPrefixedStrippedSibling = !candidateNamesFullAlias &&
    subjectAliases.some(({ text: alias, stripped }) => {
      if (!stripped || /[\p{Script=Han}]/u.test(alias)) return false;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const match = new RegExp(
        `^(?:requirements?\\s+(?:for|of)\\s+(?:the\\s+)?)?` +
          `(${compoundWord}(?:\\s+${compoundWord}){0,3})\\s+` +
          `${escaped}\\s+(?:${genericNouns})s?` +
          `(?:$|\\s+(?:under|within|inside|outside|in|on|for|from|by|among|across|during|after|before|following|per|according\\s+to|subject\\s+to|with|without|that|which|whose|where|when)\\b)`,
        "u",
      ).exec(candidate);
      if (match === null) return false;
      return match[1].split(/\s+/u).some((token) =>
        token !== fullAliasTerminal &&
        templateCopilotV3GenericSiblingTokenHasRecognizedIdentity(
          token,
        )
      );
    });
  if (namesPrefixedStrippedSibling) return "distinct";

  const namesTarget = aliases.some((alias) => {
    if (/[\p{Script=Han}]/u.test(alias)) return candidate.includes(alias);
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `(?:^|${lexicalBoundary})${escaped}(?:$|${lexicalBoundary})`,
      "u",
    ).test(candidate);
  });
  if (namesTarget) return "target";
  const genericShape = templateCopilotV3GenericSiblingShape(
    candidate,
    rawCandidate,
    genericNouns,
  );
  if (genericShape !== null) {
    const governedTerminalTypeIsOnlyIdentity =
      subjectAliases.some(({ stripped }) => stripped) &&
      fullAliasTerminal !== undefined &&
      genericShape.stemTokens.at(-1) === fullAliasTerminal &&
      !templateCopilotV3GenericSiblingStemIsPositivelyNamed(
        genericShape.stemTokens.slice(0, -1),
        genericShape.rawStemTokens.slice(0, -1),
      );
    if (governedTerminalTypeIsOnlyIdentity) {
      return "unknown";
    }
    if (
      templateCopilotV3GenericSiblingStemIsStatusLike(
        genericShape.stemTokens,
      )
    ) {
      return "unknown";
    }
    return templateCopilotV3GenericSiblingStemIsPositivelyNamed(
        genericShape.stemTokens,
        genericShape.rawStemTokens,
      )
      ? "distinct"
      : "unknown";
  }

  const containsGenericNoun = new RegExp(
    `(?:^|[^\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}/])` +
      `(?:${genericNouns})s?` +
      `(?=$|[^\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}/])`,
    "u",
  ).test(candidate);
  const genericTarget = containsGenericNoun ||
    /^(?:it|this|that|these|those|one|same|current|target|relevant)$/u
      .test(candidate);
  return genericTarget ? "unknown" : "distinct";
}
function templateCopilotV3ImperativeOptionalObjectDisposition(
  subject: string,
  predicate: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
): TemplateCopilotV3ClauseSubjectDisposition | null {
  const fullReference = templateCopilotV3NormalizeAuthorityContinuation(
    `${subject} ${predicate}`,
  );
  const optionalObject =
    /^(?:(?:please|kindly|also|then|and|or|still|indeed)\s+){0,4}(?:(?:(?:we|you|users?|requesters?|applicants?|submitters?|staff|employees?)|(?:the\s+)?(?:user|requester|applicant|submitter|employee))\s+(?:(?:may|can|could|should|will)\s+)?)?(?:allow|permit|include|add|accept|offer)\s+(?:(?:a|an|the|some|one)\s+)?(?:optional|elective|voluntary|discretionary)\s+([\s\S]+)$/u
      .exec(
        fullReference,
      );
  if (optionalObject === null) {
    return null;
  }
  return templateCopilotV3OptionalObjectDisposition(
    optionalObject[1],
    subjectText,
    subjectKind,
  );
}

function templateCopilotV3ClauseSubjectReferences(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
) {
  const normalized = templateCopilotV3StripCorrectionAuthorityPrefix(
    templateCopilotV3NormalizeAuthorityContinuation(value),
  );
  const rawNormalized = templateCopilotV3CasePreservingEquivalentSuffix(
    value,
    normalized,
  );
  const references: TemplateCopilotV3ClauseSubjectReference[] = [];
  const englishSubjectBoundary =
    `(^|(?:[,，:：;；]\\s*|\\b(?:${templateCopilotV3EnglishSubjectConnectorSource})\\b[\\s,]*))`;
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const cjkGenericNouns = subjectKind === "attachment"
    ? templateCopilotV3CjkAttachmentGenericNounSource
    : templateCopilotV3CjkRequestGenericNounSource;
  const englishDistinctSource =
    `(?:${templateCopilotV3EnglishDistinctClassifierSource})\\s+` +
    `(?:(?:${templateCopilotV3EnglishHistoricalRequirementDescriptorSource})\\s+)?` +
    `(?:${genericNouns})\\b` +
    `(?:(?:${templateCopilotV3EnglishPostnominalHistoricalRequirementSource}))?`;
  const cjkDistinctSource =
    `(?:${templateCopilotV3CjkDistinctClassifierSource})(?:[^,，:：;；.!?。！？\\r\\n]{0,40}?的)?(?:${cjkGenericNouns})`;
  const distinctRanges: Array<{ start: number; end: number }> = [];
  const targetRanges: Array<{ start: number; end: number }> = [];
  const quantifiedNominalRanges: Array<{ start: number; end: number }> = [];

  for (const match of normalized.matchAll(
    new RegExp(englishDistinctSource, "gu"),
  )) {
    if (match.index === undefined) continue;
    const end = match.index + match[0].length;
    distinctRanges.push({ start: match.index, end });
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (
      templateCopilotV3ClauseSubjectPositionIsAssertive(
        normalized,
        match.index,
      )
    ) {
      references.push({
        offset: match.index,
        end,
        disposition: "distinct",
        predicate: parsedTail?.predicate ?? "",
        bridgeRequiresHold: parsedTail?.bridgeRequiresHold,
      });
    }
  }
  for (const match of normalized.matchAll(
    new RegExp(cjkDistinctSource, "gu"),
  )) {
    if (match.index === undefined) continue;
    const end = match.index + match[0].length;
    distinctRanges.push({ start: match.index, end });
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (
      templateCopilotV3ClauseSubjectPositionIsAssertive(
        normalized,
        match.index,
      )
    ) {
      references.push({
        offset: match.index,
        end,
        disposition: "distinct",
        predicate: parsedTail?.predicate ?? "",
        bridgeRequiresHold: parsedTail?.bridgeRequiresHold,
      });
    }
  }

  for (const boundary of normalized.matchAll(
    new RegExp(englishSubjectBoundary, "gu"),
  )) {
    if (boundary.index === undefined) continue;
    const offset = boundary.index + boundary[0].length;
    const quantifiedNominal =
      templateCopilotV3EnglishQuantifiedNominalReference(
        normalized.slice(offset),
        subjectText,
        subjectKind,
        templateCopilotV3CasePreservingEquivalentSuffix(
          rawNormalized,
          normalized.slice(offset),
        ),
      );
    if (quantifiedNominal === null) continue;
    const end = offset + quantifiedNominal.end;
    if (
      references.some((reference) =>
        reference.offset < end && reference.end > offset
      )
    ) {
      continue;
    }
    quantifiedNominalRanges.push({ start: offset, end });
    if (quantifiedNominal.disposition === "distinct") {
      distinctRanges.push({ start: offset, end });
    } else if (quantifiedNominal.disposition === "target") {
      targetRanges.push({ start: offset, end });
    }
    references.push({
      offset,
      end,
      disposition: quantifiedNominal.disposition,
      predicate: quantifiedNominal.predicate,
      bridgeRequiresHold: quantifiedNominal.bridgeRequiresHold,
    });
  }
  for (
    const { text: alias } of
      templateCopilotV3RequirementSubjectAliases(subjectText, subjectKind)
  ) {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const compoundBoundary =
      `(?:${templateCopilotV3LexicalCompoundHyphenSource}|\\s+)`;
    const compoundSource =
      `${escapedAlias}${templateCopilotV3LexicalCompoundHyphenSource}` +
      "[\\p{L}\\p{N}\\p{M}_]+" +
      `(?:${compoundBoundary}[\\p{L}\\p{N}\\p{M}_]+){0,4}?` +
      `${compoundBoundary}(?:${genericNouns})\\b`;
    for (const match of normalized.matchAll(
      new RegExp(compoundSource, "gu"),
    )) {
      if (match.index === undefined) continue;
      if (
        !templateCopilotV3TargetAliasHasLeftBoundary(
          normalized,
          match.index,
        )
      ) {
        continue;
      }
      const end = match.index + match[0].length;
      if (
        distinctRanges.some((range) =>
          match.index >= range.start && end <= range.end
        )
      ) {
        continue;
      }
      distinctRanges.push({ start: match.index, end });
      if (
        templateCopilotV3ClauseSubjectPositionIsAssertive(
          normalized,
          match.index,
        )
      ) {
        const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
          normalized.slice(end),
        );
        references.push({
          offset: match.index,
          end,
          disposition: "distinct",
          predicate: parsedTail?.predicate ?? "",
          bridgeRequiresHold: parsedTail?.bridgeRequiresHold,
        });
      }
    }
  }

  for (
    const { text: alias, stripped } of
      templateCopilotV3RequirementSubjectAliases(subjectText, subjectKind)
  ) {
    let cursor = 0;
    while (cursor <= normalized.length - alias.length) {
      const offset = normalized.indexOf(alias, cursor);
      if (offset < 0) break;
      if (
        templateCopilotV3TargetAliasHasExplicitDistinctLeftContext(
          normalized,
          offset,
        ) || distinctRanges.some((range) =>
          offset >= range.start && offset < range.end
        )
      ) {
        cursor = offset + Math.max(alias.length, 1);
        continue;
      }
      const qualification =
        templateCopilotV3AliasQualificationDetails(
          normalized,
          offset,
          alias,
          subjectKind,
          stripped,
        );
      if (
        templateCopilotV3TargetAliasHasLeftBoundary(normalized, offset) &&
        qualification !== null
      ) {
        const end = qualification.subjectEnd;
        targetRanges.push({ start: offset, end });
        references.push({
          offset,
          end,
          disposition: "target",
          predicate: qualification.predicate,
          bridgeRequiresHold: qualification.bridgeRequiresHold,
        });
      }
      cursor = offset + Math.max(alias.length, 1);
    }
  }

  const occupiedBy = (
    ranges: Array<{ start: number; end: number }>,
    offset: number,
  ) => ranges.some((range) => offset >= range.start && offset < range.end);

  for (const match of normalized.matchAll(
    new RegExp(`\\b(?:${genericNouns})\\b`, "gu"),
  )) {
    if (match.index === undefined) continue;
    if (
      occupiedBy(distinctRanges, match.index) ||
      occupiedBy(targetRanges, match.index) ||
      occupiedBy(quantifiedNominalRanges, match.index)
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(match.index + match[0].length),
    );
    if (parsedTail === null) continue;
    references.push({
      offset: match.index,
      end: match.index + match[0].length,
      disposition: "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  for (const match of normalized.matchAll(
    new RegExp(`(?:${cjkGenericNouns})`, "gu"),
  )) {
    if (match.index === undefined) continue;
    if (
      occupiedBy(distinctRanges, match.index) ||
      occupiedBy(targetRanges, match.index)
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(match.index + match[0].length),
    );
    if (parsedTail === null) continue;
    references.push({
      offset: match.index,
      end: match.index + match[0].length,
      disposition: "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }

  for (const match of normalized.matchAll(
    new RegExp(
      `(?:(?:the|this|that)\\s+)?(?:${genericNouns})` +
        `(?:${templateCopilotV3EnglishPostnominalHistoricalRequirementSource})`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    if (
      !templateCopilotV3ClauseSubjectPositionIsAssertive(
        normalized,
        match.index,
      )
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(match.index + match[0].length),
    );
    if (parsedTail === null) continue;
    references.push({
      offset: match.index,
      end: match.index + match[0].length,
      disposition: "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }

  for (const match of normalized.matchAll(

    new RegExp(
      `${englishSubjectBoundary}` +
        `((?:(?:the|this|that)\\s+)?comments?)\\s+`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const end = offset + match[2].length;
    if (
      targetRanges.some((range) =>
        offset >= range.start && offset < range.end
      )
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (parsedTail === null) continue;
    references.push({
      offset,
      end,
      disposition: "distinct",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  for (const match of normalized.matchAll(
    new RegExp(
      `${englishSubjectBoundary}` +
        `((?:(?:the|this|that)\\s+)?(?:original|target|current|relevant)\\s+(?:one|item))\\s+`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const end = offset + match[2].length;
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (parsedTail === null) continue;
    references.push({
      offset,
      end,
      disposition: "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  for (const boundary of normalized.matchAll(
    new RegExp(englishSubjectBoundary, "gu"),
  )) {
    if (boundary.index === undefined) continue;
    const offset = boundary.index + boundary[0].length;
    const quantified = templateCopilotV3EnglishQuantifiedAnaphorPrefix(
      normalized.slice(offset),
      subjectKind,
    );
    if (quantified === null) continue;
    const end = offset + quantified[0].length;
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
      true,
    );
    if (
      parsedTail === null ||
      !templateCopilotV3QuantifiedAnaphorPredicateCanBind(
        parsedTail.predicate,
      )
    ) {
      continue;
    }
    if (
      references.some((reference) =>
        reference.offset < end && reference.end > offset
      )
    ) {
      continue;
    }
    references.push({
      offset,
      end,
      disposition: "inherited",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  const englishUnknownSubjectPredicateBridge =
    templateCopilotV3EnglishUnknownSubjectPredicateBridgeSource;
  const unknownSubjectWord = `[\\p{L}\\p{N}_'’ʼ\\p{Pd}]+`;
  for (const match of normalized.matchAll(
    new RegExp(
      `${englishSubjectBoundary}` +
        `((?:(?:the|this|that|an?|some)\\s+)?${unknownSubjectWord}` +
        `(?:\\s+${unknownSubjectWord}){0,5}?)${englishUnknownSubjectPredicateBridge}` +
        `(${templateCopilotV3EnglishUnknownSubjectPredicateStartSource}\\b[\\s\\S]*)$`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const subject = templateCopilotV3NormalizeAuthorityContinuation(match[2]);
    if (/^(?:it|this|that)$/u.test(subject)) continue;
    const end = offset + match[2].length;
    if (
      references.some((reference) =>
        reference.offset < end && reference.end > offset
      )
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (parsedTail === null) continue;
    if (
      /^(?:each|both|all)$/u.test(subject) &&
      !templateCopilotV3QuantifiedAnaphorPredicateCanBind(parsedTail.predicate)
    ) {
      continue;
    }
    const imperativeDisposition =
      templateCopilotV3ImperativeOptionalObjectDisposition(
        subject,
        parsedTail.predicate,
        subjectText,
        subjectKind,
      );
    references.push({
      offset,
      end,
      disposition: imperativeDisposition ?? "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  for (const match of normalized.matchAll(
    new RegExp(
      `${englishSubjectBoundary}(it|this|that)\\b`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const end = offset + match[2].length;
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
      true,
    );
    if (parsedTail === null) continue;
    references.push({
      offset,
      end,
      disposition: "inherited",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  const cjkUnknownSubjectPredicateBridge =
    templateCopilotV3CjkUnknownSubjectPredicateBridgeSource;
  const cjkSubjectBoundary =
    `(^|(?:[,，:：;；]\\s*|(?:雖然|虽然|即使|即便|儘管|尽管|除非|如果|若|當|当|每當|每当|一旦|只要|因為|因为|由於|由于|否則|否则|但係|但是|但|而|然而|不過|不过|且|並且|并且)\\s*))`;
  for (const boundary of normalized.matchAll(
    new RegExp(cjkSubjectBoundary, "gu"),
  )) {
    if (boundary.index === undefined) continue;
    const offset = boundary.index + boundary[0].length;
    const quantified = templateCopilotV3CjkQuantifiedAnaphorPrefix(
      normalized.slice(offset),
      subjectKind,
    );
    if (quantified === null) continue;
    const end = offset + quantified[0].length;
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
      true,
    );
    if (
      parsedTail === null ||
      !templateCopilotV3QuantifiedAnaphorPredicateCanBind(
        parsedTail.predicate,
      )
    ) {
      continue;
    }
    if (
      references.some((reference) =>
        reference.offset < end && reference.end > offset
      )
    ) {
      continue;
    }
    references.push({
      offset,
      end,
      disposition: "inherited",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  const cjkUnknownPredicateStart =
    `(?:仍然|依然|仍|已|曾|為|为|是|可以|可能|可|通常|一般|不|未|無|无|毋|非|選填|选填|免填|自願填寫|自愿填写|豁免|免除)`;
  for (const match of normalized.matchAll(
    new RegExp(
      `${cjkSubjectBoundary}` +
        `((?:${templateCopilotV3CjkDeicticSource})[\\p{L}\\p{N}\\p{M}_'’ʼ\\p{Pd}\\s]{1,40}?)` +
        `${cjkUnknownSubjectPredicateBridge}` +
        `(${cjkUnknownPredicateStart}[\\s\\S]*)$`,
      "gu",
    ),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const end = offset + match[2].length;
    if (
      references.some((reference) =>
        reference.offset < end && reference.end > offset
      )
    ) {
      continue;
    }
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
    );
    if (parsedTail === null) continue;
    references.push({
      offset,
      end,
      disposition: "unknown",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }
  for (const match of normalized.matchAll(
    new RegExp(`${cjkSubjectBoundary}((?:它|其|此|該項|该项)(?:本身)?)`, "gu"),
  )) {
    if (match.index === undefined) continue;
    const offset = match.index + match[1].length;
    const end = offset + match[2].length;
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      normalized.slice(end),
      true,
    );
    if (parsedTail === null) continue;
    references.push({
      offset,
      end,
      disposition: "inherited",
      predicate: parsedTail.predicate,
      bridgeRequiresHold: parsedTail.bridgeRequiresHold,
    });
  }

  const dispositionOrder: Record<
    TemplateCopilotV3ClauseSubjectReference["disposition"],
    number
  > = {
    distinct: 0,
    unknown: 1,
    inherited: 2,
    target: 3,
  };
  references.sort((left, right) =>
    left.offset - right.offset ||
    dispositionOrder[left.disposition] - dispositionOrder[right.disposition]
  );
  return references;
}

function templateCopilotV3ProvenSubjectGenericIsQualified(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  inheritedDisposition: TemplateCopilotV3ClauseSubjectDisposition,
) {
  let disposition = inheritedDisposition;
  for (const reference of templateCopilotV3ClauseSubjectReferences(
    value,
    subjectText,
    subjectKind,
  )) {
    if (reference.disposition === "target") {
      disposition = "target";
    }
    if (reference.disposition === "distinct") {
      disposition = "distinct";
      continue;
    }
    if (reference.disposition === "unknown") {
      disposition = "unknown";
    }
    if (
      disposition !== "distinct" &&
      (
        reference.bridgeRequiresHold ||
        templateCopilotV3SubjectBoundPredicateIsQualified(
          reference.predicate,
          subjectText,
          subjectKind,
        )
      )
    ) {
      return true;
    }
  }
  return false;
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
  for (const { text: subjectAlias, stripped } of subjectAliases) {
    const escapedSubject = subjectAlias.replace(
      /[.*+?^${}()|[\]\\]/gu,
      "\\$&",
    );
    const directMatch = new RegExp(
      `^(?:(?:(?:the|this|that)\\s+)|(?:${templateCopilotV3CjkDeicticSource}))?${escapedSubject}`,
      "u",
    ).exec(scopedValue);
    const directDetails = directMatch === null
      ? null
      : templateCopilotV3AliasQualificationDetails(
        scopedValue,
        directMatch[0].length - subjectAlias.length,
        subjectAlias,
        subjectKind,
        stripped,
      );
    if (
      directDetails !== null &&
      (
        directDetails.bridgeRequiresHold ||
        templateCopilotV3SubjectBoundPredicateIsQualified(
          directDetails.predicate,
          subjectText,
          subjectKind,
        )
      )
    ) {
      return true;
    }
    const reverseMatch = new RegExp(
      `^(?:(?:the|this|that)\\s+)?(?:${fullGenericNouns})\\s+for\\s+(?:(?:the|this|that)\\s+)?${escapedSubject}`,
      "u",
    ).exec(scopedValue);
    const reverseDetails = reverseMatch === null
      ? null
      : templateCopilotV3ParseSubjectReferenceTail(
        scopedValue.slice(reverseMatch[0].length),
      );
    if (
      reverseDetails !== null &&
      (
        reverseDetails.bridgeRequiresHold ||
        templateCopilotV3SubjectBoundPredicateIsQualified(
          reverseDetails.predicate,
          subjectText,
          subjectKind,
        )
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
  const cjkSubjectNouns = subjectKind === "attachment"
    ? templateCopilotV3CjkAttachmentSubjectNounSource
    : templateCopilotV3CjkRequestSubjectNounSource;
  const strippedSubject = subjectKind === "attachment"
    ? normalizedSubject.replace(
      new RegExp(
        `(?:\\s+(?:pdf|document|file|form|attachment|upload|image|photo|excel|csv|spreadsheet)|${cjkSubjectNouns})$`,
        "u",
      ),
      "",
    )
    : normalizedSubject.replace(
      new RegExp(
        `(?:\\s+(?:field|input|question|value|item)|${cjkSubjectNouns})$`,
        "u",
      ),
      "",
    );
  return [
    { text: normalizedSubject, stripped: false },
    ...(strippedSubject && strippedSubject !== normalizedSubject
      ? [{ text: strippedSubject, stripped: true }]
      : []),
  ] as const;
}

function templateCopilotV3ClauseIsStandaloneCorrectionMarker(value: string) {
  return /^(?:correction|corrected|update|updated|revision|revised|更正|修正)$/u
    .test(templateCopilotV3NormalizeAuthorityContinuation(value));
}

function templateCopilotV3ReferenceUpdatesClauseDisposition(
  value: string,
  reference: TemplateCopilotV3ClauseSubjectReference,
  references: readonly TemplateCopilotV3ClauseSubjectReference[],
) {
  let trailingConnectorOffset = -1;
  const connectorPattern = new RegExp(
    `\\b(?:${templateCopilotV3EnglishSubordinateSubjectConnectorSource})\\b|(?:${templateCopilotV3CjkSubordinateSubjectConnectorSource})`,
    "gu",
  );
  for (const match of value.slice(0, reference.offset).matchAll(
    connectorPattern,
  )) {
    if (match.index !== undefined) {
      trailingConnectorOffset = match.index;
    }
  }
  if (trailingConnectorOffset < 0) return true;

  const afterConnector = value.slice(
    trailingConnectorOffset,
    reference.offset,
  );
  if (
    /[,，;；]\s*(?:(?:but|and|however|yet)\b|(?:但係|但是|但|而|然而|不過|不过|可是|且|並且|并且|否則|否则))/u
      .test(afterConnector)
  ) {
    return true;
  }

  return !references.some((candidate) =>
    candidate.disposition !== "inherited" &&
    candidate.offset < trailingConnectorOffset
  );
}

function templateCopilotV3ClauseRequirementSubjectDisposition(
  value: string,
  subjectText: string,
  subjectKind: "request_field" | "attachment",
  inheritedDisposition: TemplateCopilotV3ClauseSubjectDisposition,
): TemplateCopilotV3ClauseSubjectDisposition {
  const normalized = templateCopilotV3StripCorrectionAuthorityPrefix(
    templateCopilotV3NormalizeAuthorityContinuation(value),
  );
  const references = templateCopilotV3ClauseSubjectReferences(
    value,
    subjectText,
    subjectKind,
  );
  if (references.length === 0) return "unknown";

  let disposition = inheritedDisposition;
  for (const reference of references) {
    if (
      reference.disposition !== "inherited" &&
      templateCopilotV3ReferenceUpdatesClauseDisposition(
        normalized,
        reference,
        references,
      )
    ) {
      disposition = reference.disposition;
    }
  }
  return disposition;
}

function templateCopilotV3PredicateHasClosedStart(value: string) {
  return /^(?:is|are|was|were|being|becomes?|remains?|remaining|continues?|continuing|exists?|existed|may|might|can|could|should|will|would|shall|must|has|have|had|does|do|needs?|need|cannot|optional|exempt|waived|not|possibly|potentially|reportedly|allegedly|conditionally|normally|generally|ordinarily|typically|usually|sometimes|for|under|after|before|following|upon|during|according\s+to|per|subject\s+to|depending\s+on|only|solely|exclusively|just)\b/u
    .test(value) ||
    /^(?:仍|仍然|依然|已|曾|為|为|是|可|可能|通常|一般|不|未|無|无|毋|非|選填|选填|免填|自願填寫|自愿填写|豁免|免除|對|对|按|依|經|经|在|於|于)/u
      .test(value);
}

function templateCopilotV3QualifiedPredicateHasBoundedDiscoursePrefix(
  value: string,
) {
  return /^(?:(?:clearly|definitely|explicitly|conceivably|demonstrably|plainly|evidently|expressly|obviously)\s+|in\s+fact\s+)(?:(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:optional|elective|exempt|waived|unnecessary|discretionary|voluntary|not\s+(?:required|needed|mandatory|compulsory))|(?:may|might|can|could|should|would)\s+(?:now\s+)?be\s+(?:absent|omitted|waived|skipped|optional|elective|exempt|unnecessary|left\s+(?:blank|empty|unfilled|out))|(?:need\s+not|does?\s+not\s+(?:need|have)\s+to)\s+be\s+(?:provided|required|included|entered|uploaded|filled(?:\s+in)?))\b/u
    .test(value);
}

function templateCopilotV3ClauseReferencePredicate(value: string) {
  const normalized = templateCopilotV3StripReferenceDiscourseBridge(value);
  if (!normalized) return null;
  if (
    templateCopilotV3PredicateHasClosedStart(normalized) ||
    templateCopilotV3QualifiedPredicateHasBoundedDiscoursePrefix(normalized) ||
    templateCopilotV3NormalizedTextBeginsPostRequirementQualification(
      normalized,
    )
  ) {
    return normalized;
  }

  const englishBridgeRaw =
    /^(?:it|this|that)(?:\s+(?:itself|alone))?\s+([\s\S]{1,80000})$/u
      .exec(normalized)?.[1];
  const englishBridge = englishBridgeRaw === undefined
    ? undefined
    : templateCopilotV3StripReferenceDiscourseBridge(englishBridgeRaw);
  if (
    englishBridge !== undefined &&
    templateCopilotV3AnaphorPredicateHasClosedStart(englishBridge)
  ) {
    return englishBridge;
  }
  const cjkBridgeRaw =
    /^(?:它|其|此|該項|该项)(?:本身)?([\s\S]{1,80000})$/u
      .exec(normalized)?.[1];
  const cjkBridge = cjkBridgeRaw === undefined
    ? undefined
    : templateCopilotV3StripReferenceDiscourseBridge(cjkBridgeRaw);
  if (
    cjkBridge !== undefined &&
    templateCopilotV3AnaphorPredicateHasClosedStart(cjkBridge)
  ) {
    return cjkBridge;
  }
  return null;
}

type TemplateCopilotV3AliasQualificationDetails =
  TemplateCopilotV3SubjectReferenceTail & {
    subjectEnd: number;
  };

function templateCopilotV3AliasQualificationDetails(
  value: string,
  offset: number,
  subjectAlias: string,
  subjectKind: "request_field" | "attachment",
  stripped = false,
): TemplateCopilotV3AliasQualificationDetails | null {
  const aliasEnd = offset + subjectAlias.length;
  const englishGenericNouns = subjectKind === "attachment"
    ? stripped
      ? "requirement|attachment|upload|item"
      : "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  const cjkGenericNouns = subjectKind === "attachment"
    ? stripped
      ? templateCopilotV3CjkStrippedAttachmentSubjectNounSource
      : templateCopilotV3CjkAttachmentSubjectNounSource
    : templateCopilotV3CjkRequestSubjectNounSource;
  const remainder = value.slice(aliasEnd);
  const generic =
    new RegExp(`^\\s+(?:${englishGenericNouns})\\b`, "u").exec(remainder) ??
    new RegExp(`^\\s*(?:${cjkGenericNouns})`, "u").exec(remainder);
  const candidateEnds = [
    ...(generic ? [aliasEnd + generic[0].length] : []),
    aliasEnd,
  ];
  for (const subjectEnd of candidateEnds) {
    const parsedTail = templateCopilotV3ParseSubjectReferenceTail(
      value.slice(subjectEnd),
    );
    if (parsedTail !== null) {
      return { subjectEnd, ...parsedTail };
    }
  }
  return null;
}

function templateCopilotV3AliasMayBeginQualification(
  value: string,
  offset: number,
  subjectAlias: string,
  subjectKind: "request_field" | "attachment",
  stripped = false,
) {
  return templateCopilotV3AliasQualificationDetails(
    value,
    offset,
    subjectAlias,
    subjectKind,
    stripped,
  ) !== null;
}

type TemplateCopilotV3AffirmativeNegationDisposition =
  | "none"
  | "closed_affirmative"
  | "qualified_or_unknown";

function templateCopilotV3AffirmativeNegationDisposition(
  value: string,
): TemplateCopilotV3AffirmativeNegationDisposition {
  const full = templateCopilotV3NormalizeAuthorityContinuation(value);
  const optionality = /^(?:(?:(?:is|are|was|were|becomes?|remains?)\s+)?(?:not|never)\s+(?:optional|exempt|waived|unnecessary|discretionary|voluntary)\b|(?:cannot|can\s+not|may\s+not|must\s+not)\s+be\s+(?:waived|omitted|skipped)\b|(?:(?:為|为|是)\s*)?(?:(?:並非|并非|不是|非)(?:選填|选填|可選|可选|免填|自願填寫|自愿填写|豁免|免除)|(?:不可|不得)(?:免填|豁免|免除)))([\s\S]*)$/u
    .exec(full);
  const additive = /^(?:(?:(?:is|are|was|were)\s+)?not\s+(?:only|merely|simply)\s+required\b|(?:不但|不僅|不仅|不只)(?:為|为|是)?(?:必填|必須|必须|須|须|需要))([\s\S]*)$/u
    .exec(full);
  const matched = optionality ?? additive;
  if (!matched) return "none";

  const tail = templateCopilotV3NormalizeAuthorityContinuation(
    matched[1] ?? "",
  );
  if (!tail) return "closed_affirmative";

  const mandatoryTail = /^(?:but|and|yet|rather)\b[,\s]*(?:(?:(?:is|are|was|were|becomes?|remains?|continues?\s+to\s+be|will\s+remain)\s+)?(?:(?:always|still|indeed|categorically|invariably)\s+)?(?:required|mandatory|compulsory|obligatory)|(?:must|shall|will|needs?|need)\s+(?:(?:always|still)\s+)?(?:be\s+)?(?:provided|required|included|entered|uploaded|filled(?:\s+in)?))$|^(?:而是|但|且|並且|并且|而且)\s*(?:仍|一律|一概|始終|始终)?(?:為|为|是)?(?:必填|必須(?:填寫|填写|提供|上載|上传|提交)?|必须(?:填写|提供|上传|提交)?|須(?:填寫|填写|提供|上載|上传|提交)?|须(?:填写|提供|上传|提交)?|需要(?:填寫|填写|提供|上載|上传|提交)?)$/u;
  if (mandatoryTail.test(tail)) return "closed_affirmative";

  const benignScopeTail = /^(?:under\s+any\s+circumstances|for\s+(?:any|all|every)\s+requests?|by\s+(?:finance|legal|compliance)(?:\s+(?:team|department))?)$/u;
  if (optionality && benignScopeTail.test(tail)) {
    return "closed_affirmative";
  }

  if (additive) {
    const benignAuditTail = /^(?:but|and)\b[,\s]*(?:also\s+)?(?:(?:is|are|was|were)\s+)?(?:audited|reviewed|recorded|logged|tracked|verified|validated)$|^(?:而且|且|並且|并且)\s*(?:須|须|需要)?(?:核對|核对|審核|审核|審查|审查|記錄|记录|追蹤|追踪|驗證|验证)$/u;
    if (benignAuditTail.test(tail)) return "closed_affirmative";
  }

  return "qualified_or_unknown";
}

function templateCopilotV3SubjectBoundPredicateIsQualified(
  value: string,
  subjectText = "",
  subjectKind: "request_field" | "attachment" = "request_field",
) {
  const englishAuxiliarySource =
    "(?:is|are|was|were|becomes?|remains?|may|might|can|could|should|" +
    "will|would|shall|must|has|have|had|does|do|needs?|need|cannot)";
  const englishBenignIntrapredicateSource =
    "(?:however|nevertheless|nonetheless|still|instead|rather|now|" +
    "currently|henceforth|clearly|definitely|explicitly|conceivably|" +
    "demonstrably|plainly|evidently|expressly|obviously|" +
    "in\\s+(?:practice|fact))";
  const deparenthesized = templateCopilotV3NormalizeAuthorityContinuation(value)
    .replace(
      new RegExp(
        `^(${englishAuxiliarySource})\\s*[,，]\\s*` +
          `${englishBenignIntrapredicateSource}\\s*[,，]\\s*`,
        "u",
      ),
      "$1 ",
    ).replace(
      new RegExp(
        `^(${englishAuxiliarySource})\\s*[（(]\\s*` +
          `${englishBenignIntrapredicateSource}\\s*[）)]\\s*`,
        "u",
      ),
      "$1 ",
    ).replace(
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
  const fullPredicate = templateCopilotV3NormalizeAuthorityContinuation(
    subjectScoped,
  );
  const preposedScopePredicate = new RegExp(
    "^(?:for|under|within|inside|outside|in|on|among|across|during|after|" +
      "before|following|per|according\\s+to|subject\\s+to|with|without|" +
      "when|where)\\b" +
      "[^,，:：;；.!?。！？\\r\\n]{1,240}\\s+" +
      `(${englishAuxiliarySource}\\b[\\s\\S]*)$`,
    "u",
  ).exec(fullPredicate)?.[1];
  if (
    preposedScopePredicate !== undefined &&
    templateCopilotV3SubjectBoundPredicateIsQualified(
      preposedScopePredicate,
      subjectText,
      subjectKind,
    )
  ) {
    return true;
  }
  if (
    templateCopilotV3QualifiedPredicateHasBoundedDiscoursePrefix(fullPredicate)
  ) return true;
  if (
    templateCopilotV3NormalizedTextBeginsPostRequirementQualification(
      fullPredicate,
    )
  ) return true;
  const affirmativeNegation =
    templateCopilotV3AffirmativeNegationDisposition(fullPredicate);
  if (affirmativeNegation !== "none") {
    return affirmativeNegation === "qualified_or_unknown";
  }
  const phrase = templateCopilotV3NormalizeAuthorityContinuation(
    fullPredicate.split(/[,，:：;；]/u, 1)[0] ?? "",
  );
  return templateCopilotV3RequirementPredicateIsQualified(phrase) ||
    /\b(?:optional|exempt|waived|waiver|unnecessary|discretionary|voluntary|conditional|conditionally|contingent|contingently)\b/u
      .test(phrase) ||
    /\bnot\s+(?:(?:always|necessarily)\s+)?(?:required|needed|mandatory|compulsory)\b|\bno\s+longer\s+(?:required|needed)\b/u
      .test(phrase) ||
    /\b(?:need\s+not|does?\s+not\s+(?:need|have)\s+to)\s+be\s+(?:provided|required|included|entered|uploaded|filled(?:\s+in)?)\b/u
      .test(phrase) ||
    /\b(?:(?:is|are|was|were|be|been|being)\s+)?(?:normally|generally|ordinarily|typically|usually|sometimes|possibly|potentially|reportedly|allegedly)\s+(?:(?:is|are|was|were|be|been|being)\s+)?(?:required|optional)\b/u
      .test(phrase) ||
    /\b(?:(?:only|solely|exclusively|just)\s+required|required\s+(?:only|solely|exclusively|just))\b/u
      .test(phrase) ||
    /(?:選填|选填|可選|可选|免填|自願填寫|自愿填写|豁免|免除|可免除|可以免除|可省略|可以省略|可不填|可以不填|可留空|可以留空|不需要|非必須|非必须|未必|可能|通常|一般|有時|有时)/u
      .test(phrase) ||
    /(?:僅|仅|只)(?:在|於|于)?[\s\S]*(?:必填|必須|必须|需要)/u
      .test(phrase);
}

function templateCopilotV3CompetingCandidateIsSameTarget(
  candidate: string,
  aliases: readonly string[],
  subjectKind: "request_field" | "attachment",
) {
  if (!candidate) return true;
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  if (
    new RegExp(
      `^(?:` +
        `it(?:\\s+(?:itself|alone))?` +
        `|(?:this|that)(?:\\s+(?:itself|alone))?` +
        `|its\\s+(?:(?:own|respective)\\s+)?(?:${genericNouns})` +
        `|(?:(?:the|this|that)\\s+)?` +
          `(?:(?:same|very|aforementioned|above-mentioned|respective)\\s+)?` +
          `(?:${genericNouns})(?:\\s+(?:itself|alone))?` +
      `)$`,
      "u",
    ).test(candidate)
  ) {
    return true;
  }
  return aliases.some((alias) => {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `^(?:(?:the|this|that)\\s+)?` +
        `(?:(?:same|very|aforementioned|above-mentioned|respective)\\s+)?` +
        `${escapedAlias}(?:\\s+(?:${genericNouns}))?` +
        `(?:\\s+(?:itself|alone))?$`,
      "u",
    ).test(candidate);
  });
}

function templateCopilotV3CompetingCandidateIsPositivelyDistinct(
  candidate: string,
  aliases: readonly string[],
  subjectKind: "request_field" | "attachment",
) {
  if (
    templateCopilotV3CompetingCandidateIsSameTarget(
      candidate,
      aliases,
      subjectKind,
    )
  ) {
    return false;
  }
  const genericNouns = subjectKind === "attachment"
    ? "requirement|attachment|document|file|form|upload|item"
    : "requirement|field|input|question|value|item";
  if (
    new RegExp(
      `^(?:${templateCopilotV3EnglishDistinctClassifierSource})\\s+` +
        `(?:(?:${templateCopilotV3EnglishHistoricalRequirementDescriptorSource})\\s+)?` +
        `(?:${genericNouns})` +
        `(?:(?:${templateCopilotV3EnglishPostnominalHistoricalRequirementSource}))?(?:\\s+(?:itself|alone))?$`,
      "u",
    ).test(candidate)
  ) {
    return true;
  }
  return false;
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
    if (
      templateCopilotV3CompetingCandidateIsPositivelyDistinct(
        candidate,
        aliases,
        subjectKind,
      )
    ) {
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
  for (const { text: subjectAlias, stripped } of templateCopilotV3RequirementSubjectAliases(
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
      const prefix = normalized.slice(Math.max(0, offset - 80), offset);
      const precededByObjectPreposition =
        /\b(?:for|of|about|regarding)\s+(?:(?:the|this|that)\s+)?$/u
          .test(prefix);
      const canBeginSubject = !precededByObjectPreposition;
      const hasExplicitDistinctContext =
        templateCopilotV3TargetAliasHasExplicitDistinctLeftContext(
          normalized,
          offset,
        );
      const mayBeginQualification = canBeginSubject &&
        !hasExplicitDistinctContext &&
        templateCopilotV3AliasMayBeginQualification(
          normalized,
          offset,
          subjectAlias,
          subjectKind,
          stripped,
        );
      if (
        templateCopilotV3TargetAliasHasLeftBoundary(normalized, offset) &&
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

function templateCopilotV3NormalizeCasePreservingAuthorityContinuation(
  value: string,
) {
  return templateCopilotV3NormalizeTrimCollapseText(value)
    .replace(/^[^\p{L}\p{N}_]+/u, "")
    .replace(/[^\p{L}\p{N}_]+$/u, "")
    .trim();
}

function templateCopilotV3NormalizeAuthorityContinuation(value: string) {
  return templateCopilotV3NormalizeLexicalText(value)
    .replace(/^[^\p{L}\p{N}_]+/u, "")
    .replace(/[^\p{L}\p{N}_]+$/u, "")
    .trim();
}

function templateCopilotV3CasePreservingEquivalentSuffix(
  rawValue: string,
  normalizedSuffix: string,
) {
  if (!normalizedSuffix) return "";
  const raw = templateCopilotV3NormalizeCasePreservingAuthorityContinuation(
    rawValue,
  );
  const normalizedRaw = templateCopilotV3NormalizeAuthorityContinuation(raw);
  if (normalizedRaw === normalizedSuffix) return raw;
  if (normalizedRaw.endsWith(normalizedSuffix)) {
    const rawSuffix = raw.slice(raw.length - normalizedSuffix.length);
    if (
      templateCopilotV3NormalizeAuthorityContinuation(rawSuffix) ===
        normalizedSuffix
    ) {
      return rawSuffix;
    }
  }
  return normalizedSuffix;
}
