// كل قالب لازم يترسم فعلًا بالـ renderer الحقيقي (زي التصدير بالظبط)، مش بس يعدّي الـ typecheck
// وتصدير فيديو حقيقي قصير من أوله لآخره (مع ضبط علو الصوت)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { probe } from "../scripts/media.mjs";
import { normalizeVideoLoudness } from "../scripts/audio.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montag-render-"));
let serveUrl;
let comps = [];

beforeAll(async () => {
  serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
  comps = await getCompositions(serveUrl);
}, 240000);
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("كل القوالب بتترسم", () => {
  it("فيه قوالب", () => expect(comps.map((c) => c.id).sort()).toEqual(["AutoEdit", "Captioned", "Film", "Lesson1", "Podcast", "Project", "Promo", "TextStory"]));

  // أول فريم ونص الفيديو وآخر فريم لكل قالب (بالقيم الافتراضية)
  it("أول ونص وآخر فريم في كل قالب من غير أخطاء", async () => {
    const failed = [];
    for (const c of comps) {
      for (const frame of [0, Math.floor(c.durationInFrames / 2), c.durationInFrames - 1]) {
        try {
          await renderStill({ serveUrl, composition: c, frame, output: path.join(dir, `${c.id}-${frame}.png`), scale: 0.25 });
        } catch (e) {
          failed.push(`${c.id}@${frame}: ${String(e.message).slice(0, 200)}`);
        }
      }
    }
    expect(failed).toEqual([]);
  }, 600000);
});

describe("تصدير حقيقي", () => {
  it("فيديو MP4 فيه صورة وصوت، وعلوه بيتظبط", async () => {
    const c = comps.find((x) => x.id === "Captioned");
    const out = path.join(dir, "export.mp4");
    // أول 3 ثواني بس عشان الاختبار يخلص بسرعة
    await renderMedia({ serveUrl, composition: c, codec: "h264", outputLocation: out, frameRange: [0, 89], scale: 0.5 });
    await normalizeVideoLoudness(out);
    const info = await probe(out);
    expect(info.hasAudio).toBe(true);
    expect(info.width).toBeGreaterThan(0);
    expect(info.duration).toBeGreaterThan(2.5);
  }, 300000);
});
