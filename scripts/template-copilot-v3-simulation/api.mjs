// HTTP client for the simulated-user runs: a real signed-in admin user (cookie
// session, exactly as the browser has it) talking to the app's own routes.
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function connectSimulatedUser({
  appUrl,
  supabaseUrl,
  anonKey,
  serviceKey,
  label = "sim",
}) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/u.test(supabaseUrl)) {
    throw new Error("Simulated users only run against a local Supabase.");
  }
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `${label}-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`;
  const password = `Sim-${randomBytes(12).toString("base64url")}!9a`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Simulated Author" },
  });
  if (createError || !created.user) throw new Error(`createUser: ${createError?.message}`);
  const userId = created.user.id;
  const profile = {
    id: userId,
    email,
    full_name: "Simulated Author",
    role: "superuser",
    is_admin: true,
    is_active: true,
  };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await service.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const { data: existing } = await service.from("profiles").select("id").eq("id", userId).maybeSingle();
  const { error: profileError } = existing
    ? await service.from("profiles").update(profile).eq("id", userId)
    : await service.from("profiles").insert(profile);
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  let { data: unit } = await service.from("business_units").select("id").eq("is_active", true).limit(1).maybeSingle();
  if (!unit) {
    const inserted = await service.from("business_units").insert({ name: "Simulation Unit", is_active: true }).select("id").single();
    if (inserted.error) throw new Error(`business unit: ${inserted.error.message}`);
    unit = inserted.data;
  }
  let { data: department } = await service
    .from("business_departments")
    .select("name")
    .eq("business_unit_id", unit.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!department) {
    const inserted = await service
      .from("business_departments")
      .insert({ business_unit_id: unit.id, name: "Simulation Department", is_active: true })
      .select("name")
      .single();
    if (inserted.error) throw new Error(`department: ${inserted.error.message}`);
    department = inserted.data;
  }

  const jar = new Map();
  const browserLike = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: signInError } = await browserLike.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign in: ${signInError.message}`);

  async function call(method, path, body, extraHeaders = {}) {
    const started = Date.now();
    const response = await fetch(`${appUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep text */ }
    return { status: response.status, json, text: json ? undefined : text.slice(0, 500), ms: Date.now() - started };
  }

  return Object.freeze({
    userId,
    email,
    businessUnitId: unit.id,
    departmentName: department.name,
    service,
    call,
    newKey: (prefix) => `${prefix}-${randomUUID().slice(0, 12)}`,
  });
}
