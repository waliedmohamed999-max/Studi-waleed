// "مخرج الأفلام" (المرحلة 7): فيلم قصير من لقطات فيديو متولدة بالذكاء الاصطناعي
// + تعليق صوتي + كابشن + تلوين سينمائي + كارت نهاية
import { Fragment, useMemo } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type { Caption } from "@remotion/captions";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { assetSrc, fadeEnvelope, KenBurnsImage } from "./lib/media";
import { AnimatedText } from "./lib/AnimatedText";
import { CaptionsLayer } from "./CaptionedVideo";
import type { FilmProps, FilmShot } from "./film/types";

const FPS = 30;
const FADE = 10; // طول الانتقال الناعم بالفريمات
const END_CARD = 3; // ثواني كارت النهاية
const VOICE_DELAY = 0.15; // التعليق بيبدأ بعد بداية اللقطة بشوية عشان يبان طبيعي

const shotFrames = (s: FilmShot) => Math.round(Math.max(1, Number(s.duration) || 5) * FPS);
const overlapOf = (p: FilmProps) => (p.transition === "fade" ? FADE : 0);
const hasEndCard = (p: FilmProps) => !!(p.cta || p.logo);

// بداية كل لقطة بالفريمات
export const filmStarts = (p: FilmProps) => {
  const starts: number[] = [];
  let t = 0;
  for (const s of p.shots) {
    starts.push(t);
    t += shotFrames(s) - overlapOf(p);
  }
  return starts;
};

export const calculateFilm = (p: FilmProps) => {
  const { width, height } = getFormat(p.format);
  const shots = p.shots.reduce((sum, s) => sum + shotFrames(s), 0) - Math.max(0, p.shots.length - 1) * overlapOf(p);
  const end = hasEndCard(p) ? END_CARD * FPS - (p.shots.length ? overlapOf(p) : 0) : 0;
  return { durationInFrames: Math.max(FPS, shots + end), fps: FPS, width, height };
};

// كل كلمات التعليق الصوتي بتوقيتها في الفيلم كله (للكابشن)
export const filmCaptions = (p: FilmProps): Caption[] => {
  if (p.voiceProvider === "recorded") return p.recordedCaptions ?? [];
  if (p.voiceProvider === "none") return [];
  const starts = filmStarts(p);
  return p.shots.flatMap((s, i) => {
    if (!s.voice) return [];
    const offset = (starts[i] / FPS + VOICE_DELAY) * 1000;
    const words = s.words ?? [];
    return words.map((w) => ({
      ...w,
      // كل كلمة بمسافة قبلها (والسكوت بين اللقطات بيفصل الكابشن)
      text: ` ${w.text.trim()}`,
      startMs: w.startMs + offset,
      endMs: w.endMs + offset,
      timestampMs: null,
    }));
  });
};

// ===== التلوين السينمائي =====
const gradeFilter: Record<string, string> = {
  none: "none",
  warm: "sepia(0.18) saturate(1.12) contrast(1.05)",
  cool: "saturate(0.95) hue-rotate(-6deg) contrast(1.06) brightness(0.98)",
  "teal-orange": "contrast(1.1) saturate(1.2) sepia(0.08) hue-rotate(-4deg)",
  mono: "grayscale(1) contrast(1.15)",
};

// حبيبات الفيلم: نويز بيتغير كل فريم
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(random(`grain-${frame}`) * 1000);
  return (
    <AbsoluteFill style={{ opacity: 0.09, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ===== لقطة واحدة =====
const ShotView: React.FC<{ shot: FilmShot; index: number; p: FilmProps; fontFamily: string; heavy: number }> = ({ shot, index, p, fontFamily, heavy }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const unit = Math.min(width, height);
  const dur = shotFrames(shot);
  const textIn = spring({ frame: frame - 8, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ filter: gradeFilter[p.grade] ?? "none" }}>
        {shot.clip ? (
          <OffthreadVideo src={assetSrc(shot.clip)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : shot.keyframe ? (
          // لسه الفيديو متولدش: بنعرض الصورة بحركة بسيطة (تنفع كمعاينة أو كنسخة رخيصة)
          <KenBurnsImage src={shot.keyframe} duration={dur} index={index} />
        ) : (
          <AbsoluteFill style={{ background: "linear-gradient(160deg,#0f172a,#1e293b)", justifyContent: "center", alignItems: "center", padding: unit * 0.1 }}>
            <div dir="auto" style={{ fontFamily, color: "#94a3b8", fontSize: unit * 0.045, textAlign: "center", lineHeight: 1.6 }}>
              🎬 اللقطة {index + 1}
              <br />
              {shot.purpose || "لسه متولدتش"}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>

      {/* تظليل خفيف على الأطراف (vignette) */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)", pointerEvents: "none" }} />

      {/* كلام على الشاشة: lower third أنيق */}
      {shot.onScreenText && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: height * (p.letterbox === "on" ? 0.16 : 0.1) }}>
          <div
            dir="auto"
            style={{
              fontFamily,
              fontWeight: heavy,
              fontSize: unit * 0.06,
              color: p.textColor,
              textAlign: "center",
              padding: `0 ${unit * 0.07}px`,
              opacity: textIn * interpolate(frame, [dur - 12, dur - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              transform: `translateY(${(1 - textIn) * 20}px)`,
              textShadow: "0 4px 24px rgba(0,0,0,0.75)",
              letterSpacing: 0.5,
            }}
          >
            {shot.onScreenText}
            <div style={{ margin: `${unit * 0.015}px auto 0`, height: unit * 0.006, width: unit * 0.12 * textIn, background: p.accent, borderRadius: 99 }} />
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ===== كارت النهاية =====
const EndCard: React.FC<{ p: FilmProps; fontFamily: string; heavy: number }> = ({ p, fontFamily, heavy }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #1f2937, #000 75%)", justifyContent: "center", alignItems: "center", gap: unit * 0.05 }}>
      {p.logo && <Img src={assetSrc(p.logo)} style={{ width: unit * 0.24, height: unit * 0.24, objectFit: "contain", opacity: enter, transform: `scale(${0.85 + enter * 0.15})` }} />}
      {p.cta && (
        <div
          dir="auto"
          style={{
            fontFamily,
            fontWeight: heavy,
            fontSize: unit * 0.075,
            color: "#000",
            background: p.accent,
            padding: `${unit * 0.02}px ${unit * 0.07}px`,
            borderRadius: unit * 0.05,
            transform: `scale(${enter})`,
          }}
        >
          {p.cta}
        </div>
      )}
      {p.ctaSub && (
        <AnimatedText text={p.ctaSub} animation="fadeUp" duration={END_CARD * fps} delay={12} style={{ fontFamily, fontWeight: heavy, fontSize: unit * 0.05, color: p.textColor }} />
      )}
    </AbsoluteFill>
  );
};

export const FilmVideo: React.FC<FilmProps> = (p) => {
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const font = getFont(p.font);
  const starts = filmStarts(p);
  const captions = useMemo(() => (p.captions === "on" ? filmCaptions(p) : []), [p]);
  const fadePresentation = p.transition === "fade" ? fade() : null;

  // فترات التعليق الصوتي (عشان المزيكا توطى تحتها)
  const voiceSpans = useMemo(() => {
    if (p.voiceProvider === "recorded") return p.recordedVoice ? [[0, durationInFrames]] : [];
    return p.shots.map((s, i) => (s.voice ? [starts[i] + VOICE_DELAY * fps, starts[i] + (VOICE_DELAY + s.voiceDuration) * fps] : null)).filter(Boolean) as number[][];
  }, [p, starts, fps, durationInFrames]);

  const musicVol = (f: number) => {
    const base = Math.max(0, Math.min(100, p.musicVolume)) / 100;
    const fadeInOut = fadeEnvelope(f, durationInFrames, fps);
    // ducking: المزيكا بتوطى لـ 30% وقت الكلام، بانتقال ناعم
    const near = voiceSpans.some(([a, b]) => f >= a - 8 && f <= b + 8);
    const inside = voiceSpans.some(([a, b]) => f >= a && f <= b);
    const duck = inside ? 0.3 : near ? 0.6 : 1;
    return base * fadeInOut * duck;
  };

  const scenes = [
    ...p.shots.map((s, i) => ({ key: s.id, frames: shotFrames(s), node: <ShotView shot={s} index={i} p={p} fontFamily={font.family} heavy={font.heavy} /> })),
    ...(hasEndCard(p) ? [{ key: "end", frames: END_CARD * fps, node: <EndCard p={p} fontFamily={font.family} heavy={font.heavy} /> }] : []),
  ];

  // الشاشة العريضة بتتقص لنسبة السينما 2.39:1، والطولية بتاخد شرايط رفيعة
  const bar = p.letterbox !== "on" ? 0 : width > height ? Math.max(0, (height - width / 2.39) / 2) : height * 0.06;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <TransitionSeries>
        {scenes.map((sc, i) => (
          <Fragment key={sc.key}>
            {i > 0 && fadePresentation && <TransitionSeries.Transition presentation={fadePresentation} timing={linearTiming({ durationInFrames: FADE })} />}
            <TransitionSeries.Sequence durationInFrames={sc.frames}>{sc.node}</TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>

      {p.grain === "on" && <Grain />}

      {/* شرايط سينما سودا فوق وتحت */}
      {bar > 0 && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: bar, background: "#000" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: bar, background: "#000" }} />
        </>
      )}

      {captions.length > 0 && (
        <CaptionsLayer
          captions={captions}
          breakOnSilenceMs={350}
          look={{ captionStyle: p.captionStyle, position: "bottom", wordsTogetherMs: 1400, captionSize: 85, font: p.font, textColor: p.textColor, highlight: p.accent }}
        />
      )}

      {/* ===== الصوت ===== */}
      {p.voiceProvider === "recorded" && p.recordedVoice && <Html5Audio src={assetSrc(p.recordedVoice)} volume={p.voiceVolume / 100} />}
      {p.voiceProvider !== "recorded" &&
        p.voiceProvider !== "none" &&
        p.shots.map((s, i) =>
          s.voice ? (
            <Sequence key={s.id} from={Math.round(starts[i] + VOICE_DELAY * fps)}>
              <Html5Audio src={assetSrc(s.voice)} volume={p.voiceVolume / 100} />
            </Sequence>
          ) : null,
        )}
      {/* المؤثرات والجو: كل لقطة بصوتها، بـ fade صغير في الأول والآخر */}
      {p.shots.map((s, i) => {
        if (!s.sfx) return null;
        const len = shotFrames(s);
        const v = Math.max(0, Math.min(100, p.sfxVolume ?? 45)) / 100;
        return (
          <Sequence key={`sfx-${s.id}`} from={starts[i]} durationInFrames={len}>
            <Html5Audio src={assetSrc(s.sfx)} loop volume={(f) => v * Math.min(1, f / 6, (len - f) / 8)} />
          </Sequence>
        );
      })}
      {p.music && <Html5Audio src={assetSrc(p.music)} loop volume={musicVol} />}
    </AbsoluteFill>
  );
};
