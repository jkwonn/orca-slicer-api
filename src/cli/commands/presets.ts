import { AppError } from "../../core/errors";
import {
  listVendors,
  listSystemPresets,
  readFlattenedPreset,
  type PresetKind,
} from "../../core/presets";
import { parse, bool, info, color, printJson, bulletList } from "../util";

export const presetsHelp = `${color.bold("osa presets")} — browse OrcaSlicer's bundled system presets

${color.bold("USAGE")}
  osa presets vendors
  osa presets list <vendor> <kind>
  osa presets show <vendor> <kind> <name> [--json]

${color.bold("KINDS")}
  machine    printer profiles
  process    process profiles
  filament   filament profiles

${color.bold("NOTES")}
  Requires ORCA_RESOURCES_PATH (OrcaSlicer's resources directory) or an
  ORCASLICER_PATH that points directly at the binary.
  'show' prints the preset with its inherits chain fully resolved.

${color.bold("EXAMPLES")}
  osa presets vendors
  osa presets list BBL machine
  osa presets show BBL process "0.20mm Standard @BBL A1" --json`;

const KINDS: PresetKind[] = ["machine", "process", "filament"];

/** `osa presets <sub>` dispatcher. */
export async function presetsCommand(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "vendors":
      return vendorsSub(rest);
    case "list":
    case "ls":
      return listSub(rest);
    case "show":
    case "get":
      return showSub(rest);
    default:
      throw new AppError(
        400,
        `Unknown subcommand "${sub ?? ""}".\n\n` + presetsHelp
      );
  }
}

async function vendorsSub(argv: string[]): Promise<number> {
  const { values } = parse(argv, { json: { type: "boolean" } });
  const vendors = await listVendors();
  if (bool(values, "json")) {
    printJson(vendors);
  } else {
    info(color.bold(`vendors (${vendors.length})`));
    info(bulletList(vendors));
  }
  return 0;
}

async function listSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa presets list <vendor> <kind>");
  }
  const [vendor, kind] = positionals;
  assertKind(kind);
  const names = await listSystemPresets(vendor, kind);
  if (bool(values, "json")) {
    printJson(names);
  } else {
    info(color.bold(`${vendor}/${kind} (${names.length})`));
    info(bulletList(names));
  }
  return 0;
}

async function showSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 3) {
    throw new AppError(400, "Usage: osa presets show <vendor> <kind> <name>");
  }
  const [vendor, kind, name] = positionals;
  assertKind(kind);
  const preset = await readFlattenedPreset(vendor, kind, name);
  printJson(preset);
  return 0;
}

function assertKind(kind: string): asserts kind is PresetKind {
  if (!KINDS.includes(kind as PresetKind)) {
    throw new AppError(
      400,
      `Invalid kind "${kind}". Expected one of: ${KINDS.join(", ")}`
    );
  }
}
