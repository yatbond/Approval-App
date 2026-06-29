import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Approval App",
  description: "Configurable approval workflow platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
