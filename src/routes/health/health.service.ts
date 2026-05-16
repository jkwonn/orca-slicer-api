import { promises as fs } from "fs";
import { getDataPath, getOrcaPathOrNull } from "../../core/env";
import { getOrcaVersion } from "../../core/orca";
import { getProfilesRoot } from "../../core/presets";

/**
 * Environment health check shared by the HTTP `/health` route and the CLI
 * `health` command: verifies the OrcaSlicer binary runs and the data
 * directory is writable.
 */
export interface HealthCheck {
  status: "healthy" | "unhealthy";
  timestamp: string;
  checks: {
    orcaslicer: {
      available: boolean;
      version?: string;
      path?: string;
      error?: string;
    };
    dataPath: {
      accessible: boolean;
      path: string;
      error?: string;
    };
    systemPresets: {
      available: boolean;
      path?: string;
    };
  };
}

export async function checkHealth(): Promise<HealthCheck> {
  const timestamp = new Date().toISOString();
  const checks: HealthCheck["checks"] = {
    orcaslicer: { available: false },
    dataPath: { accessible: false, path: getDataPath() },
    systemPresets: { available: false },
  };

  // --- OrcaSlicer binary ---
  const orcaPath = getOrcaPathOrNull();
  if (!orcaPath) {
    checks.orcaslicer.error = "ORCASLICER_PATH is not set";
  } else {
    checks.orcaslicer.path = orcaPath;
    try {
      await fs.access(orcaPath, fs.constants.X_OK);
      checks.orcaslicer.version = getOrcaVersion();
      checks.orcaslicer.available = true;
    } catch (error) {
      checks.orcaslicer.error =
        error instanceof Error ? error.message : String(error);
    }
  }

  // --- Data directory ---
  try {
    await fs.mkdir(checks.dataPath.path, { recursive: true });
    await fs.access(
      checks.dataPath.path,
      fs.constants.R_OK | fs.constants.W_OK
    );
    checks.dataPath.accessible = true;
  } catch (error) {
    checks.dataPath.error =
      error instanceof Error ? error.message : String(error);
  }

  // --- Bundled system presets (optional) ---
  const presetsRoot = getProfilesRoot();
  if (presetsRoot) {
    checks.systemPresets.available = true;
    checks.systemPresets.path = presetsRoot;
  }

  const status =
    checks.orcaslicer.available && checks.dataPath.accessible
      ? "healthy"
      : "unhealthy";

  return { status, timestamp, checks };
}
