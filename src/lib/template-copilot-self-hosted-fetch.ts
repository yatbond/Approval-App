// llama.cpp-style servers read max_tokens, and Qwen-family models think unless
// told not to; thinking is far outside the provider timeout.
export async function selfHostedChatFetch(
  url: string | URL | Request,
  init?: RequestInit,
) {
  if (
    typeof init?.body !== "string" ||
    !String(url instanceof Request ? url.url : url).endsWith("/chat/completions")
  ) {
    return fetch(url, init);
  }
  const body = JSON.parse(init.body) as Record<string, unknown>;
  if (body.max_completion_tokens !== undefined && body.max_tokens === undefined) {
    body.max_tokens = body.max_completion_tokens;
  }
  body.chat_template_kwargs = {
    ...(body.chat_template_kwargs as Record<string, unknown> | undefined),
    enable_thinking: false,
  };
  return fetch(url, { ...init, body: JSON.stringify(body) });
}
