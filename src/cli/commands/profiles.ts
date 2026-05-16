import { promises as fs } from "fs";
import * as path from "path";
import { AppError } from "../../core/errors";
import {
  assertCategory,
  assertValidName,
  listProfiles,
  getProfile,
  saveProfile,
  deleteProfile,
  parseProfileBuffer,
  profilePath,
  CATEGORIES,
  type Category,
} from "../../core/profiles";
import { readFlattenedPreset, type PresetKind } from "../../core/presets";
import { parse, str, bool, info, color, printJson, bulletList } from "../util";

export const profilesHelp = `${color.bold("osa profiles")} — manage stored printer / process / filament profiles

${color.bold("USAGE")}
  osa profiles list <category>
  osa profiles show <category> <name> [--json]
  osa profiles add <category> <name> <file.json>
  osa profiles rm <category> <name>
  osa profiles path <category> <name>
  osa profiles import <category> <preset-name> [--vendor <V>] [--as <name>]

${color.bold("CATEGORIES")}
  printers   machine profiles
  presets    process profiles
  filaments  filament profiles

${color.bold("EXAMPLES")}
  osa profiles list printers
  osa profiles show presets bambua1_proc --json
  osa profiles add filaments my_petg ./my_petg.json
  osa profiles import printers "Bambu Lab A1 0.4 nozzle" --vendor BBL --as bambua1`;

const CATEGORY_TO_KIND: Record<Category, PresetKind> = {
  printers: "machine",
  presets: "process",
  filaments: "filament",
};

/** `osa profiles <sub>` dispatcher. */
export async function profilesCommand(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "list":
      return listSub(rest);
    case "show":
    case "get":
      return showSub(rest);
    case "add":
    case "save":
      return addSub(rest);
    case "rm":
    case "remove":
    case "delete":
      return rmSub(rest);
    case "path":
      return pathSub(rest);
    case "import":
      return importSub(rest);
    default:
      throw new AppError(
        400,
        `Unknown subcommand "${sub ?? ""}".\n\n` + profilesHelp
      );
  }
}

async function listSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length === 0) {
    // List every category.
    const all: Record<string, string[]> = {};
    for (const c of CATEGORIES) all[c] = await listProfiles(c);
    if (bool(values, "json")) {
      printJson(all);
    } else {
      for (const c of CATEGORIES) {
        info(color.bold(c) + color.dim(` (${all[c].length})`));
        info(bulletList(all[c]));
      }
    }
    return 0;
  }
  const category = positionals[0];
  assertCategory(category);
  const names = await listProfiles(category as Category);
  if (bool(values, "json")) {
    printJson(names);
  } else {
    info(color.bold(`${category} (${names.length})`));
    info(bulletList(names));
  }
  return 0;
}

async function showSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa profiles show <category> <name>");
  }
  const [category, name] = positionals;
  assertCategory(category);
  assertValidName(name);
  const profile = await getProfile(category as Category, name);
  // The JSON is the natural representation either way.
  void bool(values, "json");
  printJson(profile);
  return 0;
}

async function addSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  if (positionals.length !== 3) {
    throw new AppError(
      400,
      "Usage: osa profiles add <category> <name> <file.json>"
    );
  }
  const [category, name, file] = positionals;
  assertCategory(category);
  assertValidName(name);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(path.resolve(file));
  } catch {
    throw new AppError(400, `Profile file not found: ${file}`);
  }
  const content = parseProfileBuffer(buffer);
  await saveProfile(category as Category, name, content);
  info(color.green(`✓ Saved ${category}/${name}`));
  return 0;
}

async function rmSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa profiles rm <category> <name>");
  }
  const [category, name] = positionals;
  assertCategory(category);
  assertValidName(name);
  await deleteProfile(category as Category, name);
  info(color.green(`✓ Removed ${category}/${name}`));
  return 0;
}

async function pathSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa profiles path <category> <name>");
  }
  const [category, name] = positionals;
  assertCategory(category);
  assertValidName(name);
  info(profilePath(category as Category, name));
  return 0;
}

async function importSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    vendor: { type: "string" },
    as: { type: "string" },
  });
  if (positionals.length !== 2) {
    throw new AppError(
      400,
      "Usage: osa profiles import <category> <preset-name> [--vendor V] [--as name]"
    );
  }
  const [category, presetName] = positionals;
  assertCategory(category);
  const vendor = str(values, "vendor") ?? "BBL";
  const kind = CATEGORY_TO_KIND[category as Category];

  const flattened = await readFlattenedPreset(vendor, kind, presetName);
  const slug =
    str(values, "as") ??
    presetName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  assertValidName(slug);
  await saveProfile(category as Category, slug, flattened);
  info(color.green(`✓ Imported ${vendor}/${kind}/${presetName} → ${category}/${slug}`));
  return 0;
}
