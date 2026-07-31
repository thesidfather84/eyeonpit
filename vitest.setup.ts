import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, each render() in a React-rendering test (*.test.tsx) leaves
// its container mounted in document.body, so the next test's
// screen.getByTestId/getByText matches stale nodes from every prior test in
// the same file instead of just its own.
afterEach(() => {
  cleanup();
});
