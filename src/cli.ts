#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";
import { loadEnv, getProjectRoot } from "./core/env";
import { getOrcaVersion } from "./core/orca";
import { runCommand, info, warn, color, printJson } from "./cli/util";
import { topHelp } from "./cli/help";
import { sliceCommand, sliceHelp } from "./cli/commands/slice";
import {
  infoCommand,
  infoHelp,
  inspectCommand,
  inspectHelp,
} from "./cli/commands/info";
import { convertCommand, convertHelp } from "./cli/commands/convert";
import { profilesCommand, profilesHelp } from "./cli/commands/profiles";
import { configCommand, configHelp } from "./cli/commands/config";
import { presetsCommand, presetsHelp } from "./cli/commands/presets";
import { serveCommand, serveHelp } from "./cli/commands/serve";
import { healthCommand, healthHelp } from "./cli/commands/health";

/** Per-command help text, keyed by command name. */
const HELP: Record<string, string> = {
  slice: sliceHelp,
  info: infoHelp,
  inspect: inspectHelp,
  convert: convertHelp,
  profiles: profilesHelp,
  config: configHelp,
  presets: presetsHelp,
  serve: serveHelp,
  health: healthHelp,
};

/** CLI version, read from the project's package.json. */
function getCliVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(getProjectRoot(), "package.json"), "utf-8")
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function main(): Promise<number> {
  loadEnv();

  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);

  // Global help / version handling.
  if (!command || command === "help" || command === "--help" || command === "-h") {
    const target = rest[0] ?? argv[1];
    if (command === "help" && target && HELP[target]) {
      info(HELP[target]);
    } else if (command && command !== "help" && command !== "--help" && command !== "-h") {
      info(topHelp);
    } else {
      info(topHelp);
    }
    return 0;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    const cliVersion = getCliVersion();
    let orca = "unavailable";
    try {
      orca = getOrcaVersion();
    } catch {
      /* ORCASLICER_PATH not set — leave as unavailable */
    }
    if (rest.includes("--json")) {
      printJson({ cli: cliVersion, orcaslicer: orca, node: process.version });
    } else {
      info(`${color.bold("osa")} (orca-slicer-api) v${cliVersion}`);
      info(`OrcaSlicer        ${orca}`);
      info(`Node.js           ${process.version}`);
    }
    return 0;
  }

  // A per-command `--help` / `-h` prints that command's help and exits.
  if (rest.includes("--help") || rest.includes("-h")) {
    if (HELP[command]) {
      info(HELP[command]);
      return 0;
    }
  }

  switch (command) {
    case "slice":
      return runCommand(() => sliceCommand(rest));
    case "info":
      return runCommand(() => infoCommand(rest));
    case "inspect":
      return runCommand(() => inspectCommand(rest));
    case "convert":
      return runCommand(() => convertCommand(rest));
    case "profiles":
      return runCommand(() => profilesCommand(rest));
    case "config":
      return runCommand(() => configCommand(rest));
    case "presets":
      return runCommand(() => presetsCommand(rest));
    case "serve":
      return runCommand(() => serveCommand(rest));
    case "health":
      return runCommand(() => healthCommand(rest));
    default:
      warn(color.red(`Unknown command: ${command}`));
      warn(`Run ${color.bold("osa help")} to see available commands.`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    warn(color.red(`fatal: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(2);
  });
