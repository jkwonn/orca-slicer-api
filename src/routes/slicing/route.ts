import { Router } from "express";
import { uploadFullPrint } from "../../middleware/upload";
import { AppError } from "../../middleware/error";
import type {
  SliceMetaData,
  SlicingSettings,
  UploadedProfiles,
} from "./models";
import { getMetaDataFromFile, sliceModel } from "./slicing.service";
import fs from "fs/promises";
import path from "path";
import archiver from "archiver";
import { generateMetaDataHeaders } from "./helpers";

const router = Router();

router.post(
  "/",
  uploadFullPrint.fields([
    { name: "file", maxCount: 1 },
    { name: "printerProfile", maxCount: 1 },
    { name: "presetProfile", maxCount: 1 },
    { name: "filamentProfile", maxCount: 1 },
  ]),
  async (req, res) => {
    if (!req.files || Array.isArray(req.files)) {
      throw new AppError(
        400,
        "Invalid file upload format: files must be uploaded as named fields",
      );
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files["file"]) {
      throw new AppError(400, "Model file is required for slicing");
    }

    const modelFile = files["file"][0];

    const { gcodes, workdir } = await sliceModel(
      modelFile.buffer,
      modelFile.originalname,
      req.body as SlicingSettings,
      {
        printer: files["printerProfile"]?.[0]?.buffer,
        preset: files["presetProfile"]?.[0]?.buffer,
        filament: files["filamentProfile"]?.[0]?.buffer,
      } as UploadedProfiles,
    );

    if (gcodes.length === 1) {
      try {
        const metadata = await getMetaDataFromFile(gcodes[0]);
        res.set(generateMetaDataHeaders(metadata));

        res.download(gcodes[0]);
      } finally {
        await fs.rm(workdir, { recursive: true, force: true });
      }
    } else if (gcodes.length > 1) {
      const metadata: SliceMetaData = {
        printTime: 0,
        filamentUsedG: 0,
        filamentUsedMm: 0,
        layerCount: 0,
        extrusionStarts: 0,
        shortMoves: 0,
        bridgeMoves: 0,
        overhangMoves: 0,
        supportAreaCm2: 0,
        brimAreaCm2: 0,
      };

      for (const filePath of gcodes) {
        if (!filePath.endsWith(".gcode")) continue;

        const fileMetadata = await getMetaDataFromFile(filePath);
        metadata.printTime += fileMetadata.printTime;
        metadata.filamentUsedG += fileMetadata.filamentUsedG;
        metadata.filamentUsedMm += fileMetadata.filamentUsedMm;
        metadata.layerCount += fileMetadata.layerCount;
        metadata.extrusionStarts += fileMetadata.extrusionStarts;
        metadata.shortMoves += fileMetadata.shortMoves;
        metadata.bridgeMoves += fileMetadata.bridgeMoves;
        metadata.overhangMoves += fileMetadata.overhangMoves;
        metadata.supportAreaCm2 += fileMetadata.supportAreaCm2;
        metadata.brimAreaCm2 += fileMetadata.brimAreaCm2;
      }

      res.set(generateMetaDataHeaders(metadata));

      res.attachment("result.zip");
      const archive = archiver("zip", { zlib: { level: 9 } });

      archive.on("error", (err) => {
        throw new AppError(500, `Error creating archive: ${err.message}`);
      });

      res.on("finish", async () => {
        await fs.rm(workdir, { recursive: true, force: true });
      });

      archive.pipe(res);
      gcodes.forEach((filePath) => {
        archive.file(filePath, { name: path.basename(filePath) });
      });

      await archive.finalize();
    } else {
      throw new AppError(500, "No files generated during slicing");
    }
  },
);

export default router;
