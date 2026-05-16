import { parseArgs, type ParseArgsConfig } from "util";
import { AppError } from "../core/errors";

/**
 * Shared CLI helpers: argument parsing, output formatting and consistent
 * error / exit-code handling for every `osa` subcommand.
 */

/** True unless the terminal opted out of colour (`NO_COLOR`) or is not a TTY. */
const useColor = !process.env.NO_COLOR && process.stdout.isTTY === true;

function paint(code: string, text: string): string {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const color = {
  bold: (t: string) => paint("1", t),
  dim: (t: string) => paint("2", t),
  red: (t: string) => paint("31", t),
  green: (t: string) => paint("32", t),
  yellow: (t: string) => paint("33", t),
  cyan: (t: string) => paint("36", t),
};

/** Print an informational line to stdout (suppressed by `--quiet`). */
export function info(message: string, quiet = false): void {
  if (!quiet) process.stdout.write(message + "\n");
}

/** Print to stderr. */
export function warn(message: string): void {
  process.stderr.write(message + "\n");
}

/** Pretty-print a value as JSON to stdout. */
export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/**
 * Render a list of `[key, value]` rows as an aligned two-column table.
 */
export function keyValueTable(rows: Array<[string, string]>): string {
  const width = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  return rows
    .map(([k, v]) => `  ${color.dim(k.padEnd(width))}  ${v}`)
    .join("\n");
}

/** Render an array of strings as a simple bulleted list. */
export function bulletList(items: string[]): string {
  if (items.length === 0) return color.dim("  (none)");
  return items.map((i) => `  ${color.cyan("•")} ${i}`).join("\n");
}

/** Format a duration in seconds as `1h 23m 45s`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : "", `${sec}s`]
    .filter(Boolean)
    .join(" ");
}

/** Format a byte count as a human-readable size. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Thin wrapper around `util.parseArgs` that turns its low-level errors into
 * {@link AppError}s with a friendly message.
 */
export function parse(
  argv: string[],
  options: ParseArgsConfig["options"],
  allowPositionals = true
): { values: Record<string, unknown>; positionals: string[] } {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options,
      allowPositionals,
      strict: true,
    });
    return { values: values as Record<string, unknown>, positionals };
  } catch (error) {
    throw new AppError(
      400,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Read a string option, or `undefined`. */
export function str(
  values: Record<string, unknown>,
  key: string
): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

/** Read a numeric option, validating it parses. */
export function num(
  values: Record<string, unknown>,
  key: string
): number | undefined {
  const v = values[key];
  if (v === undefined) return undefined;
  const n = parseFloat(String(v));
  if (!Number.isFinite(n)) {
    throw new AppError(400, `Option --${key} must be a number`);
  }
  return n;
}

/** Read a boolean flag (default false). */
export function bool(values: Record<string, unknown>, key: string): boolean {
  return values[key] === true;
}

/** Read a repeatable string option as an array. */
export function list(
  values: Record<string, unknown>,
  key: string
): string[] {
  const v = values[key];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") return [v];
  return [];
}

/** Parse a comma-separated integer list (`"3,5,10"`). */
export function intList(input: string | undefined): number[] | undefined {
  if (!input) return undefined;
  const nums = input
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

/**
 * Run a command body, mapping the result / errors onto a process exit code:
 *   0 — success
 *   1 — user / input error (4xx)
 *   2 — internal / slicer error (5xx)
 */
export async function runCommand(
  body: () => Promise<number | void>
): Promise<number> {
  try {
    const code = await body();
    return typeof code === "number" ? code : 0;
  } catch (error) {
    if (error instanceof AppError) {
      warn(color.red(`error: ${error.message}`));
      if (error.causeMessage) warn(color.dim(`  ${error.causeMessage}`));
      return error.status >= 500 ? 2 : 1;
    }
    warn(color.red(`error: ${error instanceof Error ? error.message : String(error)}`));
    return 2;
  }
}
