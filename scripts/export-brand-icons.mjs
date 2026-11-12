/**
 * Exports the rider app's launcher, notification and in-app brand images from one flat vector mark.
 *
 * The mark is the Sugo Tacurong scooter the Customer App adopted on 2026-11-01 (its master is
 * CustomerApp/artwork/kuya-sugo/logo_concepts.mjs, `sugo-scooter`); assets/brand/sugo-mark-white.svg is a copy.
 * The rider app keeps its own red (palette `primary`) so the two launcher icons stay distinguishable.
 * No gradient, lighting, bevel or shadow enters this pipeline.
 *
 * Run from RiderMobileApp: `node scripts/export-brand-icons.mjs`
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/Capstone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const red = '#DC2626';
const master = await fs.readFile(path.join(assets, 'brand/sugo-mark-white.svg'), 'utf8');
const rider = master.replace(/^[\s\S]*?<\/title>/, '').replace(/<\/svg>\s*$/, '');
const document = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">${content}</svg>`;
const mark = document(rider);
const icon = document(`<path fill="${red}" d="M0 0h512v512H0z"/>${rider}`);
// Android foreground fits wholly inside the central 66% safe area.
const adaptive = document(`<g transform="translate(256 256) scale(.72) translate(-256 -256)">${rider}</g>`);
const round = document(`<circle cx="256" cy="256" r="256" fill="${red}"/><g transform="translate(256 256) scale(.72) translate(-256 -256)">${rider}</g>`);
const solid = (size) => sharp({ create: { width: size, height: size, channels: 3, background: red } });

await sharp(Buffer.from(icon)).flatten({ background: red }).removeAlpha().png().toFile(path.join(assets, 'icon.png'));
for (const name of ['android-icon-foreground.png', 'android-icon-monochrome.png']) await sharp(Buffer.from(adaptive)).png().toFile(path.join(assets, name));
await solid(1024).png().toFile(path.join(assets, 'android-icon-background.png'));
await sharp(Buffer.from(icon)).resize(64, 64).png().toFile(path.join(assets, 'favicon.png'));

// Android tints only the alpha of a notification icon, so it is pure white plus the mark's alpha. Resampling leaves
// 254-grey on the edges, and sharp runs extend after resize within one pipeline, so trim and pad first, then resize.
const padded = await sharp(Buffer.from(mark)).trim().extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#FFFFFF00' }).png().toBuffer();
const whiteMask = async (size) => {
  const alpha = await sharp(padded).resize(size, size, { fit: 'contain', background: '#FFFFFF00' }).extractChannel('alpha').png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: '#FFFFFF' } }).joinChannel(alpha).png();
};
await (await whiteMask(96)).toFile(path.join(assets, 'notification-icon.png'));

// In-app mark (splash emblem, login badge, Home header): white on transparent, tinted with tintColor where needed.
// 64 dp wide at @1x; screens draw it at that width or smaller. Density 144 rasterises the SVG at 2048 px (a resize
// would run after the trim and leave the square canvas).
const trimmed = await sharp(Buffer.from(mark), { density: 144 }).trim().png().toBuffer();
for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
  const alpha = await sharp(trimmed).resize({ width: 64 * scale }).extractChannel('alpha').png().toBuffer();
  const { width, height } = await sharp(alpha).metadata();
  await sharp({ create: { width, height, channels: 3, background: '#FFFFFF' } }).joinChannel(alpha).png().toFile(path.join(assets, `brand/sugo-mark-white${suffix}.png`));
}

// EAS builds the checked-out android/ folder as-is (it is gitignored and there is no prebuild), so its launcher
// mipmaps and notification drawables must be written here too.
const res = path.join(root, 'android/app/src/main/res');
if (await fs.stat(res).then(() => true, () => false)) {
  for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const dir = path.join(res, `mipmap-${density}`), legacy = 48 * scale, layer = 108 * scale;
    await sharp(Buffer.from(icon)).resize(legacy, legacy).flatten({ background: red }).removeAlpha().webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher.webp'));
    await sharp(Buffer.from(round)).resize(legacy, legacy).webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher_round.webp'));
    for (const name of ['ic_launcher_foreground.webp', 'ic_launcher_monochrome.webp']) await sharp(Buffer.from(adaptive)).resize(layer, layer).webp({ lossless: true }).toFile(path.join(dir, name));
    await solid(layer).webp({ lossless: true }).toFile(path.join(dir, 'ic_launcher_background.webp'));
    await (await whiteMask(24 * scale)).toFile(path.join(res, `drawable-${density}`, 'notification_icon.png'));
  }
}
console.log(`Rider brand icons exported: white scooter on ${red}.`);
