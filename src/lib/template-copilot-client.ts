export async function fetchTemplateCopilotApi<
  Payload extends Record<string, unknown>,
>(path: string): Promise<Payload> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as Payload & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message || "The Template Copilot request failed.",
    );
  }
  return payload;
}
