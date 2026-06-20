type CookieName = {
  name: string;
};

export function hasSupabaseAuthCookie(
  cookies: CookieName[],
  supabaseUrl?: string,
) {
  const projectRef = getSupabaseProjectRef(supabaseUrl);
  const projectAuthCookiePrefix = projectRef
    ? `sb-${projectRef}-auth-token`
    : "";

  return cookies.some((cookie) => {
    if (projectAuthCookiePrefix && cookie.name.startsWith(projectAuthCookiePrefix)) {
      return true;
    }

    return cookie.name.startsWith("sb-") && cookie.name.includes("auth-token");
  });
}

function getSupabaseProjectRef(supabaseUrl?: string) {
  if (!supabaseUrl) {
    return "";
  }

  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}
