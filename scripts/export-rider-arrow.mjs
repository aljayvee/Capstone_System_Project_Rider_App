/**
 * Exports the rider's map arrow (assets/rider-arrow.svg) at the three screen densities the map marker loads.
 *
 * The marker is drawn from an image, never a child view (GlidingRiderMarker), so the arrow has to exist as PNGs.
 *
 * Run from RiderMobileApp: `node scripts/export-rider-arrow.mjs`
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// sharp is not a dependency of the app; it is borrowed from the same runtime export-brand-icons.mjs uses.
const require = createRequire('C:/Users/Capstone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const sharp = require('sharp');
const assets = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets');
const DP = 56;
const svg = await fs.readFile(path.join(assets, 'rider-arrow.svg'));

for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
  const size = DP * scale;
  // Rasterised at the target density rather than scaled up from 1x, so the edge stays sharp.
  await sharp(svg, { density: 72 * scale }).resize(size, size).png().toFile(path.join(assets, `rider-arrow${suffix}.png`));
}
