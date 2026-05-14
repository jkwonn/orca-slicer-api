import type { SliceMetaData } from "./models";

export function generateMetaDataHeaders(metadata: SliceMetaData) {
  const headers: Record<string, string> = {};
  headers["X-Print-Time-Seconds"] = metadata.printTime.toString();
  headers["X-Filament-Used-g"] = metadata.filamentUsedG.toString();
  headers["X-Filament-Used-mm"] = metadata.filamentUsedMm.toString();
  headers["X-Layer-Count"] = metadata.layerCount.toString();
  headers["X-Extrusion-Starts"] = metadata.extrusionStarts.toString();
  headers["X-Short-Moves"] = metadata.shortMoves.toString();
  headers["X-Bridge-Moves"] = metadata.bridgeMoves.toString();
  headers["X-Overhang-Moves"] = metadata.overhangMoves.toString();
  headers["X-Support-Area-Cm2"] = metadata.supportAreaCm2.toString();
  headers["X-Brim-Area-Cm2"] = metadata.brimAreaCm2.toString();
  return headers;
}
