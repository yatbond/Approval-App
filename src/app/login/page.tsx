import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage() {
  const session = await getSessionUser();

  if (session) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#101214] p-4 text-neutral-100">
      <LoginForm />
    </main>
  );
}
