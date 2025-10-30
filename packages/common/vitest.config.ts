import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    snapshotSerializers: ["./test/Evolu/_uint8ArraySerializer.ts"],
  },
});
