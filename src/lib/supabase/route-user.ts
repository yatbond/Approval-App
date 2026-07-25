import type { createSupabaseRouteClient } from "./route.ts";

type SupabaseRouteClient = ReturnType<typeof createSupabaseRouteClient>;

export type SupabaseRouteUser = {
  id: string;
  email: string;
};

export async function getSupabaseRouteUser(
  supabase: SupabaseRouteClient,
): Promise<SupabaseRouteUser | null> {
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
  return user?.email ? { id: user.id, email: user.email } : null;
}
