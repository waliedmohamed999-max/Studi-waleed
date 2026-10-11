// "المونتاج الاحترافي بضغطة": بنتفرج على الفيديوهات ونقيّم كل لحظة فيها من غير أي مفاتيح
// بناخد 5 صور في الثانية بمقاس صغير (أبيض وأسود) ونحسب لكل صورة:
//   الحدة (مش مهزوزة ولا مغبشة)، الإضاءة (مش غامقة ولا محروقة)، التباين، والحركة بين الصورة واللي قبلها
// الحركة الكبيرة فجأة = قطع لقطة جديدة، والحركة العالية على طول = كاميرا بتتهز
import { spawn } from "node:child_process";
import { detectSpeech, ffmpegPath } from "./whisper.mjs";
import { probe } from "./media.mjs";

export class ShotsError extends Error {}

const W = 96;
const H = 54;
const RATE = 5; // صور في الثانية
const WINDOW_MS = 3600; // طول اللقطة اللي بنرشحها (أطول شوية من مكانها عشان يبقى فيه هامش)

// الصور كلها في بافر واحد (ffmpeg بتاع Remotion مفيهوش rawvideo muxer، فبنستخدم image2pipe)
const grayFrames = (file) =>
  new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ["-v", "error", "-i", file, "-an", "-r", String(RATE), "-vf", `scale=${W}:${H}`, "-pix_fmt", "gray", "-c:v", "rawvideo", "-f", "image2pipe", "-"]);
    const chunks = [];
    let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new ShotsError(`مش قادر يقرا الفيديو: ${err.slice(-200)}`))));
  });

// مقاييس كل صورة
export const frameStats = (buf) => {
  const size = W * H;
  const out = [];
  let prev = null;
  for (let o = 0; o + size <= buf.length; o += size) {
    const f = buf.subarray(o, o + size);
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < size; i++) {
      sum += f[i];
      sq += f[i] * f[i];
    }
    const mean = sum / size;
    const contrast = Math.sqrt(Math.max(0, sq / size - mean * mean));
    // الحدة: تباين الـ Laplacian (كل ما الصورة أوضح، الحواف أقوى)
    let lap = 0;
    let lapSq = 0;
    let n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const v = 4 * f[i] - f[i - 1] - f[i + 1] - f[i - W] - f[i + W];
        lap += v;
        lapSq += v * v;
        n++;
      }
    }
    const sharp = lapSq / n - (lap / n) ** 2;
    let diff = 0;
    if (prev) {
      for (let i = 0; i < size; i++) diff += Math.abs(f[i] - prev[i]);
      diff /= size;
    }
    out.push({ mean, contrast, sharp, diff });
    prev = f;
  }
  return out;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// قطع اللقطات: صورة اتغيرت فجأة أكتر بكتير من العادي
export const shotCuts = (stats) => {
  const base = median(stats.slice(1).map((s) => s.diff));
  const cuts = [];
  stats.forEach((s, i) => i > 0 && s.diff > Math.max(28, base * 4) && cuts.push(i));
  return cuts;
};

// تقييم كل صورة من 0 لـ 1 (الحدة بتتقاس نسبة لأحسن صور في كل الفيديوهات، فبنمررها sharpRef)
export const frameScore = (s, sharpRef) => {
  const sharp = clamp01(s.sharp / (sharpRef || 1));
  const exposure = s.mean < 35 || s.mean > 225 ? 0 : 1 - Math.abs(s.mean - 125) / 110;
  const contrast = clamp01(s.contrast / 55);
  // حركة خفيفة حلوة (سينمائي)، ثابتة تمام مقبولة، وكتير = اهتزاز
  const motion = s.diff < 0.6 ? 0.7 : s.diff <= 7 ? 1 : clamp01(1 - (s.diff - 7) / 10);
  return 0.4 * sharp + 0.25 * clamp01(exposure) + 0.15 * contrast + 0.2 * motion;
};

// أحسن لقطات في فيديو: نافذة WINDOW_MS جوه لقطة واحدة (من غير قطع جواها)، ومتوسط تقييمها عالي
export const bestWindows = (stats, sharpRef, durationMs) => {
  const per = 1000 / RATE;
  const len = Math.round(WINDOW_MS / per);
  const cuts = new Set(shotCuts(stats));
  const scores = stats.map((s) => frameScore(s, sharpRef));
  const all = [];
  for (let i = 1; i + len <= stats.length; i++) {
    // بنسيب أول ربع ثانية بعد أي قطع (الكاميرا لسه بتستقر)
    let bad = false;
    for (let k = i; k < i + len; k++) if (cuts.has(k) || cuts.has(k - 1)) bad = true;
    if (bad) continue;
    let sum = 0;
    let min = 1;
    for (let k = i; k < i + len; k++) {
      sum += scores[k];
      min = Math.min(min, scores[k]);
    }
    // اللقطة بتتحكم بأضعف لحظة فيها كمان (عشان متبقاش حلوة ونصها مهزوز)
    all.push({ fromMs: Math.round(i * per), toMs: Math.min(durationMs, Math.round((i + len) * per)), score: 0.75 * (sum / len) + 0.25 * min });
  }
  // أحسن لقطات من غير تداخل، ومتباعدة شوية عشان التنوع
  all.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const w of all) {
    if (w.score < 0.45) break;
    if (picked.some((p) => w.fromMs < p.toMs + 1500 && w.toMs > p.fromMs - 1500)) continue;
    picked.push(w);
    if (picked.length >= 20) break;
  }
  return picked.map((w) => ({ ...w, score: Math.round(w.score * 100) / 100 }));
};

// الفيديو الصغير ده موجود جوه الكبير؟ (نسخة تانية من نفس الملف، أو حتة متقصوصة منه)
// بنقارن 8 صور من الصغير بكل مكان ممكن في الكبير، ولو فيه مكان الصور كلها شبهه تقريبًا يبقى مكرر
export const containedIn = (small, big) => {
  const size = W * H;
  const ns = Math.floor(small.length / size);
  const nb = Math.floor(big.length / size);
  if (!ns || ns > nb + 2) return false;
  const picks = Array.from({ length: Math.min(8, ns) }, (_, k) => Math.floor(((k + 0.5) * ns) / Math.min(8, ns)));
  const frameDiff = (a, ai, b, bi) => {
    let d = 0;
    for (let i = 0; i < size; i += 3) d += Math.abs(a[ai * size + i] - b[bi * size + i]);
    return d / Math.ceil(size / 3);
  };
  for (let o = -2; o <= nb - ns + 2; o++) {
    let total = 0;
    let n = 0;
    for (const k of picks) {
      const bi = o + k;
      if (bi < 0 || bi >= nb) continue;
      total += frameDiff(small, k, big, bi);
      n++;
      if (total / n > 14) break;
    }
    if (n >= picks.length - 1 && total / n <= 9) return true;
  }
  return false;
};

// كل الفيديوهات: فين فيه كلام (عشان نعرف أنهي الأساسي) وأحسن لقطات في كل واحد
export const exploreVideos = async ({ files, onProgress }) => {
  if (!files.length) throw new ShotsError("ضيف فيديو واحد على الأقل");
  const raw = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(`بيتفرج على الفيديو ${i + 1} من ${files.length}`);
    const { file, rel } = files[i];
    const info = await probe(file);
    if (!info.width) throw new ShotsError(`الملف ${i + 1} مش فيديو`);
    const durationMs = info.duration * 1000;
    const speech = info.hasAudio ? await detectSpeech(file).catch(() => []) : [];
    const talk = speech.reduce((s, r) => s + (r.toMs - r.fromMs), 0);
    const gray = await grayFrames(file);
    raw.push({ path: rel, durationMs, width: info.width, height: info.height, speech, speechRatio: durationMs ? talk / durationMs : 0, gray, stats: frameStats(gray) });
  }
  // المكرر: الفيديو اللي لقطاته موجودة في الأساسي (اللي فيه كلام أكتر) أو في لقطات قبله، ملوش لقطات
  const order = [...raw].sort((a, b) => b.speechRatio * b.durationMs - a.speechRatio * a.durationMs);
  const kept = [];
  for (const v of order) {
    const dup = kept.find((k) => containedIn(v.gray, k.gray));
    if (dup) v.duplicateOf = dup.path;
    else kept.push(v);
  }
  onProgress?.("بيختار أحلى اللقطات");
  // مرجع الحدة: أعلى 10٪ في كل الصور (عشان نقارن الفيديوهات ببعض بعدل)
  const sharps = raw.flatMap((r) => r.stats.map((s) => s.sharp)).sort((a, b) => a - b);
  const sharpRef = sharps[Math.floor(sharps.length * 0.9)] || 1;
  return raw.map(({ stats, gray, ...r }) => ({
    ...r,
    brightness: Math.round(stats.reduce((s, x) => s + x.mean, 0) / Math.max(1, stats.length)),
    windows: r.duplicateOf ? [] : bestWindows(stats, sharpRef, r.durationMs),
  }));
};
