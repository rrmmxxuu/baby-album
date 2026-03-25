import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "宝宝相册",
    short_name: "宝宝相册",
    description: "Self-hosted baby photo timeline with family RBAC",
    start_url: "/",
    display: "standalone",
    background_color: "#f6efe4",
    theme_color: "#b55233",
    icons: []
  };
}
