import { existsSync } from "fs";
import { promises as fs } from "fs";
import * as path from "path";
import { AppError } from "./errors";

/**
 * Access to OrcaSlicer's bundled system presets — the vendor printer / process
 * / filament profiles shipped under `resources/profiles/`. This is what the
 * GUI's preset dropdowns are populated from. The CLI exposes it through the
 * `presets` command and uses it to seed the data directory (`profiles import`).
 *
 * The resources directory is located via `ORCA_RESOURCES_PATH`, or derived
 * from `ORCASLICER_PATH` when that points straight at the binary.
 */

export type PresetKind = "machine" | "process" | "filament";

/** Resolve OrcaSlicer's `resources/profiles` directory, or `null`. */
export function getProfilesRoot(): string | null {
  const explicit = process.env.ORCA_RESOURCES_PATH;
  if (explicit) {
    const p = path.join(explicit, "profiles");
    if (existsSync(p)) return p;
    if (existsSync(explicit) && path.basename(explicit) === "profiles") {
      return explicit;
    }
  }
  // Derive from the binary path: <root>/bin/orca-slicer -> <root>/resources.
  const bin = process.env.ORCASLICER_PATH;
  if (bin) {
    const candidates = [
      path.join(path.dirname(path.dirname(bin)), "resources", "profiles"),
      path.join(path.dirname(bin), "resources", "profiles"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }
  return null;
}

/** Throwing variant of {@link getProfilesRoot}. */
export function requireProfilesRoot(): string {
  const root = getProfilesRoot();
  if (!root) {
    throw new AppError(
      500,
      "OrcaSlicer system presets are not available",
      "Set ORCA_RESOURCES_PATH to OrcaSlicer's resources directory"
    );
  }
  return root;
}

/** List vendor names that ship presets (e.g. `BBL`, `Prusa`, `Creality`). */
export async function listVendors(): Promise<string[]> {
  const root = requireProfilesRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** List system preset names of a given kind for a vendor. */
export async function listSystemPresets(
  vendor: string,
  kind: PresetKind
): Promise<string[]> {
  const root = requireProfilesRoot();
  const dir = path.join(root, vendor, kind);
  if (!existsSync(dir)) return [];
  const files = await fs.readdir(dir);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Resolve the file path of a named system preset, searching all vendors. */
export function findSystemPresetFile(
  vendor: string,
  kind: PresetKind,
  name: string
): string {
  const root = requireProfilesRoot();
  const direct = path.join(root, vendor, kind, `${name}.json`);
  if (existsSync(direct)) return direct;
  throw new AppError(
    404,
    `System ${kind} preset "${name}" not found for vendor "${vendor}"`
  );
}

/**
 * Read a system preset and flatten its `inherits:` chain so the result is a
 * self-contained profile. OrcaSlicer's CLI does not resolve `inherits:` at
 * slice time, so an un-flattened child preset would be missing fields it
 * relies on a parent for.
 */
export async function readFlattenedPreset(
  vendor: string,
  kind: PresetKind,
  name: string
): Promise<Record<string, unknown>> {
  const root = requireProfilesRoot();
  return flatten(vendor, kind, name, root, 0);
}

async function flatten(
  vendor: string,
  kind: PresetKind,
  name: string,
  root: string,
  depth: number
): Promise<Record<string, unknown>> {
  if (depth > 12) {
    throw new AppError(500, `inherits chain too deep for preset "${name}"`);
  }
  const file = locatePreset(vendor, kind, name, root);
  if (!file) {
    throw new AppError(404, `Preset "${name}" not found`);
  }
  const profile = JSON.parse(await fs.readFile(file, "utf-8"));
  const inherits = profile.inherits;
  if (!inherits || typeof inherits !== "string") {
    delete profile.inherits;
    return profile;
  }
  const parent = await flatten(vendor, kind, inherits, root, depth + 1);
  const merged = { ...parent, ...profile };
  delete merged.inherits;
  return merged;
}

/** Locate a preset file, falling back to the cross-vendor BBL directory. */
function locatePreset(
  vendor: string,
  kind: PresetKind,
  name: string,
  root: string
): string | null {
  for (const v of [vendor, "BBL"]) {
    const f = path.join(root, v, kind, `${name}.json`);
    if (existsSync(f)) return f;
  }
  return null;
}
