// بيولّد ملفات تجربة في public/demo: مزيكا، مؤثرات صوت، صور، ولوجو
// كلها متولدة بالكود، فمفيش أي مشكلة حقوق ملكية
// التشغيل: node scripts/generate-demo-assets.mjs
// أو ملفات معينة بس: node scripts/generate-demo-assets.mjs glitch.wav impact.wav
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("public/demo");
fs.mkdirSync(dir, { recursive: true });

const RATE = 44100;
const only = process.argv.slice(2);
const want = (name) => !only.length || only.includes(name);

// ===== كتابة ملف WAV (مونو 16 بت) =====
const writeWav = (name, samples) => {
  if (!want(name)) return;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // مونو
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(dir, name), Buffer.concat([header, data]));
  console.log("✓", name);
};

const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // رقم MIDI ← تردد

// ===== مزيكا خلفية: 4 كوردات + إيقاع هادي، 8 ثواني بتتكرر =====
{
  const bpm = 120;
  const beat = 60 / bpm;
  const len = 8;
  const out = new Float32Array(RATE * len);
  const chords = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const ci = Math.floor(t / 2) % 4;
    const tc = t % 2;
    const env = Math.min(1, tc / 0.15) * Math.min(1, (2 - tc) / 0.3);
    let s = 0;
    for (const n of chords[ci]) {
      const f = note(n);
      s += Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12;
    }
    s *= 0.09 * env;
    // باص
    s += Math.sin(2 * Math.PI * note(chords[ci][0] - 12) * t) * 0.18 * env;
    // كيك على كل ضربة
    const tb = t % beat;
    s += Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-tb * 30)) * tb) * Math.exp(-tb * 12) * 0.45;
    // هاي هات على نص الضربة
    const th = (t + beat / 2) % beat;
    s += (Math.random() * 2 - 1) * Math.exp(-th * 60) * 0.06;
    out[i] = s;
  }
  writeWav("music.wav", out);
}

// ===== whoosh: صوت هوا بيعدي (للانتقالات) =====
{
  const len = 0.6;
  const out = new Float32Array(RATE * len);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * p);
    lp += cutoff * ((Math.random() * 2 - 1) - lp);
    out[i] = lp * Math.sin(Math.PI * p) ** 2 * 2.2;
  }
  writeWav("whoosh.wav", out);
}

// ===== pop: نقرة خفيفة (لظهور الحاجات) =====
{
  const len = 0.15;
  const out = new Float32Array(RATE * len);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * (500 + 900 * (t / len))) / RATE;
    out[i] = Math.sin(phase) * Math.exp(-t * 35) * 0.8;
  }
  writeWav("pop.wav", out);
}

// ===== ding: جرس (للنهاية) =====
{
  const len = 1.4;
  const out = new Float32Array(RATE * len);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] =
      (Math.sin(2 * Math.PI * 1047 * t) * 0.5 + Math.sin(2 * Math.PI * 2094 * t) * 0.25 + Math.sin(2 * Math.PI * 3141 * t) * 0.12) *
      Math.exp(-t * 3.5) *
      0.7;
  }
  writeWav("ding.wav", out);
}

// ===== glitch: تشويش رقمي متقطع (لانتقال الجليتش) =====
{
  const len = 0.45;
  const out = new Float32Array(RATE * len);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647), (seed / 2147483647) * 2 - 1);
  let hold = 0;
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    // "Bitcrush": العينة بتتمسك فترة عشوائية، وبتقطع وترجع
    if (hold-- <= 0) {
      hold = 20 + Math.floor((rnd() + 1) * 120);
      held = rnd();
    }
    const gate = Math.sin(t * 2 * Math.PI * 18) > -0.2 ? 1 : 0;
    const buzz = Math.sign(Math.sin(2 * Math.PI * (120 + 600 * t) * t)) * 0.3;
    out[i] = (held * 0.6 + buzz) * gate * Math.min(1, t / 0.01) * Math.exp(-t * 3) * 0.7;
  }
  writeWav("glitch.wav", out);
}

// ===== impact: ضربة مع صفير خفيف (للفلاش) =====
{
  const len = 1.1;
  const out = new Float32Array(RATE * len);
  let lp = 0;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647), (seed / 2147483647) * 2 - 1);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const boom = Math.sin(2 * Math.PI * (40 + 120 * Math.exp(-t * 18)) * t) * Math.exp(-t * 5);
    lp += 0.08 * (rnd() - lp);
    const air = lp * Math.exp(-t * 9) * 1.5;
    out[i] = (boom * 0.9 + air) * 0.8;
  }
  writeWav("impact.wav", out);
}

// ===== صور تجربة (SVG) =====
const foodSvg = (emoji, c1, c2, c3) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="75%">
      <stop offset="0" stop-color="${c1}"/><stop offset="0.6" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#g)"/>
  <circle cx="160" cy="220" r="140" fill="#fff" opacity="0.07"/>
  <circle cx="940" cy="1120" r="220" fill="#fff" opacity="0.06"/>
  <circle cx="900" cy="260" r="60" fill="#fff" opacity="0.1"/>
  <circle cx="540" cy="560" r="330" fill="#000" opacity="0.12"/>
  <text x="540" y="560" font-size="460" text-anchor="middle" dominant-baseline="central">${emoji}</text>
</svg>`;

const images = {
  "burger.svg": foodSvg("🍔", "#fbbf24", "#ea580c", "#7c2d12"),
  "pizza.svg": foodSvg("🍕", "#fca5a5", "#dc2626", "#450a0a"),
  "drink.svg": foodSvg("🥤", "#86efac", "#059669", "#064e3b"),
  "logo.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <circle cx="200" cy="200" r="190" fill="#f59e0b"/>
  <circle cx="200" cy="200" r="168" fill="none" stroke="#1c1917" stroke-width="8" stroke-dasharray="4 14" stroke-linecap="round"/>
  <text x="200" y="165" font-size="120" text-anchor="middle" dominant-baseline="central">🔥</text>
  <text x="200" y="280" font-size="78" font-weight="800" font-family="Segoe UI, Tahoma, sans-serif" fill="#1c1917" text-anchor="middle" dominant-baseline="central">الفرن</text>
</svg>`,
};
for (const [name, svg] of Object.entries(images)) {
  if (!want(name)) continue;
  fs.writeFileSync(path.join(dir, name), svg);
  console.log("✓", name);
}
