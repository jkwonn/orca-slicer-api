# `osa` — OrcaSlicer Terminal CLI

`osa` is the command-line front end of **orca-slicer-api**. It drives the
OrcaSlicer headless engine from a terminal: slice models, manage profiles,
inspect geometry, convert CAD files and run the HTTP API — every feature
shares one slicing core, so a slice behaves identically whether you run
`osa slice` or `POST /slice`.

- [Installation](#installation)
- [Environment](#environment)
- [Quick start](#quick-start)
- [Commands](#commands)
  - [`slice`](#osa-slice) · [`info`](#osa-info) · [`inspect`](#osa-inspect) ·
    [`convert`](#osa-convert) · [`profiles`](#osa-profiles) ·
    [`config`](#osa-config) · [`presets`](#osa-presets) ·
    [`serve`](#osa-serve) · [`health`](#osa-health) ·
    [`version`](#osa-version)
- [Exit codes](#exit-codes)
- [GUI feature → CLI mapping](#gui-feature--cli-mapping)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

---

## Installation

`osa` ships with this repository. From a checkout:

```bash
npm install                         # install dependencies
./scripts/provision-orcaslicer.sh    # download a local OrcaSlicer runtime
cp .env.example .env                 # then edit ORCASLICER_PATH / DATA_PATH
./bin/osa health                     # verify the environment
```

`bin/osa` runs the TypeScript source directly (via `tsx`) when no build is
present, or the compiled output after `npm run build`. To put `osa` on your
`PATH`:

```bash
npm link        # exposes `osa` globally
# or simply:
alias osa="$(pwd)/bin/osa"
```

All examples below assume `osa` resolves to `bin/osa`.

---

## Environment

`osa` reads configuration from a `.env` file in the working directory (or the
project root) and from the process environment. Real environment variables
take precedence over `.env`.

| Variable              | Required | Purpose |
|-----------------------|----------|---------|
| `ORCASLICER_PATH`     | yes      | Path to the OrcaSlicer binary or launcher script. |
| `DATA_PATH`           | no       | Profile storage directory. Default: `./data`. |
| `ORCA_RESOURCES_PATH` | no       | OrcaSlicer `resources` directory. Enables the `presets` command. |
| `PORT`                | no       | HTTP port for `osa serve`. Default: `3000`. |

A profile directory has three sub-folders, one per preset category:

```
$DATA_PATH/
├── printers/     # machine profiles   (printer JSON)
├── presets/      # process profiles   (quality/process JSON)
└── filaments/    # filament profiles  (filament JSON)
```

---

## Quick start

```bash
# Check everything is wired up
osa health

# Slice an STL with stored profiles, write ./benchy.gcode
osa slice benchy.stl --printer bambua1 --process bambua1_proc --filament bambua1_pla -o benchy.gcode

# Slice a STEP CAD file (auto-converted to a mesh)
osa slice bracket.step --printer prusamk4 --process prusamk4_proc --filament prusamk4_pla

# Inspect a model's geometry
osa info benchy.stl

# Read stats back from a sliced file
osa inspect benchy.gcode

# Start the HTTP API
osa serve --port 3000
```

---

## Commands

Every command accepts `-h` / `--help`. Most accept `--json` for
machine-readable output and `-q` / `--quiet` to suppress progress text.

### `osa slice`

Slice a 3D model into G-code or a 3MF project. Accepts `.stl`, `.obj`,
`.amf`, `.3mf` and the CAD formats `.step` / `.stp` / `.iges` / `.igs` /
`.brep` (CAD files are triangulated automatically before slicing).

```
osa slice <model> [options]
```

**Profiles**

| Flag | Description |
|------|-------------|
| `--printer <name>`        | Stored printer profile (from `$DATA_PATH/printers`). |
| `--process <name>`        | Stored process profile. Alias: `--preset`. |
| `--filament <name>`       | Stored filament profile. Repeatable for multi-material. |
| `--printer-file <path>`   | Printer profile JSON file (instead of a stored name). |
| `--process-file <path>`   | Process profile JSON file. |
| `--filament-file <path>`  | Filament profile JSON file. Repeatable. |

**Output**

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output file, or directory for multi-plate slices. |
| `--export <gcode\|3mf>` | Output format. Default: `gcode`. |
| `--min-save`          | Export a minimum-size 3MF (strips model data). |

**Plate & arrange**

| Flag | Description |
|------|-------------|
| `--plate <n>`            | Plate to slice; `0` = all plates. Default: `1`. |
| `--bed-type <type>`      | Bed/plate type, e.g. `"Textured PEI Plate"`. |
| `--no-arrange`           | Disable auto-arrange (on by default). |
| `--no-orient`            | Disable auto-orient (on by default). |
| `--allow-rotations`      | Allow rotation while auto-arranging. |
| `--multicolor-one-plate` | Allow multiple filament colors on one plate. |

**Transforms**

| Flag | Description |
|------|-------------|
| `--rotate <deg>`        | Rotate around Z. |
| `--rotate-x <deg>`      | Rotate around X. |
| `--rotate-y <deg>`      | Rotate around Y. |
| `--scale <factor>`      | Uniform scale factor. |
| `--repetitions <n>`     | Repeat the whole model N times. |
| `--ensure-on-bed`       | Lift objects partially below the bed. |
| `--assemble`            | Merge all loaded models into one object. |
| `--convert-unit`        | Convert model units (inch → mm). |
| `--skip-objects <list>` | 1-based object indices to skip, e.g. `3,5,10`. |
| `--clone-objects <list>`| Object clone pairs, e.g. `1,3`. |

**Quick settings** (patched into the process/printer preset)

| Flag | Description |
|------|-------------|
| `--layer-height <mm>`     | Layer height (0.04–0.6). |
| `--infill <pct>`          | Sparse infill density (0–100). |
| `--infill-pattern <p>`    | Infill pattern: `grid`, `gyroid`, `honeycomb`, … |
| `--walls <n>`             | Wall loop count (1–10). |
| `--nozzle <mm>`           | Nozzle diameter (0.1–2.0). |
| `--speed <bucket>`        | `standard`, `safe` or `slow`. |
| `--support <mode>`        | `auto`, `tree`, `tree-auto` or `none`. |
| `--support-threshold <d>` | Support overhang angle threshold, degrees. |
| `--brim-type <type>`      | `outer_only`, `inner_only`, `outer_and_inner`, `no_brim`. |
| `--brim-width <mm>`       | Brim width. |

**Advanced**

| Flag | Description |
|------|-------------|
| `-s, --set <key=value>` | Raw OrcaSlicer config override. Repeatable. Highest priority — overrides everything else. |
| `--timelapse`           | Slice as a timelapse print. |
| `--debug-level <0-5>`   | OrcaSlicer log verbosity. |
| `--dry-run`             | Print the OrcaSlicer command without running it. |
| `--json`                | Print the slice result (outputs + metadata) as JSON. |
| `-q, --quiet`           | Suppress progress output. |

> **`--set` covers everything else.** Any OrcaSlicer process, printer or
> filament setting can be overridden with `--set <key>=<value>` even when it
> has no dedicated flag — `--set` values are passed to OrcaSlicer as
> command-line flags, its highest-priority setting source. Keys may use
> underscores (`sparse_infill_density`) or hyphens (`sparse-infill-density`).

**Examples**

```bash
# Stored profiles
osa slice benchy.stl --printer bambua1 --process bambua1_proc --filament bambua1_pla -o benchy.gcode

# Profile JSON files exported from the OrcaSlicer GUI
osa slice cube.stl --printer-file p.json --process-file proc.json --filament-file fila.json

# Quick settings
osa slice part.step --printer prusamk4 --process prusamk4_proc --filament prusamk4_pla \
  --layer-height 0.28 --infill 25 --walls 4 --support tree

# Transform + advanced raw override
osa slice model.stl --printer bambua1 --process bambua1_proc \
  --rotate 45 --scale 1.5 --set brim_type=outer_only --set seam_position=rear

# Multi-material (two filaments)
osa slice dual.3mf --printer bambux1carbon --process bambux1carbon_proc \
  --filament bambux1carbon_pla --filament genericpetg

# All plates of a multi-plate 3MF into a directory
osa slice plates.3mf --plate 0 -o ./out/

# See the exact OrcaSlicer invocation without slicing
osa slice cube.stl --printer bambua1 --process bambua1_proc --dry-run
```

After a successful slice `osa` prints the output path, estimated print time,
filament usage, layer count and support area. With `--json` it prints the full
metadata object (print time, filament, layers and the pricing metrics —
extrusion starts, short/bridge/overhang moves, support/brim area).

### `osa info`

Inspect a model's geometry. CAD files are triangulated first.

```
osa info <model> [--json]
```

Reports dimensions, bounding box, volume, triangle count, part count and
manifold status.

```bash
osa info benchy.stl
osa info bracket.step --json
```

### `osa inspect`

Read print statistics from a sliced `.gcode` or `.3mf` file.

```
osa inspect <file.gcode|file.3mf> [--json]
```

Reports estimated print time, filament usage, layer count and the pricing
metrics (extrusion starts, short/bridge/overhang moves, support/brim area).

```bash
osa inspect benchy.gcode
osa inspect project.3mf --json
```

### `osa convert`

Convert a model between formats.

```
osa convert <model> --to <stl|3mf> [-o <path>] [--json]
```

| Flag | Description |
|------|-------------|
| `--to <stl\|3mf>`    | Target format. Default: `stl`. |
| `-o, --output <path>`| Output file, or directory for multi-file output. |
| `--json`             | Print the result as JSON. |

STEP / IGES / BREP CAD files are triangulated with OpenCASCADE; mesh and 3MF
inputs are repackaged with OrcaSlicer.

```bash
osa convert bracket.step --to stl -o bracket.stl
osa convert model.stl --to 3mf -o project.3mf
```

### `osa profiles`

Manage stored printer / process / filament profiles. Categories are
`printers`, `presets` and `filaments`.

```
osa profiles list <category>
osa profiles show <category> <name> [--json]
osa profiles add <category> <name> <file.json>
osa profiles rm <category> <name>
osa profiles path <category> <name>
osa profiles import <category> <preset-name> [--vendor <V>] [--as <name>]
```

| Subcommand | Description |
|------------|-------------|
| `list`   | List stored profile names (omit `<category>` to list all three). |
| `show`   | Print a stored profile's JSON. |
| `add`    | Save a profile JSON file under a name. |
| `rm`     | Delete a stored profile. |
| `path`   | Print the on-disk path of a stored profile. |
| `import` | Copy a bundled OrcaSlicer system preset (flattened) into the data dir. |

```bash
osa profiles list printers
osa profiles show presets bambua1_proc --json
osa profiles add filaments my_petg ./my_petg.json
osa profiles import printers "Bambu Lab A1 0.4 nozzle" --vendor BBL --as bambua1
osa config set "$(osa profiles path presets bambua1_proc)" layer_height=0.28
```

### `osa config`

Read and edit settings inside a profile JSON file. Keys may use underscores
or hyphens.

```
osa config get <file> <key>
osa config set <file> <key=value> [<key=value> ...]
osa config unset <file> <key>
osa config list <file> [--filter <substr>] [--json]
osa config diff <file-a> <file-b> [--json]
```

```bash
osa config get   data/presets/bambua1_proc.json layer_height
osa config set   data/presets/bambua1_proc.json layer_height=0.28 wall_loops=4
osa config list  data/printers/bambua1.json --filter nozzle
osa config diff  old_proc.json new_proc.json
```

Array values are written when the value looks like JSON, e.g.
`osa config set printer.json nozzle_diameter='["0.6"]'`.

### `osa presets`

Browse OrcaSlicer's bundled **system** presets (the vendor catalog the GUI
dropdowns show). Requires `ORCA_RESOURCES_PATH`.

```
osa presets vendors
osa presets list <vendor> <kind>
osa presets show <vendor> <kind> <name> [--json]
```

`<kind>` is `machine`, `process` or `filament`. `show` resolves the preset's
`inherits` chain so the output is self-contained.

```bash
osa presets vendors
osa presets list BBL machine
osa presets show BBL process "0.20mm Standard @BBL A1"
```

### `osa serve`

Start the HTTP API server (see [docs/HTTP-API.md](docs/HTTP-API.md)).

```
osa serve [--port <n>]
```

The HTTP API and the CLI share the same slicing core, so results are
identical across both.

### `osa health`

Check the environment: OrcaSlicer binary, data directory and system-preset
catalog. Exits non-zero when unhealthy.

```
osa health [--json]
```

### `osa version`

Show the CLI, OrcaSlicer and Node.js versions (`--json` for machine output).

---

## Printer profiles

`osa slice --printer <slug>` resolves a stored profile triplet from the data
directory:

- `--printer <slug>` → `$DATA_PATH/printers/<slug>.json`
- `--process <slug>_proc` → `$DATA_PATH/presets/<slug>_proc.json`
- `--filament <slug>_pla` → `$DATA_PATH/filaments/<slug>_pla.json`

The repository ships a pre-baked profile for **every printer in Sinter's
`PRINTER_DATABASE`** — 74 printer slugs across 11 brands — generated from
OrcaSlicer 2.3.1's bundled vendor profiles by `setup-profiles.sh`. Every
printer profile is brand-specific (correct bed size, kinematics and G-code
flavour); each slug has a complete process preset and PLA filament.

Run `osa profiles list printers` for the live list. Available slugs:

| Brand | Slugs |
|-------|-------|
| Bambu Lab | `bambua1` `bambua1mini` `bambup1p` `bambup1s` `bambup2s` `bambux1` `bambux1carbon` `bambuh2c` `bambuh2d` `bambuh2s` |
| Anycubic | `anycubickobra2` `anycubickobra2pro` `anycubickobra3max` `anycubickobra3v2` `anycubickobras1` `anycubickobras1max` `anycubickobrax` `anycubicvyper` `anycubicphotonmonox` |
| Creality | `crealityk1` `crealityk1c` `crealityk1max` `crealityk2` `crealityk2plus` `crealityk2pro` `crealityhi` `crealitysparkx` `cr10` `ender3s1` `ender3v2` `ender3v3` `ender3v3plus` `ender5max` |
| Elegoo | `elegooneptune4` `elegooneptune4pro` `elegoocentauri` `elegoogiga` `elegoomars3` `elegoosaturn2` |
| Flashforge | `flashforgead5m` `flashforgead5mpro` `flashforgead5x` `flashforgecreator5` |
| FLSun | `flsuns1` `flsunt1` |
| Prusa | `prusamk4` `prusamk4s` `prusamk3s` `prusamini` `prusaxl` `prusacoreone` |
| Qidi | `qidiq1pro` `qidiq2` `qidiplus4` `qidixmax` `qidixsmart3` `qidixplus3` `qidimax4` |
| Snapmaker | `snapmakerj1` `snapmakeru1` |
| Sovol | `sovolsv06` `sovolsv07` `sovolsv08` `sovolsv08max` `sovolzero` |
| Voron | `voron02` `voron24` `vorontrident` |
| Comgrow / UltiMaker | `comgrowt300` `comgrowt500` `ultimaker2plus` `ultimakers3` `ultimakers5` `ultimakers7` |

A full make/model → slug → real-slice-result matrix for all 72 Sinter
printers is in **[docs/PRINTER-COVERAGE.md](docs/PRINTER-COVERAGE.md)** (62
slice on a brand-specific profile, 10 documented Bambu A1 fallbacks, 0
failures). Re-bake the profiles any time with:

```bash
ORCA_RESOURCES=<runtime>/squashfs-root/resources/profiles \
  DATA_DIR=./data bash setup-profiles.sh
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Success. |
| `1`  | User / input error (bad arguments, file not found, validation failure). |
| `2`  | Internal / slicer error (OrcaSlicer failed, environment unhealthy). |

---

## GUI feature → CLI mapping

How every meaningful OrcaSlicer **GUI** capability maps onto `osa`. Settings
without a dedicated flag are always reachable through `--set <key>=<value>`.

### Import & files

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Import STL / OBJ / AMF / 3MF | accepted by `slice`, `info`, `convert` |
| Import STEP / IGES / BREP CAD | accepted directly — auto-triangulated |
| Export plate G-code | `slice --export gcode` (default) |
| Export plate sliced file (3MF) | `slice --export 3mf` |
| Export object / plate as STL | `convert --to stl` |
| Export as 3MF project | `convert --to 3mf` |
| Open / re-slice a 3MF project | `slice project.3mf` |

### Plate, arrange & objects

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Slice plate | `slice` |
| Slice all plates | `slice --plate 0` |
| Slice a specific plate | `slice --plate <n>` |
| Auto-arrange | on by default; `--no-arrange` to disable |
| Auto-orient | on by default; `--no-orient` to disable |
| Allow rotation when arranging | `--allow-rotations` |
| Multiple colors on one plate | `--multicolor-one-plate` |
| Plate / bed type | `--bed-type <type>` |
| Rotate object (Z / X / Y) | `--rotate` / `--rotate-x` / `--rotate-y` |
| Scale object | `--scale <factor>` |
| Duplicate / copies | `--repetitions <n>` |
| Drop / place on bed | `--ensure-on-bed` |
| Assemble (merge objects) | `--assemble` |
| Convert units (inch → mm) | `--convert-unit` |
| Disable / skip objects | `--skip-objects <list>` |
| Clone objects | `--clone-objects <list>` |

### Presets & profiles

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Select printer | `slice --printer <name>` / `--printer-file` |
| Select process / quality preset | `slice --process <name>` / `--process-file` |
| Select filament | `slice --filament <name>` / `--filament-file` |
| Multi-material filaments | repeat `--filament` |
| System preset catalog (dropdowns) | `presets vendors` / `presets list` / `presets show` |
| Save / new user preset | `profiles add` / `profiles import` |
| Delete user preset | `profiles rm` |
| Edit a preset setting | `config set` (or `--set` at slice time) |
| Compare two presets | `config diff` |
| Inspect a preset's settings | `config list` / `profiles show` |

### Process settings (Quality / Strength / Speed / Support tabs)

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Layer height | `--layer-height` (or `--set layer_height=`) |
| Sparse infill density | `--infill` (or `--set sparse_infill_density=`) |
| Infill pattern | `--infill-pattern` (or `--set sparse_infill_pattern=`) |
| Wall loops | `--walls` (or `--set wall_loops=`) |
| Print speed (coarse) | `--speed standard\|safe\|slow` |
| Per-feature speeds | `--set outer_wall_speed=…`, `--set sparse_infill_speed=…`, … |
| Enable support / type | `--support auto\|tree\|tree-auto\|none` |
| Support overhang threshold | `--support-threshold <deg>` |
| Brim type / width | `--brim-type` / `--brim-width` |
| Seam position, ironing, fuzzy skin, … | `--set <key>=<value>` |
| **Any other process setting** | `--set <key>=<value>` |

### Printer & filament settings

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Nozzle diameter | `--nozzle` (or `--set nozzle_diameter=`) |
| Bed shape / printable area | `--set printable_area=…` or edit via `config set` |
| Filament temperature / flow | `--set <key>=<value>` or `config set` on the filament JSON |
| **Any other printer/filament setting** | `--set` / `config set` |

### Inspection & output

| OrcaSlicer GUI | `osa` |
|----------------|-------|
| Object info (size, volume, facets) | `info` |
| Sliced result (time, filament, layers) | printed after `slice`; `inspect` for any file |
| Timelapse | `--timelapse` |

### Not exposed (GUI-only or not in the headless engine)

The OrcaSlicer headless engine has no interactive viewport, so the following
GUI features have **no CLI equivalent**:

- 3D viewport navigation and the layer-by-layer G-code preview
- Paint-on supports, seam painting and multi-color face painting
- Manual support / support-blocker editing
- The cut tool, mesh boolean operations and modifier meshes
- Calibration wizards (flow rate, temperature tower, pressure advance, …)
- Sending jobs to a networked printer / printer monitoring

For these, use the OrcaSlicer desktop application. Everything that affects the
*sliced result* — geometry transforms, every process/printer/filament setting,
support generation, arrangement — is reachable from `osa`.

---

## See also

- [README.md](README.md) — project overview and HTTP API
- [docs/HTTP-API.md](docs/HTTP-API.md) — REST endpoint reference
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — common problems
- `swagger.json` / `GET /api-docs` — interactive API documentation
