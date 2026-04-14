import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AWAKEN Admin",
  description: "AWAKEN site administration dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}