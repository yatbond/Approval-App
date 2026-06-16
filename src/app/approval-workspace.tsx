"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CalendarClock,
  Check,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  approvalTasks,
  departments,
  notifications,
  workflowTemplates,
} from "@/lib/mock-data";
import type { ApprovalAction, ApprovalTask } from "@/lib/types";

type Tab = "queue" | "upload" | "workflow" | "admin";

type ParseResult = {
  strategy: string;
  fields: Record<string, string>;
  confidence: Record<string, string>;
  notes: string[];
  tables?: { sheetName: string; rows: Record<string, unknown>[] }[];
};

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "queue", label: "Queue", icon: ClipboardList },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "workflow", label: "Workflow", icon: Settings },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];

const actionConfig: Record<
  ApprovalAction,
  { label: string; icon: React.ElementType; tone: string }
> = {
  approve: {
    label: "Approve",
    icon: Check,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
  },
  approve_with_comment: {
    label: "Approve with comment",
    icon: MessageSquare,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20",
  },
  reject_with_comment: {
    label: "Reject with comment",
    icon: X,
    tone: "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
  },
  reassign: {
    label: "Reassign",
    icon: ArrowRightLeft,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  },
  delegate: {
    label: "Delegate",
    icon: UserPlus,
    tone: "border-violet-500/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20",
  },
};

export default function ApprovalWorkspace({ initialTab }: { initialTab: Tab }) {
  const activeTab = initialTab;
  const [selectedTaskId, setSelectedTaskId] = useState(approvalTasks[0]?.id);
  const [comment, setComment] = useState("");
  const [activity, setActivity] = useState<string[]>([
    "APR-1048 submitted by Mandy Chan",
    "AI extraction completed for 3 fields",
    "Finance reviewer assigned",
  ]);
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  const selectedTask = useMemo(
    () => approvalTasks.find((task) => task.id === selectedTaskId) || approvalTasks[0],
    [selectedTaskId],
  );

  const unreadCount = notifications.filter((item) => item.unread).length;

  function recordAction(action: ApprovalAction) {
    const label = actionConfig[action].label;
    const suffix = comment.trim() ? `: ${comment.trim()}` : "";
    setActivity((items) => [
      `${label} recorded for ${selectedTask.id}${suffix}`,
      ...items,
    ]);
    setComment("");
  }

  async function parseFile(file: File) {
    setFileName(file.name);
    setParseError("");
    setIsParsing(true);
    setParseResult(null);
    setEditedFields({});

    const formData = new FormData();
    formData.append("file", file);
    formData.append("languageHint", "mixed English, Traditional Chinese, Simplified Chinese");

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to parse file.");
      }

      setParseResult(payload);
      setEditedFields(payload.fields || {});
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#101214] text-neutral-100">
      <div className="grid min-h-screen grid-cols-[76px_1fr] lg:grid-cols-[244px_1fr]">
        <aside className="border-r border-white/10 bg-[#171a1d]">
          <div className="flex h-16 items-center justify-center border-b border-white/10 lg:justify-start lg:px-5">
            <div className="flex size-10 items-center justify-center rounded-md bg-emerald-500 text-[#101214]">
              <ShieldCheck size={22} />
            </div>
            <div className="ml-3 hidden lg:block">
              <p className="text-sm font-semibold">Approval App</p>
              <p className="text-xs text-neutral-400">MVP workspace</p>
            </div>
          </div>

          <nav className="space-y-1 p-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={`/?tab=${tab.id}`}
                  title={tab.label}
                  className={`flex h-11 w-full items-center justify-center gap-3 rounded-md border px-3 text-sm transition lg:justify-start ${
                    active
                      ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                      : "border-transparent text-neutral-400 hover:border-white/10 hover:bg-white/5 hover:text-neutral-100"
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden lg:inline">{tab.label}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-16 flex-col justify-center gap-3 border-b border-white/10 bg-[#15181b] px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-normal md:text-2xl">
                General approval workflow
              </h1>
              <p className="text-sm text-neutral-400">
                Dynamic departments, AI/OCR parsing, approvals, delegation, deadlines, and escalation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm">
                <Bell size={16} className="text-amber-200" />
                <span>{unreadCount} unread</span>
              </div>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Plus size={16} />
                New request
              </button>
            </div>
          </header>

          <div className="p-4 md:p-6">
            {activeTab === "queue" && (
              <QueueView
                selectedTask={selectedTask}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                comment={comment}
                setComment={setComment}
                recordAction={recordAction}
                activity={activity}
              />
            )}

            {activeTab === "upload" && (
              <UploadView
                fileName={fileName}
                parseResult={parseResult}
                editedFields={editedFields}
                setEditedFields={setEditedFields}
                isParsing={isParsing}
                parseError={parseError}
                parseFile={parseFile}
              />
            )}

            {activeTab === "workflow" && <WorkflowView />}

            {activeTab === "admin" && <AdminView />}
          </div>
        </section>
      </div>
    </main>
  );
}

function QueueView({
  selectedTask,
  selectedTaskId,
  setSelectedTaskId,
  comment,
  setComment,
  recordAction,
  activity,
}: {
  selectedTask: ApprovalTask;
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  comment: string;
  setComment: (value: string) => void;
  recordAction: (action: ApprovalAction) => void;
  activity: string[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr_320px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Approval queue</h2>
          <p className="text-sm text-neutral-400">Pending, overdue, and escalated work.</p>
        </div>
        <div className="divide-y divide-white/10">
          {approvalTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`block w-full p-4 text-left transition ${
                selectedTaskId === task.id
                  ? "bg-emerald-400/10"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {task.id} - {task.department}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                <span>{task.currentStep}</span>
                <span>{task.due}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{selectedTask.title}</h2>
              <p className="text-sm text-neutral-400">
                {selectedTask.workflow} - requested by {selectedTask.requester}
              </p>
            </div>
            <div className="rounded-md border border-white/10 px-3 py-2 text-sm">
              {selectedTask.value}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Extracted draft</h3>
            <div className="space-y-2">
              {Object.entries(selectedTask.extractedFields).map(([label, value]) => (
                <div
                  key={label}
                  className="grid min-h-12 grid-cols-[140px_1fr] items-center gap-3 rounded-md border border-white/10 bg-[#121518] px-3 py-2 text-sm"
                >
                  <span className="text-neutral-400">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">Decision</h3>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comment for approval, rejection, reassignment, or delegation"
              className="h-32 w-full resize-none rounded-md border border-white/10 bg-[#121518] p-3 text-sm outline-none transition placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(Object.keys(actionConfig) as ApprovalAction[]).map((action) => {
                const Icon = actionConfig[action].icon;
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => recordAction(action)}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm transition ${actionConfig[action].tone}`}
                  >
                    <Icon size={15} />
                    {actionConfig[action].label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Activity</h2>
          <p className="text-sm text-neutral-400">Audit events for the selected item.</p>
        </div>
        <ol className="space-y-3 p-4">
          {activity.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-3 text-sm">
              <span className="mt-1 size-2 rounded-full bg-emerald-300" />
              <span className="text-neutral-300">{item}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function UploadView({
  fileName,
  parseResult,
  editedFields,
  setEditedFields,
  isParsing,
  parseError,
  parseFile,
}: {
  fileName: string;
  parseResult: ParseResult | null;
  editedFields: Record<string, string>;
  setEditedFields: (fields: Record<string, string>) => void;
  isParsing: boolean;
  parseError: string;
  parseFile: (file: File) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <section className="rounded-md border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-semibold">Upload document</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Photos use AI vision, PDFs are routed for OCR, and Excel files are parsed into tables.
        </p>

        <label className="mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-[#121518] p-6 text-center transition hover:border-emerald-400/60 hover:bg-emerald-400/5">
          {isParsing ? (
            <Loader2 className="mb-3 animate-spin text-emerald-200" size={28} />
          ) : (
            <Upload className="mb-3 text-neutral-300" size={28} />
          )}
          <span className="text-sm font-medium">
            {isParsing ? "Parsing document" : "Choose a file"}
          </span>
          <span className="mt-1 text-xs text-neutral-500">
            PDF, image, Excel, or CSV
          </span>
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                parseFile(file);
              }
            }}
          />
        </label>

        {fileName && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-white/10 bg-[#121518] p-3 text-sm">
            <FileText size={16} className="text-emerald-200" />
            <span className="truncate">{fileName}</span>
          </div>
        )}

        {parseError && (
          <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            {parseError}
          </div>
        )}
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Extraction draft</h2>
          <p className="text-sm text-neutral-400">
            Corrections here become training examples for workflow-specific extraction.
          </p>
        </div>

        <div className="p-4">
          {!parseResult && !isParsing && (
            <div className="grid min-h-72 place-items-center rounded-md border border-white/10 bg-[#121518] text-center text-sm text-neutral-500">
              <div>
                <div className="mb-3 flex justify-center gap-2">
                  <ImageIcon size={22} />
                  <FileText size={22} />
                  <FileSpreadsheet size={22} />
                </div>
                Upload a document to create an editable extraction draft.
              </div>
            </div>
          )}

          {parseResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md border border-white/10 bg-[#121518] px-3 py-1">
                  Strategy: {parseResult.strategy}
                </span>
                {parseResult.notes.map((note) => (
                  <span
                    key={note}
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
                  >
                    {note}
                  </span>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(editedFields).map(([label, value]) => (
                  <label key={label} className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{label}</span>
                    <input
                      value={value}
                      onChange={(event) =>
                        setEditedFields({
                          ...editedFields,
                          [label]: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                  </label>
                ))}
              </div>

              {parseResult.tables?.[0] && (
                <div className="overflow-hidden rounded-md border border-white/10">
                  <div className="border-b border-white/10 bg-[#121518] px-3 py-2 text-sm">
                    {parseResult.tables[0].sheetName}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <tbody>
                        {parseResult.tables[0].rows.slice(0, 8).map((row, index) => (
                          <tr key={index} className="border-b border-white/10 last:border-0">
                            {Object.values(row)
                              .slice(0, 6)
                              .map((value, cellIndex) => (
                                <td key={cellIndex} className="px-3 py-2 text-neutral-300">
                                  {String(value)}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
              >
                <Send size={16} />
                Submit for review
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function WorkflowView() {
  const workflow = workflowTemplates[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">{workflow.name}</h2>
          <p className="text-sm text-neutral-400">
            {workflow.department} - {workflow.documentTypes.join(", ")}
          </p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">
              Fields to parse
            </h3>
            <div className="space-y-2">
              {workflow.fields.map((field) => (
                <div
                  key={field.name}
                  className="rounded-md border border-white/10 bg-[#121518] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{field.label}</p>
                    <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-400">
                      {field.source}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">{field.instructions}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-neutral-300">
              Approval path
            </h3>
            <div className="space-y-3">
              {workflow.steps.map((step, index) => (
                <div
                  key={step.name}
                  className="rounded-md border border-white/10 bg-[#121518] p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-400/15 text-sm text-emerald-100">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{step.name}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {step.role} - due in {step.dueInHours}h - escalate to{" "}
                        {step.escalationRole}
                      </p>
                      <p className="mt-2 text-xs text-amber-100">
                        Branch: {step.condition}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
        <h2 className="font-semibold">Template settings</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Workflow name</span>
            <input
              defaultValue={workflow.name}
              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Branch rule</span>
            <input
              defaultValue="invoice_total >= 10000"
              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Default deadline</span>
            <input
              defaultValue="48 hours"
              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
            />
          </label>
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
          >
            <Plus size={16} />
            Add step
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminView() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">Departments</h2>
          <p className="text-sm text-neutral-400">
            Seeded list now, editable list after Supabase is connected.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {departments.map((department) => (
            <div
              key={department}
              className="flex h-24 flex-col justify-between rounded-md border border-white/10 bg-[#121518] p-3"
            >
              <span className="text-sm font-medium">{department}</span>
              <span className="text-xs text-neutral-500">Active</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">In-app notifications</h2>
          <div className="mt-3 space-y-2">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-white/10 bg-[#121518] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.unread && <span className="size-2 rounded-full bg-amber-300" />}
                </div>
                <p className="mt-1 text-xs text-neutral-400">{item.body}</p>
                <p className="mt-2 text-xs text-neutral-500">{item.time}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-semibold">Delegation</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Delegate to</span>
              <input
                defaultValue="Alex Ho"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Period</span>
              <input
                defaultValue="2026-06-19 to 2026-06-26"
                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
              />
            </label>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 text-sm text-sky-100 transition hover:bg-sky-400/20"
            >
              <CalendarClock size={16} />
              Save delegation
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalTask["status"] }) {
  if (status === "overdue") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
        <AlertTriangle size={12} />
        Overdue
      </span>
    );
  }

  if (status === "escalated") {
    return (
      <span className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
        <RotateCcw size={12} />
        Escalated
      </span>
    );
  }

  return (
    <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
      Pending
    </span>
  );
}
