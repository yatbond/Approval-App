import { redirect } from "next/navigation";
import { clearSession } from "@/lib/auth";

export async function GET() {
  await clearSession();
  redirect("/login");
}
