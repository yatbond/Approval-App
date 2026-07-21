export type BoundedBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "too_large" };

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult<unknown>> {
  const body = await readBoundedBytes(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.value)) as unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult<FormData>> {
  const body = await readBoundedBytes(request, maxBytes);
  if (!body.ok) return body;
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const normalizedBody = new Uint8Array(body.value.byteLength);
    normalizedBody.set(body.value);
    const parsed = new Request("http://bounded-body.local", {
      method: "POST",
      headers: { "content-type": contentType },
      body: normalizedBody.buffer,
    });
    return { ok: true, value: await parsed.formData() };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

async function readBoundedBytes(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult<Uint8Array>> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, value: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: combined };
}
