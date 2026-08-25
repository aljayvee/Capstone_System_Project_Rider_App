import { defineConfig } from "vitest/config";

/**
 * Runs the rider app's PURE logic — the modules that decide what a rider is
 * shown and paid, and that hold no React or native imports.
 *
 * Deliberately not jest-expo. Rendering a screen here would drag in maps,
 * camera and Firebase native modules that have no JS implementation off a
 * device, and every bug this app has actually shipped lived in the plain
 * functions behind those screens rather than in the screens themselves.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
