import type { MetadataRoute } from "next";

const SITE_URL = "https://eyeonpit.com";

const DOC_PATHS = [
  "",
  "getting-started",
  "voice",
  "quick",
  "advanced",
  "practice",
  "faq",
  "troubleshooting",
  "release-notes",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    ...DOC_PATHS.map((path) => ({
      url: `${SITE_URL}/docs${path ? `/${path}` : ""}`,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 0.8 : 0.6,
    })),
  ];
}
