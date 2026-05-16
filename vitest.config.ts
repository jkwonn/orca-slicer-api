import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    include: ["tests/**/*.spec.ts"],
    setupFiles: "./tests/e2e/setup.ts",
    // The e2e specs drive the heavyweight, multi-threaded OrcaSlicer binary.
    // Running spec files in parallel spawns many OrcaSlicer processes at once,
    // contending for CPU/memory and making slow slices flaky. Run spec files
    // one at a time so the suite is deterministic; tests within a file already
    // run sequentially.
    fileParallelism: false,
    // This is an integration suite: tests spawn the OrcaSlicer binary and the
    // CLI as child processes (the latter via tsx, which transpiles on each
    // spawn). The default 5 s timeout is unrealistic for that work and races
    // the wall clock; 60 s gives ample headroom without masking a real hang.
    testTimeout: 60_000,
  },
});
