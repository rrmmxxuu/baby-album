import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "宝宝相册",
    short_name: "宝宝相册",
    description: "Self-hosted baby photo timeline with album membership and RBAC",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "zh-CN",
    background_color: "#f6efe4",
    theme_color: "#b55233",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
