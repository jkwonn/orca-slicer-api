import multer from "multer";
import path from "path";
import { AppError } from "./error";
import { SUPPORTED_EXTENSIONS } from "../core/model";

/**
 * Multer upload middlewares.
 *
 * Model files are validated by extension rather than MIME type: 3D model
 * formats have no consistent MIME registration and clients (curl, fetch,
 * SDKs) routinely send `application/octet-stream`. The extension is what
 * OrcaSlicer itself keys off, so it is the authoritative check here.
 */
const storage = multer.memoryStorage();

const allowedModelExts = SUPPORTED_EXTENSIONS; // .stl .obj .amf .3mf .step .stp .iges .igs .brep
const modelTypeMessage = `Invalid file type. Supported model formats: ${allowedModelExts.join(", ")}`;

/** True when a filename has an accepted model extension. */
function hasModelExt(filename: string): boolean {
  return allowedModelExts.includes(path.extname(filename).toLowerCase());
}

/** True when a filename / MIME pair looks like a JSON profile. */
function isJsonProfile(filename: string, mimetype: string): boolean {
  return (
    path.extname(filename).toLowerCase() === ".json" &&
    (mimetype === "application/json" || mimetype === "application/octet-stream")
  );
}

export const uploadJson = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!isJsonProfile(file.originalname, file.mimetype)) {
      return cb(
        new AppError(400, "Invalid file type. Only JSON files are allowed.")
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 4_000_000 },
});

export const uploadModel = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!hasModelExt(file.originalname)) {
      return cb(new AppError(400, modelTypeMessage));
    }
    cb(null, true);
  },
  limits: { fileSize: 200_000_000 },
});

export const uploadFullPrint = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const profileFields = [
      "printerProfile",
      "presetProfile",
      "filamentProfile",
    ];

    if (file.fieldname === "file") {
      if (!hasModelExt(file.originalname)) {
        return cb(new AppError(400, modelTypeMessage));
      }
      return cb(null, true);
    }

    if (profileFields.includes(file.fieldname)) {
      if (!isJsonProfile(file.originalname, file.mimetype)) {
        return cb(
          new AppError(
            400,
            `Invalid file type for ${file.fieldname}. Only JSON files are allowed.`
          )
        );
      }
      return cb(null, true);
    }

    return cb(new AppError(400, "Unexpected file field received."));
  },
  limits: { fileSize: 200_000_000 },
});
