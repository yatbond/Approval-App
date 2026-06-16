"use server";

import { redirect } from "next/navigation";
import { createSession, validateSuperuser } from "@/lib/auth";

export async function loginAction(
  _previousState: { error: string },
  formData: FormData,
) {
  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");

  if (!validateSuperuser(username, password)) {
    return { error: "Invalid username or password." };
  }

  await createSession(username);
  redirect("/");
}
