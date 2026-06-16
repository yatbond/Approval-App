import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LogIn, ShieldCheck, UserPlus } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const setupMode = params.mode === "setup";

  if (user) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#101214] p-4 text-neutral-100">
      <form
        action={setupMode ? "/api/auth/sign-up" : "/api/auth/sign-in"}
        method="post"
        className="w-full max-w-sm rounded-md border border-white/10 bg-white/[0.04] p-5"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-emerald-500 text-[#101214]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Approval App</h1>
            <p className="text-sm text-neutral-400">
              {setupMode ? "Create first admin" : "Sign in with email"}
            </p>
          </div>
        </div>

        {setupMode && (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-400">Full name</span>
            <input
              name="fullName"
              autoComplete="name"
              className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
              required
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
            required
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-neutral-400">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none transition focus:border-emerald-400/60"
            required
          />
        </label>

        {params.error && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            {params.error}
          </div>
        )}

        {params.message === "check-email" && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Check your email to confirm the account, then sign in.
          </div>
        )}

        <button
          type="submit"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
        >
          {setupMode ? <UserPlus size={16} /> : <LogIn size={16} />}
          {setupMode ? "Create admin account" : "Sign in"}
        </button>

        <div className="mt-4 text-center text-sm text-neutral-400">
          {setupMode ? (
            <a className="text-emerald-200 hover:text-emerald-100" href="/login">
              I already have an account
            </a>
          ) : (
            <a
              className="text-emerald-200 hover:text-emerald-100"
              href="/login?mode=setup"
            >
              First time? Create admin account
            </a>
          )}
        </div>
      </form>
    </main>
  );
}
