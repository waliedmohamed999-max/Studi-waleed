// تسطيب Whisper (التفريغ الصوتي) وتشغيله
// التشغيل لوحده: node scripts/whisper.mjs   ← بينزّل البرنامج والموديل لو مش موجودين
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { downloadWhisperModel, installWhisperCpp, toCaptions } from "@remotion/install-whisper-cpp";
import { tryRemove } from "./fsutil.mjs";

// اسم إعداد التوقيت لكل موديل (نفس جدول Remotion)
const modelToDtw = (m) => ({ "large-v3-turbo": "large.v3.turbo", "large-v3": "large.v3", "large-v2": "large.v2", "large-v1": "large.v1" })[m] ?? m;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WHISPER_DIR = path.join(root, "whisper");
export const WHISPER_VERSION = "1.9.2";
export const WHISPER_MODEL = "large-v3-turbo";
const MODELS_DIR = path.join(WHISPER_DIR, "models");

// Remotion بيدور على البرنامج في build/bin، بس ملف الويندوز بيتفك في فولدر Release
const expectedExe = path.join(WHISPER_DIR, "build", "bin", "whisper-cli.exe");
const modelFile = path.join(MODELS_DIR, `ggml-${WHISPER_MODEL}.bin`);

export const ffmpegPath = () => {
  const dir = fs.readdirSync(path.join(root, "node_modules", "@remotion")).find((d) => d.startsWith("compositor-win32"));
  return path.join(root, "node_modules", "@remotion", dir ?? "compositor-win32-x64-msvc", "ffmpeg.exe");
};

export const whisperStatus = () => ({
  installed: fs.existsSync(expectedExe),
  modelReady: fs.existsSync(modelFile),
  model: WHISPER_MODEL,
});

const findFile = (dir, name) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name) return p;
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    }
  }
  return null;
};

export const setupWhisper = async (onProgress = () => {}) => {
  if (!fs.existsSync(expectedExe)) {
    onProgress({ step: "program", progress: 0 });
    // installWhisperCpp بينزّل الملف المضغوط في الفولدر الحالي، فبنشتغل من جوه المشروع
    const prev = process.cwd();
    process.chdir(root);
    try {
      await installWhisperCpp({ version: WHISPER_VERSION, to: WHISPER_DIR, printOutput: false }).catch((e) => {
        // بيرمي error لو ملقاش البرنامج في build/bin، وده متوقع، هنظبطه تحت
        if (!fs.existsSync(WHISPER_DIR)) throw e;
      });
    } finally {
      process.chdir(prev);
      // الملف المضغوط اللي اتنزّل مش محتاجينه بعد ما اتفك
      tryRemove(path.join(root, "whisper-bin-x64.zip"));
    }
    if (!fs.existsSync(expectedExe)) {
      const cli = findFile(WHISPER_DIR, "whisper-cli.exe");
      if (!cli) throw new Error("ملقيتش whisper-cli.exe بعد التسطيب");
      fs.mkdirSync(path.dirname(expectedExe), { recursive: true });
      for (const f of fs.readdirSync(path.dirname(cli))) {
        fs.copyFileSync(path.join(path.dirname(cli), f), path.join(path.dirname(expectedExe), f));
      }
    }
  }
  onProgress({ step: "program", progress: 1 });

  fs.mkdirSync(MODELS_DIR, { recursive: true });
  await downloadWhisperModel({
    model: WHISPER_MODEL,
    folder: MODELS_DIR,
    printOutput: false,
    onProgress: (downloaded, total) => onProgress({ step: "model", progress: total ? downloaded / total : 0 }),
  });
  onProgress({ step: "done", progress: 1 });
};

const run = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))));
  });

// بيحوّل أي ملف صوت أو فيديو لـ WAV بـ 16kHz (اللي Whisper محتاجه)
export const toWav16k = async (input, output) => {
  await run(ffmpegPath(), ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output]);
};

// ===== كشف الكلام من مستوى الصوت (للمونتاج الأوتوماتيك) =====
// Whisper بيمط توقيت الكلمة لحد الكلمة اللي بعدها، فالسكوت بيتبلع جوه الكلمات.
// عشان كده بنقيس علو الصوت كل 20 مللي ثانية، ونحدد فين فيه كلام فعلًا.
export const detectSpeech = async (input) => {
  const wav = path.join(os.tmpdir(), `montag-speech-${Date.now()}.wav`);
  await toWav16k(input, wav);
  try {
    const buf = fs.readFileSync(wav);
    const data = buf.subarray(buf.indexOf("data") + 8);
    const rate = 16000;
    const frame = rate * 0.02; // 20ms
    const db = [];
    for (let o = 0; o + frame * 2 <= data.length; o += frame * 2) {
      let sum = 0;
      for (let i = 0; i < frame; i++) {
        const v = data.readInt16LE(o + i * 2) / 32768;
        sum += v * v;
      }
      db.push(20 * Math.log10(Math.sqrt(sum / frame) + 1e-9));
    }
    if (!db.length) return [];
    // العتبة بتتحسب من الفيديو نفسه: بين مستوى الدوشة (أوطى 10٪) ومستوى الكلام (أعلى 10٪)
    const sorted = [...db].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const threshold = Math.max(-60, p10 + (p90 - p10) * 0.3);
    const voiced = db.map((d) => d > threshold);

    // الفريمات ← فترات، مع تجاهل السكتات القصيرة جدًا (أقل من 120ms) والأصوات الخاطفة (أقل من 80ms)
    let ranges = [];
    let start = -1;
    voiced.forEach((v, i) => {
      if (v && start < 0) start = i;
      if (!v && start >= 0) {
        ranges.push([start * 20, i * 20]);
        start = -1;
      }
    });
    if (start >= 0) ranges.push([start * 20, voiced.length * 20]);
    const merged = [];
    for (const r of ranges) {
      const last = merged.at(-1);
      if (last && r[0] - last[1] < 120) last[1] = r[1];
      else merged.push([...r]);
    }
    return merged.filter(([a, b]) => b - a >= 80).map(([fromMs, toMs]) => ({ fromMs, toMs }));
  } finally {
    tryRemove(wav);
  }
};

// مشكلة: whisper-cli على الويندوز مش بيقرا المسارات اللي فيها حروف عربي (زي فولدر "منتاج")
// الحل: لينك (junction) باسم إنجليزي في فولدر Temp بيشاور على فولدر whisper، وكل المسارات بتعدي منه
const asciiWhisperDir = () => {
  if (!/[^\x00-\x7F]/.test(WHISPER_DIR)) return WHISPER_DIR;
  const link = path.join(os.tmpdir(), "montag-whisper");
  if (/[^\x00-\x7F]/.test(link)) throw new Error("فولدر Temp فيه حروف مش إنجليزي، انقل المشروع لمسار إنجليزي");
  if (!fs.existsSync(link)) fs.symlinkSync(WHISPER_DIR, link, "junction");
  return link;
};

// التفريغ: بيرجع captions = كل كلمة ووقت بدايتها ونهايتها بالمللي ثانية
export const transcribeFile = async (input, { language = "ar", onProgress } = {}) => {
  const dir = asciiWhisperDir();
  const id = `tmp-${Date.now()}`;
  const wav = path.join(dir, `${id}.wav`);
  const outBase = path.join(dir, `${id}-out`);
  await toWav16k(input, wav);
  try {
    // نفس الإعدادات اللي Remotion بيستخدمها، بس بمسارات إنجليزي
    await new Promise((resolve, reject) => {
      const p = spawn(
        path.join(dir, "build", "bin", "whisper-cli.exe"),
        [
          "-f", wav,
          "--output-file", outBase,
          "--output-json",
          "-ojf", // JSON كامل فيه توقيت كل كلمة
          "--dtw", modelToDtw(WHISPER_MODEL),
          "-m", path.join(dir, "models", `ggml-${WHISPER_MODEL}.bin`),
          "-pp", // اطبع نسبة التقدم
          "-l", language,
          "-sow", // قسّم على الكلمات مش على الحروف
          "-ml", "1", // كل كلمة في سطر لوحدها = توقيت لكل كلمة
        ],
        { cwd: dir },
      );
      let log = "";
      const onData = (d) => {
        const s = d.toString("utf8");
        log += s;
        const m = s.match(/progress =\s*(\d+)/);
        if (m) onProgress?.(Number(m[1]) / 100);
      };
      p.stdout.on("data", onData);
      p.stderr.on("data", onData);
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(log.slice(-600)))));
    });
    const json = JSON.parse(fs.readFileSync(`${outBase}.json`, "utf8"));
    return toCaptions({ whisperCppOutput: json }).captions;
  } finally {
    tryRemove(wav);
    tryRemove(`${outBase}.json`);
  }
};

// لو اتشغل كسكريبت لوحده
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let last = "";
  await setupWhisper(({ step, progress }) => {
    const line = `${step} ${Math.round(progress * 100)}%`;
    if (line !== last && (progress === 1 || Math.round(progress * 100) % 5 === 0)) console.log(line);
    last = line;
  });
  console.log("✓ Whisper جاهز:", whisperStatus());
}
