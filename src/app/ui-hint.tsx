"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useState } from "react";

const infoTipOpenEvent = "approval-info-tip-open";

export function InfoTip({ label }: { label: string }) {
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function closeWhenAnotherTipOpens(event: Event) {
      if ((event as CustomEvent<string>).detail !== tooltipId) {
        setIsOpen(false);
      }
    }

    window.addEventListener(infoTipOpenEvent, closeWhenAnotherTipOpens);
    return () => window.removeEventListener(infoTipOpenEvent, closeWhenAnotherTipOpens);
  }, [tooltipId]);

  function openTooltip() {
    window.dispatchEvent(new CustomEvent(infoTipOpenEvent, { detail: tooltipId }));
    setIsOpen(true);
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`More information: ${label}`}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={openTooltip}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={openTooltip}
        onBlur={() => setIsOpen(false)}
        className="inline-flex size-5 items-center justify-center rounded-full border border-[#d2d2d2] bg-white text-[#8a8a8a] transition hover:border-[#f7941d] hover:text-[#9b5200] focus:outline-none focus:ring-2 focus:ring-[#f7941d]/40"
      >
        <CircleHelp size={13} aria-hidden="true" />
      </button>
      {isOpen ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-max max-w-[min(16rem,calc(100vw-2rem))] border border-[#d2d2d2] bg-[#231f20] px-3 py-2 text-xs leading-5 text-white shadow-lg"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
