import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { AppError } from "../../core/errors";
import { getModelInfo, convertCadFile, isCadFile } from "../../core/model";
import { getMetaDataFromFile } from "../../core/metadata";
import {
  parse,
  bool,
  info,
  color,
  printJson,
  keyValueTable,
  formatDuration,
} from "../util";

export const infoHelp = `${color.bold("osa info")} — inspect a model's geometry

${color.bold("USAGE")}
  osa info <model> [--json]

Reports bounding box, triangle count, part count, manifold status and volume.
CAD files (STEP/IGES/BREP) are triangulated before inspection.`;

export const inspectHelp = `${color.bold("osa inspect")} — read print stats from a sliced file

${color.bold("USAGE")}
  osa inspect <file.gcode|file.3mf> [--json]

Reports estimated print time, filament usage, layer count and the pricing
metrics (extrusion starts, short/bridge/overhang moves, support/brim area).`;

/** `osa info` — geometry inspection of a model file. */
export async function infoCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 1) {
    throw new AppError(400, "Exactly one model file is required.\n\n" + infoHelp);
  }
  const modelPath = path.resolve(positionals[0]);
  await assertFile(modelPath);

  let meshPath = modelPath;
  let work: string | undefined;
  try {
    if (isCadFile(modelPath)) {
      work = await fs.mkdtemp(path.join(os.tmpdir(), "osa-info-"));
      meshPath = path.join(work, "converted.stl");
      await convertCadFile(modelPath, meshPath);
    }
    const result = await getModelInfo(meshPath);

    if (bool(values, "json")) {
      printJson(result);
    } else {
      info(color.bold(path.basename(modelPath)));
      info(
        keyValueTable([
          ["dimensions", `${fmt(result.sizeX)} × ${fmt(result.sizeY)} × ${fmt(result.sizeZ)} mm`],
          ["bounding box", `(${fmt(result.minX)}, ${fmt(result.minY)}, ${fmt(result.minZ)}) → (${fmt(result.maxX)}, ${fmt(result.maxY)}, ${fmt(result.maxZ)})`],
          ["volume", `${(result.volume / 1000).toFixed(2)} cm³`],
          ["triangles", String(result.facets)],
          ["parts", String(result.parts)],
          ["manifold", result.manifold ? color.green("yes") : color.yellow("no")],
        ])
      );
    }
    return 0;
  } finally {
    if (work) await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** `osa inspect` — print statistics from a sliced G-code / 3MF. */
export async function inspectCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 1) {
    throw new AppError(
      400,
      "Exactly one .gcode or .3mf file is required.\n\n" + inspectHelp
    );
  }
  const file = path.resolve(positionals[0]);
  await assertFile(file);
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".gcode" && ext !== ".3mf") {
    throw new AppError(400, "File must be a .gcode or .3mf file");
  }

  const m = await getMetaDataFromFile(file);
  if (bool(values, "json")) {
    printJson(m);
  } else {
    info(color.bold(path.basename(file)));
    info(
      keyValueTable([
        ["print time", formatDuration(m.printTime)],
        ["filament used", `${m.filamentUsedG.toFixed(2)} g  /  ${m.filamentUsedMm.toFixed(0)} mm`],
        ["layers", String(m.layerCount)],
        ["extrusion starts", String(m.extrusionStarts)],
        ["short moves", String(m.shortMoves)],
        ["bridge moves", String(m.bridgeMoves)],
        ["overhang moves", String(m.overhangMoves)],
        ["support area", `${m.supportAreaCm2.toFixed(2)} cm²`],
        ["brim area", `${m.brimAreaCm2.toFixed(2)} cm²`],
      ])
    );
  }
  return 0;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

async function assertFile(file: string): Promise<void> {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error("not a file");
  } catch {
    throw new AppError(400, `File not found: ${file}`);
  }
}
