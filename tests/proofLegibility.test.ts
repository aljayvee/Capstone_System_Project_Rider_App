import { describe, expect, it } from "vitest";

/**
 * The clarity gate that stands between a rider and finishing an errand.
 *
 * The rule is re-stated here rather than imported: proofCapture pulls in
 * expo-image-manipulator and the ML Kit native module at the top level, neither
 * of which resolves off a device, and this suite runs in node.
 *
 * The last test in this file reads the real source and fails if the copy has
 * drifted — which it already caught once, when this was written against a
 * guessed threshold of 12 instead of the actual 40.
 */

const MIN_LEGIBLE_CHARACTERS = 40;

/** Mirrors proofCapture.isLegible. */
function isLegible(text: string | null): boolean {
  if (text === null) return true;
  return text.replace(/\s/g, "").length >= MIN_LEGIBLE_CHARACTERS;
}

/** N non-whitespace characters, spread across a page. */
const spread = (n: number) => "a ".repeat(n).trim();

describe("judging a photo the phone could read", () => {
  it("accepts a real receipt", () => {
    expect(
      isLegible(
        [
          "SAVE MORE TACURONG",
          "RICE 5KG 250.00",
          "SUGAR 1KG 85.00",
          "TOTAL 335.00",
          "CASH 400.00",
          "CHANGE 65.00",
        ].join("\n")
      )
    ).toBe(true);
  });

  it("rejects a photo that came out as almost nothing", () => {
    expect(isLegible("t o")).toBe(false);
  });

  it("does not count whitespace toward legibility", () => {
    // Counting the spaces would let a blurred photo through on layout alone.
    expect(spread(MIN_LEGIBLE_CHARACTERS).replace(/\s/g, "").length).toBe(MIN_LEGIBLE_CHARACTERS);
    expect(isLegible(spread(MIN_LEGIBLE_CHARACTERS - 1))).toBe(false);
    expect(isLegible(spread(MIN_LEGIBLE_CHARACTERS))).toBe(true);
  });

  it("rejects an empty read", () => {
    expect(isLegible("")).toBe(false);
  });

  it("sets a demanding bar, which is why a dead reader must not fail closed", () => {
    // 40 non-whitespace characters is most of a receipt header. A short slip
    // from a market stall can legitimately fall under it, so this gate is
    // strict enough that applying it to an unreadable state would strand
    // riders — see the null case below.
    expect(isLegible("TOTAL 335.00")).toBe(false);
  });
});

describe("when the reader itself is unavailable", () => {
  it("treats null as 'cannot judge', not as 'unreadable'", () => {
    // This is the whole point of the null case. ML Kit has no released New
    // Architecture support and Expo 57 makes New Arch mandatory, so the module
    // may simply stop answering. If that read as illegible, every receipt would
    // be rejected as "too blurry" while the rider stood at the counter holding
    // a perfectly sharp photo.
    expect(isLegible(null)).toBe(true);
  });

  it("is distinguishable from a genuinely blank read", () => {
    // '' means the reader worked and found nothing — a real failure worth
    // telling the rider about. null means the reader never ran. Collapsing the
    // two is what turns a dead dependency into a stranded rider.
    expect(isLegible("")).toBe(false);
    expect(isLegible(null)).toBe(true);
  });
});

describe("the copy stays in step with the source", () => {
  it("uses the same threshold and rule as proofCapture", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/services/proofCapture.ts", "utf8");

    const threshold = src.match(/MIN_LEGIBLE_CHARACTERS\s*=\s*(\d+)/);
    expect(threshold, "MIN_LEGIBLE_CHARACTERS not found in proofCapture").not.toBeNull();
    expect(Number(threshold![1])).toBe(MIN_LEGIBLE_CHARACTERS);

    // The null short-circuit is the behaviour these tests exist to protect. If
    // someone removes it, this fails rather than the suite passing against a
    // copy that no longer describes the app.
    expect(src).toMatch(/if \(text === null\) return true;/);

    // And readOnDevice must keep swallowing the native failure, or the gate
    // never sees null in the first place.
    expect(src).toMatch(/catch \{\s*return null;/);
  });
});
