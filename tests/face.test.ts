// تتبع الوش: الكادر لازم يجيب الوش في النص من غير ما يطلع برا الصورة
import { describe, expect, it } from "vitest";
import { faceAt, faceFraming, smoothTrack } from "../src/autoedit/face";

describe("مكان الوش في أي لحظة", () => {
  const track = [
    { t: 0, x: 0.2, y: 0.5, s: 0.1 },
    { t: 1000, x: 0.6, y: 0.5, s: 0.1 },
  ];
  it("بين نقطتين", () => expect(faceAt(track, 500)!.x).toBeCloseTo(0.4));
  it("قبل الأول وبعد الآخر", () => {
    expect(faceAt(track, -10)!.x).toBe(0.2);
    expect(faceAt(track, 5000)!.x).toBe(0.6);
  });
  it("من غير تتبع", () => expect(faceAt([], 0)).toBeNull());
});

describe("الكادر (فيديو عرضي في مقاس طولي)", () => {
  const size = { srcW: 1920, srcH: 1080, outW: 1080, outH: 1920 };
  it("الوش على اليمين: الكادر بيروح يمين", () => {
    const f = faceFraming({ ...size, face: { x: 0.75, y: 0.4 } });
    const posX = parseFloat(f.objectPosition);
    expect(posX).toBeGreaterThan(80);
    // الوش في نص الكادر بالظبط
    expect(parseFloat(f.origin)).toBeCloseTo(50, 0);
  });
  it("الوش على الطرف: الكادر بيقف عند حافة الصورة", () => {
    const f = faceFraming({ ...size, face: { x: 0.99, y: 0.4 } });
    expect(parseFloat(f.objectPosition)).toBe(100);
  });
  it("نفس النسبة: الصورة مبتتحركش، والزووم بيقرّب على الوش", () => {
    const f = faceFraming({ srcW: 1080, srcH: 1920, outW: 1080, outH: 1920, face: { x: 0.3, y: 0.3 } });
    expect(f.objectPosition.split(" ").map(parseFloat)).toEqual([50, 50]);
    expect(parseFloat(f.origin)).toBeCloseTo(30, 0);
  });
  it("من غير وش: النص", () => expect(faceFraming({ ...size, face: null }).objectPosition).toBe("50% 50%"));
});

describe("تنعيم الحركة", () => {
  const times = [0, 250, 500, 750, 1000];
  it("اللحظات اللي ملقيناش فيها وش بتتملا", () => {
    const raw = [null, { t: 250, x: 0.5, y: 0.5, s: 0.1 }, null, null, { t: 1000, x: 0.5, y: 0.5, s: 0.1 }];
    const out = smoothTrack(raw, times);
    expect(out).toHaveLength(5);
    expect(out.every((p) => p.x === 0.5)).toBe(true);
  });
  it("الرعشة الصغيرة مش بتحرك الكادر", () => {
    const raw = times.map((t, i) => ({ t, x: 0.5 + (i % 2 ? 0.01 : -0.01), y: 0.5, s: 0.1 }));
    const out = smoothTrack(raw, times);
    const xs = out.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.005);
  });
  it("مفيش وش خالص", () => expect(smoothTrack([null, null], [0, 250])).toEqual([]));
});
