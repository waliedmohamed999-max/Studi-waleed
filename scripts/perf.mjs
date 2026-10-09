// سرعة التصدير:
//   1) الـ bundle بيتعمل مرة واحدة ويتعاد بس لو ملفاتك اتغيرت (على الويندوز Remotion بينسخ فولدر public جواه)
//   2) عدد الصفحات اللي بترسم مع بعض (concurrency) مظبوط على جهازك، وتقدر تختبر الأنسب من الإعدادات
//   3) H.264 بـ preset أسرع (veryfast) مع جودة عالية (CRF 18)، والفرق في الجودة مش بيبان
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { tryRemove } from "./fsutil.mjs";

// ===== الـ bundle =====
const publicSignature = (dir) => {
  let n = 0;
  let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else {
        n++;
        newest = Math.max(newest, fs.statSync(f).mtimeMs);
      }
    }
  };
  walk(dir);
  return `${n}:${newest}`;
};

const bundles = new Map(); // publicDir → { sig, promise }
export const getBundle = async ({ root, publicDir }) => {
  const sig = publicSignature(publicDir);
  const cur = bundles.get(publicDir);
  if (cur && cur.sig === sig) return cur.promise;
  const promise = bundle({ entryPoint: path.join(root, "src", "index.ts"), publicDir });
  bundles.set(publicDir, { sig, promise });
  promise.catch(() => bundles.delete(publicDir));
  return promise;
};

// ===== إعدادات الرسم =====
const cpus = () => os.cpus().length || 4;
// الافتراضي: تلتين الأنوية (اتقاس على جهاز 12 thread: أسرع من الافتراضي بتاع Remotion بحوالي 20٪)
export const defaultConcurrency = () => Math.max(1, Math.min(16, Math.round(cpus() * 0.66)));

export const createPerf = ({ dataDir }) => {
  const file = path.join(dataDir, "perf.json");
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  };

  const settings = () => {
    const saved = read();
    return { cpus: cpus(), concurrency: Number(saved.concurrency) || defaultConcurrency(), tested: !!saved.concurrency, results: saved.results ?? [], testedAt: saved.testedAt ?? 0 };
  };

  // خيارات renderMedia حسب الصيغة والجودة
  const renderOptions = (codec, quality) => ({
    concurrency: settings().concurrency,
    ...(codec === "h264" ? { x264Preset: quality === "draft" ? "ultrafast" : "veryfast" } : {}),
  });

  // ===== اختبار سرعة الجهاز: بنصدّر نفس الحتة بكذا إعداد ونختار الأسرع =====
  const benchmark = async ({ root, publicDir, onProgress }) => {
    const serveUrl = await getBundle({ root, publicDir });
    const composition = await selectComposition({ serveUrl, id: "Captioned" });
    const n = cpus();
    const options = [...new Set([Math.round(n / 3), Math.round(n / 2), Math.round(n * 0.66), n - 1].map((x) => Math.max(1, Math.min(16, x))))];
    const out = path.join(os.tmpdir(), `montag-bench-${Date.now().toString(36)}.mp4`);
    const results = [];
    try {
      for (const [i, c] of options.entries()) {
        onProgress?.(`بيجرب ${c} مع بعض (${i + 1} من ${options.length})`);
        const t = Date.now();
        await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: out, frameRange: [0, 149], concurrency: c, x264Preset: "veryfast", crf: 18 });
        results.push({ concurrency: c, ms: Date.now() - t });
      }
    } finally {
      tryRemove(out);
    }
    const best = results.reduce((a, b) => (b.ms < a.ms ? b : a));
    fs.writeFileSync(file, JSON.stringify({ concurrency: best.concurrency, results, testedAt: Date.now() }, null, 2));
    return settings();
  };

  return { settings, renderOptions, benchmark };
};
