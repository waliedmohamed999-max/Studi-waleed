// "المونتاج الاحترافي بضغطة": بيوزّع أحلى اللقطات من فيديوهاتك على كلامك كـ B-roll، ويختار الشكل
// دالة صافية: المدخلات تقييم اللقطات (من scripts/shots.mjs) وأجزاء المونتاج، والمخرج لقطات جاهزة
import type { Segment } from "./edl";
import type { Broll } from "../AutoEditVideo";

export type ShotWindow = { fromMs: number; toMs: number; score: number };
export type ExploredVideo = { path: string; durationMs: number; width?: number; height?: number; duplicateOf?: string; speechRatio: number; brightness: number; speech: { fromMs: number; toMs: number }[]; windows: ShotWindow[] };

// الفيديو الأساسي: اللي فيه كلام أكتر بالثواني (مش بالنسبة، عشان كليب قصير كله كلام ميغلبش فيديو طويل)، والباقي لقطات
const talkMs = (v: ExploredVideo) => v.speechRatio * v.durationMs;
export const pickMain = (videos: ExploredVideo[]) => {
  const main = [...videos].sort((a, b) => talkMs(b) - talkMs(a) || b.durationMs - a.durationMs)[0];
  return { main, footage: videos.filter((v) => v !== main) };
};

// أماكن اللقطات بتوقيت المونتاج: بعد أول 3.5 ثانية (الوش في الأول بيشد)، وكل ~6.5 ثانية لقطة، وكل لقطة جوه جزء واحد
export const brollSlots = (segments: Segment[], { startMs = 3500, gapMs = 6500, lenMs = 2800, endPadMs = 1500 } = {}) => {
  const total = segments.reduce((s, x) => s + (x.toMs - x.fromMs), 0);
  const slots: { fromMs: number; toMs: number }[] = [];
  let t = startMs;
  while (t + 1800 <= total - endPadMs) {
    const seg = segments.find((s) => t >= s.outMs && t < s.outMs + (s.toMs - s.fromMs));
    if (!seg) break;
    const left = seg.outMs + (seg.toMs - seg.fromMs) - t;
    if (left < 1800) {
      // الجزء ده فاضل فيه حتة صغيرة: نبدأ اللقطة في أول الجزء اللي بعده
      t = seg.outMs + (seg.toMs - seg.fromMs) + 200;
      continue;
    }
    const len = Math.min(lenMs, left - 100);
    const src = seg.fromMs + (t - seg.outMs);
    slots.push({ fromMs: Math.round(src), toMs: Math.round(src + len) });
    t += len + gapMs;
  }
  return slots;
};

// أحلى لقطات بالتبادل بين الفيديوهات (عشان التنوع)، وكل فيديو لقطاته بترتيبها الطبيعي
export const chooseShots = (footage: ExploredVideo[], count: number) => {
  const queues = footage.map((v) => [...v.windows].sort((a, b) => b.score - a.score).map((w) => ({ ...w, path: v.path })));
  const chosen: (ShotWindow & { path: string })[] = [];
  while (chosen.length < count && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && chosen.length < count) chosen.push(q.shift()!);
  }
  const byFile = footage.map((v) => chosen.filter((c) => c.path === v.path).sort((a, b) => a.fromMs - b.fromMs));
  const out: typeof chosen = [];
  for (let i = 0; out.length < chosen.length; i++) for (const list of byFile) if (list[i]) out.push(list[i]);
  return out;
};

export const planBrolls = (segments: Segment[], footage: ExploredVideo[], makeId: (i: number) => string): Broll[] => {
  const slots = brollSlots(segments);
  const shots = chooseShots(footage, slots.length);
  return shots.map((s, i) => {
    const slot = slots[i];
    return {
      id: makeId(i),
      fromMs: slot.fromMs,
      toMs: slot.toMs,
      query: "",
      description: `لقطة من فيديوهاتك (تقييم ${Math.round(s.score * 100)}٪)`,
      src: s.path,
      kind: "video" as const,
      credit: "",
      enabled: true,
      skip: 0,
      // اللقطة بتتوسّط في النافذة اللي اتقيّمت
      srcFromMs: Math.max(0, Math.round(s.fromMs + Math.max(0, s.toMs - s.fromMs - (slot.toMs - slot.fromMs)) / 2)),
    };
  });
};

// الفيديو فيه مزيكا خلفية من الأصل؟ (صوت عالي لفترات طويلة مفيهاش ولا كلمة)
// ساعتها مبنحطش مزيكا تانية فوقها عشان ميبقاش فيه مزيكتين بيتخانقوا
export const hasOwnMusic = (speech: { fromMs: number; toMs: number }[], words: { startMs: number; endMs: number }[]) => {
  if (!words.length) return false;
  let voiced = 0;
  let wordless = 0;
  for (const r of speech) {
    voiced += r.toMs - r.fromMs;
    for (let t = r.fromMs; t < r.toMs; t += 100) if (!words.some((w) => t >= w.startMs - 300 && t <= w.endMs + 300)) wordless += 100;
  }
  return voiced > 0 && wordless >= 3000 && wordless / voiced > 0.25;
};

// الشكل: فلتر الألوان حسب إضاءة الفيديو الأساسي، زووم مع القطع، كابشن، ومزيكا هادية تحت الكلام (لو الفيديو مفيهوش مزيكا)
export const proLook = (brightness: number, hasWords: boolean, music: string, ownMusic = false) => ({
  grade: brightness < 90 ? "bright" : brightness > 175 ? "cool" : "teal-orange",
  zoomStyle: "jump",
  faceFollow: "on",
  progressBar: "on",
  captions: hasWords ? "on" : "off",
  music: ownMusic ? "" : music || "library/music/lofi-chill.m4a",
  musicVolume: 12,
  duckMusic: "on",
});
