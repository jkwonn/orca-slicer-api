import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import { AppError } from "./errors";
import { getDataPath } from "./env";

/**
 * Profile (preset) storage. A "profile" is a single OrcaSlicer JSON preset
 * stored on disk under `<DATA_PATH>/<category>/<name>.json`. The three
 * categories mirror the OrcaSlicer GUI's preset tabs.
 */
export type Category = "printers" | "presets" | "filaments";

export const CATEGORIES: Category[] = ["printers", "presets", "filaments"];

/** Map a category to a friendly singular noun for messages. */
export const CATEGORY_LABEL: Record<Category, string> = {
  printers: "printer",
  presets: "process",
  filaments: "filament",
};

/** Throw unless `value` is one of the three known categories. */
export function assertCategory(value: unknown): asserts value is Category {
  if (typeof value !== "string" || !CATEGORIES.includes(value as Category)) {
    throw new AppError(
      400,
      `Invalid category "${String(value)}". Expected one of: ${CATEGORIES.join(", ")}`
    );
  }
}

/**
 * Validate a profile name. Names map directly to filenames, so only letters,
 * digits and underscores are allowed — this keeps the slug usable in paired
 * `(printer, preset, filament)` lookups and rejects path traversal.
 */
export function assertValidName(name: unknown): asserts name is string {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new AppError(400, "Name cannot be empty");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new AppError(
      400,
      "Name must only contain letters, numbers, and underscores"
    );
  }
}

/** Absolute path of a profile file (no existence check). */
export function profilePath(category: Category, name: string): string {
  return join(getDataPath(), category, `${name}.json`);
}

/** Whether a profile file exists on disk. */
export function profileExists(category: Category, name: string): boolean {
  return existsSync(profilePath(category, name));
}

/**
 * Persist a profile JSON object under `<DATA_PATH>/<category>/<name>.json`,
 * pretty-printed. Creates the category directory if needed.
 */
export async function saveProfile(
  category: Category,
  name: string,
  content: object
): Promise<void> {
  try {
    const dir = join(getDataPath(), category);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      profilePath(category, name),
      JSON.stringify(content, null, 2),
      "utf8"
    );
  } catch (error) {
    throw new AppError(
      500,
      "Failed to save profile",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** List profile names (without `.json`) for a category. Empty if none. */
export async function listProfiles(category: Category): Promise<string[]> {
  const dir = join(getDataPath(), category);
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new AppError(
      500,
      "Failed to read profile directory",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Read and parse a stored profile. Throws 404 when it does not exist. */
export async function getProfile(
  category: Category,
  name: string
): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(profilePath(category, name), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(
        404,
        `${CATEGORY_LABEL[category]} profile "${name}" not found`
      );
    }
    throw new AppError(
      500,
      "Failed to read profile",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Delete a stored profile. Throws 404 when it does not exist. */
export async function deleteProfile(
  category: Category,
  name: string
): Promise<void> {
  try {
    await fs.unlink(profilePath(category, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(
        404,
        `${CATEGORY_LABEL[category]} profile "${name}" not found`
      );
    }
    throw new AppError(
      500,
      "Failed to delete profile",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Parse a JSON buffer into a profile object, with a clear error on bad JSON. */
export function parseProfileBuffer(buffer: Buffer): object {
  try {
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new AppError(
      400,
      "Profile file is not valid JSON",
      error instanceof Error ? error.message : String(error)
    );
  }
}
