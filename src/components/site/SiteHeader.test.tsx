// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

const EXPECTED_MAILTO = "mailto:contact@eyeonpit.com?subject=EyeOnPit%20Demo%20Request";

describe("SiteHeader — Request a Demo contact address (desktop and mobile)", () => {
  it("the desktop nav's Request a Demo link uses contact@eyeonpit.com", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "Request a Demo" });
    expect(link.getAttribute("href")).toBe(EXPECTED_MAILTO);
  });

  it("the mobile menu's Request a Demo link ALSO uses contact@eyeonpit.com once opened", async () => {
    render(<SiteHeader />);
    const menuButton = screen.getByRole("button", { name: "Open menu" });

    await act(async () => {
      menuButton.click();
    });

    // Both the (CSS-hidden) desktop copy and the now-visible mobile copy
    // exist in the DOM simultaneously once the mobile panel is open —
    // every "Request a Demo" link present must point to the same address.
    const links = screen.getAllByRole("link", { name: "Request a Demo" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(EXPECTED_MAILTO);
    }
  });
});
