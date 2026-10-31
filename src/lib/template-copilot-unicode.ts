/** Bounded source size shared by narrative and governed document evidence. */
export const templateCopilotMaximumSourceCodePoints = 80_000;

/** Counts Unicode code points rather than JavaScript UTF-16 code units. */
export function templateCopilotUnicodeCodePointCount(input: string) {
  return Array.from(input).length;
}
