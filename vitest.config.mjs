import { defineConfig } from "vitest/config";

// الاختبارات الأوتوماتيك: npm test
// (ملف لوحده عشان vite.config.mjs بتاع الاستوديو root بتاعه فولدر studio)
const shared = { environment: "node", testTimeout: 60000, hookTimeout: 60000 };

export default defineConfig({
  root: ".",
  test: {
    projects: [
      // كل الاختبارات مع بعض
      { test: { ...shared, name: "main", include: ["tests/**/*.test.{ts,mjs}"], exclude: ["tests/render.test.mjs"], sequence: { groupOrder: 0 } } },
      // اختبار التصدير بعدهم لوحده: بيعمل نسخة من فولدر public، واختبارات تانية بتضيف وتمسح ملفات فيه في نفس الوقت
      { test: { ...shared, name: "render", include: ["tests/render.test.mjs"], sequence: { groupOrder: 1 } } },
    ],
  },
});
