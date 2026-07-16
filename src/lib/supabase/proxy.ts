import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import { createVerifiedSessionCache } from "@/lib/supabase/verified-session-cache";
import {
  verifiedUserEmailHeader,
  verifiedUserIdHeader,
} from "@/lib/supabase/verified-user-headers";

const verifiedSessionCache = createVerifiedSessionCache();

function getSessionCacheKey(request: NextRequest) {
  return request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-") && name.includes("auth-token"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, value }) => `${name}=${value}`)
    .join(";");
}

function createUpstreamResponse(requestHeaders: Headers) {
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Never trust identity headers supplied by the browser.
  requestHeaders.delete(verifiedUserIdHeader);
  requestHeaders.delete(verifiedUserEmailHeader);
  let supabaseResponse = createUpstreamResponse(requestHeaders);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  if (!hasSupabaseAuthCookie(request.cookies.getAll(), supabaseUrl)) {
    return supabaseResponse;
  }

  const sessionCacheKey = getSessionCacheKey(request);
  const cachedUser = verifiedSessionCache.get(sessionCacheKey);
  if (cachedUser) {
    requestHeaders.set(verifiedUserIdHeader, cachedUser.id);
    requestHeaders.set(verifiedUserEmailHeader, cachedUser.email);
    return createUpstreamResponse(requestHeaders);
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = createUpstreamResponse(requestHeaders);
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | { sub?: string; email?: string; exp?: number }
    | undefined;
  let verifiedUser =
    !error && claims?.sub && claims.email
      ? { id: claims.sub, email: claims.email }
      : null;

  if (error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    verifiedUser = user?.email ? { id: user.id, email: user.email } : null;
  }

  if (verifiedUser) {
    verifiedSessionCache.set({
      cacheKey: sessionCacheKey,
      expiresAt: claims?.exp ? claims.exp * 1000 : undefined,
      user: verifiedUser,
    });
    requestHeaders.set(verifiedUserIdHeader, verifiedUser.id);
    requestHeaders.set(verifiedUserEmailHeader, verifiedUser.email);
    const verifiedResponse = createUpstreamResponse(requestHeaders);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      verifiedResponse.cookies.set(cookie);
    });
    return verifiedResponse;
  }

  return supabaseResponse;
}
