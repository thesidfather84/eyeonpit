import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:brightness-110",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-raised",
  // Red, reserved strictly for destructive actions — plan.md §8.
  destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface-raised",
};

/**
 * Shared button primitive so every screen gets consistent tap-target sizing
 * and the same variant palette, rather than each component re-deriving
 * dark-theme button styles. Plan.md §8: red is reserved for `destructive`
 * only — no other variant may borrow it.
 */
export function Button({
  variant = "secondary",
  fullWidth,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`tap-target inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        VARIANT_CLASSES[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
