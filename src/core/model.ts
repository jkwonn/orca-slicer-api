import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { createRequire } from "module";
import { AppError } from "./errors";
import { runOrca, orcaFailure } from "./orca";

/**
 * Model-file utilities: format detection, CAD → mesh conversion and geometry
 * inspection. These cover the OrcaSlicer GUI's "import" and "object info"
 * behaviour for the headless CLI / API.
 */

/** Model formats OrcaSlicer's headless engine can slice directly. */
export const MESH_EXTENSIONS = [".stl", ".obj", ".amf", ".3mf"];
/** CAD formats that must be converted to a mesh before slicing. */
export const CAD_EXTENSIONS = [".step", ".stp", ".iges", ".igs", ".brep"];
/** Every model format accepted on input. */
export const SUPPORTED_EXTENSIONS = [...MESH_EXTENSIONS, ...CAD_EXTENSIONS];

/** Lower-case file extension including the leading dot. */
export function extOf(file: string): string {
  return path.extname(file).toLowerCase();
}

/** Whether a path is a CAD format needing conversion before slicing. */
export function isCadFile(file: string): boolean {
  return CAD_EXTENSIONS.includes(extOf(file));
}

/** Whether a path is a mesh / project format the slicer loads directly. */
export function isMeshFile(file: string): boolean {
  return MESH_EXTENSIONS.includes(extOf(file));
}

/** Geometry summary produced by {@link getModelInfo}. */
export interface ModelInfo {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  facets: number;
  parts: number;
  manifold: boolean;
  /** Volume in mm³. */
  volume: number;
}

interface OcctMesh {
  attributes: { position: { array: number[] } };
  index: { array: number[] };
}
interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}
interface OcctModule {
  ReadStepFile(data: Uint8Array, params: unknown): OcctResult;
  ReadIgesFile(data: Uint8Array, params: unknown): OcctResult;
  ReadBrepFile(data: Uint8Array, params: unknown): OcctResult;
}

let occtPromise: Promise<OcctModule> | undefined;

/** Lazily initialise the OpenCASCADE (WASM) module used for CAD conversion. */
async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = (async () => {
      // occt-import-js ships a CJS factory; load it through createRequire so
      // it resolves regardless of whether we run as ESM source or build.
      const require = createRequire(import.meta.url);
      const factory = require("occt-import-js") as () => Promise<OcctModule>;
      return factory();
    })();
  }
  return occtPromise;
}

/**
 * Convert a CAD file (STEP / IGES / BREP) into a binary STL buffer by
 * triangulating it with OpenCASCADE. All solids in the file are merged into a
 * single STL, matching how the GUI imports a multi-body CAD assembly.
 */
export async function convertCadToStl(inputPath: string): Promise<Buffer> {
  const ext = extOf(inputPath);
  const data = new Uint8Array(await fs.readFile(inputPath));
  const occt = await getOcct();

  let result: OcctResult;
  try {
    if (ext === ".step" || ext === ".stp") {
      result = occt.ReadStepFile(data, null);
    } else if (ext === ".iges" || ext === ".igs") {
      result = occt.ReadIgesFile(data, null);
    } else if (ext === ".brep") {
      result = occt.ReadBrepFile(data, null);
    } else {
      throw new AppError(400, `Not a CAD file: ${inputPath}`);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      `Failed to parse CAD file ${path.basename(inputPath)}`,
      error instanceof Error ? error.message : String(error)
    );
  }

  if (!result.success || result.meshes.length === 0) {
    throw new AppError(
      422,
      `CAD file ${path.basename(inputPath)} contains no solid geometry`
    );
  }

  return meshesToBinaryStl(result.meshes);
}

/**
 * Convert a CAD file and write the resulting STL next to (or at) `outPath`.
 * Returns the STL path actually written.
 */
export async function convertCadFile(
  inputPath: string,
  outPath: string
): Promise<string> {
  const stl = await convertCadToStl(inputPath);
  await fs.writeFile(outPath, stl);
  return outPath;
}

/** Serialise OpenCASCADE triangle meshes into one binary STL buffer. */
function meshesToBinaryStl(meshes: OcctMesh[]): Buffer {
  let triangleCount = 0;
  for (const m of meshes) triangleCount += m.index.array.length / 3;

  const buf = Buffer.alloc(84 + triangleCount * 50);
  buf.write("Binary STL written by orca-slicer-api CAD converter", 0, "ascii");
  buf.writeUInt32LE(triangleCount, 80);

  let offset = 84;
  for (const mesh of meshes) {
    const pos = mesh.attributes.position.array;
    const idx = mesh.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      const b = idx[i + 1] * 3;
      const c = idx[i + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];

      // Face normal from the triangle's edge cross product.
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      buf.writeFloatLE(nx, offset);
      buf.writeFloatLE(ny, offset + 4);
      buf.writeFloatLE(nz, offset + 8);
      buf.writeFloatLE(ax, offset + 12);
      buf.writeFloatLE(ay, offset + 16);
      buf.writeFloatLE(az, offset + 20);
      buf.writeFloatLE(bx, offset + 24);
      buf.writeFloatLE(by, offset + 28);
      buf.writeFloatLE(bz, offset + 32);
      buf.writeFloatLE(cx, offset + 36);
      buf.writeFloatLE(cy, offset + 40);
      buf.writeFloatLE(cz, offset + 44);
      buf.writeUInt16LE(0, offset + 48);
      offset += 50;
    }
  }
  return buf;
}

/**
 * Inspect a mesh file with OrcaSlicer's `--info` action and return a
 * structured {@link ModelInfo}. CAD files must be converted first.
 */
export async function getModelInfo(meshPath: string): Promise<ModelInfo> {
  if (isCadFile(meshPath)) {
    throw new AppError(
      400,
      "Convert CAD files to a mesh before inspecting them"
    );
  }
  // `--info` has no --outputdir, so OrcaSlicer drops a result.json in its cwd.
  // Run it inside a throwaway directory to keep the working tree clean.
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "orca-info-"));
  try {
    const result = await runOrca(["--info", meshPath], {
      timeoutMs: 60000,
      cwd: scratch,
    });
    if (result.code !== 0 && !/size_x/.test(result.stdout)) {
      throw orcaFailure(result);
    }
    return parseInfoOutput(result.stdout);
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/** Parse the `key = value` lines emitted by OrcaSlicer `--info`. */
export function parseInfoOutput(stdout: string): ModelInfo {
  const fields: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/i);
    if (m) fields[m[1]] = m[2];
  }
  const num = (k: string): number => {
    const v = parseFloat(fields[k]);
    return Number.isFinite(v) ? v : 0;
  };
  if (fields.size_x === undefined) {
    throw new AppError(
      422,
      "OrcaSlicer did not return model info — the file may be unreadable"
    );
  }
  return {
    sizeX: num("size_x"),
    sizeY: num("size_y"),
    sizeZ: num("size_z"),
    minX: num("min_x"),
    minY: num("min_y"),
    minZ: num("min_z"),
    maxX: num("max_x"),
    maxY: num("max_y"),
    maxZ: num("max_z"),
    facets: num("number_of_facets"),
    parts: num("number_of_parts"),
    manifold: /yes|true/i.test(fields.manifold ?? ""),
    volume: num("volume"),
  };
}
