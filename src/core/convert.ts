import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { AppError } from "./errors";
import { runOrca, orcaFailure } from "./orca";
import {
  convertCadFile,
  isCadFile,
  isMeshFile,
  extOf,
  SUPPORTED_EXTENSIONS,
} from "./model";

/**
 * Model format conversion / repackaging — the headless equivalent of the
 * OrcaSlicer GUI's "Export plate sliced file" / "Export object as STL" and
 * its CAD import. Supports:
 *   - any CAD/mesh  → STL  (single merged mesh)
 *   - any mesh/3MF  → 3MF  (project package)
 */

export type ConvertFormat = "stl" | "3mf";

export interface ConvertResult {
  /** Absolute paths of the produced files. */
  outputFiles: string[];
  /** Working directory containing the outputs — caller cleans up. */
  workDir: string;
}

/**
 * Convert `inputPath` to `format`. Outputs land in a fresh working directory;
 * the caller is responsible for moving them and removing `workDir`.
 */
export async function convertModel(
  inputPath: string,
  format: ConvertFormat
): Promise<ConvertResult> {
  const ext = extOf(inputPath);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      400,
      `Unsupported input format "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
    );
  }
  try {
    await fs.access(inputPath);
  } catch {
    throw new AppError(400, `Input file not found: ${inputPath}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-convert-"));
  const outputDir = path.join(workDir, "output");
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Stage the model — CAD geometry is triangulated to STL up front.
    let meshPath = inputPath;
    if (isCadFile(inputPath)) {
      const base = path.basename(inputPath, ext);
      meshPath = path.join(workDir, `${base}.stl`);
      await convertCadFile(inputPath, meshPath);
      if (format === "stl") {
        const out = path.join(outputDir, `${base}.stl`);
        await fs.rename(meshPath, out);
        return { outputFiles: [out], workDir };
      }
    } else if (!isMeshFile(inputPath)) {
      throw new AppError(400, `Cannot convert "${inputPath}"`);
    }

    if (format === "stl") {
      const run = await runOrca(["--export-stl", "--outputdir", outputDir, meshPath], {
        outputDir,
        timeoutMs: 120000,
      });
      if (run.code !== 0 && run.resultJson?.error_string !== "Success.") {
        throw orcaFailure(run);
      }
      const stlDir = path.join(outputDir, "stl");
      const files = await safeReaddir(stlDir);
      if (files.length === 0) throw orcaFailure(run);
      return {
        outputFiles: files
          .filter((f) => f.toLowerCase().endsWith(".stl"))
          .map((f) => path.join(stlDir, f)),
        workDir,
      };
    }

    // format === "3mf"
    const run = await runOrca(
      ["--export-3mf", "result.3mf", "--outputdir", outputDir, meshPath],
      { outputDir, timeoutMs: 120000 }
    );
    if (run.code !== 0 && run.resultJson?.error_string !== "Success.") {
      throw orcaFailure(run);
    }
    const files = await safeReaddir(outputDir);
    const threeMf = files
      .filter((f) => f.toLowerCase().endsWith(".3mf"))
      .map((f) => path.join(outputDir, f));
    if (threeMf.length === 0) throw orcaFailure(run);
    return { outputFiles: threeMf, workDir };
  } catch (error) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}
