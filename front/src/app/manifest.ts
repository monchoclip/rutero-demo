import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ruts68 · Gestión de clientes",
    short_name: "Ruts68",
    description: "Cartera, agenda y seguimiento comercial para tu equipo.",
    start_url: "/app/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#10231e",
    lang: "es-CO",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
