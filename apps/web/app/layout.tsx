import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宝宝相册 | Baby Album",
  description: "Self-hosted baby photo timeline with family RBAC"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

