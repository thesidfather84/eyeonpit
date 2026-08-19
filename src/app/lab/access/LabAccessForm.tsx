"use client";

import { useActionState } from "react";
import { submitLabPasscode, type LabAccessFormState } from "./actions";

/** Mirrors src/app/access/AccessForm.tsx exactly — see that file's own doc comment. The lab passcode never touches localStorage or any client-side JS variable beyond this one controlled input while typing. */
export function LabAccessForm() {
  const [state, formAction, pending] = useActionState<LabAccessFormState, FormData>(submitLabPasscode, null);

  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor="lab-passcode" className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Lab Passcode
        </label>
        <input
          id="lab-passcode"
          name="passcode"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          className="tap-target rounded-xl border border-border bg-surface px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          placeholder="Enter lab passcode"
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
        {pending ? "Checking…" : "Enter the Lab"}
      </button>
    </form>
  );
}
