import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { AppError } from "./errors";
import { runOrca, orcaFailure } from "./orca";
import type { OrcaResultJson } from "./orca";
import {
  emptyMetaData,
  addMetaData,
  getMetaDataFromFile,
  type SliceMetaData,
} from "./metadata";
import {
  applyProcessOverrides,
  applyMachineOverrides,
  type ProcessOverrides,
  type MachineOverrides,
} from "./overrides";
import {
  convertCadFile,
  isCadFile,
  isMeshFile,
  extOf,
  SUPPORTED_EXTENSIONS,
} from "./model";
import { profilePath, profileExists } from "./profiles";

/**
 * High-level slicing engine. Both the HTTP `/slice` route and the CLI
 * `slice` command call {@link sliceModel}, so a slice behaves identically no
 * matter which entry point drives it.
 */

/** Where a profile comes from: a stored name or an explicit file path. */
export interface ProfileRef {
  /** Profile name under `<DATA_PATH>/<category>/`. */
  name?: string;
  /** Explicit path to a profile JSON file. */
  file?: string;
}

export interface SliceOptions {
  /** Path to the model file (.stl/.obj/.amf/.3mf or a CAD file to convert). */
  inputPath: string;
  /** `gcode` (default) or `3mf`. */
  exportType?: "gcode" | "3mf";

  /** Printer (machine) profile. */
  printer?: ProfileRef;
  /** Process profile. */
  process?: ProfileRef;
  /** Filament profile(s) — multiple entries enable multi-material slicing. */
  filaments?: ProfileRef[];

  /** Plate to slice: `1`-based; `0` slices every plate. Default `1`. */
  plate?: number;
  /** Auto-arrange objects on the plate. Default `true`. */
  arrange?: boolean;
  /** Auto-orient objects for printability. Default `true`. */
  orient?: boolean;
  /** Allow rotation while arranging. */
  allowRotations?: boolean;
  /** Allow multiple filament colors on one plate when arranging. */
  multicolorOnePlate?: boolean;
  /** Bed/plate type, e.g. `Textured PEI Plate`. */
  bedType?: string;
  /** Lift objects partially below the bed back onto it. */
  ensureOnBed?: boolean;
  /** Merge all loaded models into a single object. */
  assemble?: boolean;
  /** Convert model units (inch → mm). */
  convertUnit?: boolean;

  /** Rotation around Z, degrees. */
  rotate?: number;
  /** Rotation around X, degrees. */
  rotateX?: number;
  /** Rotation around Y, degrees. */
  rotateY?: number;
  /** Uniform scale factor. */
  scale?: number;
  /** Repeat the whole model N times before arranging. */
  repetitions?: number;

  /** 1-based object indices to skip. */
  skipObjects?: number[];
  /** Object clone pairs `[index, count, ...]`. */
  cloneObjects?: number[];

  /** Quick process-preset overrides. */
  processOverrides?: ProcessOverrides;
  /** Quick machine-preset overrides. */
  machineOverrides?: MachineOverrides;
  /** Raw `config_key → value` overrides forwarded as CLI flags. */
  configOverrides?: Record<string, string>;

  /** Mark the slice as a timelapse print. */
  timelapse?: boolean;
  /** OrcaSlicer debug level 0–5. */
  debugLevel?: number;
  /** Export the 3MF with minimum size (model data stripped). */
  minSave?: boolean;

  /** Pre-created working directory; one is made under `os.tmpdir()` if absent. */
  workDir?: string;
  /** Slice timeout in milliseconds. */
  timeoutMs?: number;
}

export interface SliceResult {
  /** Absolute paths of the produced G-code or 3MF files. */
  outputFiles: string[];
  /** Working directory holding the outputs — caller is responsible for cleanup. */
  workDir: string;
  /** Metadata aggregated across every output file. */
  metadata: SliceMetaData;
  /** OrcaSlicer's `result.json`, when one was written. */
  resultJson?: OrcaResultJson;
  /** The exact OrcaSlicer argument vector used (handy for `--dry-run`). */
  command: string[];
}

/** Build the OrcaSlicer argument vector for a slice without running it. */
export async function buildSliceCommand(
  options: SliceOptions
): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  const prepared = await prepare(options);
  return { args: prepared.args, cleanup: prepared.cleanup };
}

/**
 * Slice a model end to end: stage inputs, convert CAD geometry, patch presets
 * with overrides, run OrcaSlicer and collect the outputs with metadata.
 */
export async function sliceModel(options: SliceOptions): Promise<SliceResult> {
  const prepared = await prepare(options);
  const { args, workDir, outputDir, exportType } = prepared;

  const run = await runOrca(args, {
    outputDir,
    timeoutMs: options.timeoutMs,
  });

  const slicerError = run.resultJson?.error_string;
  if (run.code !== 0 || (slicerError && slicerError !== "Success.")) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw orcaFailure(run);
  }

  const produced = await collectOutputs(outputDir, exportType);
  if (produced.length === 0) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw new AppError(
      500,
      "Slicing produced no output files",
      `OrcaSlicer exited cleanly but no .${exportType} file was written`
    );
  }

  const metadata = emptyMetaData();
  for (const file of produced) {
    addMetaData(metadata, await getMetaDataFromFile(file));
  }

  return {
    outputFiles: produced,
    workDir,
    metadata,
    resultJson: run.resultJson,
    command: args,
  };
}

interface Prepared {
  args: string[];
  workDir: string;
  inputDir: string;
  outputDir: string;
  exportType: "gcode" | "3mf";
  cleanup: () => Promise<void>;
}

/** Stage all inputs and assemble the OrcaSlicer argument vector. */
async function prepare(options: SliceOptions): Promise<Prepared> {
  const exportType = options.exportType ?? "gcode";
  const ext = extOf(options.inputPath);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      400,
      `Unsupported model format "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
    );
  }
  await assertReadable(options.inputPath, "model file");

  const workDir =
    options.workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "orca-slice-")));
  const inputDir = path.join(workDir, "input");
  const outputDir = path.join(workDir, "output");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const cleanup = async () => {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // 1. Stage the model — convert CAD geometry to a mesh OrcaSlicer can load.
    let modelPath: string;
    if (isCadFile(options.inputPath)) {
      const base = path.basename(options.inputPath, ext);
      modelPath = path.join(inputDir, `${base}.stl`);
      await convertCadFile(options.inputPath, modelPath);
    } else if (isMeshFile(options.inputPath)) {
      modelPath = path.join(inputDir, path.basename(options.inputPath));
      await fs.copyFile(options.inputPath, modelPath);
    } else {
      throw new AppError(400, `Cannot slice "${options.inputPath}"`);
    }

    // 2. Resolve and (when overrides apply) patch the profiles.
    const args: string[] = [];

    const printerPath = await resolveProfile(options.printer, "printer");
    const processPath = await resolveProfile(options.process, "process");
    const filamentPaths: string[] = [];
    for (const ref of options.filaments ?? []) {
      const p = await resolveProfile(ref, "filament");
      if (p) filamentPaths.push(p);
    }

    const finalPrinter = await maybePatchMachine(
      printerPath,
      inputDir,
      options.machineOverrides
    );
    const finalProcess = await maybePatchProcess(
      processPath,
      inputDir,
      options.processOverrides
    );

    // 3. Export type.
    if (exportType === "3mf") {
      args.push("--export-3mf", "result.3mf");
    }
    if (options.minSave) args.push("--min-save");

    // 4. Transforms (applied before slicing).
    if (isFiniteNumber(options.rotateX))
      args.push("--rotate-x", String(options.rotateX));
    if (isFiniteNumber(options.rotateY))
      args.push("--rotate-y", String(options.rotateY));
    if (isFiniteNumber(options.rotate))
      args.push("--rotate", String(options.rotate));
    if (isFiniteNumber(options.scale) && options.scale !== 1)
      args.push("--scale", String(options.scale));
    if (options.repetitions && options.repetitions > 1)
      args.push("--repetitions", String(Math.floor(options.repetitions)));
    if (options.convertUnit) args.push("--convert-unit");
    if (options.assemble) args.push("--assemble");
    if (options.ensureOnBed) args.push("--ensure-on-bed");

    // 5. Object selection.
    if (options.skipObjects?.length)
      args.push("--skip-objects", options.skipObjects.join(","));
    if (options.cloneObjects?.length)
      args.push("--clone-objects", options.cloneObjects.join(","));

    // 6. Arrange / orient. Default ON so headless slicing mirrors the desktop
    // app's import behaviour — CAD exports at world coordinates are otherwise
    // rejected as "plate is empty".
    const arrange = options.arrange ?? true;
    const orient = options.orient ?? true;
    args.push("--arrange", arrange ? "1" : "0");
    args.push("--orient", orient ? "1" : "0");
    if (options.allowRotations) args.push("--allow-rotations");
    if (options.multicolorOnePlate) args.push("--allow-multicolor-oneplate");

    // 7. Profiles.
    const settings = [finalPrinter, finalProcess].filter(
      (p): p is string => !!p
    );
    if (settings.length) args.push("--load-settings", settings.join(";"));
    if (filamentPaths.length)
      args.push("--load-filaments", filamentPaths.join(";"));

    // 8. Bed type & raw config overrides (highest-priority settings).
    if (options.bedType) args.push("--curr-bed-type", options.bedType);
    for (const [key, value] of Object.entries(options.configOverrides ?? {})) {
      args.push(`--${key.replace(/_/g, "-")}`, value);
    }

    // 9. Misc.
    if (options.timelapse) args.push("--enable-timelapse");
    if (isFiniteNumber(options.debugLevel))
      args.push("--debug", String(options.debugLevel));

    // 10. Slice action + output.
    args.push("--slice", String(options.plate ?? 1));
    args.push("--allow-newer-file");
    args.push("--outputdir", outputDir);
    args.push(modelPath);

    return { args, workDir, inputDir, outputDir, exportType, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Resolve a {@link ProfileRef} to an absolute, readable file path. */
async function resolveProfile(
  ref: ProfileRef | undefined,
  kind: string
): Promise<string | undefined> {
  if (!ref) return undefined;
  if (ref.file) {
    await assertReadable(ref.file, `${kind} profile`);
    return path.resolve(ref.file);
  }
  if (ref.name) {
    const category =
      kind === "printer"
        ? "printers"
        : kind === "process"
          ? "presets"
          : "filaments";
    if (!profileExists(category, ref.name)) {
      throw new AppError(
        404,
        `${kind} profile "${ref.name}" not found in the data directory`
      );
    }
    return profilePath(category, ref.name);
  }
  return undefined;
}

/** Copy + patch a machine profile when overrides are present. */
async function maybePatchMachine(
  printerPath: string | undefined,
  inputDir: string,
  overrides: MachineOverrides | undefined
): Promise<string | undefined> {
  if (!printerPath) return undefined;
  if (!overrides || Object.keys(overrides).length === 0) return printerPath;
  try {
    const machine = JSON.parse(await fs.readFile(printerPath, "utf-8"));
    if (applyMachineOverrides(machine, overrides)) {
      const out = path.join(inputDir, "machine_override.json");
      await fs.writeFile(out, JSON.stringify(machine));
      return out;
    }
  } catch {
    // Fall back to the unpatched profile on any read/parse failure.
  }
  return printerPath;
}

/** Copy + patch a process profile when overrides are present. */
async function maybePatchProcess(
  processPath: string | undefined,
  inputDir: string,
  overrides: ProcessOverrides | undefined
): Promise<string | undefined> {
  if (!processPath) return undefined;
  if (!overrides || Object.keys(overrides).length === 0) return processPath;
  try {
    const preset = JSON.parse(await fs.readFile(processPath, "utf-8"));
    if (applyProcessOverrides(preset, overrides)) {
      const out = path.join(inputDir, "process_override.json");
      await fs.writeFile(out, JSON.stringify(preset));
      return out;
    }
  } catch {
    // Fall back to the unpatched profile on any read/parse failure.
  }
  return processPath;
}

/** List the produced output files of the requested type, sorted by name. */
async function collectOutputs(
  outputDir: string,
  exportType: "gcode" | "3mf"
): Promise<string[]> {
  const wanted = exportType === "3mf" ? ".3mf" : ".gcode";
  const files = await fs.readdir(outputDir);
  return files
    .filter((f) => f.toLowerCase().endsWith(wanted))
    .sort()
    .map((f) => path.join(outputDir, f));
}

async function assertReadable(file: string, label: string): Promise<void> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new AppError(400, `${label} is not a file: ${file}`);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, `${label} not found: ${file}`);
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
