import { NextResponse } from "next/server.js";

export function createSupabaseJsonResponse<Body>(
  cookieSource: NextResponse,
  body: Body,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  return copySupabaseResponseCookies(cookieSource, response);
}

export function copySupabaseResponseCookies<T extends NextResponse>(
  cookieSource: NextResponse,
  response: T,
) {
  cookieSource.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
