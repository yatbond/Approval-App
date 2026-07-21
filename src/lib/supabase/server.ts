import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";
import {
  verifiedUserEmailHeader,
  verifiedUserIdHeader,
} from "@/lib/supabase/verified-user-headers";
import {
  getDevelopmentAuthBypassUser,
  getLocalPerformanceAuthBypassUser,
  localPerformanceAuthHeader,
} from "@/lib/supabase/development-auth-bypass";

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Route handlers and actions can.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const requestHeaders = await headers();
  const performanceUser = getLocalPerformanceAuthBypassUser({
    enabled: process.env.LOCAL_PERFORMANCE_AUTH_ENABLED,
    email: process.env.LOCAL_PERFORMANCE_AUTH_EMAIL,
    expectedToken: process.env.LOCAL_PERFORMANCE_AUTH_TOKEN,
    requestToken: requestHeaders.get(localPerformanceAuthHeader),
    requestHost: requestHeaders.get("host"),
  });
  if (performanceUser) {
    return performanceUser;
  }

  const developmentUser = getDevelopmentAuthBypassUser({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.E2E_AUTH_BYPASS_EMAIL,
  });
  if (developmentUser) {
    return developmentUser;
  }

  const verifiedUserId = requestHeaders.get(verifiedUserIdHeader);
  const verifiedUserEmail = requestHeaders.get(verifiedUserEmailHeader);
  if (verifiedUserId && verifiedUserEmail) {
    return {
      id: verifiedUserId,
      email: verifiedUserEmail,
    };
  }

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!hasSupabaseAuthCookie(cookieStore.getAll(), supabaseUrl)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;

  if (!claimsError && claims?.sub && claims.email) {
    return {
      id: claims.sub,
      email: claims.email,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email || "" } : null;
}
