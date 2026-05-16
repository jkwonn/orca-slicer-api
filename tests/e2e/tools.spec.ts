import { describe, expect, it } from "vitest";
import { request } from "./setup";
import fs from "fs";
import path from "path";

const input = (f: string) => path.join(__dirname, "../files/input", f);

describe("Tools API", () => {
  describe("POST /tools/info", () => {
    it("returns geometry info for an STL model", async () => {
      const res = await request
        .post("/tools/info")
        .attach("file", fs.readFileSync(input("Cube.stl")), "Cube.stl")
        .expect(200)
        .expect("Content-Type", /json/);
      expect(res.body.sizeX).toBeGreaterThan(0);
      expect(res.body.sizeY).toBeGreaterThan(0);
      expect(res.body.sizeZ).toBeGreaterThan(0);
      expect(res.body.facets).toBeGreaterThan(0);
      expect(typeof res.body.manifold).toBe("boolean");
    });

    it("converts and inspects a STEP model", async () => {
      const res = await request
        .post("/tools/info")
        .attach("file", fs.readFileSync(input("Cube.step")), {
          filename: "Cube.step",
          contentType: "application/step",
        })
        .expect(200);
      expect(res.body.volume).toBeGreaterThan(0);
    });

    it("rejects a request with no file", async () => {
      await request.post("/tools/info").expect(400);
    });
  });

  describe("POST /tools/convert", () => {
    it("converts a STEP file to STL", async () => {
      const res = await request
        .post("/tools/convert?to=stl")
        .responseType("blob")
        .attach("file", fs.readFileSync(input("Cube.step")), {
          filename: "Cube.step",
          contentType: "application/step",
        })
        .expect(200);
      // Binary STL: 80-byte header + uint32 triangle count.
      expect(res.body.length).toBeGreaterThan(84);
      expect(res.body.readUInt32LE(80)).toBeGreaterThan(0);
    });

    it("converts an STL file to 3MF", async () => {
      const res = await request
        .post("/tools/convert?to=3mf")
        .responseType("blob")
        .attach("file", fs.readFileSync(input("Cube.stl")), "Cube.stl")
        .expect(200);
      // 3MF is a ZIP archive — starts with the PK signature.
      expect(res.body.slice(0, 2).toString("latin1")).toBe("PK");
    });

    it("rejects an invalid target format", async () => {
      await request
        .post("/tools/convert?to=obj")
        .attach("file", fs.readFileSync(input("Cube.stl")), "Cube.stl")
        .expect(400);
    });
  });

  describe("POST /tools/inspect", () => {
    it("extracts print stats from a sliced G-code", async () => {
      // Slice first, then feed the produced G-code back to /tools/inspect.
      const sliced = await request
        .post("/slice")
        .responseType("blob")
        .attach("file", fs.readFileSync(input("Cube.3mf")), "Cube.3mf")
        .expect(200);

      const res = await request
        .post("/tools/inspect")
        .attach("file", Buffer.from(sliced.body), "result.gcode")
        .expect(200)
        .expect("Content-Type", /json/);
      expect(res.body.printTime).toBeGreaterThan(0);
      expect(res.body.filamentUsedG).toBeGreaterThan(0);
      expect(res.body.layerCount).toBeGreaterThan(0);
    });

    it("rejects a non-gcode/3mf file", async () => {
      await request
        .post("/tools/inspect")
        .attach("file", fs.readFileSync(input("Cube.stl")), "Cube.stl")
        .expect(400);
    });
  });
});

describe("Presets API", () => {
  it("lists preset vendors", async () => {
    const res = await request.get("/presets").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain("BBL");
  });

  it("lists machine presets for a vendor", async () => {
    const res = await request.get("/presets/BBL/machine").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("rejects an invalid preset kind", async () => {
    await request.get("/presets/BBL/bogus").expect(400);
  });
});

describe("Profiles API — PATCH", () => {
  it("patches settings on a stored profile", async () => {
    const printerBuffer = fs.readFileSync(input("printer.json"));
    await request
      .post("/profiles/printers")
      .field("name", "patchtarget")
      .attach("file", printerBuffer, "printer.json")
      .expect(201);

    await request
      .patch("/profiles/printers/patchtarget")
      .send({ set: ["layer_height=0.33", "wall_loops=5"] })
      .expect(200)
      .expect((res) => {
        if (!Array.isArray(res.body.changed)) {
          throw new Error("expected a changed[] array");
        }
      });

    const res = await request
      .get("/profiles/printers/patchtarget")
      .expect(200);
    expect(res.body.layer_height).toBe("0.33");
    expect(res.body.wall_loops).toBe("5");
  });

  it("rejects a PATCH with no set field", async () => {
    const printerBuffer = fs.readFileSync(input("printer.json"));
    await request
      .post("/profiles/printers")
      .field("name", "patchempty")
      .attach("file", printerBuffer, "printer.json")
      .expect(201);
    await request.patch("/profiles/printers/patchempty").send({}).expect(400);
  });
});
