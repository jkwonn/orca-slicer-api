import { execFile } from "child_process";
import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { AppError } from "./errors";
import { getOrcaPath } from "./env";

/**
 * Low-level wrapper around the OrcaSlicer headless binary. Every OrcaSlicer
 * invocation in this project goes through {@link runOrca}; nothing else spawns
 * the slicer directly. The binary is always invoked with `execFile` (no shell)
 * so argument values never need escaping.
 */

export interface OrcaRunResult {
  /** Process exit code (`0` on success). */
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed `result.json` from the output directory, when one was written. */
  resultJson?: OrcaResultJson;
}

/** Shape of the `result.json` OrcaSlicer writes into `--outputdir`. */
export interface OrcaResultJson {
  error_string?: string;
  return_code?: number;
  plate_index?: number;
  export_time?: number;
  prepare_time?: number;
  sliced_plates?: Array<{
    id: number;
    triangle_count?: number;
    sliced_time?: number;
    warning_message?: string;
  }>;
}

export interface RunOrcaOptions {
  /** Timeout in milliseconds (default 10 minutes). */
  timeoutMs?: number;
  /** When set, `result.json` in this directory is parsed into the result. */
  outputDir?: string;
  /** Working directory for the process. */
  cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 64 * 1024 * 1024; // OrcaSlicer is chatty at trace level

/**
 * Run OrcaSlicer with the given argument array. Resolves with the captured
 * output regardless of exit code — callers inspect `code` / `resultJson` to
 * decide success. Only spawn/timeout failures reject.
 */
export async function runOrca(
  args: string[],
  options: RunOrcaOptions = {}
): Promise<OrcaRunResult> {
  const binary = getOrcaPath();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const run = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      execFile(
        binary,
        args,
        {
          encoding: "utf-8",
          timeout: timeoutMs,
          maxBuffer: MAX_BUFFER,
          cwd: options.cwd,
        },
        (error, stdout, stderr) => {
          if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(
              new AppError(
                500,
                "OrcaSlicer binary not found",
                `ORCASLICER_PATH=${binary} does not exist or is not executable`
              )
            );
            return;
          }
          if (error && (error as { killed?: boolean }).killed) {
            reject(
              new AppError(
                504,
                "OrcaSlicer timed out",
                `Exceeded ${timeoutMs} ms — try a coarser layer height or a simpler model`
              )
            );
            return;
          }
          // A non-zero exit is normal (e.g. validation failure); surface it.
          const code =
            error && typeof (error as { code?: number }).code === "number"
              ? ((error as { code?: number }).code as number)
              : error
                ? 1
                : 0;
          resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
        }
      );
    }
  );

  const result: OrcaRunResult = { ...run };

  if (options.outputDir) {
    result.resultJson = await readResultJson(options.outputDir);
  }

  return result;
}

/** Read and parse `result.json` from an output directory, or `undefined`. */
export async function readResultJson(
  outputDir: string
): Promise<OrcaResultJson | undefined> {
  try {
    const raw = await fs.readFile(path.join(outputDir, "result.json"), "utf-8");
    return JSON.parse(raw) as OrcaResultJson;
  } catch {
    return undefined;
  }
}

/**
 * Turn a failed {@link OrcaRunResult} into a descriptive {@link AppError}.
 * Prefers the slicer's own `error_string` over the raw process output.
 */
export function orcaFailure(result: OrcaRunResult): AppError {
  const slicerError = result.resultJson?.error_string;
  if (slicerError && slicerError !== "Success.") {
    return new AppError(422, `OrcaSlicer: ${slicerError}`);
  }
  const tail = (result.stderr || result.stdout)
    .split("\n")
    .filter((l) => /error|fail|cannot|invalid/i.test(l))
    .slice(-4)
    .join("; ")
    .trim();
  return new AppError(
    500,
    "OrcaSlicer did not complete successfully",
    tail || `exit code ${result.code}`
  );
}

let cachedVersion: string | undefined;

/**
 * OrcaSlicer version string, parsed from `--help` output (e.g. `2.3.1`).
 * Cached after the first successful call. Returns `"unknown"` on parse miss.
 */
export function getOrcaVersion(): string {
  if (cachedVersion) return cachedVersion;
  const binary = getOrcaPath();
  const help = execFileSync(binary, ["--help"], {
    encoding: "utf-8",
    timeout: 15000,
    maxBuffer: MAX_BUFFER,
  });
  const match = help.match(/OrcaSlicer-([\d.]+)/);
  cachedVersion = match ? match[1] : "unknown";
  return cachedVersion;
}
