import { Router } from "express";
import { uploadJson } from "../../middleware/upload";
import { AppError } from "../../middleware/error";
import {
  assertCategory,
  assertValidName,
  saveProfile,
  listProfiles,
  getProfile,
  deleteProfile,
  parseProfileBuffer,
  type Category,
} from "../../core/profiles";
import {
  setConfigValues,
  parseAssignment,
  type ConfigAssignment,
} from "../../core/settings";

const router = Router();

/** Upload (create or replace) a profile in a category. */
router.post("/:category", uploadJson.single("file"), async (req, res) => {
  const name = req.body.name;
  assertValidName(name);

  if (!req.file) {
    throw new AppError(400, "File is required");
  }

  const { category } = req.params;
  assertCategory(category);

  const content = parseProfileBuffer(req.file.buffer);
  await saveProfile(category as Category, name, content);
  res.status(201).json({ name });
});

/** List profile names in a category. */
router.get("/:category", async (req, res) => {
  const { category } = req.params;
  assertCategory(category);

  const settings = await listProfiles(category as Category);
  res.status(200).json(settings);
});

/** Fetch a single profile's JSON. */
router.get("/:category/:name", async (req, res) => {
  const { category, name } = req.params;
  assertCategory(category);
  assertValidName(name);

  const setting = await getProfile(category as Category, name);
  res.status(200).json(setting);
});

/**
 * Patch individual settings on a stored profile — the API equivalent of the
 * CLI's `config set`. Body: `{ "set": ["layer_height=0.28", ...] }`.
 */
router.patch("/:category/:name", async (req, res) => {
  const { category, name } = req.params;
  assertCategory(category);
  assertValidName(name);

  const rawSet = (req.body ?? {}).set;
  const list: string[] = Array.isArray(rawSet)
    ? rawSet
    : typeof rawSet === "string"
      ? [rawSet]
      : [];
  if (list.length === 0) {
    throw new AppError(400, 'Body must include a non-empty "set" array');
  }

  const assignments: ConfigAssignment[] = list.map(parseAssignment);
  const profile = await getProfile(category as Category, name);
  const changed = setConfigValues(profile, assignments);
  await saveProfile(category as Category, name, profile);
  res.status(200).json({ name, changed });
});

/** Delete a stored profile. */
router.delete("/:category/:name", async (req, res) => {
  const { category, name } = req.params;
  assertCategory(category);
  assertValidName(name);

  await deleteProfile(category as Category, name);
  res.status(204).send();
});

export default router;
