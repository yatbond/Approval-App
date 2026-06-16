import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LogIn, ShieldCheck } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionUser();
  const params = await searchParams;

  if (session) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#101214] p-4 text-neutral-100">
      <form
        action="/api/login"
        method="post"
        className="w-full max-w-sm rounded-md border border-white/10 bg-white/[0.04] p-5"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-emerald-500 text-[#101214]">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Approval App</h1>
            <p className="text-sm text-neutral-400">Superuser sign in</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Account</span>
          <input
            name="username"
            autoComplete="username"
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

        {params.error === "invalid" && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
            Invalid username or password.
          </div>
        )}

        <button
          type="submit"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
        >
          <LogIn size={16} />
          Sign in
        </button>
      </form>
    </main>
  );
}
