import { describe, expect, it } from "vitest";
import { LightColors, DarkColors, FontSizes } from "../src/config/theme";

/**
 * The palette's accessibility guarantees, as tests rather than as a promise.
 *
 * `npm run audit:ui` reports these numbers; this fails the build when they stop
 * being true. The audit is for reading, this is for stopping a regression — a
 * report nobody runs is not a control.
 */

// ── WCAG 2.x relative luminance ──────────────────────────────────────────────
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;

/** Ink → the surfaces it is named to sit on. */
const PAIRINGS: Array<[keyof typeof LightColors, keyof typeof LightColors]> = [
  ["success", "successBg"],
  ["success", "successSubtle"],
  ["warning", "warningBg"],
  ["warning", "warningSubtle"],
  ["danger", "dangerBg"],
  ["info", "infoBg"],
  ["info", "infoSubtle"],
  ["primaryStrong", "primarySurface"],
  ["onPrimary", "primary"],
  ["onPrimary", "primaryStrong"],
  ["onSuccess", "success"],
  ["onWarning", "warning"],
  ["onDanger", "danger"],
  ["onInfo", "info"],
  ["onNavy", "navy"],
];

const TEXT_TOKENS = ["textDark", "textMedium", "textGray", "textLight"] as const;
const SURFACES = ["bgWhite", "bgLight", "bgGray", "card"] as const;

describe("the light palette", () => {
  it.each(PAIRINGS)("puts %s on %s at 4.5:1 or better", (ink, surface) => {
    expect(contrast(LightColors[ink], LightColors[surface])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(TEXT_TOKENS)("keeps %s readable on every surface the palette defines", (token) => {
    // The failure this replaced: textLight was #9CA3AF and reached 2.54:1 even
    // on pure white, while being the colour used for timestamps and hints.
    for (const surface of SURFACES) {
      expect(
        contrast(LightColors[token], LightColors[surface]),
        `${token} on ${surface}`
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});

describe("the dark palette", () => {
  it("defines every token the light palette does", () => {
    // A missing key renders as `undefined`, which React Native silently treats
    // as "no colour" — invisible text rather than a crash.
    expect(Object.keys(DarkColors).sort()).toEqual(Object.keys(LightColors).sort());
  });

  it.each(PAIRINGS)("puts %s on %s at 4.5:1 or better", (ink, surface) => {
    // Checked separately and deliberately. A dark palette nobody measured is
    // the ordinary way an accessibility claim quietly stops being true — and
    // these five DID fail on the first attempt, because the fills go light in
    // dark mode and white stopped working on them.
    expect(contrast(DarkColors[ink], DarkColors[surface])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(TEXT_TOKENS)("keeps %s readable on every surface", (token) => {
    for (const surface of SURFACES) {
      expect(
        contrast(DarkColors[token], DarkColors[surface]),
        `${token} on ${surface}`
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it("is not a naive inversion of the light palette", () => {
    // If it were, the brand would be a cyan-ish complement rather than a red.
    expect(DarkColors.primary).not.toBe(LightColors.primary);
    expect(DarkColors.primary.toUpperCase()).toMatch(/^#F/); // still a red
  });
});

describe("the type scale", () => {
  it("puts body text at Material's 16sp", () => {
    expect(FontSizes.base).toBe(16);
  });

  it("keeps every step at or above 11", () => {
    // The old scale bottomed out at 10px, carried across from a web dashboard's
    // rem values. Anything below 11 is unreadable on a phone at arm's length.
    for (const [name, size] of Object.entries(FontSizes)) {
      expect(size, `FontSizes.${name}`).toBeGreaterThanOrEqual(11);
    }
  });

  it("rises monotonically, so the names describe an order", () => {
    const order = ["xxs", "xs", "sm", "base", "md", "lg", "xl", "xxl"] as const;
    const sizes = order.map((k) => FontSizes[k]);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});
