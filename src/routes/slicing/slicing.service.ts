import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { AppError } from "../../middleware/error";
import type {
  SlicingSettings,
  SliceResult,
  SliceMetaData,
  UploadedProfiles,
} from "./models";
import { Open } from "unzipper";

/**
 * Parse and clamp a string|number override from the caller. Returns null if
 * the value is missing/invalid so the caller knows to keep the bundled default.
 */
function numericOverride(
  raw: unknown,
  min: number,
  max: number,
): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const v = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

export async function sliceModel(
  file: Buffer,
  filename: string,
  settings: SlicingSettings,
  tempProfiles?: UploadedProfiles,
): Promise<SliceResult> {
  let workdir: string;
  let inPath: string;
  let inputDir: string;
  let outputDir: string;
  try {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), "slice-"));
    inputDir = path.join(workdir, "input");
    outputDir = path.join(workdir, "output");
    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    inPath = path.join(inputDir, filename);
    await fs.writeFile(inPath, file);

    if (tempProfiles) {
      await writeTempProfiles(tempProfiles, inputDir);
    }
  } catch (error) {
    throw new AppError(
      500,
      "Failed to prepare slicing",
      error instanceof Error ? error.message : String(error),
    );
  }

  const basePath = process.env.DATA_PATH || path.join(process.cwd(), "data");

  const args: string[] = [];

  if (settings.exportType === "3mf") {
    args.push("--export-3mf", "result.3mf");
  }

  const sliceArg = settings.plate === undefined ? "1" : settings.plate;
  args.push("--slice", sliceArg);

  // Sinter patch — default arrange/orient to ON so headless slicing mirrors the
  // desktop app's import behaviour. Without these, OrcaSlicer rejects meshes
  // exported at world coordinates (common from Fusion/SolidWorks) with
  // "plate is empty". Callers can still opt out by sending `arrange=false`
  // or `orient=false` explicitly.
  //
  // Multer turns form fields into strings, so `settings.arrange` arrives as
  // "false"/"true", never a real boolean — compare on the string value.
  const arrangeOff =
    settings.arrange === false || String(settings.arrange) === "false";
  args.push("--arrange", arrangeOff ? "0" : "1");

  const orientOff =
    settings.orient === false || String(settings.orient) === "false";
  args.push("--orient", orientOff ? "0" : "1");

  if (tempProfiles?.printer && tempProfiles?.preset) {
    const settingsArg = `${inputDir}/printer.json;${inputDir}/preset.json`;
    args.push("--load-settings", settingsArg);
  } else if (settings.printer && settings.preset) {
    // Patch the loaded preset with (a) auto-support so overhangs always get
    // supports and (b) any advanced overrides the caller sent (layer height,
    // infill, walls, speed). OrcaSlicer only adds support material where the
    // overhang angle exceeds the threshold, so this is free for parts without
    // overhangs. Overrides are validated/clamped before being injected so a
    // malformed value can't produce nonsense G-code.
    const presetPath = `${basePath}/presets/${settings.preset}.json`;
    const machinePath = `${basePath}/printers/${settings.printer}.json`;
    let finalPresetPath = presetPath;
    let finalMachinePath = machinePath;
    try {
      const raw = await fs.readFile(presetPath, "utf-8");
      const preset = JSON.parse(raw);
      let modified = false;

      if (!preset.enable_support || preset.enable_support === "0") {
        preset.enable_support = "1";
        preset.support_type = preset.support_type || "normal(auto)";
        preset.support_threshold_angle = preset.support_threshold_angle || "45";
        modified = true;
      }

      const lh = numericOverride(settings.layerHeight, 0.04, 0.6);
      if (lh !== null) {
        preset.layer_height = String(lh);
        // OrcaSlicer rejects first-layer-height > 1.5× nozzle, so clamp.
        const flh = Math.min(lh, 0.32);
        preset.initial_layer_print_height = String(flh);
        modified = true;
      }

      const infill = numericOverride(settings.infillDensity, 0, 100);
      if (infill !== null) {
        preset.sparse_infill_density = `${Math.round(infill)}%`;
        modified = true;
      }

      const walls = numericOverride(settings.wallCount, 1, 10);
      if (walls !== null) {
        preset.wall_loops = String(Math.floor(walls));
        modified = true;
      }

      // Map our coarse buckets to multipliers on outer/inner-wall speeds. The
      // bundled presets define explicit mm/s values so multiplying preserves
      // the proportions OrcaSlicer expects across acceleration/jerk fields.
      const speedMultiplier =
        settings.printSpeed === "slow" ? 0.6
        : settings.printSpeed === "safe" ? 0.8
        : settings.printSpeed === "standard" ? 1.0
        : null;
      if (speedMultiplier !== null && speedMultiplier !== 1.0) {
        const scaleFloat = (s: unknown) => {
          const v = typeof s === "string" ? parseFloat(s) : Number(s);
          return Number.isFinite(v) ? String(v * speedMultiplier) : s;
        };
        for (const k of [
          "outer_wall_speed",
          "inner_wall_speed",
          "sparse_infill_speed",
          "internal_solid_infill_speed",
          "top_surface_speed",
          "gap_infill_speed",
          "support_speed",
          "travel_speed",
          "bridge_speed",
          "overhang_speed",
        ]) {
          if (preset[k] != null) preset[k] = scaleFloat(preset[k]);
        }
        modified = true;
      }

      if (modified) {
        const tmpPreset = path.join(inputDir, "preset_override.json");
        await fs.writeFile(tmpPreset, JSON.stringify(preset));
        finalPresetPath = tmpPreset;
      }
    } catch {
      // If reading/patching fails, use the original preset as-is
    }

    // Nozzle diameter lives on the machine profile, not the preset. Patch a
    // machine override only if requested — most callers leave the printer's
    // bundled nozzle alone.
    const nozzle = numericOverride(settings.nozzleDiameter, 0.1, 2.0);
    if (nozzle !== null) {
      try {
        const raw = await fs.readFile(machinePath, "utf-8");
        const machine = JSON.parse(raw);
        machine.nozzle_diameter = [String(nozzle)];
        const tmpMachine = path.join(inputDir, "machine_override.json");
        await fs.writeFile(tmpMachine, JSON.stringify(machine));
        finalMachinePath = tmpMachine;
      } catch {
        // ignore — use bundled machine profile
      }
    }

    const settingsArg = `${finalMachinePath};${finalPresetPath}`;
    args.push("--load-settings", settingsArg);
  }

  if (tempProfiles?.filament) {
    args.push("--load-filaments", `${inputDir}/filament.json`);
  } else if (settings.filament) {
    args.push(
      "--load-filaments",
      `${basePath}/filaments/${settings.filament}.json`,
    );
  }

  if (settings.bedType) {
    args.push("--curr-bed-type", settings.bedType);
  }

  if (settings.multicolorOnePlate) {
    args.push("--allow-multicolor-oneplate");
  }

  args.push("--allow-newer-file");
  args.push("--outputdir", outputDir);

  args.push(inPath);

  if (!process.env.ORCASLICER_PATH) {
    throw new AppError(
      500,
      "Slicing is not configured properly on the server",
      "ORCASLICER_PATH environment variable is not defined",
    );
  }

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        process.env.ORCASLICER_PATH as string,
        args,
        {
          encoding: "utf-8",
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
    });
  } catch (err) {
    const resultJsonPath = path.join(outputDir, "result.json");
    let json;
    try {
      const content = await fs.readFile(resultJsonPath, "utf-8");
      json = JSON.parse(content);
    } catch {
      await fs.rm(workdir, { recursive: true, force: true });

      throw new AppError(
        500,
        "Failed to slice the model",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (json?.error_string) {
      await fs.rm(workdir, { recursive: true, force: true });

      throw new AppError(
        500,
        `Slicing failed with error from slicer: ${json.error_string}`,
      );
    }

    await fs.rm(workdir, { recursive: true, force: true });

    throw new AppError(
      500,
      "Failed to slice the model",
      err instanceof Error ? err.message : String(err),
    );
  }

  const files = await fs.readdir(outputDir);
  let resultFiles: string[];

  if (settings.exportType === "3mf") {
    resultFiles = files
      .filter((f) => f.toLowerCase().endsWith(".3mf"))
      .map((f) => path.join(outputDir, f));
  } else {
    resultFiles = files
      .filter((f) => f.toLowerCase().endsWith(".gcode"))
      .map((f) => path.join(outputDir, f));
  }

  return { gcodes: resultFiles, workdir };
}

/**
 * Extract metadata (print time, filament used) from a G-code or 3MF file.
 * @param filePath The path to the file.
 * @returns The extracted metadata.
 */
export async function getMetaDataFromFile(
  filePath: string,
): Promise<SliceMetaData> {
  let data: SliceMetaData = {
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

  if (filePath.endsWith(".gcode")) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      data = parseMetaDataFromString(content);
    } catch (error) {
      console.error(
        "Failed to read G-code file for metadata extraction:",
        error,
      );
    }
  } else if (filePath.endsWith(".3mf")) {
    try {
      const dir = await Open.file(filePath);
      for (const file of dir.files.filter((f) => f.path.endsWith(".gcode"))) {
        const content = (await file.buffer()).toString("utf-8");
        const metaData = parseMetaDataFromString(content);
        data.printTime += metaData.printTime;
        data.filamentUsedG += metaData.filamentUsedG;
        data.filamentUsedMm += metaData.filamentUsedMm;
        data.layerCount += metaData.layerCount;
        data.extrusionStarts += metaData.extrusionStarts;
        data.shortMoves += metaData.shortMoves;
        data.bridgeMoves += metaData.bridgeMoves;
        data.overhangMoves += metaData.overhangMoves;
        data.supportAreaCm2 += metaData.supportAreaCm2;
        data.brimAreaCm2 += metaData.brimAreaCm2;
      }
    } catch (error) {
      console.error("Failed to read 3MF file for metadata extraction:", error);
    }
  }

  return data;
}

function parseMetaDataFromString(content: string): SliceMetaData {
  const data: SliceMetaData = {
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

  // Pricing metrics: scan G1 moves once, tracking the current feature.
  // Extrusion start = transition from non-extruding to extruding move.
  // Short move = XY extrusion move with travel distance < 0.5mm.
  // Support/brim area = sum(move distance) × line_width / 100 (cm²).
  try {
    let lastX = 0;
    let lastY = 0;
    let lastWasExtruding = false;
    let currentFeature: string | null = null;
    let outerWallLineWidth = 0.42;
    let supportLineWidth = 0.42;
    let supportLengthMm = 0;
    let brimLengthMm = 0;

    const X_RE = /X(-?\d+(?:\.\d+)?)/;
    const Y_RE = /Y(-?\d+(?:\.\d+)?)/;
    const E_RE = /E(-?\d*\.?\d+)/;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw) continue;

      if (raw.startsWith("; FEATURE: ")) {
        currentFeature = raw.slice("; FEATURE: ".length).trim();
        continue;
      }
      if (raw.startsWith("; CHANGE_LAYER")) {
        data.layerCount += 1;
        continue;
      }
      if (raw.startsWith("; outer_wall_line_width = ")) {
        const v = parseFloat(raw.slice("; outer_wall_line_width = ".length));
        if (Number.isFinite(v) && v > 0) outerWallLineWidth = v;
        continue;
      }
      if (raw.startsWith("; support_line_width = ")) {
        const v = parseFloat(raw.slice("; support_line_width = ".length));
        if (Number.isFinite(v) && v > 0) supportLineWidth = v;
        continue;
      }
      if (!raw.startsWith("G1 ") && !raw.startsWith("G1\t")) continue;

      const xm = X_RE.exec(raw);
      const ym = Y_RE.exec(raw);
      const em = E_RE.exec(raw);

      const newX = xm ? parseFloat(xm[1]) : lastX;
      const newY = ym ? parseFloat(ym[1]) : lastY;
      const eDelta = em ? parseFloat(em[1]) : 0;

      const dx = newX - lastX;
      const dy = newY - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isExtruding = eDelta > 0;
      const movedXY = (xm !== null || ym !== null) && dist > 0.0001;

      if (isExtruding && movedXY) {
        if (!lastWasExtruding) data.extrusionStarts += 1;
        if (dist < 0.5) data.shortMoves += 1;
        if (
          currentFeature === "Bridge" ||
          currentFeature === "Internal Bridge"
        ) {
          data.bridgeMoves += 1;
        } else if (currentFeature === "Overhang wall") {
          data.overhangMoves += 1;
        } else if (
          currentFeature === "Support" ||
          currentFeature === "Support interface"
        ) {
          supportLengthMm += dist;
        } else if (currentFeature === "Brim") {
          brimLengthMm += dist;
        }
        lastWasExtruding = true;
      } else {
        lastWasExtruding = false;
      }

      if (xm) lastX = newX;
      if (ym) lastY = newY;
    }

    data.supportAreaCm2 = (supportLengthMm * supportLineWidth) / 100;
    data.brimAreaCm2 = (brimLengthMm * outerWallLineWidth) / 100;
  } catch (err) {
    console.error("Failed to parse pricing metrics from G-code:", err);
  }

  try {
    // Extract print time
    const timeIndex = content.indexOf("total estimated time");
    if (timeIndex !== -1) {
      const timeSlice = content.slice(timeIndex, timeIndex + 80);
      const timeMatch = timeSlice.match(
        /total estimated time:\s*((?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?)/i,
      );
      if (timeMatch) {
        const days = parseInt(timeMatch[2] || "0");
        const hours = parseInt(timeMatch[3] || "0");
        const minutes = parseInt(timeMatch[4] || "0");
        const seconds = parseInt(timeMatch[5] || "0");
        data.printTime = days * 86400 + hours * 3600 + minutes * 60 + seconds;
      }
    }

    if (timeIndex === -1) {
      const altTimeIndex = content.indexOf(
        "; estimated printing time (normal mode)",
      );
      if (altTimeIndex !== -1) {
        const timeSlice = content.slice(altTimeIndex, altTimeIndex + 100);
        const timeMatch = timeSlice.match(
          /; estimated printing time \(normal mode\) = \s*((?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?)/i,
        );
        if (timeMatch) {
          const days = parseInt(timeMatch[2] || "0");
          const hours = parseInt(timeMatch[3] || "0");
          const minutes = parseInt(timeMatch[4] || "0");
          const seconds = parseInt(timeMatch[5] || "0");
          data.printTime = days * 86400 + hours * 3600 + minutes * 60 + seconds;
        }
      }
    }

    // Extract filament used [mm]
    const filamentMmIndex = content.indexOf("; filament used [mm]");
    if (filamentMmIndex !== -1) {
      const filamentMmSlice = content.slice(
        filamentMmIndex,
        filamentMmIndex + 50,
      );
      const mmMatch = filamentMmSlice.match(
        /; filament used \[mm\] = \s*(\d+(\.\d+)?)/,
      );
      if (mmMatch) {
        data.filamentUsedMm = parseFloat(mmMatch[1]);
      }
    }

    // Extract filament used [g]
    const filamentGIndex = content.indexOf("; filament used [g]");
    if (filamentGIndex !== -1) {
      const filamentGSlice = content.slice(filamentGIndex, filamentGIndex + 50);
      const gMatch = filamentGSlice.match(
        /; filament used \[g\] = \s*(\d+(\.\d+)?)/,
      );
      if (gMatch) {
        data.filamentUsedG = parseFloat(gMatch[1]);
      }
    }
  } catch (err) {
    console.error("Failed to parse metadata from string:", err);
  }

  return data;
}

async function writeTempProfiles(
  profiles: UploadedProfiles,
  inputDir: string,
): Promise<void> {
  try {
    const printerPath = path.join(inputDir, "printer.json");
    const presetPath = path.join(inputDir, "preset.json");
    const filamentPath = path.join(inputDir, "filament.json");

    const writes: Promise<void>[] = [];

    if (profiles.printer && profiles.printer.length > 0) {
      writes.push(fs.writeFile(printerPath, profiles.printer));
    }
    if (profiles.preset && profiles.preset.length > 0) {
      writes.push(fs.writeFile(presetPath, profiles.preset));
    }
    if (profiles.filament && profiles.filament.length > 0) {
      writes.push(fs.writeFile(filamentPath, profiles.filament));
    }

    await Promise.all(writes);
  } catch (error) {
    throw new AppError(
      500,
      "Failed to write temporary profiles",
      error instanceof Error ? error.message : String(error),
    );
  }
}
