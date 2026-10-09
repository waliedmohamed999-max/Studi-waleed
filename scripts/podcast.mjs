// البودكاست بكذا كاميرا: مزامنة الكاميرات من الصوت + مين بيتكلم + القطع الأوتوماتيك
// الفكرة: كل كاميرا (أو مايك) قريبة من واحد، فصوته بيبقى فيها أعلى من التاني
//   1) نطلع "منحنى العلو" لكل ملف (كل 10 مللي ثانية)
//   2) المزامنة: بنزحلق المنحنيات على بعض لحد ما تتطابق (cross-correlation) فنعرف فرق البداية بين كل كاميرا والتانية
//   3) في كل لحظة: الكاميرا اللي صوت صاحبها أعلى (بعد ما نظبط مستوى كل مايك) هي اللي بتتكلم
//   4) نحوّل ده للقطات: مدة دنيا لكل لقطة، ومنقطعش على كل نَفَس، وواسعة أو شاشة مقسومة لما الاتنين يتكلموا أو يسكتوا
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ffmpegPath } from "./whisper.mjs";
import { tryRemove } from "./fsutil.mjs";

export class PodcastError extends Error {}

const RATE = 8000;
const HOP = 80; // 10ms
const COARSE = 10; // 100ms = 10 فريمات

// ===== منحنى العلو (dB كل 10ms) =====
// (FFmpeg اللي مع Remotion مبيطلعش صوت خام على pipe، فبنكتب WAV مؤقت ونقراه)
export const envelope = async (file) => {
  const tmp = path.join(os.tmpdir(), `montag-env-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.wav`);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath(), ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", "-map_metadata", "-1", tmp], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (code === 0 ? resolve() : reject(new PodcastError(`قراية الصوت فشلت (الملف فيه صوت؟): ${err.slice(-200)}`))));
      p.on("error", reject);
    });
    const buf = fs.readFileSync(tmp);
    const data = buf.subarray(buf.indexOf("data") + 8);
    const n = Math.floor(data.length / 2 / HOP);
    const out = new Float32Array(n);
    for (let f = 0; f < n; f++) {
      let sum = 0;
      for (let i = 0; i < HOP; i++) {
        const v = data.readInt16LE((f * HOP + i) * 2) / 32768;
        sum += v * v;
      }
      out[f] = 10 * Math.log10(sum / HOP + 1e-10);
    }
    return out;
  } finally {
    tryRemove(tmp);
  }
};

const decimate = (x, k) => {
  const out = new Float32Array(Math.floor(x.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += x[i * k + j];
    out[i] = s / k;
  }
  return out;
};

// ارتباط طبيعي بين a و b بعد إزاحة lag (b[i + lag] مع a[i])
// بيرجع الارتباط وعدد النقط المتداخلة
const corrAt = (a, b, lag, from, to, minN = 50) => {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
  for (let i = from; i < to; i++) {
    const j = i + lag;
    if (j < 0 || j >= b.length) continue;
    const x = a[i];
    const y = b[j];
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
    sab += x * y;
    n++;
  }
  if (n < minN) return { c: -1, n };
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return { c: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1, n };
};

// ===== المزامنة: الكاميرا التانية متأخرة/متقدمة كام مللي ثانية عن الأساسية =====
// بيرجع offsetMs: وقت الكاميرا = وقت الأساسية + offsetMs
export const syncOffset = (master, other, { maxLagSec = 120, windowSec = 600 } = {}) => {
  // خشن (كل 100ms) على أول 10 دقايق
  const a = decimate(master, COARSE);
  const b = decimate(other, COARSE);
  const maxLag = Math.round((maxLagSec * 100) / COARSE); // المنحنى 100 نقطة في الثانية، والخشن عُشرها
  const win = Math.min(a.length, Math.round((windowSec * 100) / COARSE));
  // أقل تداخل مقبول: نص الأقصر (جوه نافذة البحث). التداخل الصغير ممكن يتطابق بالصدفة
  const maxN = Math.min(win, b.length);
  const minN = Math.max(8, Math.floor(maxN / 2));
  let best = -2;
  let bestLag = 0;
  let bestScore = -2;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const { c, n } = corrAt(a, b, lag, 0, win, minN);
    if (c <= -1) continue;
    // التداخل الأكبر أوثق: نفس الارتباط على مدة أطول بيكسب
    const score = c * (0.8 + (0.2 * n) / maxN);
    // لو نتيجتين زي بعض (صوت بيتكرر)، الإزاحة الأصغر أقرب للحقيقة
    if (score > bestScore + 1e-4 || (Math.abs(score - bestScore) <= 1e-4 && Math.abs(lag) < Math.abs(bestLag))) {
      bestScore = score;
      best = c;
      bestLag = lag;
    }
  }
  // ناعم (كل 10ms) حوالين أحسن نتيجة
  const center = bestLag * COARSE;
  const fineWin = Math.min(master.length, windowSec * 100);
  let fineBest = -2;
  let fineLag = center;
  for (let lag = center - 2 * COARSE; lag <= center + 2 * COARSE; lag++) {
    const { c } = corrAt(master, other, lag, 0, fineWin, minN * COARSE);
    if (c > fineBest + 1e-4 || (Math.abs(c - fineBest) <= 1e-4 && Math.abs(lag - center) < Math.abs(fineLag - center))) {
      fineBest = c;
      fineLag = lag;
    }
  }
  return { offsetMs: fineLag * 10, score: Math.max(best, fineBest) };
};

// النسبة المئوية p من قيم مرتبة
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

// ===== مين بيتكلم في كل 100ms =====
// tracks: منحنيات المتكلمين بعد المزامنة (على وقت الأساسية)، بيرجع لكل لحظة: رقم المتكلم، أو -1 سكوت، أو -2 الاتنين
export const activeSpeakers = (tracks, { marginDb = 4 } = {}) => {
  const coarse = tracks.map((t) => decimate(t, COARSE));
  const len = Math.min(...coarse.map((c) => c.length));
  // مستوى كل مايك: الدوشة (p15) والكلام (p90)، عشان المايك العالي ميكسبش دايمًا
  const levels = coarse.map((c) => {
    const s = Float32Array.from(c.subarray(0, len)).sort();
    return { floor: pct(s, 0.15), speech: pct(s, 0.9) };
  });
  const out = new Int8Array(len);
  const seps = [];
  for (let i = 0; i < len; i++) {
    // 0 = دوشة، 1 = مستوى الكلام العادي
    const score = coarse.map((c, k) => (c[i] - levels[k].floor) / Math.max(6, levels[k].speech - levels[k].floor));
    const db = coarse.map((c, k) => c[i] - levels[k].speech);
    const order = score.map((s, k) => k).sort((x, y) => score[y] - score[x]);
    const top = order[0];
    if (score[top] < 0.45) out[i] = -1; // محدش بيتكلم
    else if (order.length > 1 && score[order[1]] >= 0.45 && db[top] - db[order[1]] < marginDb) out[i] = -2; // الاتنين
    else {
      out[i] = top;
      if (order.length > 1) seps.push(db[top] - db[order[1]]);
    }
  }
  seps.sort((x, y) => x - y);
  return { frames: out, frameMs: 100, separationDb: seps.length ? pct(seps, 0.5) : 0 };
};

// ===== مين بيتكلم من حركة الشفايف (لما المايك مشترك) =====
// speech: فيه كلام في اللحظة دي ولا لأ (من الصوت)، mouths: حركة بق كل متكلم (على وقت الأساسية، NaN = الوش مش باين)
// اللي بقه بيتحرك أكتر وقت الكلام هو اللي بيتكلم
export const visualSpeakers = (speech, mouths, { margin = 0.25 } = {}) => {
  const len = speech.length;
  // كل كاميرا بمقياسها: الوش القريب حركته أكبر من البعيد
  const scale = mouths.map((m) => {
    const vals = [];
    for (let i = 0; i < len; i++) if (speech[i] && Number.isFinite(m[i])) vals.push(m[i]);
    vals.sort((a, b) => a - b);
    // أعلى 10٪ (بنقرّب لفوق عشان الفيديوهات القصيرة)
    return Math.max(1e-4, vals[Math.min(vals.length - 1, Math.ceil(0.9 * (vals.length - 1)))] ?? 0);
  });
  const out = new Int8Array(len);
  let decided = 0;
  for (let i = 0; i < len; i++) {
    if (!speech[i]) {
      out[i] = -1;
      continue;
    }
    const v = mouths.map((m, k) => (Number.isFinite(m[i]) ? m[i] / scale[k] : -1));
    const order = v.map((_, k) => k).sort((a, b) => v[b] - v[a]);
    const top = order[0];
    const second = order.length > 1 ? v[order[1]] : -1;
    if (v[top] < 0.15) out[i] = -3; // كلام بس مفيش بق بيتحرك باين: نكمل على اللقطة الحالية
    else if (second >= 0.15 && v[top] - second < margin) out[i] = -2; // الاتنين بيتحركوا
    else {
      out[i] = top;
      decided++;
    }
  }
  return { frames: out, confidence: decided / Math.max(1, speech.filter(Boolean).length) };
};

// ===== اللحظات ← لقطات =====
// cams: [{ role: "speaker" | "wide" }]، speakerCams: رقم الكاميرا لكل متكلم
export const buildShots = (frames, frameMs, { speakerCams, wideCam = -1, minShotMs = 1800, switchAfterMs = 500, split = false }) => {
  const minF = Math.round(minShotMs / frameMs);
  const switchF = Math.round(switchAfterMs / frameMs);
  const shots = [];
  let cur = null;
  let candidate = null;
  let candidateRun = 0;
  const camFor = (v) => (v >= 0 ? { cam: speakerCams[v], cams: [speakerCams[v]], kind: "speaker" } : v === -2 && split ? { cam: speakerCams[0], cams: speakerCams.slice(0, 2), kind: "split" } : wideCam >= 0 ? { cam: wideCam, cams: [wideCam], kind: "wide" } : null);
  const key = (s) => (s ? `${s.kind}:${s.cams.join(",")}` : "");

  for (let i = 0; i < frames.length; i++) {
    let want = frames[i] === -3 ? null : camFor(frames[i]);
    // السكوت القصير أو كلام الاتنين القصير مش بيغير اللقطة
    if (!want && cur) want = cur;
    if (!cur) {
      if (want) cur = { ...want, from: i };
      continue;
    }
    if (key(want) === key(cur)) {
      candidate = null;
      candidateRun = 0;
      continue;
    }
    if (key(want) === key(candidate)) candidateRun++;
    else {
      candidate = want;
      candidateRun = 1;
    }
    // الواسعة بتحتاج وقت أطول عشان متطلعش مع كل نَفَس
    const need = candidate.kind === "speaker" ? switchF : switchF * 3;
    if (candidateRun >= need && i - candidateRun + 1 - cur.from >= minF) {
      const at = i - candidateRun + 1; // القطع عند أول ما المتكلم الجديد بدأ
      shots.push({ fromMs: cur.from * frameMs, toMs: at * frameMs, cam: cur.cam, cams: cur.cams, kind: cur.kind });
      cur = { ...candidate, from: at };
      candidate = null;
      candidateRun = 0;
    }
  }
  if (cur) shots.push({ fromMs: cur.from * frameMs, toMs: frames.length * frameMs, cam: cur.cam, cams: cur.cams, kind: cur.kind });
  if (!shots.length && speakerCams.length) shots.push({ fromMs: 0, toMs: frames.length * frameMs, cam: speakerCams[0], cams: [speakerCams[0]], kind: "speaker" });
  // اللقطة الأولى بتبدأ من الأول
  if (shots.length) shots[0].fromMs = 0;
  return shots;
};

// ===== التحليل كله =====
// cams: [{ file, mic?, role }]: mic = ملف صوت منفصل للمتكلم ده (أدق من صوت الكاميرا)
// audioFile: ريكوردر صوت منفصل (لو موجود بيتزامن هو كمان)
// mouth: (اختياري) حركة بق كل كاميرا كل 100ms بوقتها هي، من الاستوديو، لما المايك مشترك
export const analyzePodcast = async ({ cams, audioFile, minShotMs = 1800, split = false, maxLagSec = 120, mouth, onProgress }) => {
  if (cams.length < 2) throw new PodcastError("محتاج كاميرتين على الأقل");
  const speakers = cams.map((c, i) => ({ ...c, i })).filter((c) => c.role !== "wide");
  if (!speakers.length) throw new PodcastError("لازم كاميرا واحدة على الأقل تبقى لمتكلم");
  const wide = cams.findIndex((c) => c.role === "wide");

  // 1) المنحنيات (صوت الكاميرا للمزامنة، والمايك المنفصل لو موجود لتحديد المتكلم)
  const camEnv = [];
  for (const [i, c] of cams.entries()) {
    onProgress?.(`بيسمع الكاميرا ${i + 1} من ${cams.length}`);
    camEnv.push(await envelope(c.file));
  }
  const micEnv = [];
  for (const s of speakers) micEnv.push(s.mic ? await envelope(s.mic) : null);

  // 2) المزامنة على الكاميرا الأولى
  onProgress?.("بيزامن الكاميرات");
  const sync = camEnv.map((e, i) => (i === 0 ? { offsetMs: 0, score: 1 } : syncOffset(camEnv[0], e, { maxLagSec })));
  // المايك المنفصل بيتزامن على الكاميرا بتاعته
  const micSync = speakers.map((s, k) => (micEnv[k] ? syncOffset(camEnv[s.i], micEnv[k], { maxLagSec }) : null));
  let audioOffset = 0;
  if (audioFile) {
    onProgress?.("بيزامن الصوت المنفصل");
    audioOffset = syncOffset(camEnv[0], await envelope(audioFile), { maxLagSec }).offsetMs;
  }

  // الفترة اللي كل الكاميرات شغالة فيها (بوقت الأساسية)
  const durMs = camEnv.map((e) => e.length * 10);
  const fromMs = Math.max(0, ...sync.map((s) => -s.offsetMs));
  const toMs = Math.min(...durMs.map((d, i) => d - sync[i].offsetMs));
  if (toMs - fromMs < 2000) throw new PodcastError("الكاميرات مش متصورة في نفس الوقت (أو المزامنة فشلت)");

  // 3) منحنى كل متكلم على وقت الأساسية
  onProgress?.("بيحدد مين بيتكلم");
  const aligned = speakers.map((s, k) => {
    const src = micEnv[k] ?? camEnv[s.i];
    const off = (sync[s.i].offsetMs + (micSync[k]?.offsetMs ?? 0)) / 10;
    const n = Math.floor((toMs - fromMs) / 10);
    const out = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      const j = Math.round(t + fromMs / 10 + off);
      out[t] = j >= 0 && j < src.length ? src[j] : -100;
    }
    return out;
  });
  let { frames, frameMs, separationDb } = activeSpeakers(aligned);
  let mode = "audio";
  let visualConfidence = 0;
  // المايك مشترك؟ لو الاستوديو بعت حركة الشفايف لكل متكلم، بنحدد بيها
  if (Array.isArray(mouth) && speakers.every((s) => Array.isArray(mouth[s.i]) && mouth[s.i].length)) {
    onProgress?.("بيحدد المتكلم من حركة الشفايف");
    // فيه كلام؟ (أي مايك فوق مستوى الدوشة)
    const speech = Array.from(frames, (v) => v !== -1);
    const n = speech.length;
    const mouthsAligned = speakers.map((s) => {
      const m = mouth[s.i];
      const off = sync[s.i].offsetMs;
      return Array.from({ length: n }, (_, t) => {
        const j = Math.round((fromMs + t * 100 + off) / 100);
        const v = m[j];
        return v === null || v === undefined ? NaN : Number(v);
      });
    });
    const r = visualSpeakers(speech, mouthsAligned);
    frames = r.frames;
    visualConfidence = Math.round(r.confidence * 100) / 100;
    mode = "visual";
  }

  // 4) اللقطات (بوقت الأساسية)
  const shots = buildShots(frames, frameMs, { speakerCams: speakers.map((s) => s.i), wideCam: wide, minShotMs, split }).map((s) => ({ ...s, fromMs: s.fromMs + fromMs, toMs: s.toMs + fromMs }));
  shots[shots.length - 1].toMs = toMs;

  // نسبة كلام كل واحد
  const talk = speakers.map((_, k) => frames.filter((v) => v === k).length);
  const total = Math.max(1, talk.reduce((a, b) => a + b, 0));
  return {
    offsets: sync.map((s) => s.offsetMs),
    audioOffset,
    syncScores: sync.map((s) => Math.round(s.score * 100) / 100),
    range: { fromMs, toMs },
    shots,
    share: speakers.map((s, k) => ({ cam: s.i, percent: Math.round((talk[k] / total) * 100) })),
    separationDb: Math.round(separationDb * 10) / 10,
    mode,
    visualConfidence,
  };
};
