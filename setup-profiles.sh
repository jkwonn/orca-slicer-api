#!/bin/bash
# Sinter: bake OrcaSlicer's bundled (machine, process, filament) triplets into
# DATA_PATH so each printer gets its GUI-matched preset + filament. We copy
# files VERBATIM — no JSON modification — so OrcaSlicer's CLI sees the same
# profile data its GUI would, including correct array-typed fields like
# nozzle_volume / nozzle_type / machine_max_acceleration_*.
#
# For each supported printer slug we:
#   1. Copy <vendor>/machine/<machine_name>.json    -> /app/data/printers/<slug>.json
#   2. Read default_print_profile     from that JSON, copy that process file
#                                                   -> /app/data/presets/<slug>_proc.json
#   3. Read default_filament_profile  from that JSON (first entry), copy it
#                                                   -> /app/data/filaments/<slug>_pla.json
#
# OrcaSlicer's `inherits:` chain still resolves against /app/squashfs-root,
# so parent profiles (fdm_bbl_3dp_001_common, fdm_process_single_0.20, etc.)
# stay accessible without any additional setup.

set -e

P="/app/squashfs-root/resources/profiles"
DATA="/app/data"

mkdir -p "$DATA/printers" "$DATA/presets" "$DATA/filaments"

# slug | vendor | machine_basename (no .json)
# When the bundled OrcaSlicer doesn't ship a profile for a given printer
# (e.g. Bambu H2 series didn't exist at v2.3.1), the entry uses the closest
# compatible printer's profile. The slug in lib/orcaSlicer.ts still routes
# correctly because matching is by slug, not by printer_model field.
PRINTERS="
bambux1carbon|BBL|Bambu Lab X1 Carbon 0.4 nozzle
bambux1|BBL|Bambu Lab X1 0.4 nozzle
bambup1p|BBL|Bambu Lab P1P 0.4 nozzle
bambup1s|BBL|Bambu Lab P1S 0.4 nozzle
bambua1|BBL|Bambu Lab A1 0.4 nozzle
bambua1mini|BBL|Bambu Lab A1 mini 0.4 nozzle
bambuh2c|BBL|Bambu Lab X1 Carbon 0.4 nozzle
bambuh2s|BBL|Bambu Lab X1 Carbon 0.4 nozzle
bambuh2d|BBL|Bambu Lab X1 Carbon 0.4 nozzle
bambup2s|BBL|Bambu Lab P1S 0.4 nozzle
prusamk4|Prusa|Prusa MK4 0.4 nozzle
prusamk4s|Prusa|Prusa MK4S 0.4 nozzle
prusamk3s|Prusa|Prusa MK3S 0.4 nozzle
prusamini|Prusa|Prusa MINI 0.4 nozzle
prusaxl|Prusa|Prusa XL 0.4 nozzle
prusacoreone|Prusa|Prusa CORE One 0.4 nozzle
ender3v2|Creality|Creality Ender-3 V2 0.4 nozzle
ender3v3|Creality|Creality Ender-3 V3 0.4 nozzle
ender3s1|Creality|Creality Ender-3 S1 0.4 nozzle
ender5max|Creality|Creality Ender-5 Max 0.4 nozzle
cr10|Creality|Creality CR-10 Max 0.4 nozzle
crealityk1|Creality|Creality K1 (0.4 nozzle)
crealityk1c|Creality|Creality K1C 0.4 nozzle
crealityk1max|Creality|Creality K1 Max (0.4 nozzle)
crealityk2|Creality|Creality K2 Plus 0.4 nozzle
crealityk2plus|Creality|Creality K2 Plus 0.4 nozzle
crealityk2pro|Creality|Creality K2 Plus 0.4 nozzle
crealityhi|Creality|Creality Hi 0.4 nozzle
crealitysparkx|Creality|Creality K1 (0.4 nozzle)
anycubickobra2|Anycubic|Anycubic Kobra 2 0.4 nozzle
anycubickobra2pro|Anycubic|Anycubic Kobra 2 Pro 0.4 nozzle
anycubicvyper|Anycubic|Anycubic Vyper 0.4 nozzle
anycubickobras1|Anycubic|Anycubic Kobra S1 0.4 nozzle
anycubickobra3max|Anycubic|Anycubic Kobra 3 0.4 nozzle
anycubickobra3v2|Anycubic|Anycubic Kobra 3 0.4 nozzle
anycubickobras1max|Anycubic|Anycubic Kobra S1 0.4 nozzle
anycubickobrax|Anycubic|Anycubic Kobra 2 0.4 nozzle
anycubicphotonmonox|Anycubic|Anycubic Kobra 2 0.4 nozzle
ultimaker2plus|UltiMaker|UltiMaker 2 0.4 nozzle
ultimakers3|UltiMaker|UltiMaker 2 0.4 nozzle
ultimakers5|UltiMaker|UltiMaker 2 0.4 nozzle
ultimakers7|UltiMaker|UltiMaker 2 0.4 nozzle
elegooneptune4|Elegoo|Elegoo Neptune 4 (0.4 nozzle)
elegooneptune4pro|Elegoo|Elegoo Neptune 4 Pro (0.4 nozzle)
elegoocentauri|Elegoo|Elegoo Neptune 4 (0.4 nozzle)
elegoomars3|Elegoo|Elegoo Neptune 4 (0.4 nozzle)
elegoosaturn2|Elegoo|Elegoo Neptune 4 (0.4 nozzle)
sovolsv06|Sovol|Sovol SV06 0.4 nozzle
sovolsv07|Sovol|Sovol SV07 0.4 nozzle
sovolsv08|Sovol|Sovol SV08 0.4 nozzle
sovolsv08max|Sovol|Sovol SV08 MAX 0.4 nozzle
sovolzero|Sovol|Sovol SV06 0.4 nozzle
comgrowt300|Comgrow|Comgrow T300 0.4 nozzle
comgrowt500|Comgrow|Comgrow T500 0.4 nozzle
voron02|Voron|Voron 0.1 0.4 nozzle
voron24|Voron|Voron 2.4 250 0.4 nozzle
vorontrident|Voron|Voron Trident 250 0.4 nozzle
qidiq1pro|Qidi|Qidi Q1 Pro 0.4 nozzle
qidiq2|Qidi|Qidi Q2 0.4 nozzle
qidiplus4|Qidi|Qidi X-Plus 4 0.4 nozzle
qidixmax|Qidi|Qidi X-Max 0.4 nozzle
qidimax4|Qidi|Qidi X-Max 3 0.4 nozzle
flsuns1|FLSun|FLSun S1 0.4 nozzle
flsunt1|FLSun|FLSun T1 0.4 nozzle
flashforgead5m|Flashforge|Flashforge Adventurer 5M 0.4 Nozzle
flashforgead5mpro|Flashforge|Flashforge Adventurer 5M Pro 0.4 Nozzle
flashforgead5x|Flashforge|Flashforge AD5X 0.4 nozzle
flashforgecreator5|Flashforge|Flashforge Adventurer 5M 0.4 Nozzle
snapmakerj1|Snapmaker|Snapmaker J1 (0.4 nozzle)
snapmakeru1|Snapmaker|Snapmaker U1 (0.4 nozzle)
"

miss_machine=0
miss_preset=0
miss_filament=0

# Bed-size lookup: width × depth × height (mm), origin at corner. The bundled
# OrcaSlicer v2.3.1 profiles often lack `printable_area`, leaving the slicer
# to fall back to a small default that rejects parts >~230mm. We patch the
# explicit corner polygon in based on manufacturer spec — every other field
# in the JSON is left exactly as bundled so the v2.3.1 binary sees the data
# in the format it expects (string vs array).
# Flatten a profile by walking its `inherits:` chain and merging parent fields
# in. OrcaSlicer's CLI does not resolve `inherits:` at slice time, so child
# profiles that only override a few fields end up missing things like
# `filament_diameter`, `filament_density`, `filament_max_volumetric_speed`,
# leading to wildly wrong extrusion calculations (e.g. 6.7km of filament for
# a 390cm³ part). Pre-flattening produces self-contained profiles where every
# field is set explicitly. Parents are looked up in the SAME category dir
# under the bundled OrcaSlicer profile tree.
flatten_profile() {
  local src="$1" dst="$2" category_dir="$3"
  python3 - <<PYEOF
import json, os, sys

CATEGORY_DIR = "$category_dir"

def load(path):
    with open(path) as f:
        return json.load(f)

def find_parent(name):
    # Try the same category dir first; fall back to BBL's category dir which
    # holds the cross-vendor parents like fdm_process_single_0.20 and
    # fdm_bbl_3dp_001_common.
    for d in (CATEGORY_DIR, CATEGORY_DIR.replace("/Anycubic/","/BBL/").replace("/Creality/","/BBL/").replace("/Prusa/","/BBL/").replace("/Elegoo/","/BBL/").replace("/Sovol/","/BBL/").replace("/UltiMaker/","/BBL/").replace("/Voron/","/BBL/").replace("/Qidi/","/BBL/").replace("/FLSun/","/BBL/").replace("/Flashforge/","/BBL/").replace("/Snapmaker/","/BBL/").replace("/Comgrow/","/BBL/")):
        cand = os.path.join(d, name + ".json")
        if os.path.exists(cand):
            return cand
    return None

def flatten(path, depth=0):
    if depth > 10:  # cycle / inheritance loop guard
        return {}
    prof = load(path)
    inherits = prof.get("inherits")
    if not inherits:
        prof.pop("inherits", None)
        return prof
    parent_path = find_parent(inherits)
    if not parent_path:
        # Parent missing — return child as-is, slicer will fall back to
        # its hardcoded defaults for missing fields.
        prof.pop("inherits", None)
        return prof
    parent = flatten(parent_path, depth + 1)
    # Child fields override parent fields. Special-case: arrays in the
    # parent are not extended by children — children fully replace.
    merged = {**parent, **prof}
    merged.pop("inherits", None)
    return merged

merged = flatten("$src")
with open("$dst","w") as f:
    json.dump(merged, f, indent=2)
PYEOF
}

patch_machine() {
  local src="$1" dst="$2" w="$3" d="$4" h="$5" category_dir="$6"
  flatten_profile "$src" "$dst.tmp" "$category_dir"
  python3 - <<PYEOF
import json
with open("$dst.tmp") as f: prof = json.load(f)

# printable_area: only patch if the bundled (post-flatten) profile is missing
# or has an empty value. v2.3.1 ships some printer JSONs without it, which
# makes the slicer fall back to a tiny default and reject parts >~230mm. But
# many printers (e.g. Bambu A1) already ship a correct corner-origin polygon
# we shouldn't clobber.
if not prof.get("printable_area"):
    prof["printable_area"] = ["0x0", "${w}x0", "${w}x${d}", "0x${d}"]
if not prof.get("printable_height"):
    prof["printable_height"] = "${h}"

# bed_exclude_area / head_wrap_detect_zone: clear so 250mm-wide parts don't
# trip false "head will collide" rejections during arrange. These zones are
# only relevant for actual prints, not for time/filament estimation.
prof["bed_exclude_area"] = []
if "head_wrap_detect_zone" in prof:
    prof["head_wrap_detect_zone"] = []

# Always ensure G92 E0 is in layer_change_gcode. OrcaSlicer's CLI validator
# defaults to relative-E mode for marlin/klipper flavors when the field is
# unspecified, and rejects with "Add G92 E0 to layer_gcode" if it's missing.
# G92 E0 in absolute-E mode is a no-op reset, so this is safe regardless of
# use_relative_e_distances. Bundled profiles store gcode templates as either
# a string or a list of strings; handle both.
lcg = prof.get("layer_change_gcode", "")
lcg_str = "\n".join(lcg) if isinstance(lcg, list) else (lcg or "")
if "G92 E0" not in lcg_str:
    prof["layer_change_gcode"] = lcg_str.rstrip() + ("\n" if lcg_str else "") + "G92 E0"

with open("$dst","w") as f: json.dump(prof, f, indent=2)
PYEOF
  rm -f "$dst.tmp"
}

# Set compatible_printers on a preset so a given printer can use it.
# The bundled v2.3.1 process presets sometimes omit this field, which causes
# the slicer to reject "incorrect slicing parameters" when paired with our
# printer slug.
patch_preset() {
  local src="$1" dst="$2" printer_name="$3"
  python3 - <<PYEOF
import json
with open("$src") as f: prof = json.load(f)
existing = prof.get("compatible_printers", [])
if not isinstance(existing, list): existing = []
if "$printer_name" not in existing:
    existing.append("$printer_name")
prof["compatible_printers"] = existing
with open("$dst","w") as f: json.dump(prof, f, indent=2)
PYEOF
}

# Bed sizes (slug → width depth height mm). Manufacturer spec, no safety
# margin — each printer's full physical build volume.
declare -A BED_W BED_D BED_H
add_bed() { BED_W[$1]=$2; BED_D[$1]=$3; BED_H[$1]=$4; }
add_bed bambux1carbon 256 256 256
add_bed bambux1 256 256 256
add_bed bambup1p 256 256 256
add_bed bambup1s 256 256 256
add_bed bambua1 256 256 256
add_bed bambua1mini 180 180 180
add_bed bambuh2c 256 256 256
add_bed bambuh2s 256 256 256
add_bed bambuh2d 350 320 325
add_bed bambup2s 256 256 256
add_bed prusamk4 250 210 220
add_bed prusamk4s 250 210 220
add_bed prusamk3s 250 210 210
add_bed prusamini 180 180 180
add_bed prusaxl 360 360 360
add_bed prusacoreone 250 220 270
add_bed ender3v2 235 235 250
add_bed ender3v3 220 220 250
add_bed ender3s1 220 220 270
add_bed ender5max 400 400 400
add_bed cr10 300 300 400
add_bed crealityk1 220 220 250
add_bed crealityk1c 220 220 250
add_bed crealityk1max 300 300 300
add_bed crealityk2 350 350 350
add_bed crealityk2plus 350 350 350
add_bed crealityk2pro 350 350 350
add_bed crealityhi 260 260 300
add_bed crealitysparkx 220 220 220
add_bed anycubickobra2 220 220 250
add_bed anycubickobra2pro 220 220 250
add_bed anycubicvyper 245 245 260
add_bed anycubickobras1 250 250 250
add_bed anycubickobra3max 420 420 500
add_bed anycubickobra3v2 250 250 260
add_bed anycubickobras1max 500 500 420
add_bed anycubickobrax 420 420 500
add_bed anycubicphotonmonox 192 120 245
add_bed ultimaker2plus 223 223 205
add_bed ultimakers3 230 190 200
add_bed ultimakers5 330 240 300
add_bed ultimakers7 330 240 300
add_bed elegooneptune4 225 225 265
add_bed elegooneptune4pro 225 225 265
add_bed elegoocentauri 256 256 256
add_bed elegoomars3 143 89 175
add_bed elegoosaturn2 219 123 250
add_bed sovolsv06 220 220 250
add_bed sovolsv07 220 220 240
add_bed sovolsv08 350 350 345
add_bed sovolsv08max 500 500 500
add_bed sovolzero 140 140 140
add_bed comgrowt300 300 300 300
add_bed comgrowt500 500 500 500
add_bed voron02 120 120 120
add_bed voron24 350 350 350
add_bed vorontrident 350 350 320
add_bed qidiq1pro 245 245 245
add_bed qidiq2 245 245 245
add_bed qidiplus4 305 305 280
add_bed qidixmax 325 325 315
add_bed qidimax4 305 305 280
add_bed flsuns1 260 260 330
add_bed flsunt1 260 260 330
add_bed flashforgead5m 220 220 220
add_bed flashforgead5mpro 220 220 220
add_bed flashforgead5x 220 220 220
add_bed flashforgecreator5 220 220 220
add_bed snapmakerj1 320 200 200
add_bed snapmakeru1 305 305 305

while IFS='|' read -r slug vendor machine_name; do
  [ -z "$slug" ] && continue

  src_machine="$P/$vendor/machine/$machine_name.json"
  if [ ! -f "$src_machine" ]; then
    echo "MISS machine: $slug ($src_machine)"
    miss_machine=$((miss_machine+1))
    continue
  fi

  # Flatten machine inherits chain, then patch in printable_area / absolute E.
  w=${BED_W[$slug]:-256}
  d=${BED_D[$slug]:-256}
  h=${BED_H[$slug]:-256}
  patch_machine "$src_machine" "$DATA/printers/$slug.json" "$w" "$d" "$h" "$P/$vendor/machine"

  # Derive matched preset + filament from machine's own metadata.
  preset_name=$(python3 -c "import json; d=json.load(open('$src_machine')); print(d.get('default_print_profile',''))")
  filament_name=$(python3 -c "import json; d=json.load(open('$src_machine')); v=d.get('default_filament_profile',['']); print(v[0] if v else '')")

  if [ -n "$preset_name" ] && [ -f "$P/$vendor/process/$preset_name.json" ]; then
    # Flatten the preset's inherits chain so all fields are explicit.
    flatten_profile "$P/$vendor/process/$preset_name.json" "$DATA/presets/${slug}_proc.json" "$P/$vendor/process"
  else
    echo "MISS preset:  $slug -> '$preset_name'"
    miss_preset=$((miss_preset+1))
  fi

  if [ -n "$filament_name" ] && [ -f "$P/$vendor/filament/$filament_name.json" ]; then
    # Flatten the filament's inherits chain so filament_diameter, density,
    # max_volumetric_speed, etc. are all explicit.
    flatten_profile "$P/$vendor/filament/$filament_name.json" "$DATA/filaments/${slug}_pla.json" "$P/$vendor/filament"
  else
    echo "MISS filament: $slug -> '$filament_name'"
    miss_filament=$((miss_filament+1))
  fi
done <<< "$PRINTERS"

# Generic filaments for non-PLA materials. PLA defaults to the per-printer
# `<slug>_pla` slug (matched to the machine's default_filament_profile); ABS,
# PETG, etc. fall back to OrcaSlicer's bundled Generic profiles.
copy_generic() {
  local src="$1" dst="$2"
  if [ -f "$src" ]; then
    flatten_profile "$src" "$dst" "$P/BBL/filament"
  else
    echo "MISS generic filament: $src"
  fi
}
copy_generic "$P/BBL/filament/Generic PLA.json"  "$DATA/filaments/genericpla.json"
copy_generic "$P/BBL/filament/Generic ABS.json"  "$DATA/filaments/genericabs.json"
copy_generic "$P/BBL/filament/Generic PETG.json" "$DATA/filaments/genericpetg.json"
copy_generic "$P/BBL/filament/Generic TPU.json"  "$DATA/filaments/generictpu.json"
copy_generic "$P/BBL/filament/Generic ASA.json"  "$DATA/filaments/genericasa.json"
copy_generic "$P/BBL/filament/Generic PA.json"   "$DATA/filaments/genericpa.json"
copy_generic "$P/BBL/filament/Generic PVA.json"  "$DATA/filaments/genericpva.json"
copy_generic "$P/BBL/filament/fdm_filament_hips.json" "$DATA/filaments/generichips.json"

PRINTERS_BAKED=$(ls "$DATA/printers/" | wc -l)
PRESETS_BAKED=$(ls "$DATA/presets/" | wc -l)
FILAMENTS_BAKED=$(ls "$DATA/filaments/" | wc -l)
echo "Profiles ready: $PRINTERS_BAKED printers, $PRESETS_BAKED presets, $FILAMENTS_BAKED filaments"
echo "Skipped: $miss_machine missing machines, $miss_preset missing presets, $miss_filament missing filaments"
