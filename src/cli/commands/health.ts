import { checkHealth } from "../../routes/health/health.service";
import { parse, bool, info, color, printJson, keyValueTable } from "../util";

export const healthHelp = `${color.bold("osa health")} — check the OrcaSlicer environment

${color.bold("USAGE")}
  osa health [--json]

Verifies the OrcaSlicer binary runs, the data directory is writable and
whether the bundled system-preset catalog is available. Exits non-zero when
the environment is unhealthy.`;

/** `osa health` — environment readiness check. */
export async function healthCommand(argv: string[]): Promise<number> {
  const { values } = parse(argv, { json: { type: "boolean" } });
  const health = await checkHealth();

  if (bool(values, "json")) {
    printJson(health);
  } else {
    const ok = (b: boolean) => (b ? color.green("ok") : color.red("FAIL"));
    info(
      `${color.bold("OrcaSlicer environment:")} ${
        health.status === "healthy"
          ? color.green("healthy")
          : color.red("unhealthy")
      }`
    );
    info(
      keyValueTable([
        [
          "orcaslicer",
          `${ok(health.checks.orcaslicer.available)}  ${
            health.checks.orcaslicer.version
              ? `v${health.checks.orcaslicer.version}`
              : health.checks.orcaslicer.error ?? ""
          }`,
        ],
        ["  path", health.checks.orcaslicer.path ?? color.dim("(unset)")],
        [
          "data dir",
          `${ok(health.checks.dataPath.accessible)}  ${health.checks.dataPath.path}`,
        ],
        [
          "system presets",
          health.checks.systemPresets.available
            ? `${color.green("ok")}  ${health.checks.systemPresets.path}`
            : color.dim("not configured (ORCA_RESOURCES_PATH)"),
        ],
      ])
    );
  }
  return health.status === "healthy" ? 0 : 2;
}
