import { defineConfig } from "vitest/config";

// الاختبارات الأوتوماتيك: npm test
// (ملف لوحده عشان vite.config.mjs بتاع الاستوديو root بتاعه فولدر studio)
export default defineConfig({
  root: ".",
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
