# HTTP API reference

The OrcaSlicer API exposes the same slicing core as the [`osa` CLI](../CLI.md)
over HTTP. Start it with `osa serve` or `npm start`; in development the
interactive Swagger UI is served at `GET /api-docs` and the spec lives in
[`swagger.json`](../swagger.json).

Base URL: `http://localhost:3000`

## Endpoints

### Slicing

| Method & path | Purpose |
|---------------|---------|
| `POST /slice` | Slice a model; returns the G-code / 3MF (a ZIP for multi-plate). |
| `POST /slice-async` | Submit a slice job; returns a `requestId`. |
| `GET /slice-async/{requestId}` | Poll job status. |
| `GET /slice-async/{requestId}/result` | Download a finished job's output. |
| `DELETE /slice-async/{requestId}` | Discard a finished job. |

`POST /slice` accepts `multipart/form-data`:

- `file` *(required)* — the model (`.stl`, `.obj`, `.amf`, `.3mf`, `.step`,
  `.stp`, `.iges`, `.igs`, `.brep`).
- `printerProfile` / `presetProfile` / `filamentProfile` — profile JSON files
  (take precedence over the name fields below).
- `printer` / `preset` / `filament` — stored profile names.
- `bedType`, `plate`, `exportType` (`gcode`|`3mf`), `arrange`, `orient`,
  `allowRotations`, `multicolorOnePlate`.
- Transforms: `rotate`, `rotateX`, `rotateY`, `scale`, `repetitions`,
  `ensureOnBed`, `assemble`, `convertUnit`, `skipObjects`, `cloneObjects`.
- Quick settings: `layerHeight`, `infillDensity`, `infillPattern`,
  `wallCount`, `nozzleDiameter`, `printSpeed`, `support`, `supportThreshold`,
  `brimType`, `brimWidth`.
- `set` — raw `key=value` config overrides (repeatable).
- `timelapse`, `debugLevel`.

The response carries the metadata as `X-*` headers (`X-Print-Time-Seconds`,
`X-Filament-Used-g`, `X-Filament-Used-mm`, `X-Layer-Count`, …).

```bash
curl -X POST http://localhost:3000/slice \
  -F file=@benchy.stl \
  -F printer=bambua1 -F preset=bambua1_proc -F filament=bambua1_pla \
  -F layerHeight=0.28 -F support=tree \
  -o benchy.gcode
```

### Tools

| Method & path | Purpose |
|---------------|---------|
| `POST /tools/info` | Geometry inspection of an uploaded model (JSON). |
| `POST /tools/convert?to=stl\|3mf` | Convert a model; streams the result. |
| `POST /tools/inspect` | Print statistics from an uploaded `.gcode` / `.3mf`. |

```bash
curl -X POST http://localhost:3000/tools/info     -F file=@part.step
curl -X POST "http://localhost:3000/tools/convert?to=stl" -F file=@part.step -o part.stl
curl -X POST http://localhost:3000/tools/inspect  -F file=@benchy.gcode
```

### Profiles

| Method & path | Purpose |
|---------------|---------|
| `POST /profiles/{category}` | Upload a profile (`category`: `printers`/`presets`/`filaments`). |
| `GET /profiles/{category}` | List stored profile names. |
| `GET /profiles/{category}/{name}` | Fetch a profile's JSON. |
| `PATCH /profiles/{category}/{name}` | Apply `key=value` setting changes. |
| `DELETE /profiles/{category}/{name}` | Delete a profile. |

```bash
curl -X POST  http://localhost:3000/profiles/printers -F name=myprinter -F file=@printer.json
curl -X PATCH http://localhost:3000/profiles/presets/myproc \
  -H 'Content-Type: application/json' \
  -d '{"set":["layer_height=0.28","wall_loops=4"]}'
```

### System presets

| Method & path | Purpose |
|---------------|---------|
| `GET /presets` | List preset vendors. |
| `GET /presets/{vendor}/{kind}` | List presets (`kind`: `machine`/`process`/`filament`). |
| `GET /presets/{vendor}/{kind}/{name}` | Fetch a flattened system preset. |

### Health

| Method & path | Purpose |
|---------------|---------|
| `GET /health` | Environment health; `200` healthy, `503` unhealthy. |

## Errors

Errors return a JSON body `{ "message": "..." }` with an appropriate status:
`400` invalid input, `404` not found, `422` the slicer rejected the
model/parameters, `500` internal failure, `504` slice timeout.
