import { defineConfig } from "vite";

// الاستوديو العربي (الواجهة) شغال على 4000، وبيبعت طلبات التصدير لسيرفر 4001
// (تقدر تغيرهم بـ STUDIO_PORT و API_PORT)
const port = Number(process.env.STUDIO_PORT ?? 4000);
const api = `http://127.0.0.1:${process.env.API_PORT ?? 4001}`;

export default defineConfig({
  root: "studio",
  // الصور والمزيكا اللي في public/ بتتعرض للمعاينة بنفس المسارات اللي بيستخدمها التصدير
  publicDir: "../public",
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    port,
    strictPort: true,
    open: true,
    proxy: {
      "/api": api,
      "/out": api,
    },
  },
});
