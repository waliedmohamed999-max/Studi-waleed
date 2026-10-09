// شكل كل نوع مشهد على الشاشة
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedText } from "../lib/AnimatedText";
import { assetSrc, KenBurnsImage } from "../lib/media";
import type { Scene, SceneType } from "./defs";

// إعدادات المشروع اللي كل المشاهد محتاجاها
export type Theme = {
  fontFamily: string;
  heavy: number;
  animation: string;
  logo: string;
  primary: string;
  secondary: string;
  textColor: string;
  accent: string;
};

type SceneProps = { scene: Scene; theme: Theme; index: number; duration: number };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// مقاس الشاشة: unit = أصغر بعد، عشان نفس التصميم يشتغل على كل المقاسات
const useUnit = () => {
  const { width, height } = useVideoConfig();
  return { width, height, unit: Math.min(width, height) };
};

// حجم خط بيصغر لو الكلام طويل
const fit = (text: string, preferred: number, width: number, height: number) => {
  const len = Math.max(1, Array.from(text).length);
  const maxLines = height > width ? 4 : height === width ? 3 : 2;
  return Math.min(preferred, (width * 0.85 * maxLines) / (len * 0.55));
};

const anim = (scene: Scene, theme: Theme) => scene.animation || theme.animation;

// ===== الإطار المشترك: الخلفية + اللوجو =====
const SceneFrame: React.FC<SceneProps & { children: React.ReactNode; align?: "center" | "bottom"; hideLogo?: boolean }> = ({
  scene,
  theme,
  index,
  duration,
  children,
  align = "center",
  hideLogo,
}) => {
  const frame = useCurrentFrame();
  const { height, unit } = useUnit();
  const flip = index % 2 === 1;
  const angle = 135 + index * 40 + interpolate(frame, [0, duration], [0, 20]);
  const bg = str(scene.type === "imageText" ? scene.image : scene.bgImage);
  const video = scene.type === "video" ? str(scene.video) : "";
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${flip ? theme.secondary : theme.primary}, ${flip ? theme.primary : theme.secondary})` }}>
      {video && (
        <>
          <OffthreadVideo
            src={assetSrc(video)}
            trimBefore={Math.round(Math.max(0, Number(scene.trimStart) || 0) * fps)}
            muted={!Number(scene.videoVolume)}
            volume={Math.max(0, Math.min(100, Number(scene.videoVolume) || 0)) / 100}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {str(scene.text) && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 35%, transparent 60%)" }} />}
        </>
      )}
      {bg && !video && (
        <>
          <KenBurnsImage src={bg} duration={duration} index={index} />
          <AbsoluteFill
            style={{
              background:
                align === "bottom"
                  ? "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.35) 40%, transparent 65%)"
                  : "rgba(0,0,0,0.55)",
            }}
          />
        </>
      )}
      {theme.logo && !hideLogo && (
        <Img
          src={assetSrc(theme.logo)}
          style={{ position: "absolute", top: unit * 0.05, right: unit * 0.05, width: unit * 0.12, height: unit * 0.12, objectFit: "contain" }}
        />
      )}
      <AbsoluteFill
        style={{
          justifyContent: align === "bottom" ? "flex-end" : "center",
          alignItems: "center",
          padding: align === "bottom" ? `0 ${unit * 0.07}px ${height * 0.1}px` : unit * 0.08,
          gap: unit * 0.04,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ===== عنوان =====
const TitleScene: React.FC<SceneProps> = (p) => {
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const title = str(scene.title);
  return (
    <SceneFrame {...p}>
      <AnimatedText
        text={title}
        animation={anim(scene, theme)}
        duration={duration}
        delay={4}
        style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(title, unit * 0.13, width, height), lineHeight: 1.3, color: theme.textColor }}
      />
      {str(scene.subtitle) && (
        <AnimatedText
          text={str(scene.subtitle)}
          animation="fadeUp"
          duration={duration}
          delay={16}
          style={{ fontFamily: theme.fontFamily, fontWeight: 400, fontSize: fit(str(scene.subtitle), unit * 0.055, width, height), color: theme.accent }}
        />
      )}
    </SceneFrame>
  );
};

// ===== نص =====
const TextScene: React.FC<SceneProps> = (p) => {
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const text = str(scene.text);
  return (
    <SceneFrame {...p}>
      <AnimatedText
        text={text}
        animation={anim(scene, theme)}
        duration={duration}
        delay={4}
        style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(text, unit * 0.1, width, height), lineHeight: 1.35, color: theme.textColor, textShadow: "0 6px 30px rgba(0,0,0,0.25)" }}
      />
    </SceneFrame>
  );
};

// ===== صورة + كلام =====
const ImageTextScene: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const text = str(scene.text);
  const bar = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  return (
    <SceneFrame {...p} align="bottom">
      <AnimatedText
        text={text}
        animation={anim(scene, theme)}
        duration={duration}
        delay={6}
        style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(text, unit * 0.095, width, height), lineHeight: 1.35, color: theme.textColor, textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
      />
      <div style={{ height: unit * 0.012, width: unit * 0.25 * bar, background: theme.accent, borderRadius: 99 }} />
    </SceneFrame>
  );
};

// ===== فيديو + كلام =====
const VideoScene: React.FC<SceneProps> = (p) => {
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const text = str(scene.text);
  return (
    <SceneFrame {...p} align="bottom">
      {text && (
        <AnimatedText
          text={text}
          animation={anim(scene, theme)}
          duration={duration}
          delay={6}
          style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(text, unit * 0.085, width, height), lineHeight: 1.35, color: theme.textColor, textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
        />
      )}
    </SceneFrame>
  );
};

// ===== قايمة نقاط: كل نقطة بتدخل ورا التانية =====
const BulletsScene: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const heading = str(scene.heading);
  const items = (Array.isArray(scene.items) ? scene.items : []).map(String).filter((s) => s.trim());
  const stagger = Math.max(5, Math.min(12, Math.floor((duration * 0.5) / Math.max(1, items.length))));
  const itemSize = Math.min(unit * 0.065, ...items.map((t) => fit(t, unit * 0.065, width * 0.85, height)));

  return (
    <SceneFrame {...p}>
      {heading && (
        <AnimatedText
          text={heading}
          animation={anim(scene, theme)}
          duration={duration}
          delay={2}
          style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(heading, unit * 0.09, width, height), color: theme.textColor }}
        />
      )}
      <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: unit * 0.025, width: "100%", maxWidth: unit * 0.9 }}>
        {items.map((item, i) => {
          const s = spring({ frame: frame - 14 - i * stagger, fps, config: { damping: 14 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: unit * 0.03,
                opacity: s,
                transform: `translateX(${(1 - s) * 120}px)`,
                background: "rgba(255,255,255,0.08)",
                borderRadius: unit * 0.025,
                padding: `${unit * 0.022}px ${unit * 0.035}px`,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: unit * 0.06,
                  height: unit * 0.06,
                  borderRadius: "50%",
                  background: theme.accent,
                  color: theme.primary,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: theme.fontFamily,
                  fontWeight: theme.heavy,
                  fontSize: unit * 0.035,
                }}
              >
                ✓
              </div>
              <div style={{ fontFamily: theme.fontFamily, fontWeight: 700, fontSize: itemSize, color: theme.textColor, lineHeight: 1.35 }}>{item}</div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

// ===== رقم بيعد من صفر =====
const StatScene: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const target = Number(scene.value) || 0;
  const progress = interpolate(frame, [6, Math.max(20, duration * 0.6)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const shown = Math.round(target * progress).toLocaleString("en-US");
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const label = str(scene.label);
  const numberText = `${str(scene.prefix)}${shown}${str(scene.suffix)}`;

  return (
    <SceneFrame {...p}>
      <div
        dir="ltr"
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: theme.heavy,
          fontSize: Math.min(unit * 0.24, (width * 0.85) / (Array.from(`${str(scene.prefix)}${target.toLocaleString("en-US")}${str(scene.suffix)}`).length * 0.6)),
          color: theme.accent,
          transform: `scale(${pop})`,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {numberText}
      </div>
      {label && (
        <AnimatedText
          text={label}
          animation={anim(scene, theme)}
          duration={duration}
          delay={12}
          style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: fit(label, unit * 0.08, width, height), color: theme.textColor }}
        />
      )}
    </SceneFrame>
  );
};

// ===== اقتباس =====
const QuoteScene: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, unit } = useUnit();
  const { scene, theme, duration } = p;
  const quote = str(scene.quote);
  const markOpacity = interpolate(frame, [0, 15], [0, 0.9], clamp);

  return (
    <SceneFrame {...p}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: unit * 0.3, lineHeight: 0.6, color: theme.accent, opacity: markOpacity, height: unit * 0.14 }}>”</div>
      <AnimatedText
        text={quote}
        animation={anim(scene, theme)}
        duration={duration}
        delay={6}
        style={{ fontFamily: theme.fontFamily, fontWeight: 700, fontSize: fit(quote, unit * 0.08, width, height), lineHeight: 1.5, color: theme.textColor }}
      />
      {str(scene.author) && (
        <AnimatedText
          // ‏ = علامة اتجاه يمين، بتخلي الشرطة تيجي قبل الاسم في القراية العربي
          text={`‏— ${str(scene.author)}`}
          animation="fadeUp"
          duration={duration}
          delay={Math.min(duration * 0.5, 30)}
          style={{ fontFamily: theme.fontFamily, fontWeight: 400, fontSize: unit * 0.05, color: theme.accent }}
        />
      )}
    </SceneFrame>
  );
};

// ===== زرار نهاية بينبض =====
const CtaScene: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { unit } = useUnit();
  const { scene, theme, duration } = p;
  const enter = spring({ frame: frame - 4, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(frame / 5) * 0.03 * enter;

  return (
    <SceneFrame {...p} hideLogo>
      {theme.logo && <Img src={assetSrc(theme.logo)} style={{ width: unit * 0.2, height: unit * 0.2, objectFit: "contain" }} />}
      <div
        dir="auto"
        style={{
          fontFamily: theme.fontFamily,
          fontWeight: theme.heavy,
          fontSize: unit * 0.1,
          color: theme.primary,
          background: theme.accent,
          padding: `${unit * 0.025}px ${unit * 0.08}px`,
          borderRadius: unit * 0.06,
          transform: `scale(${enter * pulse})`,
          boxShadow: `0 ${unit * 0.02}px ${unit * 0.06}px rgba(0,0,0,0.35)`,
          textAlign: "center",
        }}
      >
        {str(scene.text)}
      </div>
      {str(scene.sub) && (
        <AnimatedText
          text={str(scene.sub)}
          animation="fadeUp"
          duration={duration}
          delay={14}
          style={{ fontFamily: theme.fontFamily, fontWeight: theme.heavy, fontSize: unit * 0.07, color: theme.textColor }}
        />
      )}
    </SceneFrame>
  );
};

export const sceneRenderers: Record<SceneType, React.FC<SceneProps>> = {
  title: TitleScene,
  text: TextScene,
  imageText: ImageTextScene,
  video: VideoScene,
  bullets: BulletsScene,
  stat: StatScene,
  quote: QuoteScene,
  cta: CtaScene,
};
