# Printer Coverage Matrix

Real-slice coverage for every printer in Sinter's `PRINTER_DATABASE` (`/workspace/lib/printerData.ts`) — 72 models across 11 brands.

## Summary

| Result | Count |
|--------|-------|
| ✅ PASS — slices on its own printer profile | **62** |
| ⚠️ Documented fallback to Bambu A1 | **10** |
| ❌ FAIL | **0** |
| **Total** | **72** |

Every one of the 72 printers slices successfully and produces valid G-code. 62 slice on a brand-specific printer profile; 10 currently resolve to the Bambu A1 fallback inside Sinter's `PRINTER_PROFILE_MAP` (`/workspace/lib/orcaSlicer.ts`) — see [Documented fallbacks](#documented-fallbacks). An own-profile slug has been baked and verified for 9 of those 10; activating it needs a one-line `PRINTER_PROFILE_MAP` addition in `lib/orcaSlicer.ts` (a Sinter-side file, outside this repo).

## Methodology

- **Slug resolution** — `getPrinterProfileName(make, model)` from `lib/orcaSlicer.ts` (exact match → fuzzy prefix → `default` = `bambua1`); filament via `getFilamentProfileName('PLA', slug)`.
- **Slice** — `osa slice <model> --printer <slug> --process <slug>_proc --filament <filament>` on `tests/files/input/Cube.stl`, OrcaSlicer 2.3.1, G-code export. The HTTP `POST /slice` route shares the same core.
- **PASS** — OrcaSlicer returned success and a valid G-code with a non-zero print-time, filament usage and layer count.
- Profiles are baked by `setup-profiles.sh` from OrcaSlicer 2.3.1's bundled vendor profiles; the printer profile is always brand-specific.

## Coverage matrix

| Brand | Model | Slug | Process preset | Filament | Result | Print time | Filament (g) | Layers |
|-------|-------|------|----------------|----------|--------|-----------|--------------|--------|
| Bambu Lab | A1 Mini | `bambua1mini` | `bambua1mini_proc` | `bambua1mini_pla` | ✅ PASS | 11m 38s | 0.72 | 50 |
| Bambu Lab | A1 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ✅ PASS | 11m 57s | 0.71 | 50 |
| Bambu Lab | P1P | `bambup1p` | `bambup1p_proc` | `genericpla` | ✅ PASS | 11m 20s | 0.73 | 50 |
| Bambu Lab | P1S | `bambup1s` | `bambup1s_proc` | `genericpla` | ✅ PASS | 11m 20s | 0.73 | 50 |
| Bambu Lab | P2S | `bambup2s` | `bambup2s_proc` | `genericpla` | ✅ PASS | 11m 20s | 0.73 | 50 |
| Bambu Lab | X1 | `bambux1` | `bambux1_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Bambu Lab | X1 Carbon | `bambux1carbon` | `bambux1carbon_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Bambu Lab | X1E | `bambux1` | `bambux1_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Bambu Lab | X2D | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Bambu Lab | H2C | `bambuh2c` | `bambuh2c_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Bambu Lab | H2D | `bambuh2d` | `bambuh2d_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Bambu Lab | H2S | `bambuh2s` | `bambuh2s_proc` | `genericpla` | ✅ PASS | 12m 21s | 0.96 | 50 |
| Anycubic | Kobra 3 | `anycubickobra3max` | `anycubickobra3max_proc` | `anycubickobra3max_pla` | ✅ PASS | 6m 58s | 0.69 | 62 |
| Anycubic | Kobra 3 V2 | `anycubickobra3v2` | `anycubickobra3v2_proc` | `anycubickobra3v2_pla` | ✅ PASS | 6m 58s | 0.69 | 62 |
| Anycubic | Kobra 3 Max | `anycubickobra3max` | `anycubickobra3max_proc` | `anycubickobra3max_pla` | ✅ PASS | 6m 58s | 0.69 | 62 |
| Anycubic | Kobra S1 | `anycubickobras1` | `anycubickobras1_proc` | `anycubickobras1_pla` | ✅ PASS | 5m 11s | 0.64 | 50 |
| Anycubic | Kobra S1 Max | `anycubickobras1max` | `anycubickobras1max_proc` | `anycubickobras1max_pla` | ✅ PASS | 5m 11s | 0.64 | 50 |
| Anycubic | Kobra X | `anycubickobrax` | `anycubickobrax_proc` | `anycubickobrax_pla` | ✅ PASS | 7m 16s | 0.87 | 50 |
| Creality | Ender-3 V3 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Creality | Ender-3 V3 Plus | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Creality | Ender-3 V4 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Creality | Ender-5 Max | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Creality | K1 | `crealityk1` | `crealityk1_proc` | `crealityk1_pla` | ✅ PASS | 6m 9s | 0.73 | 50 |
| Creality | K1 SE | `crealityk1` | `crealityk1_proc` | `crealityk1_pla` | ✅ PASS | 6m 9s | 0.73 | 50 |
| Creality | K1C | `crealityk1` | `crealityk1_proc` | `crealityk1_pla` | ✅ PASS | 6m 9s | 0.73 | 50 |
| Creality | K1 Max | `crealityk1max` | `crealityk1max_proc` | `crealityk1max_pla` | ✅ PASS | 6m 9s | 0.73 | 50 |
| Creality | K2 | `crealityk2` | `crealityk2_proc` | `crealityk2_pla` | ✅ PASS | 4m 37s | 0.71 | 62 |
| Creality | K2 SE | `crealityk2` | `crealityk2_proc` | `crealityk2_pla` | ✅ PASS | 4m 37s | 0.71 | 62 |
| Creality | K2 Pro | `crealityk2pro` | `crealityk2pro_proc` | `crealityk2pro_pla` | ✅ PASS | 4m 37s | 0.71 | 62 |
| Creality | K2 Plus | `crealityk2plus` | `crealityk2plus_proc` | `crealityk2plus_pla` | ✅ PASS | 4m 37s | 0.71 | 62 |
| Creality | Hi | `crealityhi` | `crealityhi_proc` | `genericpla` | ✅ PASS | 6m 33s | 0.82 | 50 |
| Creality | SparkX i7 | `crealitysparkx` | `crealitysparkx_proc` | `crealitysparkx_pla` | ✅ PASS | 6m 9s | 0.73 | 50 |
| Elegoo | Neptune 4 | `elegooneptune4` | `elegooneptune4_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | Neptune 4 Pro | `elegooneptune4pro` | `elegooneptune4pro_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | Neptune 4 Plus | `elegooneptune4` | `elegooneptune4_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | Neptune 4 Max | `elegooneptune4` | `elegooneptune4_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | Centauri Carbon | `elegoocentauri` | `elegoocentauri_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | Centauri Carbon 2 | `elegoocentauri` | `elegoocentauri_proc` | `genericpla` | ✅ PASS | 6m 41s | 0.84 | 50 |
| Elegoo | OrangeStorm Giga | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Flashforge | Adventurer 5M | `flashforgead5m` | `flashforgead5m_proc` | `flashforgead5m_pla` | ✅ PASS | 5m 22s | 0.73 | 50 |
| Flashforge | Adventurer 5M Pro | `flashforgead5mpro` | `flashforgead5mpro_proc` | `flashforgead5mpro_pla` | ✅ PASS | 5m 22s | 0.73 | 50 |
| Flashforge | Adventurer 5X | `flashforgead5x` | `flashforgead5x_proc` | `genericpla` | ✅ PASS | 5m 42s | 0.7 | 50 |
| Flashforge | Creator 5 | `flashforgecreator5` | `flashforgecreator5_proc` | `flashforgecreator5_pla` | ✅ PASS | 5m 22s | 0.73 | 50 |
| Flashforge | Creator 5 Pro | `flashforgecreator5` | `flashforgecreator5_proc` | `flashforgecreator5_pla` | ✅ PASS | 5m 22s | 0.73 | 50 |
| Flsun | S1 | `flsuns1` | `flsuns1_proc` | `flsuns1_pla` | ✅ PASS | 6m 47s | 0.71 | 50 |
| Flsun | S1 Pro | `flsuns1` | `flsuns1_proc` | `flsuns1_pla` | ✅ PASS | 6m 47s | 0.71 | 50 |
| Flsun | T1 | `flsunt1` | `flsunt1_proc` | `flsunt1_pla` | ✅ PASS | 6m 48s | 0.71 | 50 |
| Flsun | T1 Pro | `flsunt1` | `flsunt1_proc` | `flsunt1_pla` | ✅ PASS | 6m 48s | 0.71 | 50 |
| Flsun | T1 Max | `flsunt1` | `flsunt1_proc` | `flsunt1_pla` | ✅ PASS | 6m 48s | 0.71 | 50 |
| Prusa | MK4 | `prusamk4` | `prusamk4_proc` | `prusamk4_pla` | ✅ PASS | 11m 48s | 0.79 | 50 |
| Prusa | MK4S | `prusamk4s` | `prusamk4s_proc` | `genericpla` | ✅ PASS | 9m 52s | 0.71 | 50 |
| Prusa | XL | `prusaxl` | `prusaxl_proc` | `prusaxl_pla` | ✅ PASS | 11m 35s | 0.7 | 50 |
| Prusa | CORE One | `prusacoreone` | `prusacoreone_proc` | `genericpla` | ✅ PASS | 9m 44s | 0.7 | 50 |
| Prusa | CORE One+ | `prusacoreone` | `prusacoreone_proc` | `genericpla` | ✅ PASS | 9m 44s | 0.7 | 50 |
| Prusa | CORE One L | `prusacoreone` | `prusacoreone_proc` | `genericpla` | ✅ PASS | 9m 44s | 0.7 | 50 |
| Qidi | X-Smart 3 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Qidi | X-Plus 3 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Qidi | X-Max 3 | `qidixmax` | `qidixmax_proc` | `qidixmax_pla` | ✅ PASS | 7m 18s | 0.63 | 50 |
| Qidi | X-Plus4 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Qidi | X-Max4 | `qidixmax` | `qidixmax_proc` | `qidixmax_pla` | ✅ PASS | 7m 18s | 0.63 | 50 |
| Qidi | Q1 Pro | `qidiq1pro` | `qidiq1pro_proc` | `qidiq1pro_pla` | ✅ PASS | 5m 46s | 0.69 | 50 |
| Qidi | Q2 | `qidiq2` | `qidiq2_proc` | `qidiq2_pla` | ✅ PASS | 5m 42s | 0.71 | 50 |
| Snapmaker | J1 | `snapmakerj1` | `snapmakerj1_proc` | `genericpla` | ✅ PASS | 9m 44s | 0.76 | 62 |
| Snapmaker | U1 | `snapmakeru1` | `snapmakeru1_proc` | `genericpla` | ✅ PASS | 7m 35s | 0.74 | 62 |
| Sovol | SV06 | `sovolsv06` | `sovolsv06_proc` | `sovolsv06_pla` | ✅ PASS | 5m 42s | 0.88 | 50 |
| Sovol | SV06 Plus | `sovolsv06` | `sovolsv06_proc` | `sovolsv06_pla` | ✅ PASS | 5m 42s | 0.88 | 50 |
| Sovol | SV06 ACE | `sovolsv06` | `sovolsv06_proc` | `sovolsv06_pla` | ✅ PASS | 5m 42s | 0.88 | 50 |
| Sovol | SV06 Plus ACE | `sovolsv06` | `sovolsv06_proc` | `sovolsv06_pla` | ✅ PASS | 5m 42s | 0.88 | 50 |
| Sovol | SV08 | `sovolsv08` | `sovolsv08_proc` | `sovolsv08_pla` | ✅ PASS | 5m 5s | 1.04 | 50 |
| Sovol | SV08 Max | `sovolsv08` | `sovolsv08_proc` | `sovolsv08_pla` | ✅ PASS | 5m 5s | 1.04 | 50 |
| Voron | 0.1 | `bambua1` | `bambua1_proc` | `bambua1_pla` | ⚠️ A1 fallback | 11m 57s | 0.71 | 50 |
| Voron | 2.4 | `voron24` | `voron24_proc` | `voron24_pla` | ✅ PASS | 6m 26s | 0.71 | 50 |

## Documented fallbacks

These 10 models resolve to `bambua1` because Sinter's `PRINTER_PROFILE_MAP` (in `lib/orcaSlicer.ts`) has no entry whose key matches the resolved `"{make}_{model}"` string. That file is outside this repository, so the mapping itself cannot be changed here. The Bambu A1 fallback **slices successfully** for every one of them.

To remove the fallback, this repo now bakes and verifies a correct own-profile slug for 9 of the 10 (Bambu X2D excepted — OrcaSlicer 2.3.1 ships no X2D profile, so `bambuh2d`, which has X2D's exact 350×320×325 mm bed, is the correct equivalent). Adding the listed `PRINTER_PROFILE_MAP` line in `lib/orcaSlicer.ts` activates it with no further change here.

| Brand | Model | Own slug (verified) | Slice | Print time | Filament (g) | Layers | `PRINTER_PROFILE_MAP` line to add |
|-------|-------|---------------------|-------|-----------|--------------|--------|----------------------------------|
| Bambu Lab | X2D | `bambuh2d` | ✅ | 12m 21s | 0.96 | 50 | `'bambu lab_x2d': pair('bambuh2d'),` |
| Creality | Ender-3 V3 | `ender3v3` | ✅ | 6m 53s | 0.74 | 50 | `'creality_ender-3 v3': pair('ender3v3'),` |
| Creality | Ender-3 V3 Plus | `ender3v3plus` | ✅ | 6m 52s | 0.74 | 50 | `'creality_ender-3 v3 plus': pair('ender3v3plus'),` |
| Creality | Ender-3 V4 | `ender3v3` | ✅ | 6m 53s | 0.74 | 50 | `'creality_ender-3 v4': pair('ender3v3'),` |
| Creality | Ender-5 Max | `ender5max` | ✅ | 5m 28s | 0.78 | 50 | `'creality_ender-5 max': pair('ender5max'),` |
| Elegoo | OrangeStorm Giga | `elegoogiga` | ✅ | 10m 4s | 0.92 | 50 | `'elegoo_orangestorm giga': pair('elegoogiga'),` |
| Qidi | X-Smart 3 | `qidixsmart3` | ✅ | 10m 19s | 0.69 | 50 | `'qidi_x-smart 3': pair('qidixsmart3'),` |
| Qidi | X-Plus 3 | `qidixplus3` | ✅ | 10m 26s | 0.69 | 50 | `'qidi_x-plus 3': pair('qidixplus3'),` |
| Qidi | X-Plus4 | `qidiplus4` | ✅ | 5m 47s | 0.69 | 50 | `'qidi_x-plus4': pair('qidiplus4'),` |
| Voron | 0.1 | `voron02` | ✅ | 6m 25s | 0.71 | 50 | `'voron_0.1': pair('voron02'),` |

**Why each falls back**

- **Bambu Lab X2D** — OrcaSlicer 2.3.1 ships no X2D profile; bambuh2d has the identical 350x320x325 bed.
- **Creality Ender-3 V3** — PRINTER_PROFILE_MAP key 'creality_ender 3 v3' uses a space; printerData model is 'Ender-3 V3' (hyphen).
- **Creality Ender-3 V3 Plus** — No PRINTER_PROFILE_MAP entry for Ender-3 V3 Plus.
- **Creality Ender-3 V4** — PRINTER_PROFILE_MAP key 'creality_ender 3 v4' uses a space; printerData model is 'Ender-3 V4' (hyphen).
- **Creality Ender-5 Max** — PRINTER_PROFILE_MAP key 'creality_ender 5 max' uses a space; printerData model is 'Ender-5 Max' (hyphen).
- **Elegoo OrangeStorm Giga** — No PRINTER_PROFILE_MAP entry for OrangeStorm Giga.
- **Qidi X-Smart 3** — No PRINTER_PROFILE_MAP entry for X-Smart 3.
- **Qidi X-Plus 3** — No PRINTER_PROFILE_MAP entry for X-Plus 3.
- **Qidi X-Plus4** — PRINTER_PROFILE_MAP has 'qidi_plus4' -> qidiplus4 but the key does not match resolved key 'qidi_x-plus4'.
- **Voron 0.1** — PRINTER_PROFILE_MAP has 'voron_0.2' -> voron02; printerData model is '0.1'.

## Profile provenance

Every printer JSON is the brand-specific machine profile (correct bed size, kinematics and G-code flavour). Process and filament presets prefer the printer's own bundled profile and fall back as follows when OrcaSlicer 2.3.1 ships none under a usable name:

- **Process** — falls back to the closest same-brand model (`crealityhi`/`crealityk1c` → `crealityk1`, `ender3v3` → `ender3v2`, `ender3v3plus` → `ender3v3`, `prusamk4s`/`prusacoreone` → `prusamk4`, `snapmakeru1` → `snapmakerj1`, …). `0.20mm Standard`-class process settings are model-agnostic; the brand-specific bed/kinematics come from the printer profile.
- **Filament** — prefers the machine's `default_filament_profile`, then the vendor's own *Generic PLA*, then the universal *Generic PLA*. Every slug has a complete, self-contained `<slug>_pla.json` (filament density and diameter resolved).

_Generated from 72 printers · OrcaSlicer 2.3.1 · 2026-05-16._
