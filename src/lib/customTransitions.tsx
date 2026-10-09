// انتقالات إضافية معمولة بإيدنا: زووم بلور، جليتش، Whip pan، فلاش أبيض، لفة
// كل انتقال بياخد progress من 0 لـ 1، والمشهد اللي خارج والداخل كل واحد بيتحرك بطريقته
import { AbsoluteFill, interpolate, random } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";

type Kind = "zoom" | "glitch" | "whip" | "flash" | "spin";
type P = { kind: Kind };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Custom: React.FC<TransitionPresentationComponentProps<P>> = ({ children, presentationDirection, presentationProgress: t, passedProps }) => {
  const exiting = presentationDirection === "exiting";
  let style: React.CSSProperties = {};
  let overlay: React.ReactNode = null;

  switch (passedProps.kind) {
    case "zoom": {
      // المشهد القديم بيقرّب ويضبّش، والجديد بيبدأ مقرّب ومضبّش ويرجع
      const k = exiting ? t : 1 - t;
      style = { transform: `scale(${exiting ? 1 + k * 0.6 : 1 + k * 0.4})`, filter: `blur(${k * 18}px)`, opacity: exiting ? interpolate(t, [0.5, 1], [1, 0], clamp) : interpolate(t, [0, 0.5], [0, 1], clamp) };
      break;
    }
    case "whip": {
      // سحبة سريعة جدًا مع بلور حركة
      const x = exiting ? -t * 100 : (1 - t) * 100;
      style = { transform: `translateX(${x}%)`, filter: `blur(${Math.sin(t * Math.PI) * 14}px)` };
      break;
    }
    case "spin": {
      const k = exiting ? t : 1 - t;
      style = { transform: `rotate(${(exiting ? 1 : -1) * k * 90}deg) scale(${1 - k * 0.5})`, opacity: exiting ? 1 - t : t };
      break;
    }
    case "flash": {
      // فلاش أبيض في النص، والمشهد بيتبدل تحته
      style = { opacity: exiting ? (t < 0.5 ? 1 : 0) : t >= 0.5 ? 1 : 0 };
      overlay = <AbsoluteFill style={{ background: "#fff", opacity: Math.sin(t * Math.PI) }} />;
      break;
    }
    case "glitch": {
      // تقطيع وإزاحة ألوان عشوائي (بس ثابت لكل فريم عشان التصدير يطلع زي المعاينة)
      const step = Math.floor(t * 12);
      const amp = Math.sin(t * Math.PI);
      const dx = (random(`gx-${step}`) - 0.5) * 60 * amp;
      const show = exiting ? t < 0.5 || random(`gs-${step}`) < 0.3 : t >= 0.5 || random(`gs-${step}`) < 0.3;
      style = {
        opacity: show ? 1 : 0,
        transform: `translateX(${dx}px)`,
        filter: amp > 0.2 ? `hue-rotate(${random(`gh-${step}`) * 180}deg) saturate(${1 + amp * 2}) contrast(${1 + amp * 0.5})` : "none",
      };
      if (amp > 0.3 && !exiting) {
        const y = random(`gy-${step}`) * 90;
        overlay = <AbsoluteFill style={{ top: `${y}%`, height: "6%", background: "rgba(255,255,255,0.12)", mixBlendMode: "difference" }} />;
      }
      break;
    }
  }

  return (
    <AbsoluteFill>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
      {overlay}
    </AbsoluteFill>
  );
};

export const custom = (kind: Kind): TransitionPresentation<P> => ({ component: Custom, props: { kind } });
export const customKinds: Kind[] = ["zoom", "glitch", "whip", "flash", "spin"];
