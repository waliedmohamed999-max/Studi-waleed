// الأدوات المجانية: الترجمة (من غير نت حقيقي) والسيناريو من كلام المستخدم
import { afterEach, describe, expect, it, vi } from "vitest";
import { freePlan, FreeError, hasArabic, translateMany } from "../scripts/free.mjs";

// ترجمة وهمية: كل نص عربي ← "EN(رقمه)"، بنفس شكل رد Google
const fakeGoogle = () =>
  vi.fn(async (url) => {
    const q = decodeURIComponent(String(url).split("&q=")[1]);
    const out = q
      .split("\n|||\n")
      .map((_, i) => `EN${i}`)
      .join(" ||| ");
    return new Response(JSON.stringify([[[out, q]]]), { status: 200 });
  });

afterEach(() => vi.unstubAllGlobals());

describe("الترجمة", () => {
  it("كل النصوص في طلب واحد، والإنجليزي مبيتبعتش", async () => {
    const f = fakeGoogle();
    vi.stubGlobal("fetch", f);
    expect(await translateMany(["راجل مصري", "already english", "مكتب"])).toEqual(["EN0", "already english", "EN1"]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("لو Google قافل بنجرب MyMemory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("mymemory") ? new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "a man" } }), { status: 200 }) : new Response("no", { status: 429 }),
      ),
    );
    expect(await translateMany(["راجل"])).toEqual(["a man"]);
  });
  it("لو كل الخدمات واقعة: رسالة واضحة بدل ما يرسم شخص غلط", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    await expect(translateMany(["راجل"])).rejects.toBeInstanceOf(FreeError);
  });
  it("hasArabic", () => {
    expect(hasArabic("مرحبا")).toBe(true);
    expect(hasArabic("hello 123")).toBe(false);
  });
});

describe("السيناريو المجاني", () => {
  it("كل سطر لقطة، أول لقطة واسعة، والشخص ثابت في كل اللقطات", async () => {
    vi.stubGlobal("fetch", fakeGoogle());
    const plan = await freePlan({ person: "راجل", place: "مكتب", script: "سطر أول\nسطر تاني فيه كلام كتير شوية عشان المدة تطول\n\nسطر تالت" });
    expect(plan.shots).toHaveLength(3);
    expect(plan.characters).toHaveLength(1);
    expect(plan.shots[0].imagePrompt).toMatch(/^wide establishing shot/);
    expect(plan.shots.every((s) => s.characters[0] === "c1" && s.voiceLine && !hasArabic(s.imagePrompt))).toBe(true);
    expect(plan.shots[1].duration).toBeGreaterThan(plan.shots[0].duration);
    expect(plan.shots.every((s) => s.duration >= 3 && s.duration <= 15)).toBe(true);
  });
  it("من غير شخص: لقطات للمكان بس", async () => {
    vi.stubGlobal("fetch", fakeGoogle());
    const plan = await freePlan({ person: "", place: "مكتب", script: "سطر" });
    expect(plan.characters).toEqual([]);
    expect(plan.shots[0].characters).toEqual([]);
  });
  it("من غير كلام: مرفوض", async () => {
    await expect(freePlan({ person: "", place: "", script: "  \n " })).rejects.toBeInstanceOf(FreeError);
  });
});
