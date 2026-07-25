from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SUMMARY_PATH = ROOT / "output/template-copilot-qualification-report/qualification-summary.json"
BASELINE_PATH = ROOT / "output/template-copilot-qualification/qualification-results.json"
RETEST_PATH = ROOT / "output/template-copilot-qualification-retest/qualification-results.json"
SCREENSHOT_PATH = ROOT / "output/template-copilot-qualification-retest/authenticated-copilot.png"
OUTPUT_PATH = ROOT / "output/pdf/approval-copilot-qwen-qualification-report.pdf"

summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
retest = json.loads(RETEST_PATH.read_text(encoding="utf-8"))
retest_by_id = {item["id"]: item for item in retest["scenarios"]}
final_scenarios = sorted(
    [retest_by_id.get(item["id"], item) for item in baseline["scenarios"]],
    key=lambda item: item["id"],
)

FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
try:
    pdfmetrics.registerFont(
        TTFont(
            "MSJH",
            r"C:\Windows\Fonts\msjh.ttc",
            subfontIndex=0,
        )
    )
    pdfmetrics.registerFont(
        TTFont(
            "MSJH-Bold",
            r"C:\Windows\Fonts\msjhbd.ttc",
            subfontIndex=0,
        )
    )
    FONT_REGULAR = "MSJH"
    FONT_BOLD = "MSJH-Bold"
except Exception:
    # The report remains usable in English if a workstation lacks the Windows CJK fonts.
    pass

NAVY = colors.HexColor("#111827")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")
LINE = colors.HexColor("#CBD5E1")
GREEN = colors.HexColor("#15803D")
GREEN_BG = colors.HexColor("#DCFCE7")
AMBER = colors.HexColor("#B45309")
AMBER_BG = colors.HexColor("#FEF3C7")
RED = colors.HexColor("#B91C1C")
RED_BG = colors.HexColor("#FEE2E2")
BLUE = colors.HexColor("#1D4ED8")
BLUE_BG = colors.HexColor("#DBEAFE")
PURPLE = colors.HexColor("#7E22CE")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName=FONT_BOLD,
        fontSize=25,
        leading=31,
        textColor=NAVY,
        alignment=TA_LEFT,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="Subtitle",
        parent=styles["Normal"],
        fontName=FONT_REGULAR,
        fontSize=11,
        leading=16,
        textColor=SLATE,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="H1x",
        parent=styles["Heading1"],
        fontName=FONT_BOLD,
        fontSize=18,
        leading=23,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=9,
    )
)
styles.add(
    ParagraphStyle(
        name="H2x",
        parent=styles["Heading2"],
        fontName=FONT_BOLD,
        fontSize=12,
        leading=16,
        textColor=SLATE,
        spaceBefore=7,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Bodyx",
        parent=styles["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=9.2,
        leading=13.2,
        textColor=NAVY,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Smallx",
        parent=styles["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=7.6,
        leading=10.5,
        textColor=SLATE,
    )
)
styles.add(
    ParagraphStyle(
        name="Tinyx",
        parent=styles["BodyText"],
        fontName=FONT_REGULAR,
        fontSize=6.6,
        leading=8.6,
        textColor=SLATE,
    )
)
styles.add(
    ParagraphStyle(
        name="Calloutx",
        parent=styles["BodyText"],
        fontName=FONT_BOLD,
        fontSize=10,
        leading=14,
        textColor=NAVY,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="CenterSmall",
        parent=styles["Smallx"],
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="BadgeWhite",
        parent=styles["Smallx"],
        fontName=FONT_BOLD,
        textColor=WHITE,
        alignment=TA_CENTER,
    )
)


def p(text: str, style: str = "Bodyx") -> Paragraph:
    return Paragraph(text, styles[style])


def section(title: str) -> list:
    return [p(title, "H1x"), HRFlowable(width="100%", thickness=0.7, color=LINE), Spacer(1, 4)]


def badge(text: str, background, foreground=WHITE, width=43 * mm) -> Table:
    table = Table([[p(text, "BadgeWhite")]], colWidths=[width], rowHeights=[9 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("TEXTCOLOR", (0, 0), (-1, -1), foreground),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 0.5, background),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def metric_cards(items: list[tuple[str, str, str]], widths=None) -> Table:
    widths = widths or [54 * mm] * len(items)
    cells = []
    for value, label, detail in items:
        cells.append(
            [
                p(value, "H1x"),
                p(label, "Calloutx"),
                p(detail, "Smallx"),
            ]
        )
    table = Table([cells], colWidths=widths, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def styled_table(
    rows,
    widths,
    header=True,
    font_size=7.2,
    repeat_rows=1,
    alignments=None,
) -> Table:
    converted = []
    for r_idx, row in enumerate(rows):
        converted.append(
            [
                cell
                if isinstance(cell, (Paragraph, Table, Drawing))
                else p(str(cell), "Tinyx" if font_size <= 7 else "Smallx")
                for cell in row
            ]
        )
    table = Table(
        converted,
        colWidths=widths,
        repeatRows=repeat_rows if header else 0,
        hAlign="LEFT",
    )
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ]
        )
    for row_index in range(1 if header else 0, len(rows)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), LIGHT))
    if alignments:
        for col, alignment in alignments.items():
            commands.append(("ALIGN", (col, 1 if header else 0), (col, -1), alignment))
    table.setStyle(TableStyle(commands))
    return table


def horizontal_bars(items, width=165 * mm, height=54 * mm, maximum=None) -> Drawing:
    drawing = Drawing(width, height)
    left = 39 * mm
    right = 11 * mm
    usable = width - left - right
    maximum = maximum or max(value for _, value, _ in items) or 1
    bar_height = 6 * mm
    gap = 4 * mm
    y = height - 9 * mm
    for label, value, color in items:
        drawing.add(
            String(
                0,
                y + 1.5 * mm,
                label,
                fontName=FONT_REGULAR,
                fontSize=7.5,
                fillColor=SLATE,
            )
        )
        drawing.add(Rect(left, y, usable, bar_height, fillColor=LIGHT, strokeColor=None))
        drawing.add(
            Rect(
                left,
                y,
                usable * min(value / maximum, 1),
                bar_height,
                fillColor=color,
                strokeColor=None,
            )
        )
        drawing.add(
            String(
                left + usable + 2 * mm,
                y + 1.5 * mm,
                f"{value:g}",
                fontName=FONT_BOLD,
                fontSize=7.5,
                fillColor=NAVY,
            )
        )
        y -= bar_height + gap
    return drawing


def pipeline_diagram() -> Drawing:
    width, height = 170 * mm, 38 * mm
    drawing = Drawing(width, height)
    labels = [
        ("Employee brief", BLUE),
        ("Qwen interview", PURPLE),
        ("Confirmed dossier", GREEN),
        ("Deterministic compiler", AMBER),
        ("Validated draft", GREEN),
    ]
    box_w = 30 * mm
    gap = 4 * mm
    x = 0
    for index, (label, color) in enumerate(labels):
        drawing.add(
            Rect(
                x,
                10 * mm,
                box_w,
                15 * mm,
                rx=3,
                ry=3,
                fillColor=colors.Color(color.red, color.green, color.blue, alpha=0.12),
                strokeColor=color,
                strokeWidth=1.2,
            )
        )
        drawing.add(
            String(
                x + box_w / 2,
                17 * mm,
                label,
                textAnchor="middle",
                fontName=FONT_BOLD,
                fontSize=6.8,
                fillColor=NAVY,
            )
        )
        if index < len(labels) - 1:
            drawing.add(
                String(
                    x + box_w + gap / 2,
                    17 * mm,
                    "→",
                    textAnchor="middle",
                    fontName=FONT_BOLD,
                    fontSize=11,
                    fillColor=MUTED,
                )
            )
        x += box_w + gap
    drawing.add(
        String(
            0,
            2 * mm,
            "Recommended control boundary: the model interprets language; application code creates executable structure.",
            fontName=FONT_REGULAR,
            fontSize=7.5,
            fillColor=SLATE,
        )
    )
    return drawing


def first_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 13 * mm, A4[0], 13 * mm, fill=1, stroke=0)
    canvas.setFont(FONT_BOLD, 8)
    canvas.setFillColor(WHITE)
    canvas.drawString(18 * mm, A4[1] - 8.5 * mm, "CORPORATE AI QUALIFICATION")
    canvas.restoreState()
    page_number(canvas, doc)


def later_pages(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, A4[1] - 15 * mm, A4[0] - 18 * mm, A4[1] - 15 * mm)
    canvas.setFont(FONT_BOLD, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        18 * mm,
        A4[1] - 11 * mm,
        "Approval Template Copilot - Qwen Qualification",
    )
    canvas.restoreState()
    page_number(canvas, doc)


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT_REGULAR, 7)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(
        A4[0] - 18 * mm,
        10 * mm,
        f"Page {doc.page}",
    )
    canvas.drawString(
        18 * mm,
        10 * mm,
        "Synthetic Preview data only - Production unchanged",
    )
    canvas.restoreState()


def scenario_label(item):
    return item.get("archetype", "").replace("_", " ")


def lang_label(code):
    return {
        "en": "English",
        "zh-Hant": "Traditional Chinese",
        "zh-Hans": "Simplified Chinese",
    }.get(code, code)


def pct(value, total):
    return f"{(100 * value / total):.1f}%" if total else "0%"


OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
doc = BaseDocTemplate(
    str(OUTPUT_PATH),
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=21 * mm,
    bottomMargin=17 * mm,
    title=summary["title"],
    author="OpenAI Codex",
    subject="Corporate qualification of Approval Template Copilot using Qwen",
)
frame = Frame(
    doc.leftMargin,
    doc.bottomMargin,
    doc.width,
    doc.height,
    id="normal",
)
doc.addPageTemplates(
    [
        PageTemplate(id="first", frames=[frame], onPage=first_page),
        PageTemplate(id="later", frames=[frame], onPage=later_pages),
    ]
)

story = []
now_hk = datetime.now(ZoneInfo("Asia/Hong_Kong")).strftime("%d %B %Y %H:%M HKT")

# Cover and executive conclusion
story.extend(
    [
        Spacer(1, 18 * mm),
        p("Approval Template Copilot", "CoverTitle"),
        p("Extensive multilingual qualification of qwen/qwen3.5-35b-a3b", "Subtitle"),
        p(
            f"English • 繁體中文 • 简体中文<br/>Generated {now_hk}",
            "Subtitle",
        ),
        Spacer(1, 8 * mm),
        Table(
            [
                [
                    badge("INTERVIEW: CONDITIONAL GO", GREEN, width=56 * mm),
                    badge("DIRECT AUTHORING: NO-GO", RED, width=56 * mm),
                    badge("PRODUCTION: UNCHANGED", BLUE, width=52 * mm),
                ]
            ],
            colWidths=[58 * mm, 58 * mm, 54 * mm],
        ),
        Spacer(1, 9 * mm),
        p("Executive conclusion", "H1x"),
        p(
            "<b>Qwen is suitable for multilingual requirements interviewing when deterministic guardrails are applied, "
            "but it is not suitable for directly producing executable approval templates in the current architecture.</b> "
            "The final interview result is 24/24 after a bounded uncertainty-classification fix. Direct draft creation is 0/24; "
            "strict validation correctly rejected invalid graphs rather than storing unsafe templates.",
            "Bodyx",
        ),
        p(
            "<b>繁體中文：</b>結論：Qwen 適合在有確定性防護下進行多語言需求訪談，但不適合直接生成可執行工作流程。<br/>"
            "<b>简体中文：</b>结论：Qwen 适合在有确定性防护下进行多语言需求访谈，但不适合直接生成可执行工作流。",
            "Bodyx",
        ),
        Spacer(1, 4 * mm),
        metric_cards(
            [
                ("24 / 24", "Final interviews", "8 per language"),
                ("0 / 24", "Executable drafts", "Strictly rejected"),
                ("9 / 9", "Protocols", "Security and resilience"),
            ],
            widths=[56 * mm, 56 * mm, 56 * mm],
        ),
        Spacer(1, 8 * mm),
        p(
            "Recommended decision: proceed with the deterministic dossier-to-workflow compiler before any autonomous corporate pilot. "
            "A supervised interview-only pilot may be considered after full Chinese localization.",
            "Calloutx",
        ),
        Spacer(1, 6 * mm),
        p(
            f"Exact Preview evidence: baseline {summary['baseline']['deploymentId']} at "
            f"{summary['baseline']['commit'][:12]}…; guarded retest {summary['final']['deploymentIds'][1]} at "
            f"{summary['final']['commits'][1][:12]}…. The permanent Production app was not changed.",
            "Smallx",
        ),
    ]
)

# Scope and method
story.append(PageBreak())
story.extend(section("1. Qualification scope and method"))
story.extend(
    [
        p(
            "This was an authenticated, end-to-end qualification against an isolated Vercel Preview connected to a synthetic Supabase development branch. "
            "Three concurrent workers exercised ordinary corporate usage without turning the run into a provider stress test.",
        ),
        metric_cards(
            [
                ("24", "Workflow archetypes", "Purchasing, finance, HR, IT, construction, compliance"),
                ("216", "Final interview turns", "Nine structured sections per scenario"),
                ("669", "Stored messages", "49 sessions including protocols and retests"),
            ],
            widths=[56 * mm, 56 * mm, 56 * mm],
        ),
        Spacer(1, 6 * mm),
        p("Tested dimensions", "H2x"),
        styled_table(
            [
                ["Dimension", "Coverage"],
                ["Approval requirements", "Sequential, parallel, threshold, quorum, FYI, rejection, correction, escalation"],
                ["Attachments and forms", "PDF, image, editable file, spreadsheet, native form, optional and required evidence"],
                ["Conditions", "Amount, risk, geography, exception, mismatch, urgency, policy and fallback branches"],
                ["Dual paths", "Parallel reviews, conditional branches, high-risk routes, emergency routes"],
                ["Information handoff", "Selected fields, restricted views, FYI visibility, status and audit history"],
                ["Document handoff", "All/selected/none visibility, confidential evidence, upload timing and shared fulfillment"],
                ["Languages", "Eight English, eight Traditional Chinese, eight Simplified Chinese scenarios"],
            ],
            [37 * mm, 132 * mm],
        ),
        Spacer(1, 5 * mm),
        p("Execution sequence", "H2x"),
        p(
            "Baseline run → root-cause inspection → bounded deterministic guard → exact Preview redeployment → targeted retest of the seven unchanged failures. "
            "The final scenario set uses the targeted retest result only where the baseline interview failed; the other 17 baseline successes remain unchanged.",
        ),
        pipeline_diagram(),
        Spacer(1, 4 * mm),
        p(
            "<b>ZDR note.</b> The Preview required OpenRouter ZDR routing and disabled reasoning output. Successful calls demonstrate that the request could be served under that enforcement mode; "
            "this report is not an independent audit of the provider selected behind OpenRouter.",
            "Smallx",
        ),
    ]
)

# Scenario matrix pages
story.append(PageBreak())
story.extend(section("2. Workflow scenario matrix"))
story.append(
    p(
        "Every scenario used simple employee-style language but included enough variation to exercise approval logic, forms, attachments, conditions, dual paths, handoffs, collaboration, visibility, notifications, governance, and timing.",
    )
)
for chunk_start in (0, 12):
    chunk = final_scenarios[chunk_start : chunk_start + 12]
    rows = [["ID", "Language", "Workflow archetype", "Department", "Interview", "Draft"]]
    for item in chunk:
        rows.append(
            [
                item["id"],
                lang_label(item["language"]),
                scenario_label(item),
                item.get("departmentName", ""),
                "PASS" if item.get("interviewPassed") else "FAIL",
                "PASS" if item.get("draft", {}).get("created") else "FAIL",
            ]
        )
    story.append(
        styled_table(
            rows,
            [14 * mm, 29 * mm, 48 * mm, 39 * mm, 19 * mm, 19 * mm],
            font_size=6.8,
            alignments={4: "CENTER", 5: "CENTER"},
        )
    )
    if chunk_start == 0:
        story.append(Spacer(1, 5 * mm))
story.extend(
    [
        Spacer(1, 5 * mm),
        p(
            "Final interview completion is 8/8 in every language. No scenario created an executable draft, so validation, simulation, publication, activation, and detailed generated-artifact handoff fidelity remain blocked.",
            "Calloutx",
        ),
    ]
)

# Language and UX
story.append(PageBreak())
story.extend(section("3. Multilingual quality and usability"))
baseline_language = {}
for code in ("en", "zh-Hant", "zh-Hans"):
    base_items = [x for x in baseline["scenarios"] if x["language"] == code]
    baseline_language[code] = sum(1 for x in base_items if x.get("interviewPassed"))
rows = [["Language", "Baseline interview", "Final interview", "Draft", "P50 turn", "P95 turn"]]
for code in ("en", "zh-Hant", "zh-Hans"):
    item = summary["languages"][code]
    rows.append(
        [
            item["label"],
            f"{baseline_language[code]}/8",
            f"{item['interviewPasses']}/8",
            f"{item['draftPasses']}/8",
            f"{item['p50TurnMs']/1000:.1f}s",
            f"{item['p95TurnMs']/1000:.1f}s",
        ]
    )
story.extend(
    [
        styled_table(
            rows,
            [39 * mm, 30 * mm, 28 * mm, 22 * mm, 24 * mm, 24 * mm],
            alignments={1: "CENTER", 2: "CENTER", 3: "CENTER", 4: "RIGHT", 5: "RIGHT"},
        ),
        Spacer(1, 6 * mm),
        horizontal_bars(
            [
                ("English final", 8, BLUE),
                ("Traditional Chinese final", 8, PURPLE),
                ("Simplified Chinese final", 8, GREEN),
                ("Executable drafts", 0, RED),
            ],
            maximum=8,
        ),
        p("Chinese localization gap", "H2x"),
        p(
            f"Only {summary['languages']['zh-Hant']['nativeHanAcknowledgements'] + summary['languages']['zh-Hans']['nativeHanAcknowledgements']} "
            "of 144 Chinese turn responses contained Han characters (15.3%), while all 144 contained an English next-question prompt. "
            "The model understood Chinese input, but the product experience is not yet a Chinese-language chatbot.",
        ),
        styled_table(
            [
                ["UX behavior", "Traditional Chinese", "Simplified Chinese", "Assessment"],
                ["Interview completion", "8/8", "8/8", "PASS after guard"],
                ["Han characters in response", "11/72", "11/72", "FAIL localization"],
                ["English next question", "72/72", "72/72", "FAIL localization"],
                ["Explicit unknown → resolved", "PASS", "PASS", "PASS"],
                ["Chinese confirmation phrase", "PASS", "PASS", "PASS"],
            ],
            [50 * mm, 36 * mm, 36 * mm, 44 * mm],
            alignments={1: "CENTER", 2: "CENTER"},
        ),
        Spacer(1, 4 * mm),
        p(
            "Required product improvement: translate every question, confirmation instruction, dossier heading, error, review control, and generated summary; store a per-session language; and regression-test Traditional and Simplified Chinese separately.",
            "Calloutx",
        ),
    ]
)

# Interview guard and corrections
story.append(PageBreak())
story.extend(section("4. Interview guardrails, corrections, and document input"))
story.extend(
    [
        p(
            "The baseline model over-classified seven supplied answers as <i>unknown</i> because literal email addresses, file-size limits, or implementation details were absent. "
            "The prompt already prohibited this behavior. A deterministic multilingual guard now permits a blocking unknown only when the employee explicitly says they do not know or the process owner must decide.",
        ),
        metric_cards(
            [
                ("17 / 24", "Baseline interviews", "Seven false unknowns"),
                ("7 / 7", "Targeted retest", "Identical employee wording"),
                ("3 / 3", "Correction checks", "48-hour change preserved"),
            ],
            widths=[56 * mm, 56 * mm, 56 * mm],
        ),
        Spacer(1, 6 * mm),
        styled_table(
            [
                ["Guardrail/protocol", "English", "Traditional", "Simplified", "Result"],
                ["Explicit 'I do not know' held unresolved", "PASS", "PASS", "PASS", "Correctly blocks"],
                ["Concrete follow-up resolves section", "PASS", "PASS", "PASS", "Correctly resumes"],
                ["Confirmation phrase accepted", "confirm", "確認，請建立草稿", "确认，请创建草稿", "PASS"],
                ["Correction target excludes confirmation", "PASS", "PASS", "PASS", "PASS"],
            ],
            [54 * mm, 28 * mm, 31 * mm, 31 * mm, 24 * mm],
            font_size=6.8,
        ),
        Spacer(1, 6 * mm),
        p("Requirement-document safety", "H2x"),
        p(
            "Accepted text and Markdown requirements were treated as untrusted extracts. Unsupported binary input returned 415, active-content PDF returned 422, and a file over 5 MB returned 413. "
            "An embedded prompt-injection document was accepted only as untrusted source text. Because no draft compiled, generated-artifact injection fidelity could not be scored.",
        ),
        p("Initial brief", "H2x"),
        p(
            "The API now applies an optional initialRequirement immediately instead of discarding it. A short brief may legitimately leave identity details unresolved; the interview continues from the first incomplete section.",
        ),
        p("Usability recommendation", "H2x"),
        p(
            "Expose the initial free-text brief in the UI, let employees edit any dossier section before confirmation, show explicit defaults versus unknowns, and add a three-language review screen before draft creation.",
        ),
    ]
)

# Compiler root cause
story.append(PageBreak())
story.extend(section("5. Draft-generation root cause"))
story.extend(
    [
        badge("CRITICAL RELEASE BLOCKER", RED, width=62 * mm),
        Spacer(1, 5 * mm),
        p(
            "All 24 final scenarios reached a ready interview state and then failed draft creation. The endpoint retried once and returned 503 dependency_unavailable after approximately 121 seconds. "
            "No unsafe family or draft was stored; created family count remained zero.",
        ),
        metric_cards(
            [
                ("0 / 24", "Drafts created", "Safe fail-closed behavior"),
                ("12 / 14", "Retest attempts", "Schema validation failure"),
                ("2 / 14", "Retest attempts", "Invalid JSON"),
            ],
            widths=[56 * mm, 56 * mm, 56 * mm],
        ),
        Spacer(1, 5 * mm),
        p("Representative invalid output categories", "H2x"),
        styled_table(
            [
                ["Contract area", "Observed failure paths", "Meaning"],
                ["Request fields", "requestFields.*.options; template.fields.*.options", "Options missing or invalid for select-like fields"],
                ["Attachments/forms", "attachmentRequirements.*.minimumFiles; *.fields", "Required counts or native form fields inconsistent"],
                ["Routing", "routes.*; routes.*.condition; condition.fieldId", "Wrong route semantics, invalid conditions, or broken references"],
                ["Visibility/blocking", "routes.*.blocking", "FYI or non-blocking route generated as blocking"],
                ["Identity", "businessScope.processOwnerEmail", "Invented or malformed optional owner email"],
                ["Transport", "invalid_json", "Provider response was not parseable JSON despite structured-output request"],
            ],
            [38 * mm, 69 * mm, 61 * mm],
        ),
        Spacer(1, 6 * mm),
        p("Why prompt repair alone is insufficient", "H2x"),
        p(
            "The executable contract contains cross-field and graph invariants that JSON Schema cannot fully express: unique IDs, valid references, complete branches, "
            "type-specific fields, required fallback behavior, and non-blocking FYI routes. A model can produce syntactically plausible JSON while violating those invariants.",
        ),
        p("Required architecture", "H2x"),
        pipeline_diagram(),
        p(
            "The compiler should map a validated dossier into canonical IDs, fields, documents, nodes, edges, defaults, fallbacks, visibility rules, and audit metadata. "
            "The model may propose human-readable labels or flag ambiguity, but application code must own executable structure.",
            "Calloutx",
        ),
    ]
)

# Security protocol page
story.append(PageBreak())
story.extend(section("6. Security, concurrency, and resilience protocols"))
protocol_rows = [["Protocol", "Result", "Evidence"]]
protocol_evidence = {
    "unauthenticated-boundary": "Unauthenticated context request returned 401.",
    "invalid-authoritative-scope": "Unknown business/department rejected with 422.",
    "initial-requirement-contract": "Initial brief applied to the ledger.",
    "unknown-recovery-en": "Explicit unknown held, then resolved.",
    "unknown-recovery-zh-Hant": "繁體中文 unknown/recovery loop passed.",
    "unknown-recovery-zh-Hans": "简体中文 unknown/recovery loop passed.",
    "requirement-document-safety": "Accepted safe text; rejected unsafe/oversized formats.",
    "revision-idempotency-concurrency": "Replay stable; stale write rejected; one concurrent mutation applied.",
    "cross-user-isolation": "Second authenticated user received 404 for owner session.",
}
for item in retest["protocols"]:
    protocol_rows.append(
        [
            item["id"],
            "PASS" if item.get("passed") else "FAIL",
            protocol_evidence.get(item["id"], ""),
        ]
    )
story.extend(
    [
        styled_table(protocol_rows, [61 * mm, 21 * mm, 86 * mm]),
        Spacer(1, 6 * mm),
        metric_cards(
            [
                ("9 / 9", "Protocol checks", "All passed"),
                ("0", "Browser errors", "Authenticated final run"),
                ("404", "Cross-user read", "Owner isolation preserved"),
            ],
            widths=[56 * mm, 56 * mm, 56 * mm],
        ),
        Spacer(1, 6 * mm),
        p("What was proven", "H2x"),
        p(
            "Authentication, authoritative business scope, owner-scoped session reads, idempotent replay, optimistic concurrency, stale revision rejection, bounded document intake, and safe failure behavior were exercised against the deployed Preview.",
        ),
        p("What remains for corporate readiness", "H2x"),
        p(
            "Before broad rollout: corporate SSO/SCIM group mapping, centralized audit export, retention controls, DLP/classification integration, key rotation, provider allow-listing, model/request cost telemetry, "
            "rate limits per user/business, incident alerts, and an admin-visible AI activity log.",
        ),
    ]
)

# Performance page
story.append(PageBreak())
story.extend(section("7. Performance and operational behavior"))
perf = summary["performance"]
story.extend(
    [
        styled_table(
            [
                ["Measure", "P50", "P95", "Maximum", "Assessment"],
                [
                    "Interview turn",
                    f"{perf['p50InterviewTurnMs']/1000:.1f}s",
                    f"{perf['p95InterviewTurnMs']/1000:.1f}s",
                    f"{perf['maximumInterviewTurnMs']/1000:.1f}s",
                    "Usable median; high long tail",
                ],
                [
                    "Draft attempt (two tries total)",
                    f"{perf['p50DraftAttemptMs']/1000:.1f}s",
                    f"{perf['p95DraftAttemptMs']/1000:.1f}s",
                    f"{perf['maximumDraftAttemptMs']/1000:.1f}s",
                    "Unacceptable because result still fails",
                ],
            ],
            [51 * mm, 24 * mm, 24 * mm, 25 * mm, 44 * mm],
            alignments={1: "RIGHT", 2: "RIGHT", 3: "RIGHT"},
        ),
        Spacer(1, 7 * mm),
        horizontal_bars(
            [
                ("Interview P50 (s)", perf["p50InterviewTurnMs"] / 1000, BLUE),
                ("Interview P95 (s)", perf["p95InterviewTurnMs"] / 1000, PURPLE),
                ("Draft P50 (s)", perf["p50DraftAttemptMs"] / 1000, RED),
                ("Draft P95 (s)", perf["p95DraftAttemptMs"] / 1000, AMBER),
            ],
            maximum=125,
        ),
        p("Interpretation", "H2x"),
        p(
            "Ordinary interviews are workable at the median, but Chinese turns are slower and the overall long tail is visible. The direct draft call consumes roughly two minutes before failing. "
            "A deterministic compiler should reduce draft creation to local validation time and make latency predictable.",
        ),
        p("Operational safeguards", "H2x"),
        styled_table(
            [
                ["Safeguard", "Recommended threshold/action"],
                ["Interview timeout", "Soft warning at 15s; retry only once for provider transport errors, not schema mistakes"],
                ["Draft compile", "Local deterministic compile target under 2s; no LLM retry in the critical path"],
                ["Concurrency", "Per-user queue plus business-level rate limit; preserve optimistic revision checks"],
                ["Observability", "Model, route, ZDR flag, latency, token/cost, error reason, schema issue categories"],
                ["Fallback", "Save confirmed dossier even when model/provider is unavailable; allow manual builder continuation"],
            ],
            [46 * mm, 122 * mm],
        ),
    ]
)

# Defect register pages
story.append(PageBreak())
story.extend(section("8. Defect register"))
defect_rows = [["ID", "Severity", "Status", "Defect", "Evidence / required action"]]
for defect in summary["defects"]:
    defect_rows.append(
        [
            defect["id"],
            defect["severity"],
            defect["status"],
            defect["title"],
            f"{defect['evidence']} {defect['recommendation']}",
        ]
    )
story.append(
    styled_table(
        defect_rows,
        [16 * mm, 20 * mm, 30 * mm, 44 * mm, 58 * mm],
        font_size=6.6,
    )
)
story.extend(
    [
        Spacer(1, 6 * mm),
        p("Release gates", "H2x"),
        styled_table(
            [
                ["Gate", "Current", "Required before pilot"],
                ["Interview completion", "24/24 after guard", "Maintain 100% on expanded ambiguity set"],
                ["Chinese product language", "15.3% of responses contain Han; all next questions English", "Full EN/zh-Hant/zh-Hans localization"],
                ["Executable draft creation", "0/24", "24/24 schema-valid deterministic compile"],
                ["Simulation and handoff fidelity", "Blocked", "All paths simulated; visibility/document handoffs verified"],
                ["Security protocol", "9/9", "Retain and expand SSO/DLP/audit tests"],
                ["Corporate pilot", "Not approved", "5–10 person controlled pilot only after gates above"],
            ],
            [46 * mm, 50 * mm, 72 * mm],
        ),
    ]
)

# UI evidence
story.append(PageBreak())
story.extend(section("9. Authenticated Preview evidence"))
story.extend(
    [
        p(
            "The final retest opened the deployed Template Copilot through the normal sign-in flow, waited for authoritative business and department options, and captured the page. "
            "The browser recorded no console errors, page errors, HTTP errors, or Next.js error overlay.",
        )
    ]
)
if SCREENSHOT_PATH.exists():
    image = Image(str(SCREENSHOT_PATH))
    max_width = 169 * mm
    max_height = 142 * mm
    ratio = min(max_width / image.imageWidth, max_height / image.imageHeight)
    image.drawWidth = image.imageWidth * ratio
    image.drawHeight = image.imageHeight * ratio
    story.append(image)
    story.append(Spacer(1, 4 * mm))
story.extend(
    [
        styled_table(
            [
                ["Evidence", "Value"],
                ["Preview alias", "https://approval-app-template-copilot-preview.vercel.app"],
                ["Final commit", summary["final"]["commits"][1]],
                ["Final deployment", summary["final"]["deploymentIds"][1]],
                ["Model", summary["model"]],
                ["Routing mode", summary["routingMode"]],
                ["Automated tests", "909 passing; typecheck, lint and webpack production build passing"],
                ["Production", "Unchanged intentionally"],
            ],
            [43 * mm, 125 * mm],
        )
    ]
)

# Recommendation and roadmap
story.append(PageBreak())
story.extend(section("10. Recommendation and execution roadmap"))
story.extend(
    [
        p("Model suitability decision", "H2x"),
        styled_table(
            [
                ["Use", "Decision", "Conditions"],
                ["Multilingual interview extraction", "CONDITIONAL GO", "Deterministic unknown/correction guards; human confirmation; monitoring"],
                ["Direct executable template generation", "NO-GO", "Replace with deterministic compiler"],
                ["Autonomous corporate pilot", "NO-GO", "Compiler, localization, simulation, governance and security gates first"],
                ["Supervised interview-only pilot", "LIMITED GO", "After full Chinese localization; no auto-publication or activation"],
            ],
            [50 * mm, 32 * mm, 86 * mm],
        ),
        Spacer(1, 6 * mm),
        p("Recommended build order", "H2x"),
        styled_table(
            [
                ["Priority", "Work package", "Acceptance criteria"],
                ["P0", "Deterministic dossier-to-workflow compiler", "Canonical IDs, branches, fallbacks, attachments, visibility and validation; 24/24 compile"],
                ["P0", "Three-language interview UI", "All prompts, summaries, errors and controls in EN/zh-Hant/zh-Hans"],
                ["P1", "Editable dossier review", "Users can revise any section, see defaults/unknowns, cite source documents and reconfirm"],
                ["P1", "Simulation qualification", "Threshold, parallel, rejection, correction, info and document handoff routes verified"],
                ["P1", "Governance/monitoring", "SSO, audit export, DLP, retention, quotas, model routing and alerts"],
                ["P2", "Controlled 5–10 person pilot", "Supervised creation; human review; no automatic publication/activation"],
                ["P2", "Remote MCP adapter", "Expose stable authoring API after compiler and review workflow stabilize"],
                ["P3", "Teams/corporate chatbot", "Use MCP/API with enterprise identity and policy enforcement"],
            ],
            [17 * mm, 58 * mm, 93 * mm],
            font_size=6.8,
        ),
        Spacer(1, 6 * mm),
        p(
            "Do not promote the Copilot as an autonomous template creator yet. Keep the current Preview for engineering and supervised review; Production remains unchanged.",
            "Calloutx",
        ),
    ]
)

# Limitations and evidence inventory
story.append(PageBreak())
story.extend(section("11. Limitations and evidence inventory"))
story.extend(
    [
        p("Limitations", "H2x"),
        styled_table(
            [
                ["Limitation", "Impact / follow-up"],
                ["Synthetic corporate data", "Safe for qualification; validate terminology and policies with real process owners during controlled pilot"],
                ["No executable artifact passed", "Validation/simulation/publication/activation and generated handoff fidelity cannot be claimed"],
                ["Provider-side ZDR not independently audited", "Application required ZDR routing; obtain contractual/provider evidence for corporate governance"],
                ["No office document OCR benchmark in this run", "Document intake safety was tested; field extraction quality needs a separate labelled document set"],
                ["Mixed exact builds in final scenario set", "17 accepted baseline cases plus 7 unchanged targeted retests; both deployment identities are recorded"],
                ["No production traffic", "Intentional safety constraint; Production was not modified"],
            ],
            [52 * mm, 116 * mm],
        ),
        Spacer(1, 7 * mm),
        p("Evidence inventory", "H2x"),
        styled_table(
            [
                ["Artifact", "Contents"],
                ["CSV report", "258 records: summary, 9 protocols, 24 scenarios, 216 interview turns, 8 defects"],
                ["Raw baseline JSON", "24 scenario baseline, protocol calls, per-turn latency, draft attempts"],
                ["Raw retest JSON", "Seven targeted retests, 9/9 final protocols, zero browser errors"],
                ["Authenticated screenshot", "Final Template Copilot page after normal sign-in"],
                ["Vercel runtime logs", "Bounded model reason and issue paths; no prompt or credential logging"],
                ["Supabase evidence", "49 sessions, 669 messages, qwen model persisted, zero generated families"],
                ["Code gate", "909 tests, typecheck, lint, webpack build, exact Git/Vercel identity"],
            ],
            [48 * mm, 120 * mm],
        ),
        Spacer(1, 8 * mm),
        p("Final answer", "H2x"),
        p(
            "<b>Use qwen/qwen3.5-35b-a3b for the conversational interview layer, with the deterministic guards retained. "
            "Do not use it as the compiler. Build the deterministic compiler next, then rerun this exact 24-scenario matrix through validation, simulation, review, publication, and activation.</b>",
            "Bodyx",
        ),
    ]
)

doc.build(story)
print(f"pdf={OUTPUT_PATH}")
print(f"pages_expected=11")
