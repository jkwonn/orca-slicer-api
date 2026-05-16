import { configureApp } from "../../src/index";
import { beforeAll, afterAll } from "vitest";
import supertest, { Test } from "supertest";
import { Server } from "http";
import type TestAgent from "supertest/lib/agent";
import { loadEnvFile } from "process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Load ORCASLICER_PATH / DATA_PATH etc. from .env if present.
try {
  loadEnvFile();
} catch {
  console.warn("No .env file found, proceeding without.");
}

// Isolate profile storage: the profiles suite creates/deletes profiles, so it
// must not touch the real data directory. Each test run gets a fresh temp dir.
const testDataPath = mkdtempSync(join(tmpdir(), "orca-api-test-data-"));
process.env.DATA_PATH = testDataPath;

const app = configureApp();

let server: Server;
let request: TestAgent<Test>;

beforeAll(async () => {
  server = app.listen(0);
  request = supertest(app);
});

afterAll(async () => {
  server.close();
  rmSync(testDataPath, { recursive: true, force: true });
});

export { request };
