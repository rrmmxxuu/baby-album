import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaBoot } from "../components/pwa-boot";

export const metadata: Metadata = {
  title: "宝宝相册 | Baby Album",
  description: "Self-hosted baby photo timeline with album membership and RBAC",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f1ddc8"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaBoot />
        {children}
      </body>
    </html>
  );
}
