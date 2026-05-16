import * as path from "path";
import { AppError } from "../../core/errors";
import {
  readProfileFile,
  writeProfileFile,
  getConfigValue,
  setConfigValues,
  unsetConfigValue,
  parseAssignment,
  diffConfig,
} from "../../core/settings";
import { parse, bool, info, color, printJson, keyValueTable } from "../util";

export const configHelp = `${color.bold("osa config")} — read and edit settings inside a profile JSON file

${color.bold("USAGE")}
  osa config get <file> <key>
  osa config set <file> <key=value> [<key=value> ...]
  osa config unset <file> <key>
  osa config list <file> [--json] [--filter <substr>]
  osa config diff <file-a> <file-b> [--json]

${color.bold("NOTES")}
  Keys may use underscores (layer_height) or hyphens (layer-height).
  Array values are written when the value looks like JSON (e.g. '["0.4"]').
  Resolve a stored profile's path with: osa profiles path <category> <name>

${color.bold("EXAMPLES")}
  osa config get data/presets/bambua1_proc.json layer_height
  osa config set data/presets/bambua1_proc.json layer_height=0.28 wall_loops=4
  osa config list data/printers/bambua1.json --filter nozzle
  osa config diff old.json new.json`;

/** `osa config <sub>` dispatcher. */
export async function configCommand(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case "get":
      return getSub(rest);
    case "set":
      return setSub(rest);
    case "unset":
    case "rm":
      return unsetSub(rest);
    case "list":
    case "ls":
      return listSub(rest);
    case "diff":
      return diffSub(rest);
    default:
      throw new AppError(
        400,
        `Unknown subcommand "${sub ?? ""}".\n\n` + configHelp
      );
  }
}

async function getSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa config get <file> <key>");
  }
  const [file, key] = positionals;
  const obj = await readProfileFile(path.resolve(file));
  const value = getConfigValue(obj, key);
  if (bool(values, "json")) {
    printJson(value);
  } else {
    info(typeof value === "string" ? value : JSON.stringify(value));
  }
  return 0;
}

async function setSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  if (positionals.length < 2) {
    throw new AppError(400, "Usage: osa config set <file> <key=value> ...");
  }
  const file = path.resolve(positionals[0]);
  const assignments = positionals.slice(1).map(parseAssignment);
  const obj = await readProfileFile(file);
  const changed = setConfigValues(obj, assignments);
  await writeProfileFile(file, obj);
  info(color.green(`✓ Updated ${changed.length} setting(s): ${changed.join(", ")}`));
  return 0;
}

async function unsetSub(argv: string[]): Promise<number> {
  const { positionals } = parse(argv, {});
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa config unset <file> <key>");
  }
  const file = path.resolve(positionals[0]);
  const obj = await readProfileFile(file);
  const removed = unsetConfigValue(obj, positionals[1]);
  if (!removed) {
    throw new AppError(404, `Setting "${positionals[1]}" was not present`);
  }
  await writeProfileFile(file, obj);
  info(color.green(`✓ Removed ${positionals[1]}`));
  return 0;
}

async function listSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    json: { type: "boolean" },
    filter: { type: "string" },
  });
  if (positionals.length !== 1) {
    throw new AppError(400, "Usage: osa config list <file> [--filter <substr>]");
  }
  const obj = await readProfileFile(path.resolve(positionals[0]));
  const filter = (values.filter as string | undefined)?.toLowerCase();
  let entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  if (filter) entries = entries.filter(([k]) => k.toLowerCase().includes(filter));

  if (bool(values, "json")) {
    printJson(Object.fromEntries(entries));
  } else {
    info(color.dim(`${entries.length} setting(s)`));
    info(
      keyValueTable(
        entries.map(([k, v]) => [
          k,
          Array.isArray(v) ? JSON.stringify(v) : String(v),
        ])
      )
    );
  }
  return 0;
}

async function diffSub(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, { json: { type: "boolean" } });
  if (positionals.length !== 2) {
    throw new AppError(400, "Usage: osa config diff <file-a> <file-b>");
  }
  const left = await readProfileFile(path.resolve(positionals[0]));
  const right = await readProfileFile(path.resolve(positionals[1]));
  const diffs = diffConfig(left, right);

  if (bool(values, "json")) {
    printJson(diffs);
  } else if (diffs.length === 0) {
    info(color.green("✓ No differences"));
  } else {
    info(color.dim(`${diffs.length} difference(s)`));
    for (const d of diffs) {
      info(`  ${color.bold(d.key)}`);
      info(`    ${color.red("- " + JSON.stringify(d.left))}`);
      info(`    ${color.green("+ " + JSON.stringify(d.right))}`);
    }
  }
  return 0;
}
