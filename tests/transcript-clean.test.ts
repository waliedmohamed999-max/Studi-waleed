// تنضيف التفريغ: الكلام اللي Whisper ألّفه على المزيكا، والجمل المتعادة
import { describe, expect, it } from "vitest";
import type { Caption } from "@remotion/captions";
import { cleanTranscript, findRestarts } from "../src/autoedit/edl";

const w = (text: string, startMs: number, endMs: number, confidence = 0.95): Caption => ({ text: ` ${text}`, startMs, endMs, timestampMs: null, confidence });
const texts = (ws: Caption[]) => ws.map((x) => x.text.trim()).join(" ");

describe("الكلام المتألّف", () => {
  // تفريغ حقيقي من فيديو فيه مزيكا في أوله: أول 3 كلمات Whisper ألّفهم
  const real = [
    w("شاشة", 50, 3330, 0.05),
    w("الرئيسية", 3330, 10000, 0.62),
    w("للتطبيق", 10000, 10000, 0.64),
    w("دي", 10000, 10160, 0.59),
    w("الشاشة", 10160, 10670, 0.86),
    w("الرئيسية", 10670, 11340, 1),
    w("للتطبيق", 11340, 12000, 0.99),
    w("من", 12000, 12130, 0.99),
    w("هنا", 12130, 12330, 0.99),
  ];
  it("بيتشال، والكلام الحقيقي بيفضل", () => {
    expect(texts(cleanTranscript(real))).toBe("دي الشاشة الرئيسية للتطبيق من هنا");
  });
  it("الكلام الواضح مبيتلمسش", () => {
    const ok = [w("انا", 0, 300), w("رحت", 300, 600), w("المدرسة", 600, 1000)];
    expect(cleanTranscript(ok)).toEqual(ok);
  });
});

describe("الإعادات", () => {
  it("الجملة المتعادة: النسخة الأولى بتتقص", () => {
    const words = [w("انا", 0, 300), w("رحت", 300, 600), w("يعني", 700, 900), w("انا", 1200, 1500), w("رحت", 1500, 1800), w("الشغل", 1800, 2200)];
    const cuts = findRestarts(words);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ fromWord: 0, toWord: 2, reason: "إعادة" });
  });
  it("التهتهة في كلمة", () => {
    expect(findRestarts([w("المشروع", 0, 400), w("المشروع", 500, 900), w("ده", 900, 1100)])[0]).toMatchObject({ fromWord: 0, toWord: 0 });
  });
  it("التأكيد مش إعادة، والتكرار البعيد مش إعادة", () => {
    expect(findRestarts([w("حلو", 0, 300), w("جدا", 300, 600), w("جدا", 600, 900)])).toEqual([]);
    expect(findRestarts([w("الشاشة", 0, 300), w("الرئيسية", 300, 600), ...Array.from({ length: 3 }, (_, i) => w(`كلمة${i}`, 600 + i * 300, 900 + i * 300)), w("الشاشة", 9000, 9300), w("الرئيسية", 9300, 9600)])).toEqual([]);
  });
});

import { refineWords } from "../src/autoedit/edl";
describe("توقيت الكابشن مع مزيكا قبل الكلام", () => {
  it("الكلام مبيتمطش على المزيكا اللي قبله", () => {
    const words = [w("دي", 10000, 10160), w("الشاشة", 10160, 10670), w("الرئيسية", 10670, 11340), w("للتطبيق", 11340, 12000)];
    const out = refineWords(words, [{ fromMs: 4500, toMs: 11560 }]);
    expect(out[0].startMs).toBeGreaterThanOrEqual(10000);
    expect(out[3].endMs).toBeLessThanOrEqual(11560);
  });
});

import { relinkWords, wordIndexMap } from "../src/autoedit/edl";
describe("الإيموجي بيتنقل مع كلمته", () => {
  it("بعد تنضيف 3 كلمات من الأول، الإيموجي بيفضل على نفس الكلمة", () => {
    const old = [w("شاشة", 50, 3330, 0.05), w("الرئيسية", 3330, 10000, 0.62), w("للتطبيق", 10000, 10000, 0.64), w("دي", 10000, 10160), w("الطلب", 15410, 16000)];
    const clean = cleanTranscript(old);
    const map = wordIndexMap(old, clean);
    const out = relinkWords([{ id: "a", fromWord: 4, atMs: 0, emoji: "🛒" }, { id: "b", fromWord: 0, atMs: 0, emoji: "📱" }], map, true);
    expect(out).toEqual([{ id: "a", fromWord: 1, atMs: 0, emoji: "🛒" }]);
    expect(clean[1].text.trim()).toBe("الطلب");
  });
});

describe("جمل Whisper المتألّفة على المزيكا", () => {
  it("«موسيقى» و«اشتركوا في القناة» بيتشالوا", () => {
    const ws = [w("موسيقى", 0, 2000, 0.9), w("اشتركوا", 2000, 3000, 0.9), w("في", 3000, 3100), w("القناة", 3100, 3500), w("اهلا", 4000, 4400)];
    expect(texts(cleanTranscript(ws))).toBe("اهلا");
  });
});
