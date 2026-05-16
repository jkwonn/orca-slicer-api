import { Router } from "express";
import multer from "multer";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { AppError } from "../../middleware/error";
import { uploadModel } from "../../middleware/upload";
import {
  getModelInfo,
  convertCadFile,
  isCadFile,
  extOf,
} from "../../core/model";
import { convertModel, type ConvertFormat } from "../../core/convert";
import { getMetaDataFromFile } from "../../core/metadata";
import { generateMetaDataHeaders } from "../slicing/helpers";

/**
 * Model "tools" endpoints — the headless counterparts of OrcaSlicer GUI
 * actions that are not slicing:
 *   POST /info     — geometry inspection of an uploaded model
 *   POST /convert  — STEP/mesh → STL or 3MF conversion (`?to=stl|3mf`)
 *   POST /inspect  — print-stats extraction from an uploaded G-code / 3MF
 */
const router = Router();

// G-code / 3MF can be large; accept any file for the inspect endpoint.
const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200_000_000 },
});

/** Inspect an uploaded model's geometry (bounding box, volume, manifold). */
router.post("/info", uploadModel.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "Model file is required");

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "orca-info-"));
  try {
    const src = path.join(work, sanitize(req.file.originalname));
    await fs.writeFile(src, req.file.buffer);

    let meshPath = src;
    if (isCadFile(src)) {
      meshPath = path.join(work, "converted.stl");
      await convertCadFile(src, meshPath);
    }
    const info = await getModelInfo(meshPath);
    res.status(200).json(info);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

/** Convert an uploaded model to STL or 3MF and stream the result back. */
router.post("/convert", uploadModel.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "Model file is required");

  const to = String(req.query.to ?? req.body?.to ?? "stl").toLowerCase();
  if (to !== "stl" && to !== "3mf") {
    throw new AppError(400, 'Query "to" must be "stl" or "3mf"');
  }

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "orca-conv-in-"));
  let convertWorkDir: string | undefined;
  try {
    const src = path.join(work, sanitize(req.file.originalname));
    await fs.writeFile(src, req.file.buffer);

    const result = await convertModel(src, to as ConvertFormat);
    convertWorkDir = result.workDir;

    if (result.outputFiles.length === 0) {
      throw new AppError(500, "Conversion produced no output");
    }
    const out = result.outputFiles[0];
    res.download(out, path.basename(out), async () => {
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
      if (convertWorkDir) {
        await fs.rm(convertWorkDir, { recursive: true, force: true }).catch(
          () => {}
        );
      }
    });
  } catch (error) {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    if (convertWorkDir) {
      await fs
        .rm(convertWorkDir, { recursive: true, force: true })
        .catch(() => {});
    }
    throw error;
  }
});

/** Extract print statistics from an uploaded G-code or 3MF file. */
router.post("/inspect", uploadAny.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "G-code or 3MF file is required");
  const ext = extOf(req.file.originalname);
  if (ext !== ".gcode" && ext !== ".3mf") {
    throw new AppError(400, "File must be a .gcode or .3mf file");
  }

  const work = await fs.mkdtemp(path.join(os.tmpdir(), "orca-inspect-"));
  try {
    const src = path.join(work, `upload${ext}`);
    await fs.writeFile(src, req.file.buffer);
    const metadata = await getMetaDataFromFile(src);
    res.set(generateMetaDataHeaders(metadata));
    res.status(200).json(metadata);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

function sanitize(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "model.stl";
}

export default router;
