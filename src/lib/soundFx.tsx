// مؤثرات صوتية في أي لحظة من الفيديو، وخفض المزيكا لوحدها وقت الكلام (Ducking)
import { Html5Audio, Sequence, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { assetSrc, musicVolume } from "./media";

export type SoundFxItem = { id: string; src: string; atMs: number; volume: number; label?: string }; // atMs بتوقيت الفيديو النهائي، volume من 0 لـ 100

export const SoundFxLayer: React.FC<{ items: SoundFxItem[] }> = ({ items }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {(items ?? [])
        .filter((s) => s.src)
        .map((s) => (
          <Sequence key={s.id} from={Math.max(0, Math.round((s.atMs / 1000) * fps))}>
            <Html5Audio src={assetSrc(s.src)} volume={Math.max(0, Math.min(100, s.volume ?? 80)) / 100} />
          </Sequence>
        ))}
    </>
  );
};

// فترات الكلام من الكلمات (بالمللي ثانية)، والسكتات القصيرة بتتدمج عشان المزيكا متطلعش وتنزل مع كل كلمة
export const speechSpans = (words: Pick<Caption, "startMs" | "endMs">[], joinMs = 450): [number, number][] => {
  const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
  const out: [number, number][] = [];
  for (const w of sorted) {
    const last = out.at(-1);
    if (last && w.startMs - last[1] <= joinMs) last[1] = Math.max(last[1], w.endMs);
    else out.push([w.startMs, w.endMs]);
  }
  return out;
};

// المزيكا بتنزل لـ amount وقت الكلام، بانتقال ناعم (fadeMs) قبل الكلام وبعده
export const duckFactor = (ms: number, spans: [number, number][], amount = 0.35, fadeMs = 250) => {
  // أقرب فترة (بحث ثنائي)
  let lo = 0;
  let hi = spans.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (spans[mid][0] <= ms) lo = mid;
    else hi = mid - 1;
  }
  let d = Infinity;
  for (const i of [lo, lo + 1]) {
    const s = spans[i];
    if (!s) continue;
    if (ms >= s[0] && ms <= s[1]) return amount;
    d = Math.min(d, ms < s[0] ? s[0] - ms : ms - s[1]);
  }
  if (d >= fadeMs) return 1;
  return amount + (1 - amount) * (d / fadeMs);
};

// صوت المزيكا النهائي: الفيد في الأول والآخر + الخفض وقت الكلام
export const duckedMusicVolume = (f: number, total: number, base: number, fps: number, spans: [number, number][] | null) =>
  musicVolume(f, total, base, fps) * (spans?.length ? duckFactor((f / fps) * 1000, spans) : 1);
