// البودكاست بكاميرتين: المزامنة ومين بيتكلم والقطع
// بنعمل "تسجيل" صناعي: متكلمين بيتبادلوا الكلام، كل مايك سامع صاحبه عالي والتاني واطي،
// والكاميرا التانية بدأت تسجل متأخر 1.37 ثانية
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzePodcast, buildShots } from "../scripts/podcast.mjs";

const R = 16000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montag-pod-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

let seed = 9;
const rnd = () => ((seed = (seed * 16807) % 2147483647), (seed / 2147483647) * 2 - 1);

// كلام صناعي: دوشة بتتفتح وتتقفل زي المقاطع (4 مرات في الثانية تقريبًا) بإيقاع عشوائي
const speech = (seconds, segments) => {
  const x = new Float32Array(Math.round(seconds * R));
  let lp = 0;
  let syl = 0;
  let sylLen = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / R;
    const on = segments.some(([a, b]) => t >= a && t < b);
    if (--sylLen <= 0) {
      sylLen = Math.round(R * (0.12 + 0.18 * Math.abs(rnd())));
      syl = Math.abs(rnd()) > 0.25 ? 0.5 + 0.5 * Math.abs(rnd()) : 0.05;
    }
    lp = 0.7 * lp + 0.3 * rnd();
    x[i] = on ? lp * syl * 0.5 : 0;
  }
  return x;
};

const wav = (file, x) => {
  const d = Buffer.alloc(x.length * 2);
  x.forEach((v, i) => d.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + d.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(R, 24);
  h.writeUInt32LE(R * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(d.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, d]));
  return file;
};

describe("البودكاست", () => {
  // أ بيتكلم، بعدين ب، بعدين أ، بعدين ب، وفي الآخر الاتنين مع بعض
  const A = speech(24, [[0.5, 5], [10, 14.5], [20, 22]]);
  const B = speech(24, [[5.6, 9.5], [15, 19.5], [20.5, 22]]);
  const mix = (main, other) => main.map((v, i) => v + other[i] * 0.2 + rnd() * 0.002);
  const LATE = 1.37; // الكاميرا التانية بدأت متأخر
  const cam1 = wav(path.join(dir, "cam1.wav"), mix(A, B));
  const cam2Full = mix(B, A);
  const cam2 = wav(path.join(dir, "cam2.wav"), cam2Full.subarray(Math.round(LATE * R)));

  it("المزامنة: بيعرف إن الكاميرا التانية متأخرة 1.37 ثانية (بفرق أقل من فريم)", async () => {
    const r = await analyzePodcast({ cams: [{ file: cam1, role: "speaker" }, { file: cam2, role: "speaker" }] });
    expect(Math.abs(r.offsets[1] - -LATE * 1000)).toBeLessThanOrEqual(30);
    expect(r.syncScores[1]).toBeGreaterThan(0.5);
  });

  it("القطع: كل لقطة على اللي بيتكلم", async () => {
    const r = await analyzePodcast({ cams: [{ file: cam1, role: "speaker" }, { file: cam2, role: "speaker" }] });
    // في نص كل جملة لازم الكاميرا تبقى على صاحبها
    const camAt = (sec) => r.shots.find((s) => sec * 1000 >= s.fromMs && sec * 1000 < s.toMs)?.cam;
    expect(camAt(3)).toBe(0);
    expect(camAt(7.5)).toBe(1);
    expect(camAt(12)).toBe(0);
    expect(camAt(17)).toBe(1);
    expect(r.separationDb).toBeGreaterThan(6);
    expect(r.share[0].percent + r.share[1].percent).toBeGreaterThan(95);
    // الفترة المشتركة: من أول ما الكاميرا التانية اشتغلت
    expect(Math.abs(r.range.fromMs - LATE * 1000)).toBeLessThanOrEqual(30);
  });

  it("كلام منتظم (فقرات بالدور) والكاميرا التانية متأخرة: المزامنة متتلخبطش في تطابق بالصدفة", async () => {
    const A2 = speech(30, [[0.5, 6], [12, 17], [23, 28]]);
    const B2 = speech(30, [[6.6, 11.4], [17.6, 22.5], [25, 28]]);
    const c1 = wav(path.join(dir, "r1.wav"), mix(A2, B2));
    const c2 = wav(path.join(dir, "r2.wav"), mix(B2, A2).subarray(Math.round(2.4 * R)));
    const r = await analyzePodcast({ cams: [{ file: c1, role: "speaker" }, { file: c2, role: "speaker" }] });
    expect(Math.abs(r.offsets[1] - -2400)).toBeLessThanOrEqual(30);
  });

  it("الكلام بتاع الاتنين مع بعض: شاشة مقسومة لو مطلوب", () => {
    const frames = Int8Array.from([...Array(30).fill(0), ...Array(30).fill(-2), ...Array(30).fill(1)]);
    const shots = buildShots(frames, 100, { speakerCams: [0, 1], split: true, minShotMs: 1000 });
    expect(shots.map((s) => s.kind)).toEqual(["speaker", "split", "speaker"]);
  });

  it("السكوت الطويل بيروح على الكاميرا الواسعة، والقصير لأ", () => {
    const frames = Int8Array.from([...Array(30).fill(0), ...Array(3).fill(-1), ...Array(30).fill(0), ...Array(40).fill(-1), ...Array(30).fill(1)]);
    const shots = buildShots(frames, 100, { speakerCams: [0, 1], wideCam: 2, minShotMs: 1000 });
    expect(shots.map((s) => s.cam)).toEqual([0, 2, 1]);
  });

  it("مفيش قطع أسرع من المدة الدنيا", () => {
    const frames = Int8Array.from(Array.from({ length: 200 }, (_, i) => (Math.floor(i / 8) % 2 ? 1 : 0)));
    const shots = buildShots(frames, 100, { speakerCams: [0, 1], minShotMs: 2000 });
    expect(shots.slice(0, -1).every((s) => s.toMs - s.fromMs >= 2000)).toBe(true);
  });
});
