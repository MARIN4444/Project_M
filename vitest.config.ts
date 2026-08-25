import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Runs the parts of the app that are deliberately free of React Native and
 * native imports, so they execute in plain Node and the feedback loop stays
 * fast. UI and native-backed modules are exercised on a device instead.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Modules that reach for native APIs are exercised on a device, not here.
    exclude: ['**/node_modules/**', 'src/db/client.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
