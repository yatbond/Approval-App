export function GET() {
  return new Response("<!doctype html><title>ok</title><h1>ok</h1>", {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
