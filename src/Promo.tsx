// فيديو "إعلان": لوجو ← مشاهد بالصور ← Call to Action
// المرحلة 2: صور بحركة Ken Burns، لوجو، مزيكا خلفية، ومؤثرات صوت
import { Fragment } from "react";
import { AbsoluteFill, Html5Audio, Img, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { AnimatedText } from "./lib/AnimatedText";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { getTransition, totalDuration, transitionTiming, TRANSITION_FRAMES } from "./lib/transitions";
import { assetSrc, KenBurnsImage, musicVolume } from "./lib/media";

export type Slide = { image: string; text: string };

export type PromoProps = {
  format: string;
  font: string;
  animation: string;
  transition: string;
  secondsPerScene: number;
  kenBurns: string; // "on" | "off"
  brandName: string;
  logo: string;
  slides: Slide[];
  cta: string;
  ctaSub: string;
  music: string;
  musicVolume: number; // 0..100
  sfx: string; // "on" | "off"
  primary: string;
  secondary: string;
  textColor: string;
  accent: string;
};

const FPS = 30;

const sceneFrames = (p: PromoProps) => Math.round(Math.max(1, p.secondsPerScene) * FPS);
const sceneCount = (p: PromoProps) => 2 + p.slides.length; // مقدمة + المشاهد + النهاية

export const calculatePromo = (p: PromoProps) => {
  const { width, height } = getFormat(p.format);
  return { durationInFrames: totalDuration(sceneCount(p), sceneFrames(p), p.transition), fps: FPS, width, height };
};

// ===== المقدمة: اللوجو بينط واسم البراند تحته =====
const Intro: React.FC<{ p: PromoProps; duration: number }> = ({ p, duration }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const s = spring({ frame, fps, config: { damping: 9 } });
  const rotate = (1 - s) * -25;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${p.secondary}, ${p.primary} 75%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: unit * 0.05,
      }}
    >
      {p.logo && (
        <Img
          src={assetSrc(p.logo)}
          style={{ width: unit * 0.38, height: unit * 0.38, objectFit: "contain", transform: `scale(${s}) rotate(${rotate}deg)` }}
        />
      )}
      <AnimatedText
        text={p.brandName}
        animation={p.animation}
        duration={duration}
        delay={10}
        style={{ fontFamily: font.family, fontWeight: font.heavy, fontSize: unit * 0.11, color: p.textColor }}
      />
    </AbsoluteFill>
  );
};

// ===== مشهد صورة + كلام =====
const SlideScene: React.FC<{ p: PromoProps; slide: Slide; index: number; duration: number }> = ({ p, slide, index, duration }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const bar = spring({ frame: frame - 6, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: p.primary }}>
      {slide.image ? (
        <KenBurnsImage src={slide.image} duration={duration} index={index} enabled={p.kenBurns !== "off"} />
      ) : (
        <AbsoluteFill style={{ background: `linear-gradient(160deg, ${p.secondary}, ${p.primary})` }} />
      )}

      {/* تدرج غامق تحت عشان الكلام يبان على أي صورة */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.35) 40%, transparent 65%)" }} />

      {/* اللوجو صغير في الركن */}
      {p.logo && (
        <Img
          src={assetSrc(p.logo)}
          style={{ position: "absolute", top: unit * 0.05, right: unit * 0.05, width: unit * 0.14, height: unit * 0.14, objectFit: "contain" }}
        />
      )}

      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: `0 ${unit * 0.07}px ${height * 0.1}px` }}>
        <AnimatedText
          text={slide.text}
          animation={p.animation}
          duration={duration}
          delay={6}
          style={{
            fontFamily: font.family,
            fontWeight: font.heavy,
            fontSize: Math.min(unit * 0.095, (width * 0.88 * 3) / (Math.max(1, Array.from(slide.text).length) * 0.55)),
            lineHeight: 1.35,
            color: p.textColor,
            textShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        />
        <div style={{ marginTop: unit * 0.03, height: unit * 0.012, width: unit * 0.25 * bar, background: p.accent, borderRadius: 99 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ===== النهاية: زرار Call to Action بينبض =====
const Cta: React.FC<{ p: PromoProps; duration: number }> = ({ p, duration }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(frame / 5) * 0.03 * enter;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 60%, ${p.secondary}, ${p.primary} 75%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: unit * 0.06,
        padding: unit * 0.08,
      }}
    >
      {p.logo && <Img src={assetSrc(p.logo)} style={{ width: unit * 0.2, height: unit * 0.2, objectFit: "contain" }} />}
      <div
        dir="auto"
        style={{
          fontFamily: font.family,
          fontWeight: font.heavy,
          fontSize: unit * 0.1,
          color: p.primary,
          background: p.accent,
          padding: `${unit * 0.025}px ${unit * 0.08}px`,
          borderRadius: unit * 0.06,
          transform: `scale(${enter * pulse})`,
          boxShadow: `0 ${unit * 0.02}px ${unit * 0.06}px rgba(0,0,0,0.35)`,
          textAlign: "center",
        }}
      >
        {p.cta}
      </div>
      <AnimatedText
        text={p.ctaSub}
        animation="fadeUp"
        duration={duration}
        delay={14}
        style={{ fontFamily: font.family, fontWeight: font.heavy, fontSize: unit * 0.075, color: p.textColor }}
      />
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps> = (p) => {
  const { width, height, durationInFrames, fps } = useVideoConfig();
  const dur = sceneFrames(p);
  const presentation = getTransition(p.transition, width, height);
  const overlap = presentation ? TRANSITION_FRAMES : 0;
  const count = sceneCount(p);
  // بداية كل مشهد على التايملاين (عشان المؤثرات الصوتية تيجي في وقتها)
  const sceneStart = (i: number) => i * (dur - overlap);

  const scenes = [
    <Intro key="intro" p={p} duration={dur} />,
    ...p.slides.map((s, i) => <SlideScene key={`s${i}`} p={p} slide={s} index={i} duration={dur} />),
    <Cta key="cta" p={p} duration={dur} />,
  ];

  return (
    <AbsoluteFill style={{ background: p.primary }}>
      <TransitionSeries>
        {scenes.map((scene, i) => (
          <Fragment key={i}>
            {i > 0 && presentation && <TransitionSeries.Transition presentation={presentation} timing={transitionTiming} />}
            <TransitionSeries.Sequence durationInFrames={dur}>{scene}</TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>

      {/* ===== الصوت ===== */}
      {p.music && (
        <Html5Audio
          src={assetSrc(p.music)}
          loop
          volume={(f) => musicVolume(f, durationInFrames, Math.max(0, Math.min(100, p.musicVolume)) / 100, fps)}
        />
      )}

      {p.sfx !== "off" && (
        <>
          {/* pop مع اللوجو في الأول */}
          <Sequence from={2} durationInFrames={10}>
            <Html5Audio src={assetSrc("demo/pop.wav")} volume={0.7} />
          </Sequence>
          {/* whoosh مع كل انتقال */}
          {Array.from({ length: count - 1 }, (_, i) => (
            <Sequence key={i} from={Math.max(0, sceneStart(i + 1) - (overlap ? 4 : 2))} durationInFrames={20}>
              <Html5Audio src={assetSrc("demo/whoosh.wav")} volume={0.55} />
            </Sequence>
          ))}
          {/* ding مع زرار الـ CTA */}
          <Sequence from={sceneStart(count - 1) + overlap + 4} durationInFrames={45}>
            <Html5Audio src={assetSrc("demo/ding.wav")} volume={0.5} />
          </Sequence>
        </>
      )}
    </AbsoluteFill>
  );
};
