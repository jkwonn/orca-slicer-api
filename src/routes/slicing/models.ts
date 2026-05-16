export type { SliceMetaData } from "../../core/metadata";
export type { Category } from "../../core/profiles";

/**
 * Slicing options accepted by the HTTP `/slice` and `/slice-async` routes as
 * multipart form fields. Multer delivers every field as a string, so numeric
 * and boolean fields are parsed defensively in `parseSlicingSettings`.
 */
export interface SlicingSettings {
  // --- profiles (resolved by stored name) ---
  printer?: string;
  preset?: string;
  filament?: string;

  // --- plate / arrange ---
  bedType?: string;
  plate?: string;
  multicolorOnePlate?: boolean | string;
  arrange?: boolean | string;
  orient?: boolean | string;
  allowRotations?: boolean | string;
  exportType?: "gcode" | "3mf";

  // --- transforms ---
  rotate?: string | number;
  rotateX?: string | number;
  rotateY?: string | number;
  scale?: string | number;
  repetitions?: string | number;
  ensureOnBed?: boolean | string;
  assemble?: boolean | string;
  convertUnit?: boolean | string;

  // --- object selection ---
  skipObjects?: string;
  cloneObjects?: string;

  // --- quick process overrides ---
  /** Process preset overrides — patched into the loaded preset before slicing. */
  nozzleDiameter?: string | number;
  layerHeight?: string | number;
  /** 0–100 percent. */
  infillDensity?: string | number;
  infillPattern?: string;
  /** 1–10 wall loops. */
  wallCount?: string | number;
  /** Speed bucket. Mapped to a multiplier on per-feature speeds at slice time. */
  printSpeed?: "standard" | "safe" | "slow";
  /** Support mode: `auto`, `tree`, `tree-auto` or `none`. */
  support?: "auto" | "tree" | "tree-auto" | "none";
  supportThreshold?: string | number;
  brimType?: string;
  brimWidth?: string | number;

  // --- raw config passthrough ---
  /** Raw `key=value` config override(s); forwarded to OrcaSlicer as flags. */
  set?: string | string[];

  // --- misc ---
  timelapse?: boolean | string;
  debugLevel?: string | number;
}

export interface SliceResult {
  gcodes: string[];
  workdir: string;
}

export interface UploadedProfiles {
  printer?: Buffer;
  preset?: Buffer;
  filament?: Buffer;
}
