// مؤثرات صوتية في أي لحظة من الفيديو، وخفض المزيكا لوحدها وقت الكلام (Ducking)
import { Html5Audio, Sequence, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { assetSrc, musicVolume } from "./media";

// فترة صوت: من لحظة للحظة الصوت بيبقى نسبة من مستواه العادي (100 = عادي، 0 = ساكت، 200 = الضعف)
export type VolRange = { id: string; fromMs: number; toMs: number; volume: number };

// مقطع صوتي في أي لحظة من الفيديو (مؤثر، مزيكا، تعليق، أي ملف صوت)
export type SoundFxItem = {
  id: string;
  src: string;
  atMs: number; // بيبدأ فين في الفيديو النهائي
  volume: number; // 0..200
  label?: string;
  trimMs?: number; // بيبدأ من الثانية كام جوه الملف
  durMs?: number; // بيشتغل قد إيه (فاضي = لآخر الملف)
  fileMs?: number; // طول الملف كله (للتايملاين)
  fadeInMs?: number;
  fadeOutMs?: number;
  ranges?: VolRange[]; // فترات صوت جوه المقطع (بالنسبة لأول المقطع)
};

const RAMP_MS = 250;
// نسبة الصوت عند لحظة معينة بسبب الفترات: 1 = عادي. الدخول والخروج من الفترة بانتقال ناعم جوه حدودها
export const rangeGain = (ms: number, ranges: VolRange[] | undefined, rampMs = RAMP_MS) => {
  let best = 0;
  let gain = 1;
  for (const r of ranges ?? []) {
    if (ms < r.fromMs || ms > r.toMs || r.toMs <= r.fromMs) continue;
    const ramp = Math.min(rampMs, (r.toMs - r.fromMs) / 2);
    const w = ramp > 0 ? Math.min(1, (ms - r.fromMs) / ramp, (r.toMs - ms) / ramp) : 1;
    if (w > best) {
      best = w;
      gain = 1 + w * (Math.max(0, Math.min(200, r.volume)) / 100 - 1);
    }
  }
  return gain;
};

// مدة المقطع اللي هيشتغل فعلًا (لو معروفة)
export const clipMs = (s: SoundFxItem) => s.durMs ?? (s.fileMs !== undefined ? Math.max(0, s.fileMs - (s.trimMs ?? 0)) : undefined);

export const clipVolume = (s: SoundFxItem, ms: number) => {
  const base = Math.max(0, Math.min(200, s.volume ?? 80)) / 100;
  const len = clipMs(s);
  const fin = s.fadeInMs ? Math.min(1, ms / s.fadeInMs) : 1;
  const fout = s.fadeOutMs && len !== undefined ? Math.min(1, Math.max(0, (len - ms) / s.fadeOutMs)) : 1;
  return Math.max(0, base * fin * fout * rangeGain(ms, s.ranges));
};

export const SoundFxLayer: React.FC<{ items: SoundFxItem[] }> = ({ items }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {(items ?? [])
        .filter((s) => s.src)
        .map((s) => {
          const len = clipMs(s);
          return (
            <Sequence key={s.id} from={Math.max(0, Math.round((s.atMs / 1000) * fps))} durationInFrames={len !== undefined ? Math.max(1, Math.round((len / 1000) * fps)) : undefined}>
              <Html5Audio src={assetSrc(s.src)} trimBefore={s.trimMs ? Math.round((s.trimMs / 1000) * fps) : undefined} volume={(f) => clipVolume(s, (f / fps) * 1000)} />
            </Sequence>
          );
        })}
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
// (والفترات اللي انت محددها: علّي هنا ووطّي هنا)
export const duckedMusicVolume = (f: number, total: number, base: number, fps: number, spans: [number, number][] | null, ranges?: VolRange[]) =>
  musicVolume(f, total, base, fps) * (spans?.length ? duckFactor((f / fps) * 1000, spans) : 1) * rangeGain((f / fps) * 1000, ranges);
