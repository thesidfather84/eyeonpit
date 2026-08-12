// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("Hero — homepage Launch button (1.4.1 access-control patch)", () => {
  it('"Launch EyeOnPit" routes to /access, not directly to /app', () => {
    render(<Hero />);
    const launchLink = screen.getByRole("link", { name: "Launch EyeOnPit" });
    expect(launchLink.getAttribute("href")).toBe("/access");
  });

  it('"Request a Demo" is unaffected by the access-control patch (still a plain mailto link, no passcode gating a demo request)', () => {
    render(<Hero />);
    const demoLink = screen.getByRole("link", { name: "Request a Demo" });
    expect(demoLink.getAttribute("href")).toMatch(/^mailto:/);
  });

  it('"Request a Demo" uses the contact@eyeonpit.com address', () => {
    render(<Hero />);
    const demoLink = screen.getByRole("link", { name: "Request a Demo" });
    expect(demoLink.getAttribute("href")).toBe("mailto:contact@eyeonpit.com?subject=EyeOnPit%20Demo%20Request");
  });
});
