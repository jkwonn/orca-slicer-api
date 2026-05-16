/**
 * Structured "quick setting" overrides that are patched into a process or
 * machine preset JSON before slicing. These mirror the most-used knobs in the
 * OrcaSlicer GUI's Process / Printer tabs.
 *
 * Anything not covered here can still be set with a raw `key=value` config
 * override, which is forwarded to OrcaSlicer as a command-line flag (the
 * slicer's highest-priority setting source).
 */

export type SupportMode = "auto" | "tree" | "tree-auto" | "none";
export type SpeedBucket = "standard" | "safe" | "slow";

/** High-level process-preset overrides. */
export interface ProcessOverrides {
  /** Layer height in mm (clamped 0.04–0.6). */
  layerHeight?: string | number;
  /** Sparse infill density, 0–100 percent. */
  infillDensity?: string | number;
  /** Wall loop count, 1–10. */
  wallLoops?: string | number;
  /** Sparse infill pattern (e.g. `grid`, `gyroid`, `honeycomb`). */
  infillPattern?: string;
  /** Support generation mode. */
  support?: SupportMode;
  /** Overhang angle threshold for support, degrees (0–90). */
  supportThreshold?: string | number;
  /** Brim type (`outer_only`, `inner_only`, `outer_and_inner`, `no_brim`). */
  brimType?: string;
  /** Brim width in mm. */
  brimWidth?: string | number;
  /** Coarse print-speed bucket — scales the preset's per-feature speeds. */
  printSpeed?: SpeedBucket;
  /**
   * When true (the default for the HTTP `/slice` route, kept for backward
   * compatibility), enable support if the preset ships with it off. The CLI
   * leaves this undefined so a preset's own choice is respected.
   */
  autoEnableSupport?: boolean;
}

/** High-level machine-preset overrides. */
export interface MachineOverrides {
  /** Nozzle diameter in mm (clamped 0.1–2.0). */
  nozzleDiameter?: string | number;
}

/**
 * Parse and range-check a string|number override. Returns `null` (meaning
 * "keep the preset default") when the value is missing or out of range, so a
 * malformed input can never produce nonsense G-code.
 */
export function numericOverride(
  raw: unknown,
  min: number,
  max: number
): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const v = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

const SPEED_KEYS = [
  "outer_wall_speed",
  "inner_wall_speed",
  "sparse_infill_speed",
  "internal_solid_infill_speed",
  "top_surface_speed",
  "gap_infill_speed",
  "support_speed",
  "travel_speed",
  "bridge_speed",
  "overhang_speed",
];

const SPEED_MULTIPLIERS: Record<SpeedBucket, number> = {
  standard: 1.0,
  safe: 0.8,
  slow: 0.6,
};

/**
 * Apply {@link ProcessOverrides} to a parsed process-preset object in place.
 * Returns `true` when at least one field was changed.
 */
export function applyProcessOverrides(
  preset: Record<string, unknown>,
  overrides: ProcessOverrides
): boolean {
  let modified = false;

  // Support: explicit mode wins; otherwise optionally auto-enable.
  if (overrides.support) {
    if (overrides.support === "none") {
      preset.enable_support = "0";
    } else {
      preset.enable_support = "1";
      preset.support_type =
        overrides.support === "tree" || overrides.support === "tree-auto"
          ? "tree(auto)"
          : "normal(auto)";
    }
    modified = true;
  } else if (
    overrides.autoEnableSupport &&
    (!preset.enable_support || preset.enable_support === "0")
  ) {
    preset.enable_support = "1";
    preset.support_type = (preset.support_type as string) || "normal(auto)";
    preset.support_threshold_angle =
      (preset.support_threshold_angle as string) || "45";
    modified = true;
  }

  const threshold = numericOverride(overrides.supportThreshold, 0, 90);
  if (threshold !== null) {
    preset.support_threshold_angle = String(threshold);
    modified = true;
  }

  const lh = numericOverride(overrides.layerHeight, 0.04, 0.6);
  if (lh !== null) {
    preset.layer_height = String(lh);
    // OrcaSlicer rejects a first layer height above 1.5× the nozzle; clamp.
    preset.initial_layer_print_height = String(Math.min(lh, 0.32));
    modified = true;
  }

  const infill = numericOverride(overrides.infillDensity, 0, 100);
  if (infill !== null) {
    preset.sparse_infill_density = `${Math.round(infill)}%`;
    modified = true;
  }

  if (overrides.infillPattern) {
    preset.sparse_infill_pattern = overrides.infillPattern;
    modified = true;
  }

  const walls = numericOverride(overrides.wallLoops, 1, 10);
  if (walls !== null) {
    preset.wall_loops = String(Math.floor(walls));
    modified = true;
  }

  if (overrides.brimType) {
    preset.brim_type = overrides.brimType;
    modified = true;
  }
  const brimWidth = numericOverride(overrides.brimWidth, 0, 50);
  if (brimWidth !== null) {
    preset.brim_width = String(brimWidth);
    modified = true;
  }

  // Speed bucket: scale the preset's explicit mm/s values by a multiplier so
  // the proportions OrcaSlicer expects across acceleration/jerk are preserved.
  if (overrides.printSpeed && SPEED_MULTIPLIERS[overrides.printSpeed]) {
    const factor = SPEED_MULTIPLIERS[overrides.printSpeed];
    if (factor !== 1.0) {
      for (const key of SPEED_KEYS) {
        const cur = preset[key];
        if (cur == null) continue;
        const v = typeof cur === "string" ? parseFloat(cur) : Number(cur);
        if (Number.isFinite(v)) preset[key] = String(v * factor);
      }
      modified = true;
    }
  }

  return modified;
}

/**
 * Apply {@link MachineOverrides} to a parsed machine-preset object in place.
 * Returns `true` when at least one field was changed.
 */
export function applyMachineOverrides(
  machine: Record<string, unknown>,
  overrides: MachineOverrides
): boolean {
  let modified = false;
  const nozzle = numericOverride(overrides.nozzleDiameter, 0.1, 2.0);
  if (nozzle !== null) {
    machine.nozzle_diameter = [String(nozzle)];
    modified = true;
  }
  return modified;
}
