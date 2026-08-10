import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Рядом — микрозадачи",
    short_name: "Рядом",
    description: "Найти помощь или подработку рядом с домом.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#064e3b",
    lang: "ru",
  };
}
