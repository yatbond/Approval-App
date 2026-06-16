import { NextResponse } from "next/server";
import {
  cookieName,
  createSessionToken,
  getSessionCookieOptions,
  validateSuperuser,
} from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const baseUrl = new URL(request.url);

  if (!validateSuperuser(username, password)) {
    return NextResponse.redirect(new URL("/login?error=invalid", baseUrl), {
      status: 303,
    });
  }

  const response = NextResponse.redirect(new URL("/", baseUrl), { status: 303 });
  response.cookies.set(
    cookieName,
    createSessionToken(username),
    getSessionCookieOptions(),
  );

  return response;
}
