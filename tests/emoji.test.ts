// الإيموجي الأوتوماتيك والكابشن المدبلج والفحص السريع
import { describe, expect, it } from "vitest";
import type { Caption } from "@remotion/captions";
import { emojiFor, suggestEmojis } from "../src/lib/emoji";
import { remapPlainWords } from "../src/AutoEditVideo";
import { quickChecks } from "../studio/ReviewCard";

const w = (text: string, startMs: number, endMs = startMs + 300): Caption => ({ text: ` ${text}`, startMs, endMs, timestampMs: null, confidence: null });

describe("الإيموجي من القاموس", () => {
  it("بيعرف الكلمة حتى مع ال و و و ب", () => {
    expect(emojiFor("القهوة")).toBe("☕");
    expect(emojiFor("والفلوس")).toBe("💰");
    expect(emojiFor("بالنجاح")).toBe("🚀");
    expect(emojiFor("مبروك!")).toBe("🎉");
  });
  it("الكلمات العادية ملهاش إيموجي", () => {
    expect(emojiFor("في")).toBeNull();
    expect(emojiFor("هو")).toBeNull();
  });
  it("مش بيحط إيموجي ورا بعض على طول", () => {
    const words = [w("قهوة", 0), w("فلوس", 500), w("نجاح", 4000), w("نجاح", 8000)];
    const picks = suggestEmojis(words);
    expect(picks.map((p) => p.index)).toEqual([0, 2]); // الفلوس قريبة من القهوة، والنجاح التاني نفس الإيموجي
  });
});

describe("كابشن الدبلجة بعد المونتاج", () => {
  it("الكلمة اللي في جزء اتقص بتتشال، والباقي بياخد وقته الجديد", () => {
    const segments = [
      { fromMs: 0, toMs: 1000, outMs: 0 },
      { fromMs: 3000, toMs: 4000, outMs: 1000 },
    ];
    const out = remapPlainWords([w("hello", 100, 400), w("cut", 1500, 1800), w("world", 3200, 3500)], segments);
    expect(out.map((x) => x.text.trim())).toEqual(["hello", "world"]);
    expect(out[1].startMs).toBe(1200);
  });
});

describe("الفحص السريع قبل التصدير", () => {
  const meta = { width: 1080, height: 1920, durationInFrames: 30 * 20, fps: 30 };
  const settings = { format: "mp4", quality: "high", thumbnail: true, loudness: true } as never;
  it("بيمسك مشهد فيه كلام كتير وطبقة تحت أزرار المنصة", () => {
    const props = {
      scenes: [
        { id: "a", type: "text", duration: 2, text: "كلام كتير جدا جدا جدا جدا جدا جدا جدا جدا جدا جدا جدا جدا", layers: [{ id: "l", kind: "text", text: "تحت", x: 50, y: 92 }] },
        { id: "b", type: "cta", duration: 3, text: "اطلب" },
      ],
    };
    const texts = quickChecks("Project", props, meta, settings).map((c) => c.text);
    expect(texts.some((t) => t.includes("كلام كتير"))).toBe(true);
    expect(texts.some((t) => t.includes("تحت أزرار"))).toBe(true);
  });
  it("مونتاج من غير عنوان شادد ولا كابشن", () => {
    const checks = quickChecks("AutoEdit", { media: "x.mp4", words: [], captions: "off", hookTitle: "" }, meta, settings);
    expect(checks.filter((c) => c.level !== "ok").length).toBeGreaterThanOrEqual(3);
  });
});
