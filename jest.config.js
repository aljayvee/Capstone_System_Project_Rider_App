/**
 * Render tests for the Rider App.
 *
 * Runs ALONGSIDE vitest rather than replacing it. vitest owns the pure logic
 * (`tests/*.test.ts`, 64 tests) and stays fast because it needs no native
 * mocking; jest-expo owns anything that has to actually mount a component
 * (`tests/**\/*.test.tsx`).
 *
 * That split exists because of a real bug: ProgressSteps kept a stale icon map
 * after the rider's five steps became four, so `icons.Delivering` was undefined
 * and the home screen threw on every active errand. The vitest suite could not
 * catch it — nothing rendered — and the loose `Record<string, any>` hid it from
 * tsc. Both holes are now closed, but the class of bug needs a harness that
 * mounts things.
 *
 * Config mirrors the CustomerApp's, which already runs 19 render suites, so the
 * two apps are configured the same way rather than two different ways.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.js'],
  // Cold-cache protection. Both settings are about jest-expo's transform cost,
  // not about anything in the code under test.
  //
  // The symptom was one test failing only on a clean checkout: "shows the
  // message it is given" is the first in its file to mount a real component
  // tree, so the whole lazy module graph loads inside that single render() and
  // is billed to it. Warm it takes 1.2s; cold, with three suites transforming
  // react-native and the expo modules at once, it was measured at 49s.
  //
  // maxWorkers is the actual fix. Three parallel workers each transform the same
  // dependency graph before any of them has populated the on-disk cache, so they
  // multiply the one expensive thing rather than sharing it. Running serially
  // lets the first suite pay that cost once and the rest read it back.
  //
  // The timeout is the belt to that braces, at 30s to match the CustomerApp this
  // config mirrors — the one setting that never got copied across. A timeout
  // that fires on cache state rather than on the code under test is a false
  // alarm, and a suite that cries wolf on a clean checkout is one people learn
  // to re-run instead of read.
  maxWorkers: 1,
  testTimeout: 30000,
  // Only .tsx here — the .ts files under tests/ belong to vitest, and jest
  // picking them up would run every pure-logic test twice under a slower runner.
  testMatch: ['**/tests/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-maps|react-native-worklets|firebase|@firebase)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // lucide-react-native's "react-native"/"import" export condition points at
    // an ESM-only .mjs build that jest-expo's transform never matches (it only
    // handles .js/.jsx/.ts/.tsx) — redirect to the package's own CJS build
    // rather than teaching Jest to transform .mjs globally. Same workaround the
    // CustomerApp needs, and the path is unchanged in lucide 1.x.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
