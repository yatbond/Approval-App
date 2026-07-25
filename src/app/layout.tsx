import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { appThemeStorageKey } from "@/lib/theme-state";

export const metadata: Metadata = {
  title: "Chun Wo Approvals",
  description: "Chun Wo approval workflow platform",
};

const initializeTheme = `
  (() => {
    try {
      const savedTheme = window.localStorage.getItem(${JSON.stringify(appThemeStorageKey)});
      const theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      document.documentElement.dataset.theme = theme;
    } catch {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full flex flex-col antialiased">
        {children}
        <Script
          id="approval-app-theme-initializer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: initializeTheme }}
        />
      </body>
    </html>
  );
}
