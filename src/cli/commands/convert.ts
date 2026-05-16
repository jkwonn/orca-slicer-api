import { promises as fs } from "fs";
import * as path from "path";
import { AppError } from "../../core/errors";
import { convertModel, type ConvertFormat } from "../../core/convert";
import { parse, str, bool, info, color, printJson } from "../util";

export const convertHelp = `${color.bold("osa convert")} — convert a model to STL or 3MF

${color.bold("USAGE")}
  osa convert <model> --to <stl|3mf> [-o <path>]

${color.bold("OPTIONS")}
  --to <stl|3mf>      Target format (default: stl)
  -o, --output <path> Output file, or directory for multi-file output
  --json              Print the result as JSON

${color.bold("NOTES")}
  STEP / IGES / BREP CAD files are triangulated with OpenCASCADE.
  Mesh and 3MF inputs are repackaged with OrcaSlicer.

${color.bold("EXAMPLES")}
  osa convert bracket.step --to stl -o bracket.stl
  osa convert model.stl --to 3mf -o project.3mf`;

/** `osa convert` — model format conversion. */
export async function convertCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv, {
    to: { type: "string" },
    output: { type: "string", short: "o" },
    json: { type: "boolean" },
  });

  if (positionals.length !== 1) {
    throw new AppError(400, "Exactly one model file is required.\n\n" + convertHelp);
  }
  const input = path.resolve(positionals[0]);
  const to = (str(values, "to") ?? "stl").toLowerCase();
  if (to !== "stl" && to !== "3mf") {
    throw new AppError(400, '--to must be "stl" or "3mf"');
  }

  const result = await convertModel(input, to as ConvertFormat);
  try {
    const written = await writeFiles(
      result.outputFiles,
      str(values, "output"),
      input,
      to
    );
    if (bool(values, "json")) {
      printJson({ outputs: written });
    } else {
      info(color.green(`✓ Converted to ${to.toUpperCase()}`));
      for (const w of written) info(`  ${w}`);
    }
    return 0;
  } finally {
    await fs.rm(result.workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function writeFiles(
  produced: string[],
  output: string | undefined,
  input: string,
  format: string
): Promise<string[]> {
  const base = path.basename(input, path.extname(input));

  if (produced.length === 1 && output && !output.endsWith("/")) {
    const dest = path.resolve(output);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(produced[0], dest);
    return [rel(dest)];
  }

  const dir = output ? path.resolve(output) : process.cwd();
  await fs.mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (let i = 0; i < produced.length; i++) {
    const name =
      produced.length === 1
        ? `${base}.${format}`
        : path.basename(produced[i]);
    const dest = path.join(dir, name);
    await fs.copyFile(produced[i], dest);
    written.push(rel(dest));
  }
  return written;
}

function rel(p: string): string {
  const r = path.relative(process.cwd(), p);
  return r.startsWith("..") ? p : r;
}
