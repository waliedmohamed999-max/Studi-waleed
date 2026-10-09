// "مونتاج أوتوماتيك": فيديو بتتكلم فيه ← نسخة متقطعة ومتظبطة جاهزة للنشر
// قص السكتات والإمم والإعادات، زووم بيتغير مع القطع، كادر بيتبع الوش، لقطات B-roll، كابشن، عنوان شادد، ومزيكا
import { useMemo } from "react";
import { AbsoluteFill, Html5Audio, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { assetSrc, KenBurnsImage, musicVolume } from "./lib/media";
import { CaptionsLayer } from "./CaptionedVideo";
import { buildSegments, rangeToOut, refineWords, remapWords, resolveRange, sourceToOut, totalMs, type CutRange, type EdlInput, type Highlight, type Segment, type TimeRange } from "./autoedit/edl";
import { faceAt, faceFraming, type FacePoint } from "./autoedit/face";
import { gradeFilter } from "./lib/grades";
import { EmojiPops, type EmojiItem } from "./lib/emoji";

// لقطة B-roll: بتظهر فوق الكلام في فترة معينة (بتوقيت الفيديو الأصلي)، والصوت بيكمل عادي
export type Broll = TimeRange & {
  id: string;
  fromWord?: number;
  toWord?: number;
  query: string; // وصف البحث (إنجليزي)
  description: string; // وصف اللقطة بالعربي
  src: string;
  kind: "video" | "image" | "";
  credit: string;
  enabled: boolean;
  skip: number; // رقم النتيجة في البحث (عشان "لقطة تانية")
};

export type AutoEditProps = {
  media: string;
  mediaDuration: number; // ثواني
  mediaVolume: number;
  cleanAudio: string; // نسخة الصوت بعد التنضيف (لو موجودة بتتسمع بدل صوت الفيديو)
  words: Caption[]; // كلام الفيديو الأصلي بتوقيته
  speech: TimeRange[]; // الفترات اللي فيها كلام فعلًا (من مستوى الصوت)
  silenceMs: number;
  padMs: number;
  removeFillers: string; // on | off
  cuts: CutRange[];
  splits: number[]; // نقط القص اليدوي
  emphasis: TimeRange[]; // جمل مهمة (زووم عليها)
  highlights: Highlight[]; // مقاطع ريلز مقترحة
  range: TimeRange | null; // لو بنصدّر مقطع واحد بس
  hookTitle: string;
  showHook: string;
  zoomStyle: string; // jump | emphasis | none
  captions: string;
  captionStyle: string;
  position: string;
  captionSize: number;
  font: string;
  textColor: string;
  highlight: string;
  format: string;
  progressBar: string;
  music: string;
  musicVolume: number;
  // تتبع الوش
  faceTrack: FacePoint[];
  mediaWidth: number;
  mediaHeight: number;
  faceFollow: string; // on | off
  // لقطات B-roll
  brolls: Broll[];
  // فلتر الألوان
  grade: string;
  // إيموجي بينط على الكلمات المهمة (atMs بتوقيت الفيديو الأصلي)
  emojis: EmojiItem[];
  showEmojis: string; // on | off
  // كليبات زيادة قبل الدمج (المونتاج من كذا فيديو)
  clips: string[];
  // شيل الخلفية
  cutout: string; // فيديو الشخص من غير خلفية (WebM شفاف)
  cutoutBg: string; // off | blur | color | image
  cutoutColor: string;
  cutoutImage: string;
  // الترجمة والدبلجة
  dubAudio: string; // الصوت المدبلج (بنفس توقيت الأصل)
  dubWords: Caption[]; // كلام الدبلجة بتوقيته (للكابشن)
  dubLang: string;
  dubVideo: string; // نسخة الفيديو اللي الشفايف فيها ماشية مع الدبلجة
  useDub: string; // on | off
};

// الكلام بتوقيت الفيديو الأصلي ← بتوقيت المونتاج (للكابشن المدبلج): الكلمة بتفضل لو نصها جوه جزء متساب
export const remapPlainWords = (words: Caption[], segments: Segment[]): Caption[] =>
  words.flatMap((w) => {
    const mid = (w.startMs + w.endMs) / 2;
    const seg = segments.find((s) => mid >= s.fromMs && mid <= s.toMs);
    if (!seg) return [];
    const start = sourceToOut(Math.max(w.startMs, seg.fromMs), segments)!;
    const stop = sourceToOut(Math.min(w.endMs, seg.toMs), segments)!;
    return [{ ...w, text: ` ${w.text.trim()}`, startMs: start, endMs: Math.max(start + 80, stop), timestampMs: null }];
  });

const dubOn = (p: AutoEditProps) => p.useDub === "on" && !!p.dubAudio;

const FPS = 30;

export const edlInput = (p: AutoEditProps): EdlInput => ({
  words: p.words ?? [],
  speech: p.speech ?? [],
  durationMs: (Number(p.mediaDuration) || 0) * 1000,
  silenceMs: Number(p.silenceMs) || 600,
  padMs: Number(p.padMs) || 120,
  removeFillers: p.removeFillers !== "off",
  cuts: p.cuts ?? [],
  range: p.range,
  splits: p.splits ?? [],
});

export const autoEditSegments = (p: AutoEditProps) => buildSegments(edlInput(p));

export const calculateAutoEdit = (p: AutoEditProps) => {
  const { width, height } = getFormat(p.format);
  const ms = totalMs(autoEditSegments(p));
  return { durationInFrames: Math.max(FPS, Math.round((ms / 1000) * FPS)), fps: FPS, width, height };
};

// ===== مقطع واحد من الفيديو الأصلي، بالزووم بتاعه =====
const SegmentView: React.FC<{ p: AutoEditProps; seg: Segment; index: number; frames: number }> = ({ p, seg, index, frames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // الكادر بيتبع الوش (لو اتعمل تتبع)
  const follow = p.faceFollow !== "off" && (p.faceTrack ?? []).length > 0;
  const face = follow ? faceAt(p.faceTrack, seg.fromMs + (frame / fps) * 1000) : null;
  const framing = faceFraming({ srcW: p.mediaWidth, srcH: p.mediaHeight, outW: width, outH: height, face });

  // الزووم: jump = بيتبدل مع كل قطع (زي اليوتيوبرز)، emphasis = بيقرّب على الجمل المهمة بس
  const words = refineWords(p.words ?? [], p.speech ?? []);
  const important = (p.emphasis ?? []).map((e) => resolveRange(e as TimeRange & { fromWord?: number; toWord?: number }, words)).some((e) => e.fromMs < seg.toMs && e.toMs > seg.fromMs);
  const target = p.zoomStyle === "jump" ? (index % 2 ? 1.12 : 1) : p.zoomStyle === "emphasis" ? (important ? 1.18 : 1) : 1;
  const punch = p.zoomStyle === "emphasis" && important ? spring({ frame, fps, config: { damping: 200 }, durationInFrames: 8 }) : 1;
  // حركة بطيئة جدًا جوه كل مقطع عشان الصورة متبقاش ميتة
  const drift = interpolate(frame, [0, Math.max(1, frames)], [0, 0.02]);
  const scale = 1 + (target - 1) * punch + drift;

  // fade سريع (3 فريم ≈ 0.1 ثانية) في أول وآخر كل مقطع، عشان القطع ميعملش "تِك"
  const base = Math.max(0, Math.min(100, p.mediaVolume ?? 100)) / 100;
  const vol = (f: number) => base * Math.max(0, Math.min(1, f / 3, (frames - f) / 3));
  const trimBefore = Math.round((seg.fromMs / 1000) * fps);

  // الصورة: الفيديو المدبلج (لو الشفايف اتحركت)، أو الشخص من غير خلفية، أو الأصل
  const dub = dubOn(p);
  const cut = !dub || !p.dubVideo ? (p.cutout && p.cutoutBg !== "off" ? p.cutout : "") : "";
  const visual = dub && p.dubVideo ? p.dubVideo : cut || p.media;
  // الصوت: الدبلجة، أو الصوت النضيف، أو صوت الفيديو الأصلي (لو الصورة جاية من ملف تاني)
  const audio = dub ? p.dubAudio : p.cleanAudio || (visual !== p.media ? p.media : "");
  const fit: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: framing.objectPosition };

  return (
    <AbsoluteFill style={{ filter: gradeFilter(p.grade) }}>
      {/* الخلفية ورا الشخص (لما الخلفية الأصلية تتشال) */}
      {cut && p.cutoutBg === "blur" && (
        <AbsoluteFill style={{ filter: "blur(28px) brightness(0.75)", transform: "scale(1.15)" }}>
          <OffthreadVideo src={assetSrc(p.media)} trimBefore={trimBefore} muted style={fit} />
        </AbsoluteFill>
      )}
      {cut && p.cutoutBg === "color" && <AbsoluteFill style={{ background: p.cutoutColor || "#111827" }} />}
      {cut && p.cutoutBg === "image" && p.cutoutImage && <KenBurnsImage src={p.cutoutImage} duration={frames} index={index} />}
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: framing.origin }}>
        <OffthreadVideo src={assetSrc(visual)} trimBefore={trimBefore} transparent={!!cut} muted={!!audio} volume={audio ? 0 : vol} style={fit} />
      </AbsoluteFill>
      {audio && <Html5Audio src={assetSrc(audio)} trimBefore={trimBefore} volume={vol} />}
    </AbsoluteFill>
  );
};

// ===== لقطة B-roll فوق الكلام: بتدخل بزووم خفيف وتطلع بـ fade =====
const BrollView: React.FC<{ b: Broll; frames: number; index: number }> = ({ b, frames, index }) => {
  const frame = useCurrentFrame();
  const fade = Math.min(1, frame / 5, (frames - frame) / 5);
  const scale = interpolate(frame, [0, frames], [1.06, 1]);
  return (
    <AbsoluteFill style={{ opacity: Math.max(0, fade), background: "#000" }}>
      {b.kind === "video" ? (
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <OffthreadVideo src={assetSrc(b.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : (
        <KenBurnsImage src={b.src} duration={frames} index={index} />
      )}
    </AbsoluteFill>
  );
};

// فترات الـ B-roll بعد المونتاج (اللي ليها لقطة ومش متلغية)
export const brollSpans = (p: AutoEditProps, segments: Segment[]) => {
  const words = refineWords(p.words ?? [], p.speech ?? []);
  return (p.brolls ?? [])
    .filter((b) => b.enabled && b.src)
    .map((b) => ({ b, out: rangeToOut(resolveRange(b, words), segments) }))
    .filter((x): x is { b: Broll; out: TimeRange } => !!x.out && x.out.toMs - x.out.fromMs >= 500);
};

export const AutoEditVideo: React.FC<AutoEditProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const input = edlInput(p);
  const segments = useMemo(() => buildSegments(input), [p]);
  const captions = useMemo(
    () => (p.captions !== "on" ? [] : dubOn(p) && (p.dubWords ?? []).length ? remapPlainWords(p.dubWords, segments) : remapWords(input, segments)),
    [p, segments],
  );
  // الإيموجي بتوقيت المونتاج (اللي كلمته اتقصت بيتشال)
  const emojiItems = useMemo(() => {
    if (p.showEmojis === "off") return [];
    const words = refineWords(p.words ?? [], p.speech ?? []);
    return (p.emojis ?? []).flatMap((e) => {
      const src = e.fromWord !== undefined && words[e.fromWord] ? words[e.fromWord].startMs : e.atMs;
      const out = sourceToOut(src + 1, segments);
      return out === null ? [] : [{ atMs: out, emoji: e.emoji }];
    });
  }, [p, segments]);
  const brolls = useMemo(() => brollSpans(p, segments), [p, segments]);

  if (!p.media) {
    return (
      <AbsoluteFill style={{ background: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: font.family, color: "#94a3b8", fontSize: unit * 0.05, textAlign: "center", padding: unit * 0.1 }}>ارفع فيديو بتتكلم فيه من المحتوى ✂️</div>
      </AbsoluteFill>
    );
  }

  // لو بنعمل مقطع ريلز، العنوان الشادد بتاعه هو اللي بيظهر
  const hook = p.range ? ((p.highlights ?? []).find((h) => h.fromMs === p.range!.fromMs && h.toMs === p.range!.toMs)?.hook ?? p.hookTitle) : p.hookTitle;
  const hookIn = spring({ frame, fps, config: { damping: 14 } });
  const hookOut = interpolate(frame, [fps * 3, fps * 3.4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {segments.map((seg, i) => {
        const from = Math.round((seg.outMs / 1000) * fps);
        const to = Math.round(((seg.outMs + seg.toMs - seg.fromMs) / 1000) * fps);
        return (
          <Sequence key={`${seg.fromMs}-${i}`} from={from} durationInFrames={Math.max(1, to - from)} premountFor={fps}>
            <SegmentView p={p} seg={seg} index={i} frames={to - from} />
          </Sequence>
        );
      })}

      {/* لقطات B-roll فوق الكلام (الصوت بيكمل تحتها) */}
      {brolls.map(({ b, out }, i) => {
        const from = Math.round((out.fromMs / 1000) * fps);
        const frames = Math.max(1, Math.round((out.toMs / 1000) * fps) - from);
        return (
          <Sequence key={b.id} from={from} durationInFrames={frames} premountFor={fps}>
            <BrollView b={b} frames={frames} index={i} />
          </Sequence>
        );
      })}

      {/* عنوان شادد في أول 3 ثواني */}
      {p.showHook !== "off" && hook && frame < fps * 3.5 && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: height * 0.09 }}>
          <div
            dir="auto"
            style={{
              fontFamily: font.family,
              fontWeight: font.heavy,
              fontSize: unit * 0.062,
              color: "#000",
              background: p.highlight,
              padding: `${unit * 0.015}px ${unit * 0.04}px`,
              borderRadius: unit * 0.02,
              maxWidth: width * 0.86,
              textAlign: "center",
              lineHeight: 1.35,
              opacity: hookOut,
              transform: `scale(${0.8 + hookIn * 0.2}) rotate(${(1 - hookIn) * -3}deg)`,
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            }}
          >
            {hook}
          </div>
        </AbsoluteFill>
      )}

      {emojiItems.length > 0 && <EmojiPops items={emojiItems} />}

      {captions.length > 0 && (
        <CaptionsLayer
          captions={captions}
          breakOnSilenceMs={500}
          look={{ captionStyle: p.captionStyle, position: p.position, wordsTogetherMs: 1100, captionSize: p.captionSize, font: p.font, textColor: p.textColor, highlight: p.highlight }}
        />
      )}

      {/* شريط تقدم رفيع تحت (بيزوّد نسبة المشاهدة للآخر) */}
      {p.progressBar === "on" && (
        <div style={{ position: "absolute", bottom: 0, right: 0, height: Math.max(6, height * 0.006), width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`, background: p.highlight }} />
      )}

      {p.music && <Html5Audio src={assetSrc(p.music)} loop volume={(f) => musicVolume(f, durationInFrames, Math.max(0, Math.min(100, p.musicVolume)) / 100, fps)} />}
    </AbsoluteFill>
  );
};

export { sourceToOut };
