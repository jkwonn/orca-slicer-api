import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { sliceModel as coreSliceModel } from "../../core/slice";
import type { SliceOptions, ProfileRef } from "../../core/slice";
import type { ProcessOverrides, MachineOverrides } from "../../core/overrides";
import { getMetaDataFromFile } from "../../core/metadata";
import { AppError } from "../../core/errors";
import type {
  SliceResult,
  SlicingSettings,
  UploadedProfiles,
} from "./models";

// Re-exported so route files keep importing metadata helpers from here.
export { getMetaDataFromFile };

/**
 * HTTP adapter over the shared slicing core. Maps the multipart `/slice` form
 * (string-typed settings + uploaded profile buffers) onto a core
 * {@link SliceOptions} call, then returns the legacy `{ gcodes, workdir }`
 * shape the route handlers expect.
 */
export async function sliceModel(
  file: Buffer,
  filename: string,
  settings: SlicingSettings,
  tempProfiles?: UploadedProfiles
): Promise<SliceResult> {
  // Stage the uploaded model + any uploaded profile buffers to disk so the
  // core engine (which works with file paths) can consume them.
  let stageDir: string;
  try {
    stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-upload-"));
  } catch (error) {
    throw new AppError(
      500,
      "Failed to prepare slicing",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const modelPath = path.join(stageDir, sanitizeFilename(filename));
    await fs.writeFile(modelPath, file);

    const printerRef = await stageProfile(
      stageDir,
      "printer.json",
      tempProfiles?.printer,
      settings.printer
    );
    const processRef = await stageProfile(
      stageDir,
      "process.json",
      tempProfiles?.preset,
      settings.preset
    );
    const filamentRef = await stageProfile(
      stageDir,
      "filament.json",
      tempProfiles?.filament,
      settings.filament
    );

    const options: SliceOptions = {
      inputPath: modelPath,
      exportType: settings.exportType === "3mf" ? "3mf" : "gcode",
      printer: printerRef,
      process: processRef,
      filaments: filamentRef ? [filamentRef] : undefined,
      plate: parseIntOr(settings.plate, 1),
      // The route default for arrange/orient is ON — headless slicing then
      // mirrors the desktop app's import behaviour. Callers opt out per field.
      arrange: asBool(settings.arrange, true),
      orient: asBool(settings.orient, true),
      allowRotations: asBool(settings.allowRotations, false),
      multicolorOnePlate: asBool(settings.multicolorOnePlate, false),
      bedType: settings.bedType || undefined,
      ensureOnBed: asBool(settings.ensureOnBed, false),
      assemble: asBool(settings.assemble, false),
      convertUnit: asBool(settings.convertUnit, false),
      rotate: asNum(settings.rotate),
      rotateX: asNum(settings.rotateX),
      rotateY: asNum(settings.rotateY),
      scale: asNum(settings.scale),
      repetitions: asNum(settings.repetitions),
      skipObjects: asIntArray(settings.skipObjects),
      cloneObjects: asIntArray(settings.cloneObjects),
      timelapse: asBool(settings.timelapse, false),
      debugLevel: asNum(settings.debugLevel),
      processOverrides: buildProcessOverrides(settings),
      machineOverrides: buildMachineOverrides(settings),
      configOverrides: buildConfigOverrides(settings.set),
    };

    const result = await coreSliceModel(options);
    return { gcodes: result.outputFiles, workdir: result.workDir };
  } finally {
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Write an uploaded buffer to disk, or resolve to a stored profile name. */
async function stageProfile(
  stageDir: string,
  fileName: string,
  buffer: Buffer | undefined,
  name: string | undefined
): Promise<ProfileRef | undefined> {
  if (buffer && buffer.length > 0) {
    const file = path.join(stageDir, fileName);
    await fs.writeFile(file, buffer);
    return { file };
  }
  if (name) return { name };
  return undefined;
}

function buildProcessOverrides(s: SlicingSettings): ProcessOverrides {
  return {
    layerHeight: s.layerHeight,
    infillDensity: s.infillDensity,
    infillPattern: s.infillPattern,
    wallLoops: s.wallCount,
    printSpeed: s.printSpeed,
    support: s.support,
    supportThreshold: s.supportThreshold,
    brimType: s.brimType,
    brimWidth: s.brimWidth,
    // Backwards compatibility: the route auto-enables support so overhangs
    // always get material unless the caller explicitly chose a support mode.
    autoEnableSupport: s.support === undefined,
  };
}

function buildMachineOverrides(s: SlicingSettings): MachineOverrides {
  return { nozzleDiameter: s.nozzleDiameter };
}

/** Parse `set` form field(s) — `key=value` strings — into a config map. */
function buildConfigOverrides(
  set: string | string[] | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!set) return out;
  const list = Array.isArray(set) ? set : [set];
  for (const entry of list) {
    const eq = entry.indexOf("=");
    if (eq > 0) out[entry.slice(0, eq).trim()] = entry.slice(eq + 1);
  }
  return out;
}

/** Multer delivers form fields as strings; treat only "false"/"0" as false. */
function asBool(v: boolean | string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  return !(v === "false" || v === "0");
}

function asNum(v: string | number | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseIntOr(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function asIntArray(v: string | undefined): number[] | undefined {
  if (!v) return undefined;
  const nums = v
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "model.stl";
}
