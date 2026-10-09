// باقة أصوات البداية: مؤثرات صوتية ومزيكا بسيطة، متولدة كلها بالكود
// يعني ملكك 100٪ ومن غير أي مشكلة حقوق (تستخدمها تجاري براحتك)
// التشغيل: node scripts/generate-sound-pack.mjs
// الملفات بتطلع في public/library ومعاها manifest.json (الاسم العربي والنوع والتصنيف)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ffmpegPath } from "./whisper.mjs";

const R = 44100;
const out = path.resolve("public/library");
fs.mkdirSync(path.join(out, "sfx"), { recursive: true });
fs.mkdirSync(path.join(out, "music"), { recursive: true });

let seed = 21;
const rnd = () => ((seed = (seed * 16807) % 2147483647), (seed / 2147483647) * 2 - 1);
const buf = (sec) => new Float32Array(Math.round(sec * R));
const TAU = Math.PI * 2;
const note = (n) => 440 * 2 ** ((n - 69) / 12);

// فلتر low-pass بسيط (للدوشة)
const lowpass = (x, k) => {
  let y = 0;
  return x.map((v) => (y += k * (v - y)));
};
const normalize = (x, peak = 0.89) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m ? x.map((v) => (v / m) * peak) : x;
};
const mixInto = (dst, src, at = 0, gain = 1) => {
  for (let i = 0; i < src.length && at + i < dst.length; i++) dst[at + i] += src[i] * gain;
  return dst;
};

// ===== أدوات تصنيع =====
const tone = (sec, f0, f1, env, type = "sine") => {
  const x = buf(sec);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const p = i / x.length;
    ph += (TAU * (f0 + (f1 - f0) * p)) / R;
    const s = type === "square" ? Math.sign(Math.sin(ph)) * 0.5 : type === "tri" ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    x[i] = s * env(p, i / R);
  }
  return x;
};
const noise = (sec, env, k = 1) => {
  const x = buf(sec);
  for (let i = 0; i < x.length; i++) x[i] = rnd() * env(i / x.length, i / R);
  return k < 1 ? lowpass(x, k) : x;
};
// وتر بيتنقر (Karplus-Strong): قريب من صوت العود والقانون
const pluck = (freq, sec, damp = 0.996) => {
  const x = buf(sec);
  const n = Math.round(R / freq);
  const line = Float32Array.from({ length: n }, () => rnd());
  for (let i = 0; i < x.length; i++) {
    const j = i % n;
    const next = line[(j + 1) % n];
    line[j] = damp * 0.5 * (line[j] + next);
    x[i] = line[j];
  }
  return x;
};
const kick = (sec = 0.35) => tone(sec, 120, 40, (p) => Math.exp(-p * 7));
const snare = () => noise(0.18, (p) => Math.exp(-p * 9), 0.5);
const hat = () => noise(0.05, (p) => Math.exp(-p * 12), 1);
const doum = () => tone(0.3, 95, 70, (p) => Math.exp(-p * 6));
const tak = () => mixInto(noise(0.08, (p) => Math.exp(-p * 18), 0.6), tone(0.08, 900, 600, (p) => Math.exp(-p * 20)), 0, 0.5);

const items = [];
const save = (folder, name, x, meta) => {
  const tmp = path.join(os.tmpdir(), `montag-pack-${name}.wav`);
  const y = normalize(x);
  const data = Buffer.alloc(y.length * 2);
  y.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(R, 24);
  h.writeUInt32LE(R * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(tmp, Buffer.concat([h, data]));
  // AAC عشان الحجم يبقى صغير (أصغر من WAV بحوالي 10 مرات)
  const file = path.join(out, folder, `${name}.m4a`);
  execFileSync(ffmpegPath(), ["-v", "error", "-y", "-i", tmp, "-c:a", "aac", "-b:a", folder === "music" ? "160k" : "128k", "-f", "mp4", file]);
  fs.unlinkSync(tmp);
  items.push({ path: `library/${folder}/${name}.m4a`, kind: folder, duration: Math.round((y.length / R) * 100) / 100, license: "منتاج (متولد بالكود، مجاني لأي استخدام)", ...meta });
  console.log("✓", folder, name);
};

// ===== المؤثرات =====
// انتقالات
save("sfx", "swoosh-fast", noise(0.45, (p) => Math.sin(Math.PI * p) ** 3, 0.18), { label: "سووش سريع", category: "انتقالات" });
{
  const x = noise(0.6, (p) => Math.sin(Math.PI * p) ** 2, 0.12);
  save("sfx", "swoosh-reverse", x.reverse().map((v, i, a) => v * (i / a.length) ** 1.5), { label: "سووش بالعكس (قبل الظهور)", category: "انتقالات" });
}
{
  const x = buf(2.2);
  mixInto(x, noise(2.2, (p) => p ** 2.2, 0.08));
  mixInto(x, tone(2.2, 200, 1400, (p) => p ** 2 * 0.5), 0, 0.6);
  save("sfx", "riser", x, { label: "رايزر (تصاعد قبل حاجة مهمة)", category: "انتقالات" });
}
save("sfx", "downlifter", tone(1.6, 900, 60, (p) => (1 - p) ** 1.5), { label: "داون ليفتر (نزول)", category: "انتقالات" });

// ضربات
{
  const x = buf(1.6);
  mixInto(x, tone(1.6, 70, 32, (p) => Math.exp(-p * 3.5)));
  mixInto(x, noise(0.5, (p) => Math.exp(-p * 7), 0.25), 0, 0.7);
  save("sfx", "hit-cinematic", x, { label: "ضربة سينمائية", category: "ضربات" });
}
save("sfx", "sub-boom", tone(2, 55, 28, (p) => Math.exp(-p * 2.2)), { label: "بوم عميق", category: "ضربات" });
save("sfx", "punch", mixInto(tone(0.25, 160, 50, (p) => Math.exp(-p * 9)), noise(0.06, (p) => 1 - p, 0.4), 0, 0.6), { label: "لكمة / خبطة", category: "ضربات" });

// واجهة وتنبيهات
save("sfx", "click", tone(0.04, 2400, 1800, (p) => Math.exp(-p * 25)), { label: "كليك", category: "واجهة" });
save("sfx", "bubble", tone(0.18, 400, 1300, (p) => Math.sin(Math.PI * p)), { label: "فقاعة", category: "واجهة" });
{
  const x = buf(0.9);
  mixInto(x, tone(0.5, note(79), note(79), (p) => Math.exp(-p * 5)));
  mixInto(x, tone(0.6, note(84), note(84), (p) => Math.exp(-p * 4)), Math.round(0.13 * R));
  save("sfx", "notification", x, { label: "إشعار", category: "واجهة" });
}
{
  const x = buf(0.9);
  [72, 76, 79, 84].forEach((n, i) => mixInto(x, tone(0.45, note(n), note(n), (p) => Math.exp(-p * 5), "tri"), Math.round(i * 0.08 * R)));
  save("sfx", "success", x, { label: "نجاح / صح", category: "واجهة" });
}
save("sfx", "error", tone(0.45, 220, 150, (p) => (p < 0.45 || p > 0.55 ? 0.7 : 0) * (1 - p), "square"), { label: "غلط / خطأ", category: "واجهة" });
{
  const x = buf(1.6);
  for (let k = 0; k < 11; k++) mixInto(x, mixInto(noise(0.03, (p) => Math.exp(-p * 15), 0.7), tone(0.03, 1800 + rnd() * 400, 1500, (p) => Math.exp(-p * 20)), 0, 0.4), Math.round((k * 0.13 + Math.abs(rnd()) * 0.04) * R), 0.8);
  save("sfx", "typing", x, { label: "كتابة على كيبورد", category: "واجهة" });
}
{
  const x = buf(0.35);
  mixInto(x, noise(0.05, (p) => Math.exp(-p * 10), 0.8));
  mixInto(x, noise(0.08, (p) => Math.exp(-p * 8), 0.6), Math.round(0.11 * R));
  save("sfx", "camera-shutter", x, { label: "كاميرا (تصوير)", category: "واجهة" });
}
save("sfx", "tick", tone(0.03, 3000, 2500, (p) => Math.exp(-p * 30)), { label: "تيك ساعة", category: "واجهة" });

// مرح ومشاعر
{
  const x = buf(1.2);
  mixInto(x, noise(0.08, (p) => Math.exp(-p * 12), 0.5), 0, 0.5);
  [88, 91, 96].forEach((n, i) => mixInto(x, tone(0.9, note(n), note(n), (p) => Math.exp(-p * 3.5)), Math.round(0.05 * i * R), 0.6));
  save("sfx", "cash", x, { label: "كاشير (فلوس)", category: "مرح" });
}
{
  const x = buf(1.4);
  for (let k = 0; k < 24; k++) mixInto(x, tone(0.25, 2000 + Math.abs(rnd()) * 3000, 2500 + Math.abs(rnd()) * 3000, (p) => Math.sin(Math.PI * p) * 0.4), Math.round(Math.abs(rnd()) * 1.1 * R));
  save("sfx", "magic", x, { label: "سحر / لمعة", category: "مرح" });
}
{
  const x = buf(1.6);
  [0, 0.28, 0.8, 1.08].forEach((t) => mixInto(x, tone(0.18, 70, 45, (p) => Math.exp(-p * 7)), Math.round(t * R)));
  save("sfx", "heartbeat", x, { label: "دقات قلب (توتر)", category: "مرح" });
}
save("sfx", "boing", tone(0.6, 180, 420, (p, t) => Math.exp(-p * 3) * (1 + 0.6 * Math.sin(TAU * 18 * t))), { label: "بوينج (كوميدي)", category: "مرح" });

// ===== المزيكا (بسيطة، للبداية) =====
// لوفاي هادي: 80 BPM، كوردات ناعمة وإيقاع خفيف
{
  const bpm = 80;
  const beat = 60 / bpm;
  const bars = 8;
  const x = buf(bars * 4 * beat);
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
  for (let b = 0; b < bars; b++) {
    const c = chords[b % 4];
    const at = Math.round(b * 4 * beat * R);
    for (const n of c) mixInto(x, tone(4 * beat, note(n), note(n), (p) => Math.min(1, p * 8) * (1 - p) ** 0.5 * 0.18, "tri"), at);
    mixInto(x, tone(4 * beat, note(c[0] - 12), note(c[0] - 12), (p) => (1 - p) * 0.3), at);
    for (let k = 0; k < 4; k++) {
      const t = at + Math.round(k * beat * R);
      if (k % 2 === 0) mixInto(x, kick(), t, 0.6);
      else mixInto(x, snare(), t, 0.25);
      mixInto(x, hat(), t + Math.round((beat / 2) * R), 0.15);
    }
  }
  // تشويش فينيل خفيف
  mixInto(x, noise(x.length / R, () => 0.015, 0.3));
  save("music", "lofi-chill", x, { label: "لوفاي هادي (80)", mood: "هادي", bpm });
}
// حماسي: 120 BPM، باص وطبول وكوردات
{
  const bpm = 120;
  const beat = 60 / bpm;
  const bars = 8;
  const x = buf(bars * 4 * beat);
  const roots = [45, 41, 36, 43];
  for (let b = 0; b < bars; b++) {
    const r = roots[b % 4];
    const at = Math.round(b * 4 * beat * R);
    for (let k = 0; k < 8; k++) mixInto(x, tone(beat / 2, note(r - 12), note(r - 12), (p) => (1 - p) ** 2 * 0.35, "square"), at + Math.round((k * beat * R) / 2));
    for (const n of [r + 12, r + 16, r + 19]) for (let k = 0; k < 4; k++) mixInto(x, tone(beat * 0.45, note(n), note(n), (p) => (1 - p) * 0.12, "tri"), at + Math.round((k + 0.5) * beat * R));
    for (let k = 0; k < 4; k++) {
      const t = at + Math.round(k * beat * R);
      mixInto(x, kick(), t, 0.7);
      if (k % 2 === 1) mixInto(x, snare(), t, 0.35);
      mixInto(x, hat(), t + Math.round((beat / 2) * R), 0.2);
    }
  }
  save("music", "upbeat", x, { label: "حماسي (120)", mood: "حماسي", bpm });
}
// عربي: مقام حجاز على وتر بيتنقر (قريب من العود) وإيقاع مقسوم (دُم تَك)
{
  const bpm = 100;
  const beat = 60 / bpm;
  const bars = 8;
  const x = buf(bars * 4 * beat);
  const hijaz = [62, 63, 66, 67, 69, 70, 72, 74]; // ري حجاز
  const phrase = [0, 1, 2, 1, 3, 2, 1, 0, 4, 3, 2, 3, 1, 2, 1, 0];
  for (let b = 0; b < bars; b++) {
    const at = Math.round(b * 4 * beat * R);
    // مقسوم: دُم تَك تَك دُم تَك
    [[0, "d"], [1, "t"], [1.5, "t"], [2, "d"], [3, "t"]].forEach(([t, k]) => mixInto(x, k === "d" ? doum() : tak(), at + Math.round(t * beat * R), k === "d" ? 0.55 : 0.3));
    for (let k = 0; k < 8; k++) {
      const n = hijaz[phrase[(b * 8 + k) % phrase.length]] - (b % 4 === 3 && k > 5 ? 12 : 0);
      mixInto(x, pluck(note(n), beat * 1.2, 0.997), at + Math.round(((k * beat) / 2) * R), 0.5);
    }
    mixInto(x, tone(4 * beat, note(50), note(50), (p) => (1 - p) * 0.12, "tri"), at);
  }
  save("music", "arabic-hijaz", x, { label: "عربي حجاز (عود ومقسوم)", mood: "عربي", bpm });
}

fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(items, null, 2));
console.log(`✓ ${items.length} ملف + manifest.json`);
