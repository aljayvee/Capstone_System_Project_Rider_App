import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STEP_META, STATUS_STEPS } from "../src/types/rider";

/**
 * One thing, one name.
 *
 * The rider app called its unit of work seven different things: a Mission when
 * offered, an Assignment while active, a Task in the navigation, an Errand on
 * completion, a Trip in the earnings line, a delivery when offline, and an Offer
 * when declined. A rider reading those in sequence has no way to know they are
 * the same thing.
 *
 * That kind of drift does not arrive in one bad commit — it accumulates, one
 * screen at a time, because nobody reads the screens in order. So it is checked
 * here rather than trusted to review.
 *
 * The canonical noun is ERRAND, because it is what the customer app, the
 * dispatcher board, the database and the business already say. The rider using
 * a different word for the same object is the drift, not the fix.
 */

const BANNED: Array<{ word: RegExp; why: string }> = [
  { word: /\bmissions?\b/i, why: 'invented flavour for an errand — say "errand"' },
  { word: /\bwaypoints?\b/i, why: 'navigation jargon for a shop — say "store"' },
  { word: /\bassignments?\b/i, why: 'a second name for an errand — say "errand"' },
  { word: /\bmark as\b/i, why: "updates a record rather than saying what happened" },
  { word: /\bcached?\b/i, why: "implementation detail; nobody thinks in caches" },
  { word: /\bdestinations?\b/i, why: 'say who is there — "customer"' },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Strings a rider can actually read.
 *
 * Deliberately narrow. Identifiers may keep whatever name they have —
 * `useRiderMission` and `activeMissions` are code, and renaming them is churn
 * with no reader on the other side.
 */
function visibleStrings(src: string): string[] {
  const found: string[] = [];
  // JSX text nodes
  for (const m of src.matchAll(/>([^<>{}]{4,120})</g)) found.push(m[1]);
  // spoken to a screen reader, and label-ish props
  for (const m of src.matchAll(/accessibility(?:Label|Hint)=\{?["'`]([^"'`]{3,120})["'`]/g)) found.push(m[1]);
  for (const m of src.matchAll(/\blabel=\{?["'`]([^"'`]{3,120})["'`]/g)) found.push(m[1]);
  return found.map((s) => s.trim()).filter((s) => s.length > 3 && /[a-z]/i.test(s));
}

const files = sourceFiles("src").map((path) => ({
  path: path.replace(/\\/g, "/"),
  strings: visibleStrings(readFileSync(path, "utf8")),
}));

describe("the words a rider reads", () => {
  it("collects something to check, so a passing run is not vacuous", () => {
    const total = files.reduce((n, f) => n + f.strings.length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it.each(BANNED)("never says $word", ({ word, why }) => {
    const offences: string[] = [];
    for (const f of files) {
      for (const s of f.strings) {
        if (word.test(s)) offences.push(`${f.path.replace("src/", "")}: "${s}"`);
      }
    }
    expect(offences, `${word} — ${why}`).toEqual([]);
  });
});

describe("the step labels and their actions", () => {
  it("gives every step both a label and an action", () => {
    for (const step of STATUS_STEPS) {
      expect(STEP_META[step].label.length, step).toBeGreaterThan(0);
      expect(STEP_META[step].action.length, step).toBeGreaterThan(0);
    }
  });

  it("uses one noun for the shop across label and action", () => {
    // The old pair was "Traveling to Pickup" -> "Mark Arrived at Store": the
    // stepper called it a pickup and the button called it a store.
    const all = STATUS_STEPS.flatMap((s) => [STEP_META[s].label, STEP_META[s].action]).join(" ");
    expect(all).not.toMatch(/\bpickup\b/i);
  });

  it("writes actions as something the rider is saying, not a record being edited", () => {
    // "Mark as Delivered" is a database row. "I've handed it over" is a person.
    for (const step of STATUS_STEPS) {
      expect(STEP_META[step].action, step).not.toMatch(/^Mark\b/i);
    }
  });

  it("keeps every action short enough to read at a glance", () => {
    // This is the label on a button a rider taps while standing in a shop or
    // straddling a motorcycle.
    for (const step of STATUS_STEPS) {
      expect(STEP_META[step].action.length, `${step}: "${STEP_META[step].action}"`).toBeLessThanOrEqual(24);
    }
  });
});
