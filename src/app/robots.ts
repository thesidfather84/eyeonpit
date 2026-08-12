import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/investigations", "/settings"],
      },
    ],
    sitemap: "https://eyeonpit.com/sitemap.xml",
  };
}
