import { promises as fs } from "fs";
import * as path from "path";
import { AppError } from "../../core/errors";
import { sliceModel, buildSliceCommand, type SliceOptions } from "../../core/slice";
import type { ProfileRef } from "../../core/slice";
import type { SupportMode, SpeedBucket } from "../../core/overrides";
import { getOrcaPath } from "../../core/env";
import {
  parse,
  str,
  num,
  bool,
  list,
  intList,
  info,
  color,
  printJson,
  keyValueTable,
  formatDuration,
} from "../util";

export const sliceHelp = `${color.bold("osa slice")} — slice a 3D model into G-code or a 3MF

${color.bold("USAGE")}
  osa slice <model> [options]

${color.bold("PROFILES")}
  --printer <name>        Stored printer profile (data dir)
  --process <name>        Stored process profile  (alias: --preset)
  --filament <name>       Stored filament profile (repeatable)
  --printer-file <path>   Printer profile JSON file
  --process-file <path>   Process profile JSON file
  --filament-file <path>  Filament profile JSON file (repeatable)

${color.bold("OUTPUT")}
  -o, --output <path>     Output file, or directory for multi-plate slices
  --export <gcode|3mf>    Output format (default: gcode)
  --min-save              Export a minimum-size 3MF (strips model data)

${color.bold("PLATE & ARRANGE")}
  --plate <n>             Plate to slice; 0 = all plates (default: 1)
  --bed-type <type>       Bed/plate type, e.g. "Textured PEI Plate"
  --no-arrange            Disable auto-arrange (on by default)
  --no-orient             Disable auto-orient  (on by default)
  --allow-rotations       Allow rotation while arranging
  --multicolor-one-plate  Allow multiple filament colors on one plate

${color.bold("TRANSFORMS")}
  --rotate <deg>          Rotate around Z
  --rotate-x <deg>        Rotate around X
  --rotate-y <deg>        Rotate around Y
  --scale <factor>        Uniform scale factor
  --repetitions <n>       Repeat the whole model N times
  --ensure-on-bed         Lift objects partially below the bed
  --assemble              Merge all loaded models into one object
  --convert-unit          Convert model units (inch → mm)
  --skip-objects <list>   1-based object indices to skip, e.g. 3,5,10
  --clone-objects <list>  Object clone pairs, e.g. 1,3

${color.bold("QUICK SETTINGS")}
  --layer-height <mm>     Layer height (0.04–0.6)
  --infill <pct>          Sparse infill density (0–100)
  --infill-pattern <p>    Infill pattern, e.g. grid, gyroid, honeycomb
  --walls <n>             Wall loop count (1–10)
  --nozzle <mm>           Nozzle diameter (0.1–2.0)
  --speed <bucket>        standard | safe | slow
  --support <mode>        auto | tree | tree-auto | none
  --support-threshold <d> Support overhang angle threshold, degrees
  --brim-type <type>      outer_only | inner_only | outer_and_inner | no_brim
  --brim-width <mm>       Brim width

${color.bold("ADVANCED")}
  -s, --set <key=value>   Raw OrcaSlicer config override (repeatable)
  --timelapse             Slice as a timelapse print
  --debug-level <0-5>     OrcaSlicer log verbosity
  --dry-run               Print the OrcaSlicer command without running it
  --json                  Print the slice result as JSON
  -q, --quiet             Suppress progress output

${color.bold("EXAMPLES")}
  osa slice benchy.stl --printer bambua1 --process bambua1_proc --filament bambua1_pla
  osa slice part.step --printer prusamk4 --process prusamk4_proc --layer-height 0.28
  osa slice model.3mf --plate 0 -o ./plates/
  osa slice cube.stl --printer-file p.json --process-file proc.json --dry-run`;

const OPTIONS = {
  output: { type: "string", short: "o" },
  export: { type: "string" },
  "min-save": { type: "boolean" },
  printer: { type: "string" },
  process: { type: "string" },
  preset: { type: "string" },
  filament: { type: "string", multiple: true },
  "printer-file": { type: "string" },
  "process-file": { type: "string" },
  "filament-file": { type: "string", multiple: true },
  plate: { type: "string" },
  "bed-type": { type: "string" },
  "no-arrange": { type: "boolean" },
  "no-orient": { type: "boolean" },
  "allow-rotations": { type: "boolean" },
  "multicolor-one-plate": { type: "boolean" },
  rotate: { type: "string" },
  "rotate-x": { type: "string" },
  "rotate-y": { type: "string" },
  scale: { type: "string" },
  repetitions: { type: "string" },
  "ensure-on-bed": { type: "boolean" },
  assemble: { type: "boolean" },
  "convert-unit": { type: "boolean" },
  "skip-objects": { type: "string" },
  "clone-objects": { type: "string" },
  "layer-height": { type: "string" },
  infill: { type: "string" },
  "infill-pattern": { type: "string" },
  walls: { type: "string" },
  nozzle: { type: "string" },
  speed: { type: "string" },
  support: { type: "string" },
  "support-threshold": { type: "string" },
  "brim-type": { type: "string" },
  "brim-width": { type: "string" },
  set: { type: "string", multiple: true, short: "s" },
  timelapse: { type: "boolean" },
  "debug-level": { type: "string" },
  "dry-run": { type: "boolean" },
  json: { type: "boolean" },
  quiet: { type: "boolean", short: "q" },
} as const;

/** `osa slice` — slice a model into G-code / 3MF. */
export async function sliceCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, OPTIONS);

  if (positionals.length === 0) {
    throw new AppError(400, "A model file is required.\n\n" + sliceHelp);
  }
  if (positionals.length > 1) {
    throw new AppError(400, `Expected one model file, got ${positionals.length}`);
  }
  const modelPath = path.resolve(positionals[0]);
  const quiet = bool(values, "quiet");
  const exportType = (str(values, "export") ?? "gcode").toLowerCase();
  if (exportType !== "gcode" && exportType !== "3mf") {
    throw new AppError(400, '--export must be "gcode" or "3mf"');
  }

  const options: SliceOptions = {
    inputPath: modelPath,
    exportType: exportType as "gcode" | "3mf",
    printer: profileRef(str(values, "printer"), str(values, "printer-file")),
    process: profileRef(
      str(values, "process") ?? str(values, "preset"),
      str(values, "process-file")
    ),
    filaments: filamentRefs(
      list(values, "filament"),
      list(values, "filament-file")
    ),
    plate: values.plate !== undefined ? num(values, "plate") : 1,
    bedType: str(values, "bed-type"),
    arrange: !bool(values, "no-arrange"),
    orient: !bool(values, "no-orient"),
    allowRotations: bool(values, "allow-rotations"),
    multicolorOnePlate: bool(values, "multicolor-one-plate"),
    rotate: num(values, "rotate"),
    rotateX: num(values, "rotate-x"),
    rotateY: num(values, "rotate-y"),
    scale: num(values, "scale"),
    repetitions: num(values, "repetitions"),
    ensureOnBed: bool(values, "ensure-on-bed"),
    assemble: bool(values, "assemble"),
    convertUnit: bool(values, "convert-unit"),
    skipObjects: intList(str(values, "skip-objects")),
    cloneObjects: intList(str(values, "clone-objects")),
    timelapse: bool(values, "timelapse"),
    debugLevel: num(values, "debug-level"),
    minSave: bool(values, "min-save"),
    processOverrides: {
      layerHeight: str(values, "layer-height"),
      infillDensity: str(values, "infill"),
      infillPattern: str(values, "infill-pattern"),
      wallLoops: str(values, "walls"),
      printSpeed: parseSpeed(str(values, "speed")),
      support: parseSupport(str(values, "support")),
      supportThreshold: str(values, "support-threshold"),
      brimType: str(values, "brim-type"),
      brimWidth: str(values, "brim-width"),
    },
    machineOverrides: { nozzleDiameter: str(values, "nozzle") },
    configOverrides: parseSet(list(values, "set")),
  };

  // --dry-run: build and print the OrcaSlicer command, run nothing.
  if (bool(values, "dry-run")) {
    const { args, cleanup } = await buildSliceCommand(options);
    try {
      if (bool(values, "json")) {
        printJson({ binary: getOrcaPath(), args });
      } else {
        info(color.bold("OrcaSlicer command:"), quiet);
        info(`  ${getOrcaPath()} \\`, quiet);
        info(formatCommandLines(args), quiet);
      }
    } finally {
      await cleanup();
    }
    return 0;
  }

  // Keep stdout pure JSON when --json is set; the progress line is noise then.
  const jsonOut = bool(values, "json");
  info(color.dim(`Slicing ${path.basename(modelPath)} …`), quiet || jsonOut);
  const result = await sliceModel(options);

  try {
    const written = await writeOutputs(
      result.outputFiles,
      str(values, "output"),
      modelPath,
      exportType
    );

    if (bool(values, "json")) {
      printJson({
        outputs: written,
        metadata: result.metadata,
        resultJson: result.resultJson,
      });
    } else {
      const m = result.metadata;
      info("", quiet);
      info(color.green("✓ Slice complete"), quiet);
      info(
        keyValueTable([
          ["output", written.join(", ")],
          ["print time", formatDuration(m.printTime)],
          ["filament", `${m.filamentUsedG.toFixed(2)} g  /  ${m.filamentUsedMm.toFixed(0)} mm`],
          ["layers", String(m.layerCount)],
          ["support area", `${m.supportAreaCm2.toFixed(2)} cm²`],
        ]),
        quiet
      );
    }
    return 0;
  } finally {
    await fs.rm(result.workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function profileRef(
  name: string | undefined,
  file: string | undefined
): ProfileRef | undefined {
  if (file) return { file: path.resolve(file) };
  if (name) return { name };
  return undefined;
}

function filamentRefs(names: string[], files: string[]): ProfileRef[] {
  const refs: ProfileRef[] = [];
  for (const f of files) refs.push({ file: path.resolve(f) });
  for (const n of names) refs.push({ name: n });
  return refs;
}

function parseSpeed(v: string | undefined): SpeedBucket | undefined {
  if (!v) return undefined;
  if (v === "standard" || v === "safe" || v === "slow") return v;
  throw new AppError(400, '--speed must be "standard", "safe" or "slow"');
}

function parseSupport(v: string | undefined): SupportMode | undefined {
  if (!v) return undefined;
  if (v === "auto" || v === "tree" || v === "tree-auto" || v === "none") {
    return v;
  }
  throw new AppError(
    400,
    '--support must be "auto", "tree", "tree-auto" or "none"'
  );
}

function parseSet(entries: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      throw new AppError(400, `Invalid --set value "${entry}" (expected key=value)`);
    }
    out[entry.slice(0, eq).trim()] = entry.slice(eq + 1);
  }
  return out;
}

/** Copy slice outputs to their destination and return the written paths. */
async function writeOutputs(
  produced: string[],
  output: string | undefined,
  modelPath: string,
  exportType: string
): Promise<string[]> {
  const base = path.basename(modelPath, path.extname(modelPath));
  const ext = `.${exportType}`;

  if (produced.length === 1 && output && !output.endsWith("/")) {
    const dest = path.resolve(output);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(produced[0], dest);
    return [relativeOrAbsolute(dest)];
  }

  // Multiple outputs (or a directory destination): write each file by name.
  const dir = output ? path.resolve(output) : process.cwd();
  await fs.mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (let i = 0; i < produced.length; i++) {
    const srcName = path.basename(produced[i]);
    const destName =
      produced.length === 1 ? `${base}${ext}` : srcName;
    const dest = path.join(dir, destName);
    await fs.copyFile(produced[i], dest);
    written.push(relativeOrAbsolute(dest));
  }
  return written;
}

function relativeOrAbsolute(p: string): string {
  const rel = path.relative(process.cwd(), p);
  return rel.startsWith("..") ? p : rel;
}

/** Render an OrcaSlicer arg vector as one `--flag value` per line. */
function formatCommandLines(args: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token.startsWith("--") && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      lines.push(`${token} ${quote(args[++i])}`);
    } else {
      lines.push(token);
    }
  }
  return lines.map((l) => `    ${l}`).join(" \\\n");
}

function quote(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}
