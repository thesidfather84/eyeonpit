import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EyeOnPit — Casino Surveillance & Blackjack Investigation",
    short_name: "EyeOnPit",
    description:
      "Professional casino surveillance and blackjack investigation software.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
