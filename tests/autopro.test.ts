// المونتاج الاحترافي بضغطة: اختيار الفيديو الأساسي، أماكن اللقطات، وتقييم اللقطات
import { describe, expect, it } from "vitest";
import { brollSlots, chooseShots, pickMain, planBrolls, proLook, type ExploredVideo } from "../src/autoedit/autopro";
// @ts-expect-error سكريبت JS
import { bestWindows, frameStats, shotCuts } from "../scripts/shots.mjs";

const vid = (path: string, speechRatio: number, windows: [number, number, number][] = []): ExploredVideo => ({
  path,
  durationMs: 60000,
  speechRatio,
  brightness: 120,
  speech: [],
  windows: windows.map(([fromMs, toMs, score]) => ({ fromMs, toMs, score })),
});
const seg = (fromMs: number, toMs: number, outMs: number) => ({ fromMs, toMs, outMs });

describe("اختيار الفيديو الأساسي", () => {
  it("اللي فيه كلام أكتر هو الأساسي والباقي لقطات", () => {
    const { main, footage } = pickMain([vid("a", 0.1), vid("b", 0.8), vid("c", 0)]);
    expect(main.path).toBe("b");
    expect(footage.map((v) => v.path)).toEqual(["a", "c"]);
  });
  it("كليب قصير كله كلام ميغلبش فيديو طويل فيه كلام أكتر بالثواني", () => {
    const long = { ...vid("long", 0.7), durationMs: 87000 };
    const short = { ...vid("short", 0.8), durationMs: 10000 };
    expect(pickMain([short, long]).main.path).toBe("long");
  });
});

describe("أماكن اللقطات", () => {
  it("مفيش لقطة في أول 3.5 ثانية ولا في آخر ثانية ونص، وكل لقطة جوه جزء واحد", () => {
    const segments = [seg(0, 10000, 0), seg(12000, 30000, 10000)];
    const slots = brollSlots(segments);
    expect(slots.length).toBeGreaterThan(1);
    for (const s of slots) {
      expect(segments.some((g) => s.fromMs >= g.fromMs && s.toMs <= g.toMs)).toBe(true);
      expect(s.toMs - s.fromMs).toBeGreaterThanOrEqual(1700);
    }
    expect(slots[0].fromMs).toBe(3500);
  });
  it("فيديو قصير أوي مفيهوش لقطات", () => {
    expect(brollSlots([seg(0, 5000, 0)])).toEqual([]);
  });
});

describe("توزيع اللقطات", () => {
  it("بالتبادل بين الفيديوهات، وكل فيديو بترتيبه", () => {
    const a = vid("a", 0, [[20000, 23600, 0.9], [1000, 4600, 0.8], [40000, 43600, 0.5]]);
    const b = vid("b", 0, [[5000, 8600, 0.7]]);
    const out = chooseShots([a, b], 3);
    expect(out.map((x) => `${x.path}${x.fromMs}`)).toEqual(["a1000", "b5000", "a20000"]);
  });
  it("اللقطة بتاخد مكانها ومصدرها جوه النافذة المتقيّمة", () => {
    const brolls = planBrolls([seg(0, 30000, 0)], [vid("f", 0, [[10000, 13600, 0.9], [30000, 33600, 0.8]])], (i) => `id${i}`);
    expect(brolls.length).toBe(2);
    const b = brolls[0];
    expect(b.src).toBe("f");
    expect(b.kind).toBe("video");
    expect(b.srcFromMs! >= 10000 && b.srcFromMs! + (b.toMs - b.fromMs) <= 13600).toBe(true);
  });
  it("الفيديو الغامق بياخد فلتر منوّر، والكابشن بيتقفل من غير كلام", () => {
    expect(proLook(60, false, "").grade).toBe("bright");
    expect(proLook(60, false, "").captions).toBe("off");
    expect(proLook(130, true, "x.mp3").music).toBe("x.mp3");
  });
});

// صور صناعية 96×54
const W = 96;
const H = 54;
const frame = (fn: (x: number, y: number) => number) => {
  const f = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = Math.max(0, Math.min(255, Math.round(fn(x, y))));
  return f;
};
const checker = (shift: number, level = 120) => frame((x, y) => (((x + shift) >> 3) + (y >> 3)) % 2 ? level + 60 : level - 60);

describe("تقييم اللقطات", () => {
  it("القطع المفاجئ بيتعرف", () => {
    const frames = [...Array(10).fill(0).map((_, i) => checker(i)), ...Array(10).fill(0).map(() => frame(() => 30))];
    expect(shotCuts(frameStats(Buffer.concat(frames)))).toContain(10);
  });
  it("الواضح والمنوّر بياخد تقييم أعلى من الغامق المغبش", () => {
    const sharp = Array(40).fill(0).map((_, i) => checker(i % 4));
    const dull = Array(40).fill(0).map(() => frame(() => 20));
    const stats = frameStats(Buffer.concat([...sharp, ...dull]));
    const ref = Math.max(...stats.map((s: { sharp: number }) => s.sharp));
    const wins = bestWindows(stats, ref, 16000);
    expect(wins.length).toBeGreaterThan(0);
    expect(wins.every((w: { toMs: number }) => w.toMs <= 8200)).toBe(true);
  });
});

import { formatForSize } from "../src/lib/formats";
describe("المقاس على اتجاه الفيديو", () => {
  it("عرضي ← يوتيوب، طولي ← ريلز، مربع ← مربع", () => {
    expect(formatForSize(1920, 1080)).toBe("youtube");
    expect(formatForSize(576, 1024)).toBe("reel");
    expect(formatForSize(1080, 1080)).toBe("square");
    expect(formatForSize(1080, 1350)).toBe("portrait");
    expect(formatForSize(0, 0)).toBe("reel");
  });
});

import { hasOwnMusic } from "../src/autoedit/autopro";
describe("مزيكا الفيديو الأصلية", () => {
  it("صوت طويل من غير كلام = فيه مزيكا، وكلام بس = مفيش", () => {
    const words = [{ startMs: 10000, endMs: 12000 }, { startMs: 12100, endMs: 19800 }];
    expect(hasOwnMusic([{ fromMs: 3380, toMs: 11560 }, { fromMs: 12060, toMs: 19800 }], words)).toBe(true);
    expect(hasOwnMusic([{ fromMs: 10000, toMs: 19800 }], words)).toBe(false);
  });
});
