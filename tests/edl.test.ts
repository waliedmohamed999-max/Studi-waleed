// حساب القطع في المونتاج الأوتوماتيك: لازم يفضل صح لأن المعاينة والتصدير بيعتمدوا عليه
import { describe, expect, it } from "vitest";
import type { Caption } from "@remotion/captions";
import { buildSegments, isFiller, outToSource, rangeToOut, refineWords, remapWords, sourceToOut, totalMs, type EdlInput } from "../src/autoedit/edl";

const w = (text: string, startMs: number, endMs: number): Caption => ({ text: ` ${text}`, startMs, endMs, timestampMs: null, confidence: null });

const base = (over: Partial<EdlInput> = {}): EdlInput => ({
  words: [],
  speech: [],
  durationMs: 10000,
  silenceMs: 600,
  padMs: 0,
  removeFillers: true,
  cuts: [],
  ...over,
});

describe("الإمم والآآآ", () => {
  it("بيعرف الإمم بأشكالها", () => {
    for (const f of ["إممم", "اممم", "آآآ", "ممم", "uhh", "hmm"]) expect(isFiller(f)).toBe(true);
  });
  it("مبيشيلش اه (بمعنى أيوه) ولا الكلام العادي", () => {
    // ملحوظة: "أمم" بتتشال لأن Whisper بيكتب الإمم كده كتير (أكتر بكتير من كلمة "أمم" بمعنى شعوب)
    for (const t of ["اه", "أهلاً", "مصر", "ماما", "مهم"]) expect(isFiller(t)).toBe(false);
  });
});

describe("قص السكوت", () => {
  it("السكوت الطويل بيتقص والقصير بيفضل", () => {
    const speech = [
      { fromMs: 0, toMs: 1000 },
      { fromMs: 1300, toMs: 2000 }, // سكوت 300ms: يفضل
      { fromMs: 4000, toMs: 5000 }, // سكوت 2 ثانية: يتقص
    ];
    const segs = buildSegments(base({ speech }));
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ fromMs: 0, toMs: 2000, outMs: 0 });
    expect(segs[1]).toMatchObject({ fromMs: 4000, toMs: 5000, outMs: 2000 });
    expect(totalMs(segs)).toBe(3000);
  });

  it("الهامش حوالين الكلام", () => {
    const segs = buildSegments(base({ speech: [{ fromMs: 1000, toMs: 2000 }], padMs: 100 }));
    expect(segs[0]).toMatchObject({ fromMs: 900, toMs: 2100 });
  });

  it("من غير أي بيانات: الفيديو كله", () => {
    const segs = buildSegments(base({ durationMs: 5000 }));
    expect(segs).toEqual([{ fromMs: 0, toMs: 5000, outMs: 0 }]);
  });
});

describe("الإمم والقطع والقص اليدوي", () => {
  // من غير speech: التوقيت من الكلمات زي ما هو (المحاذاة ليها اختبار لوحدها تحت)
  const words = [w("أهلاً", 0, 500), w("إممم", 500, 1000), w("بيكم", 1000, 1500), w("في", 1500, 1800), w("القناة", 1800, 2400)];
  const speech: { fromMs: number; toMs: number }[] = [];

  it("بيشيل الإمم", () => {
    const segs = buildSegments(base({ words, speech, durationMs: 2400 }));
    expect(totalMs(segs)).toBe(1900);
    expect(segs.every((s) => s.toMs <= 500 || s.fromMs >= 1000)).toBe(true);
  });

  it("بيشيل الأجزاء اللي Claude قال عليها (بأرقام الكلمات)", () => {
    const segs = buildSegments(base({ words, speech, durationMs: 2400, cuts: [{ fromMs: 0, toMs: 0, fromWord: 3, toWord: 4, reason: "إعادة", enabled: true }] }));
    expect(segs.at(-1)!.toMs).toBe(1500);
  });

  it("القطع المقفول مبيتشالش", () => {
    const segs = buildSegments(base({ words, speech, durationMs: 2400, cuts: [{ fromMs: 1500, toMs: 2400, reason: "x", enabled: false }] }));
    expect(segs.at(-1)!.toMs).toBe(2400);
  });

  it("القص اليدوي بيقسم المقطع لاتنين", () => {
    const segs = buildSegments(base({ speech: [{ fromMs: 0, toMs: 4000 }], durationMs: 4000, splits: [1500] }));
    expect(segs.map((s) => [s.fromMs, s.toMs])).toEqual([
      [0, 1500],
      [1500, 4000],
    ]);
  });

  it("الكابشن بعد المونتاج: الكلمات المشالة مش موجودة والتوقيت اتظبط", () => {
    const input = base({ words, speech, durationMs: 2400 });
    const caps = remapWords(input, buildSegments(input));
    expect(caps.map((c) => c.text.trim())).toEqual(["أهلاً", "بيكم", "في", "القناة"]);
    expect(caps[1].startMs).toBe(500);
  });
});

describe("التحويل بين وقت الأصل ووقت المونتاج", () => {
  const segs = buildSegments(base({ speech: [{ fromMs: 0, toMs: 1000 }, { fromMs: 3000, toMs: 4000 }] }));
  it("رايح جاي", () => {
    expect(sourceToOut(3500, segs)).toBe(1500);
    expect(outToSource(1500, segs)).toBe(3500);
    expect(sourceToOut(2000, segs)).toBeNull(); // اتقص
  });
  it("فترة بتعدي على قطع", () => {
    expect(rangeToOut({ fromMs: 500, toMs: 3500 }, segs)).toEqual({ fromMs: 500, toMs: 1500 });
    expect(rangeToOut({ fromMs: 1500, toMs: 2500 }, segs)).toBeNull();
  });
});

describe("محاذاة الكلمات على الكلام الحقيقي", () => {
  it("الكلمة اللي Whisper حطها في السكوت بترجع لجزء الكلام", () => {
    const words = [w("واحد", 0, 2000), w("اتنين", 2000, 3000)];
    const speech = [
      { fromMs: 1500, toMs: 2000 },
      { fromMs: 2500, toMs: 3000 },
    ];
    const r = refineWords(words, speech);
    expect(r[0].startMs).toBe(1500);
    expect(r[1].startMs).toBe(2500);
  });
  it("الترتيب بيفضل زي ما هو", () => {
    const words = [w("أ", 0, 100), w("ب", 100, 200), w("ج", 200, 300)];
    const r = refineWords(words, [{ fromMs: 1000, toMs: 1600 }]);
    expect(r.map((x) => x.startMs)).toEqual([...r.map((x) => x.startMs)].sort((a, b) => a - b));
    expect(r.at(-1)!.endMs).toBe(1600);
  });
});
