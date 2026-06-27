export function getTrackingHandoffPanelState({
  isExpanded,
  participantCount,
  hiddenFieldCount,
  hiddenAttachmentCount,
}: {
  isExpanded: boolean;
  participantCount: number;
  hiddenFieldCount: number;
  hiddenAttachmentCount: number;
}) {
  const hiddenSummary = [
    hiddenFieldCount ? `${hiddenFieldCount} hidden value(s)` : "",
    hiddenAttachmentCount ? `${hiddenAttachmentCount} hidden document(s)` : "",
  ].filter(Boolean);

  return {
    isVisible: isExpanded,
    toggleLabel: isExpanded ? "Hide" : "Show",
    ariaLabel: isExpanded
      ? "Hide handoff and visibility"
      : "Show handoff and visibility",
    summary: [`${participantCount} viewer(s)`, ...hiddenSummary].join(", "),
  };
}
