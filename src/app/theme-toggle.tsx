"use client";

import { Moon, Sun } from "lucide-react";
import { useAppTheme } from "./use-app-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useAppTheme();
  const switchingTo = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${switchingTo} mode`}
      aria-label={`Switch to ${switchingTo} mode`}
      aria-pressed={theme === "dark"}
      className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white text-[#4b4647] transition hover:border-[#f7941d] hover:bg-[#fff8ef] ${className}`}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
