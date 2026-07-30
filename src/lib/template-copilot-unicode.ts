/** Counts Unicode code points rather than JavaScript UTF-16 code units. */
export function templateCopilotUnicodeCodePointCount(input: string) {
  return Array.from(input).length;
}
