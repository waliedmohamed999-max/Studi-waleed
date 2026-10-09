// مكتبة حركات النصوص: كومبوننت واحد وتختار نوع الحركة
import type { CSSProperties } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";

export const animations = {
  pop: "تكبير بنطة",
  slide: "دخول من الجنب",
  fadeUp: "ظهور لفوق",
  words: "كلمة كلمة",
  typewriter: "آلة كاتبة",
  reveal: "كشف من اليمين",
} as const;

export type AnimationKey = keyof typeof animations;

export const animationOptions = Object.entries(animations).map(([value, label]) => ({ value, label }));

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// تقسيم النص لحروف من غير ما نكسر الإيموجي
const graphemes = (text: string) => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
};

type Props = {
  text: string;
  animation: string;
  duration: number; // طول المشهد بالفريمات (عشان الحركات الطويلة تخلص في وقتها)
  delay?: number; // تأخير قبل ما الحركة تبدأ
  style?: CSSProperties;
};

export const AnimatedText: React.FC<Props> = ({ text, animation, duration, delay = 0, style }) => {
  const frame = useCurrentFrame() - delay;
  const { fps } = useVideoConfig();

  // dir="auto" بيخلي المتصفح يختار الاتجاه حسب أول حرف (عربي ← يمين، إنجليزي ← شمال)
  const base: CSSProperties = { margin: 0, textAlign: "center", ...style };

  switch (animation as AnimationKey) {
    case "slide": {
      const p = spring({ frame, fps, config: { damping: 16 } });
      return (
        <div dir="auto" style={{ ...base, opacity: p, transform: `translateX(${(1 - p) * 250}px)` }}>
          {text}
        </div>
      );
    }

    case "fadeUp": {
      const p = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
      return (
        <div dir="auto" style={{ ...base, opacity: p, transform: `translateY(${(1 - p) * 80}px)` }}>
          {text}
        </div>
      );
    }

    case "words": {
      // كل كلمة لوحدها، فالحروف العربية بتفضل متوصلة صح
      const words = text.split(/\s+/).filter(Boolean);
      const stagger = Math.max(2, Math.min(6, Math.floor((duration * 0.5) / Math.max(1, words.length))));
      return (
        <div
          dir="auto"
          style={{ ...base, display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: "0.25em" }}
        >
          {words.map((w, i) => {
            const p = spring({ frame: frame - i * stagger, fps, config: { damping: 12 } });
            return (
              <span key={i} style={{ display: "inline-block", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 40}px) scale(${0.6 + p * 0.4})` }}>
                {w}
              </span>
            );
          })}
        </div>
      );
    }

    case "typewriter": {
      // بنعرض جزء من النص كله مرة واحدة (مش حرف حرف في span)
      // عشان الحروف العربية تفضل متشبكة في بعض صح
      const chars = graphemes(text);
      const shown = Math.round(interpolate(frame, [0, Math.max(10, duration * 0.6)], [0, chars.length], clamp));
      const cursorOn = Math.floor(frame / 8) % 2 === 0 || shown < chars.length;
      return (
        <div dir="auto" style={base}>
          {chars.slice(0, shown).join("")}
          <span style={{ opacity: cursorOn ? 1 : 0, fontWeight: 400 }}>|</span>
        </div>
      );
    }

    case "reveal": {
      // قناع بيكشف النص من اليمين للشمال (اتجاه القراءة العربي)
      const p = interpolate(frame, [0, 22], [0, 100], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      return (
        <div dir="auto" style={{ ...base, clipPath: `inset(0 0 0 ${100 - p}%)` }}>
          {text}
        </div>
      );
    }

    case "pop":
    default: {
      const p = spring({ frame, fps, config: { damping: 10 } });
      return (
        <div dir="auto" style={{ ...base, transform: `scale(${p})` }}>
          {text}
        </div>
      );
    }
  }
};
