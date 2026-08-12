// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessForm } from "./AccessForm";

const submitPasscodeMock = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  submitPasscode: submitPasscodeMock,
}));

afterEach(() => {
  submitPasscodeMock.mockReset();
});

describe("AccessForm", () => {
  it("renders a passcode field and the Enter EyeOnPit button, no error shown initially", async () => {
    render(<AccessForm />);

    const input = screen.getByLabelText("Passcode") as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("password");
    screen.getByRole("button", { name: "Enter EyeOnPit" }); // throws if absent
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it('displays "Incorrect access code." when the action returns an error, without revealing any other detail', async () => {
    submitPasscodeMock.mockResolvedValue({ error: "Incorrect access code." });

    const { container } = render(<AccessForm />);
    const input = screen.getByLabelText("Passcode") as HTMLInputElement;
    const form = container.querySelector("form")!;

    await act(async () => {
      input.value = "000000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.requestSubmit();
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Incorrect access code.");
    expect(submitPasscodeMock).toHaveBeenCalled();
  });

  it("the passcode input is never pre-filled and never echoes a previous value back after a failed attempt", async () => {
    submitPasscodeMock.mockResolvedValue({ error: "Incorrect access code." });
    render(<AccessForm />);
    const input = screen.getByLabelText("Passcode") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it('does NOT render any "Try Practice Mode" or other passcode-bypass control — Practice Mode is not currently isolated at the routing/data-access level, so it stays behind this same gate (see the 1.4.1 patch notes)', () => {
    render(<AccessForm />);
    expect(screen.queryByText(/practice/i)).toBeNull();
  });
});
