import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LogIn, UserPlus } from "lucide-react";
import Image from "next/image";
import { ThemeToggle } from "@/app/theme-toggle";

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
    <main className="relative grid min-h-screen place-items-center border-t-4 border-[#f7941d] bg-[#f7f7f5] p-4 text-[#231f20]">
      <ThemeToggle className="absolute right-4 top-4" />
      <form
        action={setupMode ? "/api/auth/sign-up" : "/api/auth/sign-in"}
        method="post"
        className="w-full max-w-sm rounded-md border border-[#d2d2d2] bg-white p-6 shadow-[0_12px_30px_rgba(35,31,32,0.08)]"
      >
        <div className="mb-6 border-b border-[#e6e6e6] pb-5">
          <span data-brand-logo className="inline-flex rounded-sm bg-white p-1">
            <Image
              src="/chunwo-logo.svg"
              alt="Chun Wo"
              width={180}
              height={48}
              priority
              className="h-auto w-[180px] dark:hidden"
            />
            <Image
              src="/chunwo-logo-dark.svg"
              alt="Chun Wo"
              width={180}
              height={48}
              priority
              className="hidden h-auto w-[180px] dark:block"
            />
          </span>
          <div className="mt-5 border-l-2 border-[#f7941d] pl-3">
            <h1 className="text-lg font-bold">Approvals</h1>
            <p className="text-sm text-[#666162]">
              {setupMode ? "Administrator setup" : "Sign in to continue"}
            </p>
          </div>
        </div>

        {setupMode && (
          <label className="block">
            <span className="mb-1 block text-xs text-[#666162]">Name</span>
            <input
              name="fullName"
              autoComplete="name"
              className="h-11 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm outline-none transition focus:border-[#f7941d]"
              required
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-[#666162]">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            className="h-11 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm outline-none transition focus:border-[#f7941d]"
            required
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-[#666162]">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-11 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm outline-none transition focus:border-[#f7941d]"
            required
          />
        </label>

        {params.error && (
          <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-50 p-3 text-sm text-rose-800">
            {params.error}
          </div>
        )}

        {params.message === "check-email" && (
          <div className="mt-3 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] p-3 text-sm text-[#653a08]">
            Confirm email, then sign in.
          </div>
        )}

        <button
          type="submit"
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#e6810c] bg-[#f7941d] px-3 text-sm font-medium text-[#231f20] transition hover:bg-[#e6810c]"
        >
          {setupMode ? <UserPlus size={16} /> : <LogIn size={16} />}
          {setupMode ? "Create admin" : "Sign in"}
        </button>

        <div className="mt-4 text-center text-sm text-[#666162]">
          {setupMode ? (
            <a className="font-medium text-[#7b791c] hover:text-[#4d4c10]" href="/login">
              Sign in
            </a>
          ) : (
            <a
              className="font-medium text-[#7b791c] hover:text-[#4d4c10]"
              href="/login?mode=setup"
            >
              Create admin
            </a>
          )}
        </div>
      </form>
    </main>
  );
}
