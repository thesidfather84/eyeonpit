"use client";

import { useActionState } from "react";
import { submitPasscode, type AccessFormState } from "./actions";

/** The passcode never touches localStorage or any client-side JS variable beyond this single controlled input's value while the operator is typing — it's submitted straight to the server action as FormData, and the only thing that ever comes back is a generic error string. */
export function AccessForm() {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(submitPasscode, null);

  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor="passcode" className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          className="tap-target rounded-xl border border-border bg-surface px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          placeholder="Enter access code"
        />
      </div>

      {state?.error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="tap-target flex items-center justify-center rounded-xl bg-accent text-sm font-semibold uppercase tracking-[0.1em] text-accent-foreground shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Checking…" : "Enter EyeOnPit"}
      </button>
    </form>
  );
}
