import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { loadEnvFile } from "process";

const execFileAsync = promisify(execFile);

// The CLI reads ORCASLICER_PATH / DATA_PATH from .env; load it for the paths
// we forward to spawned CLI processes.
try {
  loadEnvFile();
} catch {
  /* no .env — rely on the ambient environment */
}

const PROJECT_ROOT = process.cwd();
const TSX = path.join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(PROJECT_ROOT, "src", "cli.ts");
const INPUT = path.join(PROJECT_ROOT, "tests", "files", "input");

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the `osa` CLI from TypeScript source and capture its result. */
async function runCli(
  args: string[],
  extraEnv: Record<string, string> = {}
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [CLI, ...args], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        // The shared test setup repoints DATA_PATH at an empty temp dir; the
        // CLI subprocess needs the real, profile-populated data directory.
        DATA_PATH: path.join(PROJECT_ROOT, "data"),
        ...extraEnv,
      },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

let workDir: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "osa-cli-test-"));
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("osa CLI — environment", () => {
  it("prints version information", async () => {
    const r = await runCli(["version"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/orca-slicer-api/);
    expect(r.stdout).toMatch(/OrcaSlicer/);
  });

  it("prints top-level help", async () => {
    const r = await runCli(["help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/USAGE/);
    expect(r.stdout).toMatch(/slice/);
  });

  it("prints per-command help", async () => {
    const r = await runCli(["help", "slice"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/osa slice/);
  });

  it("reports a healthy environment", async () => {
    const r = await runCli(["health", "--json"]);
    expect(r.code).toBe(0);
    const health = JSON.parse(r.stdout);
    expect(health.status).toBe("healthy");
    expect(health.checks.orcaslicer.available).toBe(true);
  });

  it("exits non-zero on an unknown command", async () => {
    const r = await runCli(["bogus-command"]);
    expect(r.code).not.toBe(0);
  });
});

describe("osa CLI — geometry", () => {
  it("inspects an STL model", async () => {
    const r = await runCli(["info", path.join(INPUT, "Cube.stl"), "--json"]);
    expect(r.code).toBe(0);
    const info = JSON.parse(r.stdout);
    expect(info.sizeX).toBeGreaterThan(0);
    expect(info.facets).toBeGreaterThan(0);
  });

  it("inspects a STEP model (CAD conversion)", async () => {
    const r = await runCli(["info", path.join(INPUT, "Cube.step"), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).volume).toBeGreaterThan(0);
  });

  it("converts a STEP file to STL", async () => {
    const out = path.join(workDir, "converted.stl");
    const r = await runCli([
      "convert",
      path.join(INPUT, "Cube.step"),
      "--to",
      "stl",
      "-o",
      out,
    ]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(84);
  });
});

describe("osa CLI — slicing", () => {
  it("slices an STL with named profiles", async () => {
    const out = path.join(workDir, "cube.gcode");
    const r = await runCli([
      "slice",
      path.join(INPUT, "Cube.stl"),
      "--printer",
      "bambua1",
      "--process",
      "bambua1_proc",
      "--filament",
      "bambua1_pla",
      "-o",
      out,
    ]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    const gcode = fs.readFileSync(out, "utf-8");
    expect(gcode).toMatch(/total estimated time/);
  }, 120_000);

  it("slices a STEP file end to end", async () => {
    const out = path.join(workDir, "cube-step.gcode");
    const r = await runCli([
      "slice",
      path.join(INPUT, "Cube.step"),
      "--printer",
      "bambua1",
      "--process",
      "bambua1_proc",
      "--filament",
      "bambua1_pla",
      "-o",
      out,
    ]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
  }, 120_000);

  it("prints the OrcaSlicer command for --dry-run without slicing", async () => {
    const r = await runCli([
      "slice",
      path.join(INPUT, "Cube.stl"),
      "--printer",
      "bambua1",
      "--process",
      "bambua1_proc",
      "--layer-height",
      "0.28",
      "--dry-run",
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/--slice/);
    expect(r.stdout).toMatch(/--load-settings/);
  });

  it("inspects a sliced G-code", async () => {
    const gcode = path.join(workDir, "cube.gcode");
    expect(fs.existsSync(gcode)).toBe(true); // produced by an earlier test
    const r = await runCli(["inspect", gcode, "--json"]);
    expect(r.code).toBe(0);
    const stats = JSON.parse(r.stdout);
    expect(stats.printTime).toBeGreaterThan(0);
    expect(stats.layerCount).toBeGreaterThan(0);
  });
});

describe("osa CLI — profiles & config", () => {
  it("lists stored printer profiles", async () => {
    const r = await runCli(["profiles", "list", "printers"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/printers/);
  });

  it("adds, reads and removes a profile in an isolated data dir", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osa-cli-data-"));
    const env = { DATA_PATH: dataDir };
    const profileFile = path.join(INPUT, "printer.json");

    const add = await runCli(
      ["profiles", "add", "printers", "clitest", profileFile],
      env
    );
    expect(add.code).toBe(0);

    const list = await runCli(["profiles", "list", "printers", "--json"], env);
    expect(JSON.parse(list.stdout)).toContain("clitest");

    const rm = await runCli(["profiles", "rm", "printers", "clitest"], env);
    expect(rm.code).toBe(0);

    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("reads and edits settings inside a profile file", async () => {
    const copy = path.join(workDir, "process.json");
    fs.copyFileSync(path.join(INPUT, "process.json"), copy);

    const set = await runCli([
      "config",
      "set",
      copy,
      "layer_height=0.26",
      "wall_loops=6",
    ]);
    expect(set.code).toBe(0);

    const get = await runCli(["config", "get", copy, "layer-height"]);
    expect(get.code).toBe(0);
    expect(get.stdout.trim()).toBe("0.26");

    const json = JSON.parse(fs.readFileSync(copy, "utf-8"));
    expect(json.wall_loops).toBe("6");
  });

  it("diffs two profile files", async () => {
    const a = path.join(workDir, "a.json");
    const b = path.join(workDir, "b.json");
    fs.writeFileSync(a, JSON.stringify({ layer_height: "0.2" }));
    fs.writeFileSync(b, JSON.stringify({ layer_height: "0.3" }));
    const r = await runCli(["config", "diff", a, b]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/layer_height/);
  });
});
