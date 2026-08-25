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
