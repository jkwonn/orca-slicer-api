import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { sliceModel } from "../../src/core/slice";
import { request } from "./setup";

/**
 * Printer-coverage regression test.
 *
 * Slices a real model on a representative sample of the baked printer
 * profiles — every brand in Sinter's PRINTER_DATABASE plus every printer that
 * resolves to the Bambu A1 fallback (verified here on its own profile). Locks
 * in the result of docs/PRINTER-COVERAGE.md so a broken or missing profile is
 * caught immediately.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const MODEL = path.join(__dirname, "../files/input/Cube.stl");

/** [slug, brand, note] — at least one printer per brand + every A1 fallback. */
const SAMPLE: Array<[string, string, string]> = [
  // Bambu Lab
  ["bambua1", "Bambu Lab", "A1"],
  ["bambux1carbon", "Bambu Lab", "X1 Carbon"],
  ["bambuh2d", "Bambu Lab", "H2D / X2D own profile"],
  // Anycubic
  ["anycubickobra3max", "Anycubic", "Kobra 3 / 3 Max"],
  ["anycubickobras1", "Anycubic", "Kobra S1"],
  // Creality
  ["crealityk1", "Creality", "K1 family"],
  ["crealityk2plus", "Creality", "K2 Plus"],
  ["ender3v3", "Creality", "Ender-3 V3 own profile (A1 fallback)"],
  ["ender3v3plus", "Creality", "Ender-3 V3 Plus own profile (A1 fallback)"],
  ["ender5max", "Creality", "Ender-5 Max own profile (A1 fallback)"],
  // Elegoo
  ["elegooneptune4", "Elegoo", "Neptune 4"],
  ["elegoocentauri", "Elegoo", "Centauri Carbon"],
  ["elegoogiga", "Elegoo", "OrangeStorm Giga own profile (A1 fallback)"],
  // Flashforge
  ["flashforgead5m", "Flashforge", "Adventurer 5M"],
  ["flashforgecreator5", "Flashforge", "Creator 5"],
  // Flsun
  ["flsuns1", "Flsun", "S1"],
  ["flsunt1", "Flsun", "T1"],
  // Prusa
  ["prusamk4", "Prusa", "MK4"],
  ["prusaxl", "Prusa", "XL"],
  ["prusacoreone", "Prusa", "CORE One"],
  // Qidi
  ["qidiq2", "Qidi", "Q2"],
  ["qidixmax", "Qidi", "X-Max 3 / X-Max4"],
  ["qidixsmart3", "Qidi", "X-Smart 3 own profile (A1 fallback)"],
  ["qidixplus3", "Qidi", "X-Plus 3 own profile (A1 fallback)"],
  ["qidiplus4", "Qidi", "X-Plus4 own profile (A1 fallback)"],
  // Snapmaker
  ["snapmakerj1", "Snapmaker", "J1"],
  ["snapmakeru1", "Snapmaker", "U1"],
  // Sovol
  ["sovolsv06", "Sovol", "SV06 family"],
  ["sovolsv08", "Sovol", "SV08 family"],
  // Voron
  ["voron24", "Voron", "2.4"],
  ["voron02", "Voron", "0.1 own profile (A1 fallback)"],
];

describe("Printer coverage — every brand slices on its own profile", () => {
  it("ships a complete baked profile triplet for every sampled printer", () => {
    for (const [slug] of SAMPLE) {
      expect(
        fs.existsSync(path.join(DATA_DIR, "printers", `${slug}.json`)),
        `printers/${slug}.json`
      ).toBe(true);
      expect(
        fs.existsSync(path.join(DATA_DIR, "presets", `${slug}_proc.json`)),
        `presets/${slug}_proc.json`
      ).toBe(true);
      expect(
        fs.existsSync(path.join(DATA_DIR, "filaments", `${slug}_pla.json`)),
        `filaments/${slug}_pla.json`
      ).toBe(true);
    }
  });

  it.each(SAMPLE)(
    "slices on %s (%s — %s)",
    async (slug) => {
      const result = await sliceModel({
        inputPath: MODEL,
        printer: { file: path.join(DATA_DIR, "printers", `${slug}.json`) },
        process: { file: path.join(DATA_DIR, "presets", `${slug}_proc.json`) },
        filaments: [
          { file: path.join(DATA_DIR, "filaments", `${slug}_pla.json`) },
        ],
      });
      try {
        expect(result.outputFiles.length).toBeGreaterThan(0);
        const gcode = fs.readFileSync(result.outputFiles[0], "utf-8");
        expect(gcode).toMatch(/G1 /); // contains real toolpaths
        expect(result.metadata.printTime).toBeGreaterThan(0);
        expect(result.metadata.filamentUsedG).toBeGreaterThan(0);
        expect(result.metadata.layerCount).toBeGreaterThan(0);
      } finally {
        fs.rmSync(result.workDir, { recursive: true, force: true });
      }
    },
    120_000
  );
});

describe("Printer coverage — HTTP /slice route", () => {
  // Exercises the same baked profiles through the HTTP API (uploaded profile
  // files), confirming the CLI core and the route behave identically.
  it.each([
    ["bambua1", "Bambu Lab A1"],
    ["prusamk4", "Prusa MK4"],
    ["elegoogiga", "Elegoo OrangeStorm Giga"],
  ])("POST /slice with %s profiles (%s)", async (slug) => {
    const res = await request
      .post("/slice")
      .attach("file", fs.readFileSync(MODEL), "Cube.stl")
      .attach(
        "printerProfile",
        fs.readFileSync(path.join(DATA_DIR, "printers", `${slug}.json`)),
        "printer.json"
      )
      .attach(
        "presetProfile",
        fs.readFileSync(path.join(DATA_DIR, "presets", `${slug}_proc.json`)),
        "process.json"
      )
      .attach(
        "filamentProfile",
        fs.readFileSync(path.join(DATA_DIR, "filaments", `${slug}_pla.json`)),
        "filament.json"
      )
      .expect(200)
      .expect("x-print-time-seconds", /[0-9]+/);
    expect(Number(res.headers["x-print-time-seconds"])).toBeGreaterThan(0);
    expect(Number(res.headers["x-filament-used-g"])).toBeGreaterThan(0);
  }, 120_000);
});
