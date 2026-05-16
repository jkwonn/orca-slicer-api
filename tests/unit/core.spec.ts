import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseMetaDataFromString, emptyMetaData } from "../../src/core/metadata";
import { parseInfoOutput } from "../../src/core/model";
import { convertCadToStl } from "../../src/core/model";
import {
  numericOverride,
  applyProcessOverrides,
  applyMachineOverrides,
} from "../../src/core/overrides";
import {
  normalizeKey,
  parseAssignment,
  setConfigValues,
  getConfigValue,
  unsetConfigValue,
  diffConfig,
} from "../../src/core/settings";
import { assertValidName, assertCategory } from "../../src/core/profiles";

describe("core/metadata", () => {
  it("parses print time, filament use and layer count from G-code", () => {
    const gcode = [
      "; CHANGE_LAYER",
      "; FEATURE: Outer wall",
      "G1 X10 Y0 E0.5",
      "G1 X10 Y10 E0.5",
      "; CHANGE_LAYER",
      "; FEATURE: Bridge",
      "G1 X0 Y10 E0.5",
      "; FEATURE: Brim",
      "G1 X0 Y0 E0.2",
      "; total estimated time: 1h 2m 3s",
      "; filament used [mm] = 1234.5",
      "; filament used [g] = 5.67",
    ].join("\n");

    const m = parseMetaDataFromString(gcode);
    expect(m.printTime).toBe(3600 + 120 + 3);
    expect(m.filamentUsedMm).toBeCloseTo(1234.5);
    expect(m.filamentUsedG).toBeCloseTo(5.67);
    expect(m.layerCount).toBe(2);
    expect(m.bridgeMoves).toBe(1);
    expect(m.extrusionStarts).toBeGreaterThan(0);
  });

  it("returns a zeroed accumulator from emptyMetaData", () => {
    const m = emptyMetaData();
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });
});

describe("core/model — info parsing", () => {
  it("parses OrcaSlicer --info output into a structured object", () => {
    const out = [
      "size_x = 20.000000",
      "size_y = 30.000000",
      "size_z = 40.000000",
      "min_x = 0.000000",
      "min_y = 0.000000",
      "min_z = 0.000000",
      "max_x = 20.000000",
      "max_y = 30.000000",
      "max_z = 40.000000",
      "number_of_facets = 240",
      "manifold = yes",
      "number_of_parts =  2",
      "volume = 12000.5",
    ].join("\n");
    const info = parseInfoOutput(out);
    expect(info.sizeX).toBe(20);
    expect(info.sizeZ).toBe(40);
    expect(info.facets).toBe(240);
    expect(info.parts).toBe(2);
    expect(info.manifold).toBe(true);
    expect(info.volume).toBeCloseTo(12000.5);
  });

  it("throws when --info output is empty", () => {
    expect(() => parseInfoOutput("garbage")).toThrow();
  });
});

describe("core/model — CAD conversion", () => {
  it("converts a STEP file to a valid binary STL", async () => {
    const stepPath = path.join(__dirname, "../files/input/Cube.step");
    const stl = await convertCadToStl(stepPath);
    // Binary STL: 80-byte header + uint32 count + 50 bytes/triangle.
    expect(stl.length).toBeGreaterThan(84);
    const triangleCount = stl.readUInt32LE(80);
    expect(triangleCount).toBeGreaterThan(0);
    expect(stl.length).toBe(84 + triangleCount * 50);
  });
});

describe("core/overrides", () => {
  it("clamps numeric overrides to a valid range", () => {
    expect(numericOverride("0.2", 0.04, 0.6)).toBe(0.2);
    expect(numericOverride("99", 0.04, 0.6)).toBeNull();
    expect(numericOverride("", 0, 100)).toBeNull();
    expect(numericOverride(undefined, 0, 100)).toBeNull();
  });

  it("applies process overrides to a preset object", () => {
    const preset: Record<string, unknown> = { outer_wall_speed: "100" };
    const changed = applyProcessOverrides(preset, {
      layerHeight: 0.28,
      infillDensity: 25,
      wallLoops: 4,
      support: "tree",
      printSpeed: "slow",
    });
    expect(changed).toBe(true);
    expect(preset.layer_height).toBe("0.28");
    expect(preset.sparse_infill_density).toBe("25%");
    expect(preset.wall_loops).toBe("4");
    expect(preset.enable_support).toBe("1");
    expect(preset.support_type).toBe("tree(auto)");
    expect(preset.outer_wall_speed).toBe("60"); // 100 * 0.6
  });

  it("auto-enables support only when the preset has it off", () => {
    const off: Record<string, unknown> = { enable_support: "0" };
    expect(applyProcessOverrides(off, { autoEnableSupport: true })).toBe(true);
    expect(off.enable_support).toBe("1");

    const on: Record<string, unknown> = { enable_support: "1" };
    expect(applyProcessOverrides(on, { autoEnableSupport: true })).toBe(false);
  });

  it("applies a nozzle diameter machine override", () => {
    const machine: Record<string, unknown> = {};
    expect(applyMachineOverrides(machine, { nozzleDiameter: 0.6 })).toBe(true);
    expect(machine.nozzle_diameter).toEqual(["0.6"]);
  });
});

describe("core/settings", () => {
  it("normalises hyphen keys to underscore form", () => {
    expect(normalizeKey("layer-height")).toBe("layer_height");
    expect(normalizeKey(" wall_loops ")).toBe("wall_loops");
  });

  it("parses key=value assignments", () => {
    expect(parseAssignment("layer_height=0.2")).toEqual({
      key: "layer_height",
      value: "0.2",
    });
    expect(() => parseAssignment("nonsense")).toThrow();
  });

  it("sets, reads and unsets config values", () => {
    const obj: Record<string, unknown> = {};
    const changed = setConfigValues(obj, [
      { key: "layer_height", value: "0.24" },
      { key: "nozzle_diameter", value: '["0.4"]' },
    ]);
    expect(changed).toEqual(["layer_height", "nozzle_diameter"]);
    expect(getConfigValue(obj, "layer_height")).toBe("0.24");
    expect(getConfigValue(obj, "nozzle_diameter")).toEqual(["0.4"]);
    expect(unsetConfigValue(obj, "layer_height")).toBe(true);
    expect(unsetConfigValue(obj, "missing")).toBe(false);
  });

  it("diffs two config objects", () => {
    const diffs = diffConfig(
      { a: "1", b: "2", c: "3" },
      { a: "1", b: "9", d: "4" }
    );
    const keys = diffs.map((d) => d.key);
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys).toContain("d");
    expect(keys).not.toContain("a");
  });
});

describe("core/profiles — validation", () => {
  it("accepts valid names and rejects invalid ones", () => {
    expect(() => assertValidName("bambua1_proc")).not.toThrow();
    expect(() => assertValidName("test-printer!")).toThrow();
    expect(() => assertValidName("")).toThrow();
  });

  it("accepts known categories and rejects unknown ones", () => {
    expect(() => assertCategory("printers")).not.toThrow();
    expect(() => assertCategory("presets")).not.toThrow();
    expect(() => assertCategory("bogus")).toThrow();
  });
});

describe("test fixtures", () => {
  it("ships the model fixtures used by the suite", () => {
    for (const f of ["Cube.stl", "Cube.step", "Cube.3mf"]) {
      expect(fs.existsSync(path.join(__dirname, "../files/input", f))).toBe(
        true
      );
    }
  });
});
