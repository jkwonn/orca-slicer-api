export interface SlicingSettings {
  printer?: string;
  preset?: string;
  filament?: string;
  bedType?: string;
  plate?: string;
  multicolorOnePlate?: boolean;
  arrange?: boolean;
  orient?: boolean;
  exportType?: "gcode" | "3mf";
}

export interface SliceResult {
  gcodes: string[];
  workdir: string;
}

export interface SliceMetaData {
  printTime: number; //print time in seconds
  filamentUsedG: number; // filament used in grams
  filamentUsedMm: number; // total length of filament used in millimeters
  layerCount: number; // total number of layers
  extrusionStarts: number; // count of distinct extrusion paths (travel→extrude transitions)
  shortMoves: number; // count of XY extrusion moves under 0.5mm (fine detail proxy)
  bridgeMoves: number; // count of extrusion moves inside Bridge/Internal Bridge features
  overhangMoves: number; // count of extrusion moves inside Overhang wall features
  supportAreaCm2: number; // total support+interface line area in cm² (length×line_width)
  brimAreaCm2: number; // total brim line area in cm²
}

export type Category = "printers" | "presets" | "filaments";

export interface UploadedProfiles {
  printer?: Buffer;
  preset?: Buffer;
  filament?: Buffer;
}
