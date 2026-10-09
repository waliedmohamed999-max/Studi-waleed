// تحسين الصوت: تنضيف الدوشة + شيل الطنين الواطي + ضبط العلو
// FFmpeg اللي جاي مع Remotion مفيهوش فلاتر تنضيف، فالتنضيف معمول هنا بالجافاسكريبت:
//   1) High-pass عند 80Hz: بيشيل الهمهمة والتكييف والخبط على الترابيزة
//   2) RNNoise (ذكاء اصطناعي) أو Spectral subtraction (الطريقة القديمة: بصمة الدوشة من أهدى اللحظات)
//   3) لمسة استوديو: EQ + كومبريسور
//   4) loudnorm (من FFmpeg): علو ثابت ومريح زي المنصات
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ffmpegPath } from "./whisper.mjs";
import { tryRemove } from "./fsutil.mjs";

const RATE = 48000;

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400)))));
    p.on("error", reject);
  });

const readWav = (file) => {
  const buf = fs.readFileSync(file);
  const data = buf.subarray(buf.indexOf("data") + 8);
  const n = Math.floor(data.length / 2);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return x;
};

const writeWav = (file, x) => {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
};

// ===== High-pass (Biquad من RBJ cookbook) =====
const highpass = (x, freq = 80, q = 0.707) => {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
};

// ===== FFT (radix-2 in-place) =====
const fft = (re, im, inverse) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
};

// ===== تنضيف الدوشة (Spectral subtraction) =====
// strength من 0 لـ 1: كل ما تزيد بيشيل دوشة أكتر (بس بيبدأ يأثر على الصوت نفسه فوق 0.8)
export const denoise = (x, strength = 0.6) => {
  const N = 2048;
  const hop = N / 4;
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(1, Math.ceil((x.length - N) / hop) + 1);
  const bins = N / 2 + 1;

  // 1) طيف كل فريم
  const mags = [];
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[f * hop + i] ?? 0) * win[i];
    fft(re, im, false);
    const m = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      m[k] = Math.hypot(re[k], im[k]);
      energy[f] += m[k] * m[k];
    }
    mags.push(m);
  }

  // 2) بصمة الدوشة = متوسط أهدى 10٪ من الفريمات
  const order = [...energy.keys()].sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(1, Math.floor(frames * 0.1)));
  const noise = new Float64Array(bins);
  for (const f of quiet) for (let k = 0; k < bins; k++) noise[k] += mags[f][k] / quiet.length;

  // 3) نطرح الدوشة من كل فريم ونرجّع الصوت (مع تنعيم عشان منسمعش "صفير")
  const alpha = 1 + strength * 1.5; // قد إيه بنطرح
  const floor = 0.1 - strength * 0.06; // أقل حاجة بنسيبها (عشان الصوت يفضل طبيعي)
  const out = new Float64Array(x.length + N);
  const norm = new Float64Array(x.length + N);
  let prev = new Float64Array(bins).fill(1);
  for (let f = 0; f < frames; f++) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[f * hop + i] ?? 0) * win[i];
    fft(re, im, false);
    const g = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const raw = Math.max(floor, 1 - (alpha * noise[k]) / (mags[f][k] + 1e-12));
      g[k] = 0.55 * raw + 0.45 * Math.min(prev[k], raw + 0.3);
    }
    prev = g;
    for (let k = 0; k < bins; k++) {
      re[k] *= g[k];
      im[k] *= g[k];
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      out[f * hop + i] += re[i] * win[i];
      norm[f * hop + i] += win[i] * win[i];
    }
  }
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return y;
};

// ===== تنضيف بالذكاء الاصطناعي (RNNoise) =====
// شبكة عصبية متدربة على الكلام، فبتشيل الدوشة اللي بتتغير كمان (شارع، ناس، كيبورد، مروحة)
// مش بس الدوشة الثابتة زي الطريقة القديمة
let rnnoiseLib = null;
const loadRnnoise = async () => {
  if (!rnnoiseLib) {
    // المكتبة معمولة للمتصفح، وبتتأكد إنها في متصفح أو Worker، فبنوهمها لحظة التحميل بس
    const had = "WorkerGlobalScope" in globalThis;
    if (!had) globalThis.WorkerGlobalScope = class {};
    try {
      const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
      rnnoiseLib = await Rnnoise.load();
    } finally {
      if (!had) delete globalThis.WorkerGlobalScope;
    }
  }
  return rnnoiseLib;
};

// RNNoise بيطلّع الصوت متأخر 20ms (960 عينة)، فبنرجّعه لمكانه عشان يفضل مظبوط مع الصورة
const RNNOISE_DELAY = 960;

export const denoiseAi = async (x) => {
  const lib = await loadRnnoise();
  const size = lib.frameSize; // 480 عينة = 10ms
  const st = lib.createDenoiseState();
  const total = Math.ceil((x.length + RNNOISE_DELAY) / size) * size;
  const y = new Float64Array(x.length);
  const frame = new Float32Array(size);
  try {
    for (let o = 0; o < total; o += size) {
      for (let i = 0; i < size; i++) frame[i] = (x[o + i] ?? 0) * 32768;
      st.processFrame(frame);
      for (let i = 0; i < size; i++) {
        const at = o + i - RNNOISE_DELAY;
        if (at >= 0 && at < y.length) y[at] = frame[i] / 32768;
      }
    }
  } finally {
    st.destroy();
  }
  return y;
};

// ===== فلتر Peaking EQ (RBJ) =====
const peaking = (x, freq, gainDb, q = 1) => {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha / A;
  const [b0, b1, b2] = [(1 + alpha * A) / a0, (-2 * cos) / a0, (1 - alpha * A) / a0];
  const [a1, a2] = [(-2 * cos) / a0, (1 - alpha / A) / a0];
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
};

// ===== كومبريسور: بيقرّب الكلام العالي من الواطي عشان الصوت يبقى "مليان" زي الإذاعة =====
// gateDb: تحت المستوى ده (بين الكلام) بنوطّي الصوت كمان، عشان الكومبريسور ميعليش بواقي الدوشة
export const compress = (x, { thresholdDb = -24, ratio = 3, attackMs = 8, releaseMs = 120, gateDb = -48 } = {}) => {
  const att = Math.exp(-1 / ((attackMs / 1000) * RATE));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * RATE));
  const y = new Float64Array(x.length);
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    const db = 20 * Math.log10(env + 1e-9);
    const over = db - thresholdDb;
    const gainDb = over > 0 ? -over * (1 - 1 / ratio) : db < gateDb ? Math.max(-30, db - gateDb) : 0;
    y[i] = x[i] * 10 ** (gainDb / 20);
  }
  return y;
};

// ===== لمسة "صوت استوديو": شيل الطنين المكتوم وزود الوضوح =====
export const voicePolish = (x) => {
  let y = peaking(x, 300, -2.5, 1); // الصوت المكتوم (Boxy) بتاع الأوض الفاضية
  y = peaking(y, 3500, 3, 0.9); // وضوح الكلام
  y = peaking(y, 7500, -1.5, 2); // تهدية حرف السين شوية
  return compress(y);
};

// ===== تنضيف ملف صوت أو فيديو ← ملف WAV نضيف =====
// mode: "ai" (الأقوى، الافتراضي) أو "classic" (الطريقة القديمة بس)
// polish: لمسة الاستوديو (EQ + كومبريسور)
export const cleanAudio = async (input, output, { strength = 0.6, mode = "ai", polish = true, onProgress } = {}) => {
  const tmp = path.join(os.tmpdir(), `montag-clean-${Date.now()}`);
  const raw = `${tmp}-raw.wav`;
  const mid = `${tmp}-mid.wav`;
  try {
    onProgress?.("بيقرا الصوت");
    await run(["-y", "-i", input, "-vn", "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", raw]);
    let x = readWav(raw);
    x = highpass(x, 80);
    if (mode === "ai" && strength > 0) {
      onProgress?.("الذكاء الاصطناعي بينضّف الدوشة");
      x = await denoiseAi(x);
      // بواقي الدوشة الثابتة (لو قوي) بنشيلها بالطريقة القديمة بخفة
      if (strength > 0.7) x = denoise(x, 0.3);
    } else if (strength > 0) {
      onProgress?.("بينضّف الدوشة");
      x = denoise(x, strength);
    }
    if (polish) {
      onProgress?.("بيحسّن الصوت");
      x = voicePolish(x);
    }
    writeWav(mid, x);
    onProgress?.("بيظبط العلو");
    // الصوت بيتظبط على -16 LUFS (مستوى الكلام المريح)، وبعدين الفيديو النهائي كله بيتظبط على -14
    await run(["-y", "-i", mid, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", String(RATE), "-c:a", "pcm_s16le", output]);
  } finally {
    for (const f of [raw, mid]) tryRemove(f);
  }
};

// ===== ضبط علو الفيديو النهائي على مستوى المنصات (-14 LUFS) =====
// الصورة بتتنسخ زي ما هي (من غير إعادة ترميز)، والصوت بس اللي بيتعدل
export const normalizeVideoLoudness = async (file) => {
  const tmp = file.replace(/(\.\w+)$/, ".norm$1");
  const ext = path.extname(file).toLowerCase();
  const codec = ext === ".webm" ? ["-c:a", "libopus", "-b:a", "160k"] : ["-c:a", "aac", "-b:a", "192k"];
  await run(["-y", "-i", file, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", ...codec, tmp]);
  tryRemove(file);
  fs.renameSync(tmp, file);
};
