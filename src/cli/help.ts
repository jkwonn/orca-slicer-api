import { color } from "./util";

/** Top-level `osa` help text. */
export const topHelp = `${color.bold("osa")} — OrcaSlicer terminal toolkit

A command-line front end for the OrcaSlicer headless engine: slice models,
manage profiles, inspect geometry, convert CAD files and run the HTTP API —
all sharing one slicing core.

${color.bold("USAGE")}
  osa <command> [options]

${color.bold("SLICING & GEOMETRY")}
  slice <model>            Slice a model into G-code or 3MF
  info <model>             Inspect model geometry (bbox, volume, manifold)
  inspect <gcode|3mf>      Read print stats from a sliced file
  convert <model>          Convert STEP/mesh to STL or 3MF

${color.bold("PROFILES & CONFIG")}
  profiles <sub>           Manage stored printer/process/filament profiles
  config <sub>             Read and edit settings inside a profile JSON
  presets <sub>            Browse OrcaSlicer's bundled system presets

${color.bold("SERVER & ENVIRONMENT")}
  serve                    Start the HTTP API server
  health                   Check the OrcaSlicer environment
  version                  Show OrcaSlicer / CLI versions
  help [command]           Show help for a command

${color.bold("GLOBAL OPTIONS")}
  --json                   Machine-readable JSON output (most commands)
  -q, --quiet              Suppress progress output
  -h, --help               Show help

${color.bold("ENVIRONMENT")}
  ORCASLICER_PATH          Path to the OrcaSlicer binary / launcher (required)
  DATA_PATH                Profile storage directory (default: ./data)
  ORCA_RESOURCES_PATH      OrcaSlicer 'resources' dir (enables 'presets')
  PORT                     HTTP port for 'serve' (default: 3000)

${color.bold("EXAMPLES")}
  osa health
  osa slice benchy.stl --printer bambua1 --process bambua1_proc --filament bambua1_pla
  osa info part.step
  osa profiles list printers
  osa config set data/presets/bambua1_proc.json layer_height=0.28

Run 'osa help <command>' for detailed options.`;
