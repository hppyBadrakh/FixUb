import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FixUB — Хотын асуудлыг хамтдаа шийдье",
    short_name: "FixUB",
    description:
      "Улаанбаатарын дэд бүтцийн асуудлыг мэдээлж, явцыг нь хянах платформ. Report and track public infrastructure problems in Ulaanbaatar.",
    lang: "mn",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2c5aa8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
