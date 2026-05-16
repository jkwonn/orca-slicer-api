import { startServer } from "../../index";
import { getPort } from "../../core/env";
import { parse, num, info, color } from "../util";

export const serveHelp = `${color.bold("osa serve")} — start the OrcaSlicer HTTP API server

${color.bold("USAGE")}
  osa serve [--port <n>]

${color.bold("OPTIONS")}
  --port <n>   Listen port (default: $PORT or 3000)

The HTTP API shares the exact same slicing core as the CLI, so a slice
behaves identically whether driven through 'osa slice' or 'POST /slice'.`;

/** `osa serve` — boot the HTTP API. */
export async function serveCommand(argv: string[]): Promise<number> {
  const { values } = parse(argv, { port: { type: "string" } });
  const port = num(values, "port") ?? getPort();
  info(color.dim(`Starting OrcaSlicer API on port ${port} …`));
  await startServer(port);
  // startServer keeps the process alive; never resolves to an exit.
  return new Promise<number>(() => {});
}
