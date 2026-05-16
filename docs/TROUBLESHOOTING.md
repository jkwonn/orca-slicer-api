# Troubleshooting

## `osa health` reports OrcaSlicer unavailable

`osa` could not run the OrcaSlicer binary.

1. **`ORCASLICER_PATH` is unset** — set it in `.env` to the binary or launcher
   produced by `./scripts/provision-orcaslicer.sh` (typically
   `.orca-runtime/orca`).
2. **The path is wrong or not executable** — `ls -l "$ORCASLICER_PATH"` and
   `chmod +x` it if needed.
3. **glibc mismatch** — see below.

## `error while loading shared libraries` / `GLIBC_2.3x not found`

The OrcaSlicer AppImage is built against a recent glibc (Ubuntu 24.04,
glibc 2.39+) and is dynamically linked against GTK/GL libraries. On an older
host the binary will not start.

Options, in order of preference:

1. **Run on a matching OS.** Ubuntu 24.04 (or newer) satisfies the binary
   directly. The included `Dockerfile` builds exactly such an image — it is
   the supported production runtime.

   ```bash
   docker build -t orca-slicer-api .
   docker run -p 3000:3000 orca-slicer-api
   ```

2. **Provide the runtime libraries out-of-tree.** Extract an Ubuntu 24.04
   root filesystem (for example from the `ubuntu:24.04` image or the project's
   own built image) and run the binary through that glibc's dynamic loader:

   ```bash
   <rootfs>/lib/ld-linux-<arch>.so.1 \
     --library-path <rootfs>/usr/lib/<arch>:<rootfs>/lib/<arch> \
     <squashfs-root>/bin/orca-slicer --help
   ```

   Place the loader copy inside `squashfs-root/bin/` so OrcaSlicer still
   resolves its `resources/` directory correctly, then point
   `ORCASLICER_PATH` at a launcher that invokes it. This is how the
   development sandbox runs OrcaSlicer 2.3.1 on Debian 12.

3. **Install OrcaSlicer system-wide** from your distribution and point
   `ORCASLICER_PATH` at it.

Slicing itself does not use the GPU — the GL/Wayland errors OrcaSlicer prints
during a headless run are only about thumbnail generation and are harmless.

## `The input model file to the slicer can not be parsed`

OrcaSlicer's headless engine loads only `.stl`, `.obj`, `.amf` and `.3mf`.
CAD files (`.step`, `.stp`, `.iges`, `.igs`, `.brep`) are **automatically
triangulated** by `osa` / the API before slicing, so this error usually means
the file is corrupt or not actually the format its extension claims.

Run `osa info <file>` to confirm the geometry loads.

## `plate is empty` / `No suitable objects`

The model sits outside the printable area — common for CAD exports left at
world coordinates. `osa slice` enables auto-arrange and auto-orient by default
to handle this. If you passed `--no-arrange`, drop it, or add `--ensure-on-bed`.

## `Slicing failed with error from slicer: ... incorrect slicing parameters`

The printer and process presets are incompatible (for example a process
preset whose `compatible_printers` list does not include the chosen printer).
Use a matched `(printer, process, filament)` triplet, or import a fresh,
flattened preset with `osa profiles import`.

## CAD conversion produces an empty or wrong mesh

`osa` uses OpenCASCADE (`occt-import-js`) to triangulate STEP/IGES/BREP files.
Very large assemblies can be slow. Verify the result with
`osa info <file>` — if the triangle count is 0 the CAD file has no solid
geometry (it may contain only surfaces or wireframe).

## The `presets` command says system presets are unavailable

Set `ORCA_RESOURCES_PATH` to OrcaSlicer's `resources` directory (the folder
containing `profiles/`), or point `ORCASLICER_PATH` directly at the binary so
the path can be derived from it.

## Slicing is slow or times out

Large or high-detail models take longer. The slice timeout defaults to 10
minutes. Reduce detail with a coarser `--layer-height`, or raise the limit —
the HTTP API caller controls it per request and the CLI uses the default.
