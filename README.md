# OrcaSlicer API & CLI

Slice 3D models with [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer)
from a **REST API** or a **terminal CLI** — one slicing core, two front ends.

Full credit to the OrcaSlicer contributors for the slicer itself; this project
only wraps its headless engine.

## Features

- **Slicing** — STL, OBJ, AMF and 3MF, plus **STEP / IGES / BREP CAD files**
  (triangulated automatically). Export G-code or a 3MF project; multi-plate
  slicing returns a ZIP of G-codes.
- **Terminal CLI (`osa`)** — slice, inspect, convert, manage profiles, edit
  preset settings and browse OrcaSlicer's bundled presets, with a flag for
  every GUI-equivalent option and a `--set key=value` escape hatch for any
  OrcaSlicer setting. See **[CLI.md](CLI.md)**.
- **Transforms & arrangement** — rotate, scale, repeat, auto-arrange,
  auto-orient, ensure-on-bed, assemble, unit conversion, skip/clone objects.
- **Quick settings** — layer height, infill, walls, nozzle, speed, support
  (normal/tree), brim — all overridable per slice without editing a preset.
- **Model tools** — geometry inspection (`info`), format conversion
  (`convert`), and print-statistics extraction from sliced files (`inspect`).
- **Profile management** — store, list, edit (`config set`), diff and import
  printer / process / filament presets.
- **Async slicing** — submit long jobs and poll for results (`/slice-async`).

## Requirements

- **Node.js** v20.12+ (v22 recommended)
- **OrcaSlicer** 2.3.x — provisioned locally by the included script, installed
  system-wide, or run via the bundled `Dockerfile`.

## Installation

```bash
git clone https://github.com/AFKFelix/orca-slicer-api.git
cd orca-slicer-api
npm install

# Download a local OrcaSlicer runtime (extracts the AppImage, no root needed)
./scripts/provision-orcaslicer.sh

# Configure
cp .env.example .env          # then edit ORCASLICER_PATH / DATA_PATH

# Verify
./bin/osa health
```

> On hosts older than the AppImage's glibc (it targets Ubuntu 24.04), run the
> slicer via the `Dockerfile` instead — see
> [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

### Docker

```bash
docker build --build-arg ORCA_VERSION=2.3.2 --build-arg TARGETARCH=amd64 -t orca-slicer-api .
docker run -d -p 3000:3000 --name orca-slicer-api orca-slicer-api
```

## Usage

### CLI

```bash
osa slice benchy.stl --printer bambua1 --process bambua1_proc --filament bambua1_pla -o benchy.gcode
osa info  bracket.step
osa inspect benchy.gcode
osa convert bracket.step --to stl -o bracket.stl
osa profiles list printers
osa config set data/presets/bambua1_proc.json layer_height=0.28
osa serve --port 3000
```

The complete command and flag reference, plus a **GUI-feature → CLI mapping
table**, is in **[CLI.md](CLI.md)**.

### HTTP API

```bash
osa serve            # or: npm start
```

```bash
curl -X POST http://localhost:3000/slice \
  -F file=@benchy.stl \
  -F printer=bambua1 -F preset=bambua1_proc -F filament=bambua1_pla \
  -o benchy.gcode
```

Endpoints: `/slice`, `/slice-async`, `/profiles`, `/presets`, `/tools/info`,
`/tools/convert`, `/tools/inspect`, `/health`. Full reference in
[docs/HTTP-API.md](docs/HTTP-API.md); interactive docs at `GET /api-docs` (dev
mode) and in [`swagger.json`](swagger.json).

## Configuration

Set via `.env` (see [`.env.example`](.env.example)) or the environment:

| Variable | Required | Description |
|----------|----------|-------------|
| `ORCASLICER_PATH` | yes | Path to the OrcaSlicer binary / launcher. |
| `DATA_PATH` | no | Profile storage directory (default `./data`). |
| `ORCA_RESOURCES_PATH` | no | OrcaSlicer `resources` dir — enables `presets`. |
| `PORT` | no | HTTP port (default `3000`). |
| `NODE_ENV` | no | `development` enables `/api-docs`. |
| `ASYNC_SLICE_RETENTION_MS` | no | Async job retention (default 60 min). |

Profiles are stored as OrcaSlicer JSON files under:

```
<DATA_PATH>/
├── printers/     # machine profiles
├── presets/      # process profiles
└── filaments/    # filament profiles
```

## Architecture

`src/core/` holds the slicing engine — model conversion, profile resolution,
preset overrides, the OrcaSlicer process runner and G-code metadata parsing.
Both the HTTP routes (`src/routes/`) and the CLI (`src/cli/`) are thin layers
over that core, so a slice is identical regardless of entry point.

## Security

**No authentication or authorization is implemented.** Do not expose this
service directly to the public internet without adding a security layer.

## Development

```bash
npm run dev       # HTTP server with reload
npm run cli -- slice cube.stl --printer bambua1 --process bambua1_proc
npm test          # vitest suite
npm run build     # compile to dist/
npm run lint
```

## License

AGPL-3.0-or-later. OrcaSlicer is the work of the
[OrcaSlicer](https://github.com/SoftFever/OrcaSlicer) contributors.
