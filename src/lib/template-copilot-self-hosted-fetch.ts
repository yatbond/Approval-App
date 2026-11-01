// llama.cpp-style servers read max_tokens, sample at temperature 1.0 unless told
// otherwise, and Qwen-family models think unless told not to; thinking is far
// outside the provider timeout.
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
  // The server default is a sampling temperature of 1.0; extraction must repeat.
  if (body.temperature === undefined) body.temperature = 0;
  body.chat_template_kwargs = {
    ...(body.chat_template_kwargs as Record<string, unknown> | undefined),
    enable_thinking: false,
  };
  return fetch(url, { ...init, body: JSON.stringify(body) });
}
