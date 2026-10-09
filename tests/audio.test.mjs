// تنضيف الصوت: الذكاء الاصطناعي لازم يشيل الدوشة (حتى اللي بتتغير) من غير ما يبوظ الكلام أو يأخّره
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanAudio, compress, denoise, denoiseAi } from "../scripts/audio.mjs";

const RATE = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647), (seed / 2147483647) * 2 - 1);
const db = (x, a = 0, b = x.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-12);
};

// "كلام" صناعي: نغمات بتتغير زي الصوت البشري، وسكوت قبله وبعده
const fakeVoice = (seconds = 3, gap = 1) => {
  const n = Math.round((seconds + gap * 2) * RATE);
  const x = new Float64Array(n);
  for (let i = gap * RATE; i < n - gap * RATE; i++) {
    const t = i / RATE;
    const f0 = 140 + 40 * Math.sin(2 * Math.PI * 1.5 * t);
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t) ** 2;
    let v = 0;
    for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    x[i] = 0.12 * env * v;
  }
  return x;
};

// دوشة ثابتة + دوشة بتيجي وتروح (زي الشارع)
const addNoise = (x) => {
  let lp = 0;
  return x.map((v, i) => {
    lp = 0.9 * lp + 0.1 * rnd();
    const burst = Math.sin((2 * Math.PI * 0.7 * i) / RATE) > 0.4 ? 0.1 * lp : 0;
    return v + 0.015 * rnd() + burst;
  });
};

describe("تنضيف الدوشة", () => {
  const clean = fakeVoice();
  const noisy = addNoise(clean);
  const gap = RATE; // أول ثانية سكوت

  it("الذكاء الاصطناعي بيوطّي الدوشة في السكوت أكتر من 15dB", async () => {
    const out = await denoiseAi(noisy);
    expect(db(noisy, 0, gap) - db(out, 0, gap)).toBeGreaterThan(15);
  });

  it("الذكاء الاصطناعي أحسن من الطريقة القديمة مع الدوشة اللي بتتغير", async () => {
    const ai = await denoiseAi(noisy);
    const classic = denoise(noisy, 0.6);
    expect(db(ai, 0, gap)).toBeLessThan(db(classic, 0, gap));
  });

  it("الكلام مبيتأخرش (التزامن مع الصورة)", async () => {
    const out = await denoiseAi(noisy);
    // أول ما الكلام يبدأ في الأصل لازم يبدأ في النسخة النضيفة في نفس اللحظة تقريبًا (أقل من 15ms)
    const onset = (x) => x.findIndex((v, i) => i > gap * 0.5 && Math.abs(v) > 0.03);
    expect(Math.abs(onset(out) - onset(clean))).toBeLessThan(RATE * 0.015);
  });

  it("الكومبريسور بيقرّب العالي من الواطي", () => {
    const x = new Float64Array(RATE).map((_, i) => (i < RATE / 2 ? 0.05 : 0.6) * Math.sin(i / 10));
    const y = compress(x);
    const before = db(x, RATE / 2, RATE) - db(x, 0, RATE / 2);
    const after = db(y, RATE / 2, RATE) - db(y, 0, RATE / 2);
    expect(after).toBeLessThan(before - 5);
  });
});

describe("تنضيف ملف كامل (FFmpeg + كل المراحل)", () => {
  it("بيطلع ملف WAV على مستوى الكلام المريح", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montag-test-"));
    const input = path.join(dir, "in.wav");
    const output = path.join(dir, "out.wav");
    const x = addNoise(fakeVoice(2, 0.5));
    const data = Buffer.alloc(x.length * 2);
    x.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
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
    fs.writeFileSync(input, Buffer.concat([h, data]));
    try {
      await cleanAudio(input, output, { mode: "ai", polish: true });
      const buf = fs.readFileSync(output);
      expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buf.length).toBeGreaterThan(RATE); // فيه صوت فعلًا
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
