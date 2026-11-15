import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_CONFIG } from "@/lib/config";

export const metadata: Metadata = {
  title: APP_CONFIG.appName,
  description: `Team management app for ${APP_CONFIG.appName}`,
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#10b981",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
