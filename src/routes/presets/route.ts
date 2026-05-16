import { Router } from "express";
import { AppError } from "../../middleware/error";
import {
  listVendors,
  listSystemPresets,
  readFlattenedPreset,
  type PresetKind,
} from "../../core/presets";

/**
 * Read-only access to OrcaSlicer's bundled system presets (the vendor
 * printer / process / filament catalog the GUI dropdowns show).
 *   GET /presets                       — vendor list
 *   GET /presets/:vendor/:kind         — preset names (kind: machine|process|filament)
 *   GET /presets/:vendor/:kind/:name   — flattened preset JSON
 */
const router = Router();

const KINDS: PresetKind[] = ["machine", "process", "filament"];

function assertKind(kind: string): asserts kind is PresetKind {
  if (!KINDS.includes(kind as PresetKind)) {
    throw new AppError(
      400,
      `Invalid kind "${kind}". Expected one of: ${KINDS.join(", ")}`
    );
  }
}

router.get("/", async (_req, res) => {
  res.status(200).json(await listVendors());
});

router.get("/:vendor/:kind", async (req, res) => {
  const { vendor, kind } = req.params;
  assertKind(kind);
  res.status(200).json(await listSystemPresets(vendor, kind));
});

router.get("/:vendor/:kind/:name", async (req, res) => {
  const { vendor, kind, name } = req.params;
  assertKind(kind);
  const preset = await readFlattenedPreset(vendor, kind, name);
  res.status(200).json(preset);
});

export default router;
