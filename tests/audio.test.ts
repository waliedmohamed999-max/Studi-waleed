// المقاطع الصوتية وفترات الصوت: الحسابات اللي المعاينة والتصدير بيعتمدوا عليها
import { describe, expect, it } from "vitest";
import { clipMs, clipVolume, duckedMusicVolume, rangeGain, type SoundFxItem, type VolRange } from "../src/lib/soundFx";

const r = (fromMs: number, toMs: number, volume: number): VolRange => ({ id: `${fromMs}`, fromMs, toMs, volume });

describe("فترات الصوت", () => {
  const ranges = [r(1000, 3000, 200), r(5000, 7000, 0)];
  it("برا الفترات الصوت عادي، وجواها النسبة اللي اخترتها", () => {
    expect(rangeGain(500, ranges)).toBe(1);
    expect(rangeGain(2000, ranges)).toBe(2);
    expect(rangeGain(6000, ranges)).toBe(0);
    expect(rangeGain(4000, ranges)).toBe(1);
  });
  it("الدخول والخروج من الفترة بالتدريج (مفيش قفزة)", () => {
    const start = rangeGain(1000, ranges);
    const mid = rangeGain(1125, ranges);
    expect(start).toBe(1);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(2);
  });
  it("فترة قصيرة جدًا: التدريج بيتقسم على طولها", () => {
    expect(rangeGain(1100, [r(1000, 1200, 0)])).toBeCloseTo(0, 5);
  });
  it("المزيكا: الفترات بتتضرب في الصوت العادي", () => {
    const fps = 30;
    const normal = duckedMusicVolume(60, 300, 0.5, fps, null);
    const louder = duckedMusicVolume(60, 300, 0.5, fps, null, [r(1000, 3000, 150)]);
    expect(louder).toBeCloseTo(normal * 1.5, 5);
  });
});

describe("المقاطع الصوتية", () => {
  const clip: SoundFxItem = { id: "a", src: "x.mp3", atMs: 2000, volume: 100, trimMs: 1000, fileMs: 6000, fadeInMs: 500, fadeOutMs: 1000 };
  it("المدة: من مكان البداية جوه الملف لآخره، أو المدة اللي اخترتها", () => {
    expect(clipMs(clip)).toBe(5000);
    expect(clipMs({ ...clip, durMs: 2000 })).toBe(2000);
    expect(clipMs({ id: "b", src: "y", atMs: 0, volume: 80 })).toBeUndefined();
  });
  it("بيدخل ويخرج بالتدريج", () => {
    expect(clipVolume(clip, 0)).toBe(0);
    expect(clipVolume(clip, 250)).toBeCloseTo(0.5);
    expect(clipVolume(clip, 2000)).toBe(1);
    expect(clipVolume(clip, 4500)).toBeCloseTo(0.5);
    expect(clipVolume(clip, 5000)).toBe(0);
  });
  it("الصوت لحد 200%، والفترات جوه المقطع شغالة", () => {
    const c = { ...clip, volume: 200, fadeInMs: undefined, fadeOutMs: undefined, ranges: [r(1000, 2000, 50)] };
    expect(clipVolume(c, 500)).toBe(2);
    expect(clipVolume(c, 1500)).toBe(1);
  });
});
