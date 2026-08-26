#!/usr/bin/env node
/**
 * Measures the Rider App's UI against published accessibility guidance.
 *
 * Exists so the remodel can be argued from numbers rather than taste. Run it
 * now for the "before" column and again afterwards for the "after" — same
 * command, same method, so the comparison is honest.
 *
 *   node scripts/uiAudit.mjs            # human-readable report
 *   node scripts/uiAudit.mjs --json     # machine-readable, for diffing runs
 *
 * Standards applied:
 *   WCAG 2.2 AA 1.4.3  — 4.5:1 for body text, 3:1 for large text (>=18pt, or
 *                        >=14pt bold)
 *   WCAG 2.2 AA 1.4.11 — 3:1 for UI component boundaries and icons
 *   WCAG 2.2 AA 2.5.8  — target size at least 24x24 CSS px
 *   Material Design 3  — touch targets at least 48x48dp (Android is the target
 *                        platform on both test devices)
 *   Apple HIG          — 44x44pt, quoted for reference only
 *
 * Method and its limits are printed with the report; nothing here measures a
 * running app, so target sizes are computed from stylesheets rather than
 * observed from a layout pass. Where that estimate could be wrong it is marked
 * rather than rounded in our favour.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'src');

const MD3_TARGET = 48;
const WCAG_TARGET_MIN = 24;
const BODY_CONTRAST = 4.5;
const LARGE_CONTRAST = 3.0;
/** Below this a font is "body" for contrast purposes; at or above it, "large". */
const LARGE_TEXT_PT = 18;
const LARGE_BOLD_PT = 14;

// ── file walking ─────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}
const files = walk(SRC).map((f) => ({ path: f, rel: relative(ROOT, f).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));

// ── colour maths (WCAG 2.x relative luminance) ───────────────────────────────
function parseHex(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fgHex, bgHex) {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── the theme ────────────────────────────────────────────────────────────────
function readTheme() {
  const themeFile = files.find((f) => f.rel.endsWith('config/theme.ts'));
  if (!themeFile) return { colors: {}, fontSizes: {} };

  const colors = {};
  const colorBlock = themeFile.src.match(/export const Colors\s*=\s*\{([\s\S]*?)\n\}/);
  if (colorBlock) {
    for (const m of colorBlock[1].matchAll(/^\s*(\w+):\s*"(#[0-9A-Fa-f]{3,8})"/gm)) {
      colors[m[1]] = m[2].toUpperCase();
    }
  }

  const fontSizes = {};
  const fontBlock = themeFile.src.match(/export const FontSizes\s*=\s*\{([\s\S]*?)\n\}/);
  if (fontBlock) {
    for (const m of fontBlock[1].matchAll(/^\s*(\w+):\s*(\d+)/gm)) fontSizes[m[1]] = Number(m[2]);
  }
  return { colors, fontSizes };
}

const { colors, fontSizes } = readTheme();

// ── 1. contrast ──────────────────────────────────────────────────────────────
//
// Two passes, because neither alone is honest.
//
// The DESIGN-SYSTEM pass checks the pairs the theme's own naming promises:
// every `<hue>Bg` / `<hue>Light` surface against the `<hue>Dark` / `<hue>` ink
// meant to sit on it, plus every text token against every background token.
// These are the combinations the palette guarantees, so a failure here is a
// fault in the system rather than in one screen.
//
// The OBSERVED pass checks pairs found together inside a single StyleSheet
// entry. It catches little, because React Native normally puts `color` on a
// Text style and `backgroundColor` on its container, and correlating those
// needs the component tree rather than the stylesheet. Reported separately so
// the small number is not mistaken for a clean bill of health.
const HUES = ['primary', 'green', 'amber', 'blue', 'navy'];

function designSystemPairs() {
  const out = [];
  const has = (k) => typeof colors[k] === 'string';
  const add = (fg, bg, note) => {
    if (!has(fg) || !has(bg) || fg === bg) return;
    out.push({ fg, fgHex: colors[fg], bg, bgHex: colors[bg], fontSize: null, bold: false, where: 'config/theme.ts', style: note });
  };

  for (const hue of HUES) {
    for (const surface of [`${hue}Bg`, `${hue}Light`]) {
      for (const ink of [`${hue}Dark`, hue]) add(ink, surface, `${hue} on its own surface`);
    }
    // White text on a saturated fill is the standard button treatment.
    add('textWhite', hue, `white on ${hue}`);
    add('textWhite', `${hue}Dark`, `white on ${hue}Dark`);
  }

  const texts = Object.keys(colors).filter((k) => /^text/.test(k) && k !== 'textWhite');
  const surfaces = Object.keys(colors).filter((k) => /^bg/.test(k) && k !== 'bgDark');
  for (const t of texts) for (const s of surfaces) add(t, s, 'text on surface');
  for (const t of ['textWhite']) add(t, 'bgDark', 'text on dark surface');

  return out;
}

function findColourPairs() {
  const pairs = new Map();
  const tokenOf = (expr) => {
    const direct = expr.match(/Colors\.(\w+)/);
    if (direct) return { token: direct[1], hex: colors[direct[1]] };
    const literal = expr.match(/['"](#[0-9A-Fa-f]{3,8})['"]/);
    if (literal) return { token: literal[1].toUpperCase(), hex: literal[1].toUpperCase() };
    return null;
  };

  for (const file of files) {
    // Each `name: { ... }` entry inside a StyleSheet.create block.
    for (const block of file.src.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
      const body = block[2];
      // Only a genuine foreground colour. shadowColor, tintColor, borderColor
      // and placeholderTextColor all end in "Color" and none of them is text —
      // reporting a drop shadow as failing text contrast would discredit the
      // whole report.
      const colorDecl = body.match(/(?:^|[,{\s])color:\s*([^,\n]+)/);
      const bgDecl = body.match(/backgroundColor:\s*([^,\n]+)/);
      if (!colorDecl || !bgDecl) continue;

      const fg = tokenOf(colorDecl[1]);
      const bg = tokenOf(bgDecl[1]);
      if (!fg?.hex || !bg?.hex) continue;

      const fontSize = body.match(/fontSize:\s*(?:FontSizes\.(\w+)|(\d+))/);
      const size = fontSize ? (fontSize[1] ? fontSizes[fontSize[1]] : Number(fontSize[2])) : null;
      const bold = /fontWeight:\s*(?:FontWeights\.(?:bold|extrabold|black)|['"](?:700|800|900)['"])/.test(body);

      const key = `${fg.token}|${bg.token}|${size ?? '-'}|${bold}`;
      if (!pairs.has(key)) {
        pairs.set(key, {
          fg: fg.token, fgHex: fg.hex, bg: bg.token, bgHex: bg.hex,
          fontSize: size, bold, where: file.rel, style: block[1],
        });
      }
    }
  }
  return [...pairs.values()];
}

const score = (p) => {
  const ratio = contrast(p.fgHex, p.bgHex);
  const isLarge = p.fontSize !== null && (p.fontSize >= LARGE_TEXT_PT || (p.bold && p.fontSize >= LARGE_BOLD_PT));
  const required = isLarge ? LARGE_CONTRAST : BODY_CONTRAST;
  return { ...p, ratio: ratio === null ? null : round2(ratio), required, isLarge, passes: ratio !== null && ratio >= required };
};
const byRatio = (a, b) => a.ratio - b.ratio;

/**
 * Whether any single file both paints `bg` as a background and uses `fg` as a
 * colour.
 *
 * File-level co-occurrence is weaker than tracing the component tree, but it
 * separates "this pair is really on screen somewhere" from "the palette's
 * naming implies this pair". Without the distinction the report would claim
 * failures for combinations nobody renders — white on the bright `green` used
 * for an online dot, say — and one overclaim is enough for a reviewer to
 * discount the rest.
 */
function isObserved(fg, bg) {
  const bgUse = new RegExp(`backgroundColor:\\s*(?:Colors\\.${bg}\\b|['"]${colors[bg]}['"])`, 'i');
  const fgUse = new RegExp(`color:\\s*(?:Colors\\.${fg}\\b|['"]${colors[fg]}['"])`, 'i');
  return files.some((f) => bgUse.test(f.src) && fgUse.test(f.src));
}

const systemFindings = designSystemPairs()
  .map(score)
  .filter((f) => f.ratio !== null)
  .map((f) => ({ ...f, observed: isObserved(f.fg, f.bg) }))
  .sort(byRatio);
const colourFindings = findColourPairs().map(score).filter((f) => f.ratio !== null).sort(byRatio);

// ── 2. touch targets ─────────────────────────────────────────────────────────
//
// Estimated from the stylesheet, since nothing here runs a layout pass. An
// explicit height/minHeight is taken as fact; otherwise the target is
// paddingVertical*2 plus a content estimate, and rows resting on an estimate
// are marked so they can be confirmed by hand rather than trusted blindly.
const CONTENT_FALLBACK = 20;

function styleEntries(src) {
  const map = new Map();
  for (const block of src.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) map.set(block[1], block[2]);
  return map;
}

function targetHeight(body, styles) {
  const num = (re) => {
    const m = body.match(re);
    if (!m) return null;
    if (m[1] && !/^\d+$/.test(m[1])) return null;
    return Number(m[1]);
  };
  const explicit = num(/(?:minHeight|height):\s*(\d+)/);
  if (explicit !== null) return { height: explicit, exact: true };

  let padV = num(/paddingVertical:\s*(\d+)/);
  if (padV === null) {
    const spacing = body.match(/paddingVertical:\s*Spacing\.(\w+)/);
    if (spacing) padV = SPACING[spacing[1]] ?? null;
  }
  if (padV === null) {
    padV = num(/padding:\s*(\d+)/);
    if (padV === null) {
      const spacing = body.match(/padding:\s*Spacing\.(\w+)/);
      if (spacing) padV = SPACING[spacing[1]] ?? null;
    }
  }
  if (padV === null) return null;

  const fs = body.match(/fontSize:\s*(?:FontSizes\.(\w+)|(\d+))/);
  const content = fs ? Math.round((fs[1] ? fontSizes[fs[1]] : Number(fs[2])) * 1.3) : CONTENT_FALLBACK;
  return { height: padV * 2 + content, exact: false };
}

// Spacing scale, read from the theme so the estimate follows any retune.
const SPACING = (() => {
  const themeFile = files.find((f) => f.rel.endsWith('config/theme.ts'));
  const out = {};
  const block = themeFile?.src.match(/export const Spacing\s*=\s*\{([\s\S]*?)\n\}/);
  if (block) for (const m of block[1].matchAll(/^\s*(\w+):\s*(\d+)/gm)) out[m[1]] = Number(m[2]);
  return out;
})();

const targetFindings = [];
for (const file of files) {
  const styles = styleEntries(file.src);
  // Every `style={styles.X}` sitting on a touchable element.
  // `(?:[^>]|=>)*?` rather than `[\s\S]*?` so the scan does not stop at the
  // '>' inside `onPress={() => ...}`, which would hide every attribute
  // declared after the first arrow function.
  for (const m of file.src.matchAll(/<(TouchableOpacity|Pressable|TouchableHighlight|TouchableWithoutFeedback)\b((?:[^>]|=>)*?)>/g)) {
    const attrs = m[2];
    const styleRef = attrs.match(/style=\{(?:\[)?\s*styles\.(\w+)/);
    if (!styleRef) continue;
    const body = styles.get(styleRef[1]);
    if (!body) continue;

    const measured = targetHeight(body, styles);
    if (!measured) continue;

    targetFindings.push({
      where: file.rel,
      style: styleRef[1],
      height: measured.height,
      exact: measured.exact,
      hasHitSlop: /hitSlop/.test(attrs),
      passesMd3: measured.height >= MD3_TARGET,
      passesWcag: measured.height >= WCAG_TARGET_MIN,
    });
  }
}
targetFindings.sort((a, b) => a.height - b.height);

// ── 3. accessibility coverage ────────────────────────────────────────────────
const TOUCHABLE = /<(TouchableOpacity|Pressable|TouchableHighlight|TouchableWithoutFeedback|Button)\b/g;
const A11Y = /accessibilityLabel|accessibilityRole|accessibilityHint|accessibilityState/;

let touchableCount = 0;
let labelledCount = 0;
const unlabelledByFile = {};
for (const file of files) {
  for (const m of file.src.matchAll(/<(TouchableOpacity|Pressable|TouchableHighlight|TouchableWithoutFeedback|Button)\b((?:[^>]|=>)*?)>/g)) {
    touchableCount += 1;
    if (A11Y.test(m[2])) labelledCount += 1;
    else unlabelledByFile[file.rel] = (unlabelledByFile[file.rel] ?? 0) + 1;
  }
  TOUCHABLE.lastIndex = 0;
}

// ── 4. interruptions in the ride path ────────────────────────────────────────
const alerts = [];
for (const file of files) {
  for (const m of file.src.matchAll(/Alert\.alert\(\s*(['"`])(.*?)\1\s*,?\s*(?:(['"`])(.*?)\3)?/gs)) {
    alerts.push({ where: file.rel, title: m[2], body: (m[4] ?? '').slice(0, 60) });
  }
}
// A success confirmation costs a tap and tells the rider what the screen
// already shows. Failures and genuine decisions are legitimate.
const CONFIRMATORY = /^(Status Updated|Task Accepted!?|Task Declined|Ready!?|Errand Delivered!?)$/i;
const confirmatory = alerts.filter((a) => CONFIRMATORY.test(a.title));

// ── 5. hardcoded colour bypass ───────────────────────────────────────────────
let hardcoded = 0;
const hardcodedByFile = {};
for (const file of files) {
  if (file.rel.endsWith('config/theme.ts')) continue;
  const n = [...file.src.matchAll(/['"]#[0-9A-Fa-f]{3,8}['"]/g)].length;
  if (n) { hardcoded += n; hardcodedByFile[file.rel] = n; }
}

// ── 6. font scaling ──────────────────────────────────────────────────────────
const allowFontScaling = files.filter((f) => /allowFontScaling/.test(f.src)).length;

// ── report ───────────────────────────────────────────────────────────────────
const summary = {
  generatedAt: new Date().toISOString(),
  contrast: {
    pairsChecked: colourFindings.length,
    failing: colourFindings.filter((f) => !f.passes).length,
    systemChecked: systemFindings.length,
    systemFailing: systemFindings.filter((f) => !f.passes).length,
    worst: systemFindings[0] ? { pair: `${systemFindings[0].fg} on ${systemFindings[0].bg}`, ratio: systemFindings[0].ratio } : null,
  },
  targets: {
    measured: targetFindings.length,
    belowMd3: targetFindings.filter((t) => !t.passesMd3).length,
    belowWcagMin: targetFindings.filter((t) => !t.passesWcag).length,
    smallest: targetFindings[0]?.height ?? null,
  },
  accessibility: { touchables: touchableCount, labelled: labelledCount, unlabelled: touchableCount - labelledCount },
  interruptions: { total: alerts.length, confirmatory: confirmatory.length },
  tokens: { hardcodedHex: hardcoded, filesWithHardcoded: Object.keys(hardcodedByFile).length },
  fontScaling: { filesConsidering: allowFontScaling },
  typeScale: fontSizes,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, systemFindings, colourFindings, targetFindings, alerts }, null, 2));
  process.exit(0);
}

const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
const bar = (s) => console.log(`\n${'─'.repeat(78)}\n${s}\n${'─'.repeat(78)}`);

console.log(`\nRIDER APP — UI ACCESSIBILITY BASELINE`);
console.log(`Generated ${summary.generatedAt}`);
console.log(`Standards: WCAG 2.2 AA (1.4.3, 1.4.11, 2.5.8) · Material Design 3 · Apple HIG`);

const line = (f, showWhere) => {
  const mark = f.passes ? ' ' : '✗';
  const size = f.fontSize ? `${f.fontSize}${f.bold ? 'b' : ''}`.padStart(4) : '   -';
  return `${mark} ${String(f.ratio).padStart(5)}  ${String(f.required).padStart(4)}  ${size}  ` +
    `${(f.fg + ' on ' + f.bg).padEnd(34).slice(0, 34)} ${showWhere.replace('src/', '')}`;
};

bar("1a. COLOUR CONTRAST — the palette's own pairings");
const sysFail = systemFindings.filter((f) => !f.passes);
const failObserved = sysFail.filter((f) => f.observed);
const failImplied = sysFail.filter((f) => !f.observed);
console.log(`${systemFindings.length} pairs the theme's naming implies · ${sysFail.length} below the required ratio`);
console.log(`of which ${failObserved.length} appear in a file that renders both.\n`);

console.log('  OBSERVED — some screen puts this ink on this surface');
console.log('  ratio   need   size  foreground on background            meaning');
for (const f of failObserved) console.log(line(f, f.style));
if (failObserved.length === 0) console.log('  (none)');

console.log('\n  IMPLIED ONLY — the naming suggests the pair; no file renders both.');
console.log('  Worth fixing in the palette so it cannot be reached by accident.');
for (const f of failImplied) console.log(line(f, f.style));
if (failImplied.length === 0) console.log('  (none)');

console.log(`\n  ${systemFindings.filter((f) => f.passes).length} pair(s) pass and are not listed. Use --json for all.`);

bar('1b. COLOUR CONTRAST — pairs observed in a single style entry');
console.log(`${colourFindings.length} found, ${summary.contrast.failing} failing.`);
console.log(`Few, because React Native splits text colour and background across\nnested styles; correlating those needs the component tree, not the\nstylesheet. Treat 1a as the real measure.\n`);
console.log('  ratio   need   size  foreground on background            where');
for (const f of colourFindings.slice(0, 12)) console.log(line(f, f.where));

bar('2. TOUCH TARGETS  — estimated from stylesheets, not a layout pass');
console.log(`${targetFindings.length} measured · ${summary.targets.belowMd3} below MD3's 48dp · ${summary.targets.belowWcagMin} below WCAG's 24px floor\n`);
console.log('  height  std  style                          where');
for (const t of targetFindings.slice(0, 20)) {
  const mark = t.passesMd3 ? ' ' : '✗';
  const note = t.exact ? '   ' : ' ~ ';
  console.log(
    `${mark} ${String(t.height).padStart(4)}dp${note}${t.passesMd3 ? 'ok ' : t.passesWcag ? 'wcag' : 'FAIL'}  ` +
    `${t.style.padEnd(30).slice(0, 30)} ${t.where.replace('src/', '')}`
  );
}
if (targetFindings.length > 20) console.log(`  … ${targetFindings.length - 20} more (use --json)`);
console.log(`\n  ~ = estimated as paddingVertical*2 + content; confirm by hand before quoting.`);

bar('3. ACCESSIBILITY LABELLING');
console.log(`${labelledCount} of ${touchableCount} controls carry any accessibility prop (${pct(labelledCount, touchableCount)}).`);
console.log(`${summary.accessibility.unlabelled} controls report nothing to a screen reader.\n`);
for (const [f, n] of Object.entries(unlabelledByFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(n).padStart(3)}  ${f.replace('src/', '')}`);
}

bar('4. INTERRUPTIONS IN THE RIDE PATH');
console.log(`${alerts.length} blocking Alert.alert calls, of which ${confirmatory.length} confirm a success.\n`);
for (const a of alerts) {
  const flag = CONFIRMATORY.test(a.title) ? '✗' : ' ';
  console.log(`${flag} "${a.title}" ${a.body ? `— ${a.body}` : ''}`);
}
console.log(`\n  ✗ = fires on success and costs a tap while riding.`);

bar('5. TOKEN DISCIPLINE');
console.log(`${hardcoded} hardcoded hex values across ${summary.tokens.filesWithHardcoded} files, bypassing the theme.\n`);
for (const [f, n] of Object.entries(hardcodedByFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`  ${String(n).padStart(3)}  ${f.replace('src/', '')}`);
}

bar('6. TYPE SCALE');
const entries = Object.entries(fontSizes).sort((a, b) => a[1] - b[1]);
console.log(entries.map(([k, v]) => `${k}:${v}`).join('  '));
const belowBody = entries.filter(([, v]) => v < 16).length;
console.log(`\n${belowBody} of ${entries.length} steps fall below the 16sp Material treats as body size.`);
console.log(`allowFontScaling considered in ${allowFontScaling} file(s) — OS text scaling is otherwise untested.`);

bar('SUMMARY');
console.log(`  palette pairs failing       ${summary.contrast.systemFailing} / ${summary.contrast.systemChecked}  (${failObserved.length} of them rendered)`);
console.log(`  targets below 48dp          ${summary.targets.belowMd3} / ${summary.targets.measured}`);
console.log(`  controls with no a11y prop  ${summary.accessibility.unlabelled} / ${summary.accessibility.touchables}`);
console.log(`  success-only interruptions  ${summary.interruptions.confirmatory} / ${summary.interruptions.total}`);
console.log(`  hardcoded hex values        ${summary.tokens.hardcodedHex}`);
console.log('');
