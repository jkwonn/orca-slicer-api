import { existsSync } from "fs";
import * as path from "path";
import { AppError } from "./errors";

/**
 * Centralised environment / configuration access for the OrcaSlicer API and
 * CLI. Both entry points read the same variables so behaviour is identical no
 * matter which one drives a slice.
 *
 * - `ORCASLICER_PATH` — absolute path to the OrcaSlicer binary (or a launcher
 *   wrapper). Required for slicing, model info and conversion.
 * - `DATA_PATH`       — base directory holding `printers/`, `presets/` and
 *   `filaments/` profile JSON files. Defaults to `<cwd>/data`.
 * - `PORT`            — HTTP port for `serve` (default 3000).
 */

let envFileLoaded = false;

/**
 * Load a `.env` file once, if present. The HTTP server is normally started
 * with `node --env-file=.env`; the CLI is not, so it loads the file itself.
 * Safe to call repeatedly.
 */
export function loadEnv(cwd: string = process.cwd()): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  const candidates = [
    path.join(cwd, ".env"),
    path.join(getProjectRoot(), ".env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
        return;
      } catch {
        // ignore — fall through to next candidate / process env
      }
    }
  }
}

/** Repository root (one level above the compiled `src`/`dist` directory). */
export function getProjectRoot(): string {
  // `import.meta.url` points at .../src/core/env.ts (dev) or .../dist/src/core/env.js (build).
  const here = new URL(".", import.meta.url).pathname;
  // .../src/core/  ->  repo root is two levels up; .../dist/src/core/ -> three.
  let dir = path.resolve(here);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/** Resolved data directory for profile storage. Always returns a path. */
export function getDataPath(): string {
  return process.env.DATA_PATH || path.join(process.cwd(), "data");
}

/**
 * Resolved OrcaSlicer binary path. Throws an {@link AppError} when unset so
 * callers get a clear, actionable message instead of an ENOENT spawn failure.
 */
export function getOrcaPath(): string {
  const p = process.env.ORCASLICER_PATH;
  if (!p) {
    throw new AppError(
      500,
      "OrcaSlicer is not configured",
      "Set the ORCASLICER_PATH environment variable to the OrcaSlicer binary or launcher"
    );
  }
  return p;
}

/** OrcaSlicer path or `null` if unset (for health checks that must not throw). */
export function getOrcaPathOrNull(): string | null {
  return process.env.ORCASLICER_PATH || null;
}

/** HTTP port for the `serve` command / standalone server. */
export function getPort(): number {
  const raw = Number(process.env.PORT);
  return Number.isFinite(raw) && raw > 0 ? raw : 3000;
}
