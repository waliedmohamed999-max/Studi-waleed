// "المونتاج الأوتوماتيك": حساب القطع (Edit Decision List)
// المدخلات:
//   speech: الفترات اللي فيها كلام فعلًا (من مستوى الصوت، دقيقة جدًا)
//   words:  الكلام كلمة كلمة من Whisper (توقيته بيتمط على السكوت، فبنظبطه بـ speech)
// المخرج: الأجزاء اللي هتتساب من الفيديو الأصلي، بالترتيب
// دالة صافية، فالمعاينة والتصدير بيحسبوا نفس النتيجة بالظبط
import type { Caption } from "@remotion/captions";

export type CutRange = { fromMs: number; toMs: number; reason: string; enabled: boolean; fromWord?: number; toWord?: number };
export type TimeRange = { fromMs: number; toMs: number };
export type Highlight = { title: string; hook: string; fromMs: number; toMs: number; fromWord?: number; toWord?: number };
export type Segment = TimeRange & { outMs: number }; // outMs = بيبدأ فين في الفيديو بعد المونتاج

// الكلمات اللي ملهاش معنى (إممم، آآآ، همم، uh...) بعد ما نوحّد الألف ونشيل التشكيل والترقيم
// ملحوظة: "اه" لوحدها مش بتتشال لأنها معناها "أيوه" في المصري
const FILLER = /^(ا*م{2,}|ا{2,}ه*|ه+م{2,}|ء+|u+h+|u+m+|h+m+|e+r+m+|m{2,}|a+h{2,}|e+h{2,})$/i;
export const normalizeWord = (t: string) =>
  t
    .trim()
    .replace(/[ً-ْـ]/g, "") // التشكيل والتطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/[.,،؟?!؛;:"'«»()\-…]/g, "");
export const isFiller = (t: string) => {
  const w = normalizeWord(t);
  return w.length > 0 && FILLER.test(w);
};

export type EdlInput = {
  words: Caption[];
  speech: TimeRange[];
  durationMs: number;
  silenceMs: number; // أي سكوت أطول من كده بيتقص
  padMs: number; // هامش حوالين الكلام عشان القطع ميبقاش حاد
  removeFillers: boolean;
  cuts: CutRange[]; // أجزاء Claude قال تتشال (إعادة، غلطة...)
  range?: TimeRange | null; // لو بنعمل مقطع واحد بس (ريلز من فيديو طويل)
  splits?: number[]; // نقط قص يدوي (بالمللي ثانية في الفيديو الأصلي)
};

// ===== أدوات الفترات =====
const sortMerge = (list: TimeRange[], joinGap = 0) => {
  const out: TimeRange[] = [];
  for (const r of [...list].sort((a, b) => a.fromMs - b.fromMs)) {
    const last = out.at(-1);
    if (last && r.fromMs - last.toMs <= joinGap) last.toMs = Math.max(last.toMs, r.toMs);
    else out.push({ ...r });
  }
  return out;
};
const subtract = (base: TimeRange[], remove: TimeRange[]) => {
  let result = base.map((r) => ({ ...r }));
  for (const cut of remove) {
    const next: TimeRange[] = [];
    for (const r of result) {
      if (cut.toMs <= r.fromMs || cut.fromMs >= r.toMs) next.push(r);
      else {
        if (cut.fromMs > r.fromMs) next.push({ fromMs: r.fromMs, toMs: cut.fromMs });
        if (cut.toMs < r.toMs) next.push({ fromMs: cut.toMs, toMs: r.toMs });
      }
    }
    result = next;
  }
  return result;
};

// ===== توقيت الكلمات الحقيقي =====
// Whisper ساعات بيحط الكلمة في السكوت اللي قبلها، فبنعمل "محاذاة" بسيطة:
// 1) كل كلمة بتروح لجزء الكلام اللي بتتقاطع معاه أكتر، ولو مفيش، لأول جزء كلام بعدها
// 2) جوه كل جزء، الكلمات بتتوزع على وقته حسب طول كل كلمة
export const refineWords = (words: Caption[], speech: TimeRange[]): Caption[] => {
  if (!speech.length || !words.length) return words;
  const assign: number[] = [];
  let minIdx = 0;
  words.forEach((w) => {
    let best = -1;
    let bestOverlap = 0;
    for (let k = minIdx; k < speech.length; k++) {
      const o = Math.min(w.endMs, speech[k].toMs) - Math.max(w.startMs, speech[k].fromMs);
      if (o > bestOverlap) {
        bestOverlap = o;
        best = k;
      }
      if (speech[k].fromMs > w.endMs) break;
    }
    if (best < 0) {
      best = speech.findIndex((s, k) => k >= minIdx && s.fromMs >= w.startMs);
      if (best < 0) best = speech.length - 1;
    }
    best = Math.max(best, minIdx); // الترتيب لازم يفضل زي ما هو
    assign.push(best);
    minIdx = best;
  });
  const result = words.map((w) => ({ ...w }));
  for (let k = 0; k < speech.length; k++) {
    const idx = assign.flatMap((a, i) => (a === k ? [i] : []));
    if (!idx.length) continue;
    const weights = idx.map((i) => Math.max(1, words[i].text.trim().length));
    const sum = weights.reduce((a, b) => a + b, 0);
    let t = speech[k].fromMs;
    const span = speech[k].toMs - speech[k].fromMs;
    idx.forEach((i, j) => {
      const d = (weights[j] / sum) * span;
      result[i].startMs = Math.round(t);
      result[i].endMs = Math.round(t + d);
      t += d;
    });
  }
  return result;
};

// الأجزاء اللي Claude حددها بأرقام الكلمات ← أوقات حقيقية (بعد المحاذاة)
export const resolveRange = <T extends TimeRange & { fromWord?: number; toWord?: number }>(r: T, words: Caption[]): T =>
  r.fromWord !== undefined && r.toWord !== undefined && words[r.fromWord] && words[r.toWord]
    ? { ...r, fromMs: words[r.fromWord].startMs, toMs: words[r.toWord].endMs }
    : r;

// كل كلمة: هتتساب ولا هتتشال، وليه
export const wordDecisions = ({ words, removeFillers, cuts, range }: EdlInput) =>
  words.map((w) => {
    const rng = range ? resolveRange(range as TimeRange & { fromWord?: number; toWord?: number }, words) : null;
    if (rng && (w.startMs < rng.fromMs - 1 || w.endMs > rng.toMs + 1)) return "outside" as const;
    if (removeFillers && isFiller(w.text)) return "filler" as const;
    if (cuts.some((c) => { const r = resolveRange(c, words); return c.enabled && w.startMs >= r.fromMs - 1 && w.endMs <= r.toMs + 1; })) return "cut" as const;
    return "keep" as const;
  });

export const buildSegments = (input: EdlInput): Segment[] => {
  const { durationMs, silenceMs, padMs, range } = input;
  const words = refineWords(input.words, input.speech);
  const end = durationMs || Math.max(0, ...words.map((w) => w.endMs), ...input.speech.map((s) => s.toMs));

  // 1) فين فيه كلام: من مستوى الصوت لو موجود، وإلا من الكلمات، وإلا الفيديو كله
  let base: TimeRange[] = input.speech.length
    ? input.speech
    : words.length
      ? words.map((w) => ({ fromMs: w.startMs, toMs: w.endMs }))
      : [{ fromMs: 0, toMs: end }];

  // 2) السكتات القصيرة بتفضل (طبيعية)، والطويلة بس اللي بتتقص، وبعدين هامش حوالين الكلام
  base = sortMerge(base, silenceMs);
  base = sortMerge(base.map((r) => ({ fromMs: Math.max(0, r.fromMs - padMs), toMs: Math.min(end, r.toMs + padMs) })));

  // 3) نشيل الإمم والأجزاء اللي Claude قال عليها
  const decisions = wordDecisions({ ...input, words });
  const removed = words.filter((_, i) => decisions[i] === "filler" || decisions[i] === "cut").map((w) => ({ fromMs: w.startMs, toMs: w.endMs }));
  removed.push(...input.cuts.filter((c) => c.enabled).map((c) => resolveRange(c, words)));
  let kept = subtract(base, sortMerge(removed));

  // 4) لو مقطع ريلز: بنقصّ على حدوده
  const rng = range ? resolveRange(range as TimeRange & { fromWord?: number; toWord?: number }, words) : null;
  if (rng) kept = kept.map((r) => ({ fromMs: Math.max(r.fromMs, rng.fromMs), toMs: Math.min(r.toMs, rng.toMs) })).filter((r) => r.toMs > r.fromMs);

  // 5) القص اليدوي: كل نقطة قص بتقسم المقطع اللي هي فيه لاتنين
  for (const s of [...(input.splits ?? [])].sort((a, b) => a - b)) {
    const i = kept.findIndex((r) => s > r.fromMs + 1 && s < r.toMs - 1);
    if (i >= 0) kept.splice(i, 1, { fromMs: kept[i].fromMs, toMs: s }, { fromMs: s, toMs: kept[i].toMs });
  }

  let out = 0;
  return kept
    .filter((s) => s.toMs - s.fromMs >= 150) // الحتت الصغيرة جدًا بتعمل تقطيع مزعج
    .map((s) => {
      const seg = { ...s, outMs: out };
      out += s.toMs - s.fromMs;
      return seg;
    });
};

export const totalMs = (segments: Segment[]) => segments.reduce((sum, s) => sum + (s.toMs - s.fromMs), 0);

// وقت بعد المونتاج ← وقته في الفيديو الأصلي (عشان نعرف القص اليدوي هيحصل فين)
export const outToSource = (outMs: number, segments: Segment[]) => {
  const s = segments.find((x) => outMs >= x.outMs && outMs < x.outMs + (x.toMs - x.fromMs));
  return s ? s.fromMs + (outMs - s.outMs) : null;
};

// وقت في الفيديو الأصلي ← وقته بعد المونتاج (أو null لو اتقص)
export const sourceToOut = (ms: number, segments: Segment[]) => {
  const s = segments.find((x) => ms >= x.fromMs && ms <= x.toMs);
  return s ? s.outMs + (ms - s.fromMs) : null;
};

// الكلام بعد المونتاج: كل كلمة اتسابت بتاخد وقتها الجديد (للكابشن)
export const remapWords = (input: EdlInput, segments: Segment[]): Caption[] => {
  const words = refineWords(input.words, input.speech);
  const decisions = wordDecisions({ ...input, words });
  const result: Caption[] = [];
  words.forEach((w, i) => {
    if (decisions[i] !== "keep") return;
    // بنستخدم نص الكلمة: لو حتة منها اتقصت (نادر)، بنقربها لأقرب مقطع
    const mid = (w.startMs + w.endMs) / 2;
    const seg = segments.find((s) => mid >= s.fromMs && mid <= s.toMs) ?? segments.find((s) => s.toMs > w.startMs && s.fromMs < w.endMs);
    if (!seg) return;
    const start = sourceToOut(Math.max(w.startMs, seg.fromMs), segments)!;
    const stop = sourceToOut(Math.min(w.endMs, seg.toMs), segments)!;
    result.push({ ...w, text: ` ${w.text.trim()}`, startMs: start, endMs: Math.max(start + 80, stop), timestampMs: null });
  });
  return result;
};

// فترة في الفيديو الأصلي ← فترتها بعد المونتاج (من أول جزء اتساب منها لآخر جزء)، أو null لو اتشالت كلها
export const rangeToOut = (r: TimeRange, segments: Segment[]): TimeRange | null => {
  let from = Infinity;
  let to = -Infinity;
  for (const s of segments) {
    const a = Math.max(r.fromMs, s.fromMs);
    const b = Math.min(r.toMs, s.toMs);
    if (b > a) {
      from = Math.min(from, s.outMs + (a - s.fromMs));
      to = Math.max(to, s.outMs + (b - s.fromMs));
    }
  }
  return to > from ? { fromMs: from, toMs: to } : null;
};
