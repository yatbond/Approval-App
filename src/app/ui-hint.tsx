import { CircleHelp } from "lucide-react";

export function InfoTip({ label }: { label: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <span
        tabIndex={0}
        title={label}
        aria-label={label}
        className="inline-flex size-5 items-center justify-center rounded-full border border-[#d2d2d2] bg-white text-[#8a8a8a] transition hover:border-[#f7941d] hover:text-[#9b5200] focus:outline-none focus:ring-2 focus:ring-[#f7941d]/40"
      >
        <CircleHelp size={13} aria-hidden="true" />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] border border-[#d2d2d2] bg-[#231f20] px-3 py-2 text-xs leading-5 text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}
