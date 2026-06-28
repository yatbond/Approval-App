import { hasSupabaseAuthCookie } from "./supabase/auth-cookies.ts";

type LogoutRouteCookie = {
  name: string;
};

export function shouldSignOutWithSupabase({
  cookies,
  supabaseUrl,
  supabaseKey,
}: {
  cookies: LogoutRouteCookie[];
  supabaseUrl?: string;
  supabaseKey?: string;
}) {
  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      hasSupabaseAuthCookie(cookies, supabaseUrl),
  );
}
