// طابور التصدير (المرحلة 6): دفعات فيها فيديو أو أكتر، بتتصدر واحد ورا التاني
// الدفعة الواحدة بتعمل bundle مرة واحدة بس، فالـ 100 فيديو أسرع بكتير من 100 تصدير منفصل
// الطابور متحفظ في ملف (out/.queue.json): لو السيرفر اتقفل، بيكمل من مكان ما وقف أول ما يشتغل تاني
import fs from "node:fs";
import path from "node:path";
import { getBundle } from "./perf.mjs";
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { normalizeVideoLoudness } from "./audio.mjs";

// ===== الصيغ والجودة =====
export const formats = {
  mp4: { ext: "mp4", codec: "h264" },
  webm: { ext: "webm", codec: "vp8" },
  gif: { ext: "gif", codec: "gif" },
};

// مسودة = نص المقاس وجودة أقل، بتخلص أسرع بكتير (للمراجعة قبل التصدير النهائي)
const qualitySettings = (format, quality) => {
  const draft = quality === "draft";
  if (format === "gif") return { scale: draft ? 0.3 : 0.5, everyNthFrame: 2, numberOfGifLoops: 0 };
  if (format === "webm") return { scale: draft ? 0.5 : 1, crf: draft ? 40 : 18, jpegQuality: draft ? 60 : 90 };
  return { scale: draft ? 0.5 : 1, crf: draft ? 30 : 18, jpegQuality: draft ? 60 : 95 };
};

// اسم ملف آمن بيحتفظ بالعربي (الويندوز بيقبله) ويشيل الرموز الممنوعة
export const safeName = (s, fallback = "video") =>
  String(s ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || fallback;

export const createQueue = ({ root, publicDir, outDir, stateFile = path.join(outDir, ".queue.json"), autoStart = true, perf }) => {
  const batches = [];
  let working = false;
  let current = null; // { batch, item, cancel }

  // ===== الحفظ في ملف =====
  // بنكتب في ملف مؤقت وبعدين نبدله، عشان لو الجهاز فصل وقت الكتابة الملف القديم ميبوظش
  const save = () => {
    try {
      const data = batches.map(({ serveUrl, ...b }) => b);
      fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(data));
      fs.renameSync(`${stateFile}.tmp`, stateFile);
    } catch (e) {
      console.error("queue save:", e.message);
    }
  };

  // ===== الرجوع بعد ما السيرفر يتقفل =====
  // الفيديو اللي كان بيتصدر ساعتها بيبدأ من الأول، واللي كانوا مستنيين بيكملوا عادي
  try {
    if (fs.existsSync(stateFile)) {
      for (const b of JSON.parse(fs.readFileSync(stateFile, "utf8"))) {
        for (const i of b.items) {
          if (i.status === "rendering") Object.assign(i, { status: "pending", progress: 0 });
        }
        batches.push({ ...b, serveUrl: null });
      }
    }
  } catch (e) {
    console.error("queue load:", e.message);
  }

  const publicItem = (i) => ({ name: i.name, status: i.status, progress: i.progress, file: i.file, thumb: i.thumb, error: i.error });
  const publicBatch = (b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    settings: b.settings,
    folder: b.folder,
    status: b.items.some((i) => i.status === "rendering" || i.status === "pending")
      ? "running"
      : b.items.some((i) => i.status === "error")
        ? "done-with-errors"
        : b.items.some((i) => i.status === "canceled")
          ? "canceled"
          : "done",
    done: b.items.filter((i) => i.status === "done").length,
    total: b.items.length,
    items: b.items.map(publicItem),
  });

  const work = async () => {
    if (working) return;
    working = true;
    try {
      for (;;) {
        // الأقدم الأول (الدفعات الجديدة بتتحط في أول القايمة)
        const batch = batches.findLast((b) => !b.canceled && b.items.some((i) => i.status === "pending"));
        if (!batch) break;
        const item = batch.items.find((i) => i.status === "pending");
        item.status = "rendering";
        save();
        try {
          // bundle مرة واحدة للدفعة كلها (ومشترك بين الدفعات لحد ما ملفاتك تتغير)
          batch.serveUrl ??= await getBundle({ root, publicDir });
          const { ext, codec } = formats[batch.settings.format];
          const composition = await selectComposition({ serveUrl: batch.serveUrl, id: item.videoId, inputProps: item.props });
          const dir = path.join(outDir, batch.folder);
          fs.mkdirSync(dir, { recursive: true });
          const base = batch.items.length > 1 ? `${String(item.index + 1).padStart(3, "0")}-${safeName(item.name)}` : `${safeName(item.name)}-${batch.id}`;
          const file = path.join(dir, `${base}.${ext}`);
          const { cancelSignal, cancel } = makeCancelSignal();
          current = { batch, item, cancel };

          await renderMedia({
            serveUrl: batch.serveUrl,
            composition,
            codec,
            inputProps: item.props,
            outputLocation: file,
            cancelSignal,
            ...qualitySettings(batch.settings.format, batch.settings.quality),
            ...(perf?.renderOptions(codec, batch.settings.quality) ?? {}),
            onProgress: ({ progress }) => (item.progress = progress),
          });
          // علو الصوت على معيار المنصات (-14 LUFS)، عشان الفيديو ميطلعش واطي أو عالي عن غيره
          if (batch.settings.loudness && ext !== "gif") {
            try {
              await normalizeVideoLoudness(file);
            } catch (e) {
              console.error("loudness:", e.message); // الفيديو نفسه سليم حتى لو الضبط فشل
            }
          }
          // كابشن النشر (لو موجود) في ملف نصي جنب الفيديو، عشان تنسخه وانت بترفع
          if (item.caption) fs.writeFileSync(path.join(dir, `${base}.txt`), item.caption, "utf8");
          const rel = path.relative(outDir, file).split(path.sep).map(encodeURIComponent).join("/");
          item.file = `/out/${rel}`;

          // صورة مصغرة: فريم من أول ثانية ونص (بعد ما الكلام يظهر)
          if (batch.settings.thumbnail) {
            const thumbFile = path.join(dir, `${base}.jpg`);
            await renderStill({
              serveUrl: batch.serveUrl,
              composition,
              inputProps: item.props,
              frame: Math.min(composition.durationInFrames - 1, Math.round(composition.fps * 1.5)),
              output: thumbFile,
              imageFormat: "jpeg",
              jpegQuality: 90,
            });
            item.thumb = `/out/${path.relative(outDir, thumbFile).split(path.sep).map(encodeURIComponent).join("/")}`;
          }
          item.status = "done";
          item.progress = 1;
        } catch (e) {
          item.status = batch.canceled ? "canceled" : "error";
          item.error = batch.canceled ? null : String(e?.message ?? e).slice(0, 400);
          if (!batch.canceled) console.error(e);
        } finally {
          current = null;
          save();
          // لو الدفعة اتلغت قبل ما أي فيديو يخلص، منسيبش فولدر فاضي
          const dir = path.join(outDir, batch.folder);
          if (batch.canceled && batch.folder && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
        }
      }
    } finally {
      working = false;
    }
  };

  if (autoStart && batches.some((b) => !b.canceled && b.items.some((i) => i.status === "pending"))) {
    console.log("بيكمل التصدير اللي كان شغال قبل ما السيرفر يتقفل");
    work();
  }

  return {
    // items: [{ name, videoId, props }]
    add({ name, items, settings }) {
      const id = Date.now().toString(36);
      const multi = items.length > 1;
      const batch = {
        id,
        name: safeName(name, "تصدير"),
        createdAt: Date.now(),
        settings,
        // الدفعات الكبيرة ليها فولدر لوحدها، والفيديو الواحد بيتحط في out على طول
        folder: multi ? `${safeName(name, "دفعة")}-${id}` : "",
        canceled: false,
        serveUrl: null,
        items: items.map((it, index) => ({ ...it, index, status: "pending", progress: 0, file: null, thumb: null, error: null })),
      };
      batches.unshift(batch);
      // بنحتفظ بآخر 30 دفعة بس (من غير ما نمسح دفعة لسه فيها فيديوهات مستنية)
      for (let i = batches.length - 1; batches.length > 30 && i >= 0; i--) {
        if (!batches[i].items.some((x) => x.status === "pending" || x.status === "rendering")) batches.splice(i, 1);
      }
      save();
      work();
      return publicBatch(batch);
    },
    get: (id) => {
      const b = batches.find((x) => x.id === id);
      return b ? publicBatch(b) : null;
    },
    list: () => batches.map(publicBatch),
    cancel(id) {
      const b = batches.find((x) => x.id === id);
      if (!b) return false;
      b.canceled = true;
      for (const i of b.items) if (i.status === "pending") i.status = "canceled";
      if (current?.batch === b) current.cancel();
      save();
      return true;
    },
    folderOf: (id) => {
      const b = batches.find((x) => x.id === id);
      return b ? path.join(outDir, b.folder) : outDir;
    },
  };
};
