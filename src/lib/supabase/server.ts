import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookies";

export async function createSupabaseServerClient() {
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
