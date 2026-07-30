from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "output" / "reports"
OUTPUT = ROOT / "output" / "pdf"
CSV_PATH = REPORTS / "template-copilot-v2-step10-qualification.csv"
SUMMARY_PATH = REPORTS / "template-copilot-v2-step10-qualification-summary.json"
PDF_PATH = OUTPUT / "template-copilot-v2-step10-qualification-report.pdf"

with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as stream:
    rows = list(csv.DictReader(stream))
summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

if len(rows) != 216:
    raise ValueError(f"Expected 216 qualification rows, received {len(rows)}")
if summary.get("status") != "passed":
    raise ValueError("Refusing to render a PASS report from a failed qualification summary")
result = summary["result"]
if result.get("conversationCount") != len(rows):
    raise ValueError("Qualification summary and CSV row count do not match")

OUTPUT.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=29,
        textColor=colors.HexColor("#123B32"),
        alignment=TA_LEFT,
        spaceAfter=8 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor=colors.HexColor("#123B32"),
        spaceBefore=3 * mm,
        spaceAfter=3 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#374151"),
    )
)
styles.add(
    ParagraphStyle(
        name="BodyClean",
        parent=styles["BodyText"],
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#1F2937"),
        spaceAfter=2.5 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="Callout",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#065F46"),
        alignment=TA_CENTER,
    )
)


def page_footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
    canvas.line(15 * mm, 12 * mm, 282 * mm, 12 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(15 * mm, 7.5 * mm, "Template Copilot v2 - Step 10 qualification")
    canvas.drawRightString(
        282 * mm, 7.5 * mm, f"Page {document.page}"
    )
    canvas.restoreState()


class InvariantCanvas(pdfcanvas.Canvas):
    """Remove volatile PDF timestamps and object IDs from qualification evidence."""

    def __init__(self, *args, **kwargs):
        kwargs["invariant"] = 1
        super().__init__(*args, **kwargs)


def p(text, style="BodyClean"):
    return Paragraph(str(text), styles[style])


def styled_table(data, widths, header=True, font_size=7.5):
    table = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("LEADING", (0, 0), (-1, -1), font_size + 2),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1F2937")),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [
            colors.white,
            colors.HexColor("#F8FAFC"),
        ]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#166534")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    table.setStyle(TableStyle(commands))
    return table


doc = SimpleDocTemplate(
    str(PDF_PATH),
    pagesize=landscape(A4),
    rightMargin=15 * mm,
    leftMargin=15 * mm,
    topMargin=15 * mm,
    bottomMargin=17 * mm,
    title="Template Copilot v2 Step 10 Qualification Report",
    author="Approval Workflow qualification harness",
)
story = []
story.append(p("Template Copilot v2", "ReportTitle"))
story.append(p("Step 10 multilingual qualification report", "Section"))
story.append(
    p(
        "Automated pre-pilot evidence - 30 July 2026. This report does not "
        "claim completion of the nine-person human pilot and does not authorize "
        "Production deployment, migration application, publication, or activation."
    )
)

headline = [
    [
        p(f"{result['conversationCount']} / {len(rows)}", "Callout"),
        p(result["criticalHallucinations"], "Callout"),
        p(result["silentOverwrites"], "Callout"),
        p(result["falseCompleteResults"], "Callout"),
        p(len(result["routeEquivalenceFailures"]), "Callout"),
    ],
    [
        p("conversations passed", "Small"),
        p("critical hallucinations", "Small"),
        p("silent overwrites", "Small"),
        p("false-complete results", "Small"),
        p("route-equivalence failures", "Small"),
    ],
]
headline_table = Table(headline, colWidths=[50 * mm] * 5)
headline_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECFDF5")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#A7F3D0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1FAE5")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(headline_table)
story.append(Spacer(1, 6 * mm))
story.append(p("Scope and method", "Section"))
story.append(
    p(
        "The release gate contains exactly 24 representative workflow "
        "archetypes x three languages (English, Traditional Chinese, and "
        "Simplified Chinese) x three repetitions. Every case uses a pinned "
        "ledger, question library, prompt, candidate schema, and bounded model "
        "output fixture. The production question controller, evidence adapter, "
        "candidate review, fact transitions, compiler, definition validator, "
        "and route simulator execute each case."
    )
)
story.append(
    p(
        "Provider failures are exercised as outage, timeout, malformed output, "
        "and privacy-route rejection fixtures. They leave the authoritative "
        "ledger unchanged; Describe then uses the production Guided fallback. "
        "No model output can commit a fact, declare readiness, publish, or activate."
    )
)

pins = summary["fixturePins"]
story.append(p("Pinned qualification inputs", "Section"))
story.append(
    styled_table(
        [
            ["Fixture", "Question library", "Prompt", "Candidate schema"],
            [
                pins["fixtureVersion"],
                pins["questionLibraryVersion"],
                pins["promptVersion"],
                pins["schemaVersion"],
            ],
        ],
        [65 * mm, 45 * mm, 78 * mm, 60 * mm],
        font_size=8,
    )
)

story.append(PageBreak())
story.append(p("Coverage", "Section"))
coverage_rows = [["Dimension", "Values", "Cases"]]
for key, values in summary["coverage"].items():
    counts = Counter(row[
        {
            "modes": "mode",
            "answerProfiles": "answerProfile",
            "ambiguities": "ambiguityFixture",
            "providerOutcomes": "providerOutcome",
            "locales": "locale",
        }[key]
    ] for row in rows)
    coverage_rows.append(
        [
            p(key, "Small"),
            p(", ".join(values), "Small"),
            p(", ".join(f"{name}: {counts[name]}" for name in values), "Small"),
        ]
    )
story.append(styled_table(coverage_rows, [42 * mm, 96 * mm, 112 * mm], font_size=7.5))

story.append(p("Automated gate results", "Section"))
gate_rows = [["Gate", "Result", "Evidence"]]
evidence = {
    "compiler": "All ledgers compiled with zero draft or publication blockers.",
    "validation": "All 216 executable definitions passed strict validation.",
    "routeSimulation": "All 216 definitions completed deterministic route simulation.",
    "deterministicReplay": "Repeated full runs produced byte-equivalent trace results.",
    "telemetryPrivacy": "Strict schema rejected raw-text keys and email-like values.",
    "providerBoundaryFixtures": "All non-success fixtures left authoritative state unchanged; Describe used Guided fallback.",
    "questionAccessibilityContracts": "Localized prompts, help controls, interaction labels, and mode-switch labels were present.",
    "unsupportedFeatureFailClosed": "Native form without fields and conditional-plus-parallel targeting were blocked with expected codes.",
}
for gate, status in summary["automatedGate"].items():
    gate_rows.append([gate, status.upper(), evidence[gate]])
story.append(styled_table(gate_rows, [48 * mm, 28 * mm, 174 * mm], font_size=8))

story.append(p("Security and privacy interpretation", "Section"))
story.append(
    p(
        "The trace stores stable codes, pseudonyms, revisions, counts, timings, "
        "version pins, bounded synthetic provider-boundary metadata, and privacy "
        "route outcome codes. "
        "It excludes raw corporate answers, message bodies, prompts, transcripts, "
        "document content, names, and direct email identifiers. Telemetry is not "
        "an alternate workflow state store."
    )
)
story.append(
    p(
        "This deterministic report does not claim a live model/ZDR result, "
        "authenticated Preview RLS or cross-user result, keyboard behavior, or "
        "dark/light contrast. Those checks remain pending the separately "
        "authorized Preview and controlled test identities."
    )
)

story.append(PageBreak())
story.append(p("Workflow-level result summary", "Section"))
workflow_rows = [["Workflow fixture", "Cases", "Locales", "Result", "Route hash count"]]
by_workflow = {}
for row in rows:
    by_workflow.setdefault(row["workflowId"], []).append(row)
for workflow, workflow_cases in sorted(by_workflow.items()):
    workflow_rows.append(
        [
            workflow,
            len(workflow_cases),
            len({item["locale"] for item in workflow_cases}),
            "PASS" if all(item["definitionValid"] == "true" for item in workflow_cases) else "FAIL",
            len({item["behaviorHash"] for item in workflow_cases}),
        ]
    )
story.append(
    styled_table(
        workflow_rows,
        [94 * mm, 28 * mm, 30 * mm, 35 * mm, 40 * mm],
        font_size=7.2,
    )
)
story.append(
    p(
        "A route hash count of 1 means every language and repetition produced "
        "the same executable behavior for that workflow fixture."
    )
)

story.append(PageBreak())
story.append(p("Controlled corporate pilot - pending", "Section"))
story.append(
    p(
        "The automated gate is pre-pilot evidence only. The human pilot requires "
        "nine employees: three per language, including new and experienced "
        "authors. Each employee must complete one standardized workflow and one "
        "real departmental workflow, producing 18 privacy-minimized observations."
    )
)
targets = [
    ["Target", "Required result"],
    ["Authorization and isolation", "Zero unauthorized mutations or cross-user exposure"],
    ["Committed facts", "Zero silent loss"],
    ["Lifecycle", "Zero automatic publication or activation"],
    ["Traceability", "100% from compiled behavior to committed facts"],
    ["Unaided completion", "At least 90% on the standardized task"],
    ["Dossier quality", "All critical facts present and no invented critical facts"],
    ["New guided authors", "Median standardized task time <= 15 minutes"],
    ["Experienced authors", "At least 30% faster than visual-builder baseline"],
    ["Initial brief recall", "At least 95% captured without being asked again"],
    ["Accessibility", "No critical failures"],
]
story.append(styled_table(targets, [78 * mm, 172 * mm], font_size=8))
story.append(p("Immediate stop criteria", "Section"))
story.append(
    p(
        "Stop new v2 sessions for any RLS bypass, cross-user transcript exposure, "
        "committed-fact loss, silent v1 reinterpretation, invented approver or "
        "critical workflow fact, missing mandatory requirement reported complete, "
        "nondeterministic compiler output, invalid publication, unapproved "
        "activation, non-approved privacy routing, or critical accessibility blocker."
    )
)
story.append(p("Remaining authorizations", "Section"))
story.append(
    p(
        "An authorized operator must separately approve an isolated authenticated "
        "Preview, any migration application, the provider/model privacy route, "
        "the pilot roster and data, and IT reviewer access. This work did not push, "
        "deploy, or apply migrations."
    )
)

csv_sha = hashlib.sha256(CSV_PATH.read_bytes()).hexdigest()
story.append(Spacer(1, 4 * mm))
story.append(
    p(
        f"Detailed CSV evidence: {CSV_PATH.name}<br/>SHA-256: {csv_sha}",
        "Small",
    )
)

doc.build(
    story,
    onFirstPage=page_footer,
    onLaterPages=page_footer,
    canvasmaker=InvariantCanvas,
)
print(json.dumps({"pdfPath": str(PDF_PATH), "pagesPrepared": True}, indent=2))
