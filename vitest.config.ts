/// <reference types="vitest/globals" />

import { defineConfig } from "vitest/config";
import path from "path";
import { mkdirSync } from "fs";

// Ensure test data dir exists at config load time (before any module resolves)
mkdirSync(path.resolve("data/test/poll"), { recursive: true });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "vmForks",
    poolOptions: {
      vmForks: {
        isolate: false,
        env: {
          DATA_PATH: path.resolve("data/test/poll"),
          DB_PATH: path.resolve("data/test/poll/rag.sqlite"),
        },
      },
    },
    include: ["server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.d.ts", "server/agents/test*"],
    },
  },
});