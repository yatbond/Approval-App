import { CircleHelp } from "lucide-react";

export function InfoTip({ label }: { label: string }) {
  return (
    <span
      tabIndex={0}
      title={label}
      aria-label={label}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 text-neutral-500 transition hover:border-emerald-400/40 hover:text-emerald-200 focus:outline-none focus:ring-1 focus:ring-emerald-400/60"
    >
      <CircleHelp size={12} aria-hidden="true" />
    </span>
  );
}
