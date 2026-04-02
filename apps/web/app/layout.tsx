import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import "./globals.css";
import { ClientErrorReporter } from "../components/client-error-reporter";
import { PwaBoot } from "../components/pwa-boot";
import { AppSessionProvider } from "../components/app-shell/app-session-provider";
import { AppLoadingSkeleton } from "../components/app-shell/ui/loading-skeletons";
import { hasValidSession } from "../lib/session";

export const metadata: Metadata = {
  title: "宝宝相册 | Baby Album",
  description: "Self-hosted baby photo timeline with album membership and RBAC",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "宝宝相册"
  },
  icons: {
    apple: "/apple-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  },
  other: {
    "apple-mobile-web-app-capable": "yes"
  }
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f2f2f7"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const initialAuthenticated = hasValidSession(cookieStore);

  return (
    <html lang="zh-CN">
      <body>
        <PwaBoot />
        <ClientErrorReporter />
        <Suspense fallback={<main className="appShell"><AppLoadingSkeleton ariaLabel="正在加载宝宝相册" /></main>}>
          <AppSessionProvider initialAuthenticated={initialAuthenticated}>{children}</AppSessionProvider>
        </Suspense>
      </body>
    </html>
  );
}
