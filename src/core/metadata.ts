import { promises as fs } from "fs";
import { Open } from "unzipper";

/**
 * Metadata extracted from a sliced G-code (or the G-code embedded in a 3MF).
 * The first three fields come straight from OrcaSlicer's G-code summary
 * comments; the remainder are derived by scanning extrusion moves and feed
 * Sinter's pricing model.
 */
export interface SliceMetaData {
  /** Total estimated print time, seconds. */
  printTime: number;
  /** Filament consumed, grams. */
  filamentUsedG: number;
  /** Filament consumed, millimetres of length. */
  filamentUsedMm: number;
  /** Total layer count. */
  layerCount: number;
  /** Distinct extrusion paths (travel→extrude transitions). */
  extrusionStarts: number;
  /** XY extrusion moves under 0.5 mm (fine-detail proxy). */
  shortMoves: number;
  /** Extrusion moves inside Bridge / Internal Bridge features. */
  bridgeMoves: number;
  /** Extrusion moves inside Overhang wall features. */
  overhangMoves: number;
  /** Support + interface line area, cm². */
  supportAreaCm2: number;
  /** Brim line area, cm². */
  brimAreaCm2: number;
}

/** A fresh, zeroed {@link SliceMetaData} accumulator. */
export function emptyMetaData(): SliceMetaData {
  return {
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
}

/** Add every numeric field of `src` into `dst` in place. */
export function addMetaData(dst: SliceMetaData, src: SliceMetaData): void {
  dst.printTime += src.printTime;
  dst.filamentUsedG += src.filamentUsedG;
  dst.filamentUsedMm += src.filamentUsedMm;
  dst.layerCount += src.layerCount;
  dst.extrusionStarts += src.extrusionStarts;
  dst.shortMoves += src.shortMoves;
  dst.bridgeMoves += src.bridgeMoves;
  dst.overhangMoves += src.overhangMoves;
  dst.supportAreaCm2 += src.supportAreaCm2;
  dst.brimAreaCm2 += src.brimAreaCm2;
}

/**
 * Extract {@link SliceMetaData} from a G-code or 3MF file on disk. For a 3MF
 * every embedded `.gcode` is parsed and the results summed.
 */
export async function getMetaDataFromFile(
  filePath: string
): Promise<SliceMetaData> {
  let data = emptyMetaData();

  if (filePath.toLowerCase().endsWith(".gcode")) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      data = parseMetaDataFromString(content);
    } catch (error) {
      console.error(
        "Failed to read G-code file for metadata extraction:",
        error
      );
    }
  } else if (filePath.toLowerCase().endsWith(".3mf")) {
    try {
      const dir = await Open.file(filePath);
      for (const file of dir.files.filter((f) =>
        f.path.toLowerCase().endsWith(".gcode")
      )) {
        const content = (await file.buffer()).toString("utf-8");
        addMetaData(data, parseMetaDataFromString(content));
      }
    } catch (error) {
      console.error("Failed to read 3MF file for metadata extraction:", error);
    }
  }

  return data;
}

/**
 * Parse {@link SliceMetaData} out of raw G-code text.
 *
 * Pricing metrics are derived in a single pass over `G1` moves while tracking
 * the current `; FEATURE:` block:
 *  - extrusion start — transition from a non-extruding to an extruding move
 *  - short move      — XY extrusion move with travel distance < 0.5 mm
 *  - support/brim    — sum(move distance) × line_width / 100 → cm²
 */
export function parseMetaDataFromString(content: string): SliceMetaData {
  const data = emptyMetaData();

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

    // OrcaSlicer writes an authoritative `; total layer number: N` summary
    // line. Prefer it: the `; CHANGE_LAYER` marker counted above only appears
    // in Bambu-flavour G-code, so non-Bambu printers (Marlin/Klipper, which
    // use `;LAYER_CHANGE`) would otherwise report zero layers.
    const totalLayerMatch = content.match(/; total layer number:\s*(\d+)/i);
    if (totalLayerMatch) {
      data.layerCount = parseInt(totalLayerMatch[1], 10);
    }
  } catch (err) {
    console.error("Failed to parse pricing metrics from G-code:", err);
  }

  try {
    const timeIndex = content.indexOf("total estimated time");
    if (timeIndex !== -1) {
      const timeSlice = content.slice(timeIndex, timeIndex + 80);
      const timeMatch = timeSlice.match(
        /total estimated time:\s*((?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?)/i
      );
      if (timeMatch) {
        data.printTime = durationToSeconds(timeMatch);
      }
    }

    if (timeIndex === -1) {
      const altTimeIndex = content.indexOf(
        "; estimated printing time (normal mode)"
      );
      if (altTimeIndex !== -1) {
        const timeSlice = content.slice(altTimeIndex, altTimeIndex + 100);
        const timeMatch = timeSlice.match(
          /; estimated printing time \(normal mode\) = \s*((?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?)/i
        );
        if (timeMatch) {
          data.printTime = durationToSeconds(timeMatch);
        }
      }
    }

    const filamentMmIndex = content.indexOf("; filament used [mm]");
    if (filamentMmIndex !== -1) {
      const mmMatch = content
        .slice(filamentMmIndex, filamentMmIndex + 50)
        .match(/; filament used \[mm\] = \s*(\d+(\.\d+)?)/);
      if (mmMatch) data.filamentUsedMm = parseFloat(mmMatch[1]);
    }

    const filamentGIndex = content.indexOf("; filament used [g]");
    if (filamentGIndex !== -1) {
      const gMatch = content
        .slice(filamentGIndex, filamentGIndex + 50)
        .match(/; filament used \[g\] = \s*(\d+(\.\d+)?)/);
      if (gMatch) data.filamentUsedG = parseFloat(gMatch[1]);
    }
  } catch (err) {
    console.error("Failed to parse metadata from string:", err);
  }

  return data;
}

/** Convert a `[full, , d?, h?, m?, s?]` regex match into seconds. */
function durationToSeconds(m: RegExpMatchArray): number {
  const days = parseInt(m[2] || "0");
  const hours = parseInt(m[3] || "0");
  const minutes = parseInt(m[4] || "0");
  const seconds = parseInt(m[5] || "0");
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}
