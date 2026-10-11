// تعديل الكلام: توزيع النص المصلَّح على الكلمات، وكتم الصوت الأصلي مكان التصليح
import { describe, expect, it } from "vitest";
import type { Caption } from "@remotion/captions";
import { spreadText } from "../studio/TranscriptEditor";
import { originalGain } from "../src/AutoEditVideo";

const w = (text: string, startMs: number, endMs: number): Caption => ({ text: ` ${text}`, startMs, endMs, timestampMs: null, confidence: null });
const words = [w("انا", 0, 300), w("رحت", 300, 600), w("المدرسه", 600, 1000), w("امبارح", 1000, 1400)];
const texts = (ws: Caption[]) => ws.map((x) => x.text.trim());

describe("توزيع النص المصلَّح", () => {
  it("نفس عدد الكلمات: كل كلمة مكانها", () => {
    expect(texts(spreadText(words, 1, 2, "روحت المدرسة"))).toEqual(["انا", "روحت", "المدرسة", "امبارح"]);
  });
  it("كلام أكتر: الزيادة بتروح لآخر كلمة وعدد الكلمات مبيتغيرش", () => {
    const out = spreadText(words, 2, 2, "الجامعة الصبح");
    expect(out.length).toBe(4);
    expect(texts(out)).toEqual(["انا", "رحت", "الجامعة الصبح", "امبارح"]);
  });
  it("كلام أقل: الباقي بيفضى ومبيتشالش", () => {
    expect(texts(spreadText(words, 0, 2, "رحت"))).toEqual(["رحت", "", "", "امبارح"]);
  });
  it("التوقيت مبيتغيرش", () => {
    expect(spreadText(words, 0, 3, "أ ب ج د").map((x) => x.startMs)).toEqual([0, 300, 600, 1000]);
  });
});

describe("كتم الصوت الأصلي مكان التصليح", () => {
  const fixes = [{ fromMs: 1000, toMs: 2000 }];
  it("جوه التصليح ساكت، وبعيد عنه عادي، وعلى الحدود بيوطى بسرعة", () => {
    expect(originalGain(1500, fixes)).toBe(0);
    expect(originalGain(500, fixes)).toBe(1);
    expect(originalGain(2500, fixes)).toBe(1);
    expect(originalGain(985, fixes)).toBeCloseTo(0.5);
  });
});
