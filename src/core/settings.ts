import { promises as fs } from "fs";
import { AppError } from "./errors";

/**
 * Read / modify / compare individual settings inside an OrcaSlicer preset
 * JSON file. This backs the CLI `config` command, which mirrors the GUI's
 * per-setting editing of a printer / process / filament preset.
 *
 * Keys may be given in either underscore (`layer_height`) or hyphen
 * (`layer-height`) form; both are normalised to the JSON's underscore form.
 */

/** Normalise a setting key to OrcaSlicer's underscore form. */
export function normalizeKey(key: string): string {
  return key.trim().replace(/-/g, "_");
}

/** Load and parse a preset JSON file. */
export async function readProfileFile(
  file: string
): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch {
    throw new AppError(404, `Profile file not found: ${file}`);
  }
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new Error("not a JSON object");
    }
    return obj;
  } catch (error) {
    throw new AppError(
      400,
      `Profile file is not valid JSON: ${file}`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Write a preset object back to disk, pretty-printed. */
export async function writeProfileFile(
  file: string,
  obj: Record<string, unknown>
): Promise<void> {
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

/** Read one setting value. Throws 404 when the key is absent. */
export function getConfigValue(
  obj: Record<string, unknown>,
  key: string
): unknown {
  const k = normalizeKey(key);
  if (!(k in obj)) {
    throw new AppError(404, `Setting "${k}" is not present in this profile`);
  }
  return obj[k];
}

/** A single parsed `key=value` assignment. */
export interface ConfigAssignment {
  key: string;
  value: string;
}

/** Parse a `key=value` string into a {@link ConfigAssignment}. */
export function parseAssignment(input: string): ConfigAssignment {
  const eq = input.indexOf("=");
  if (eq <= 0) {
    throw new AppError(
      400,
      `Invalid assignment "${input}" — expected key=value`
    );
  }
  return {
    key: normalizeKey(input.slice(0, eq)),
    value: input.slice(eq + 1),
  };
}

/**
 * Apply `key=value` assignments to a preset object in place. Values that look
 * like JSON arrays (`[...]`) are parsed; everything else is stored as a
 * string, matching how OrcaSlicer presets encode scalar settings.
 * Returns the keys that changed.
 */
export function setConfigValues(
  obj: Record<string, unknown>,
  assignments: ConfigAssignment[]
): string[] {
  const changed: string[] = [];
  for (const { key, value } of assignments) {
    obj[key] = coerceValue(value);
    changed.push(key);
  }
  return changed;
}

function coerceValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // not JSON — fall through and keep as a string
    }
  }
  return value;
}

/** Delete a setting. Returns true if it existed. */
export function unsetConfigValue(
  obj: Record<string, unknown>,
  key: string
): boolean {
  const k = normalizeKey(key);
  if (k in obj) {
    delete obj[k];
    return true;
  }
  return false;
}

/** A field difference between two presets. */
export interface ConfigDiffEntry {
  key: string;
  left: unknown;
  right: unknown;
}

/**
 * Compare two preset objects. Returns every key whose value differs, including
 * keys present in only one side (the missing side reports `undefined`).
 */
export function diffConfig(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): ConfigDiffEntry[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const diffs: ConfigDiffEntry[] = [];
  for (const key of [...keys].sort()) {
    const l = left[key];
    const r = right[key];
    if (JSON.stringify(l) !== JSON.stringify(r)) {
      diffs.push({ key, left: l, right: r });
    }
  }
  return diffs;
}
