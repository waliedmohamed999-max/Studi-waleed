// الانتقالات بين المشاهد
import { Easing } from "remotion";
import { linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { custom } from "./customTransitions";

// طول الانتقال بالفريمات (نص ثانية على 30 فريم)
export const TRANSITION_FRAMES = 15;

export const transitionTiming = linearTiming({
  durationInFrames: TRANSITION_FRAMES,
  easing: Easing.inOut(Easing.cubic),
});

export const transitions = {
  fade: "تلاشي",
  slide: "سحب من اليمين",
  wipe: "مسح",
  flip: "قلب",
  clockWipe: "عقارب الساعة",
  iris: "دايرة بتكبر",
  pushCut: "زووم بفلاش",
  zoom: "زووم بلور",
  glitch: "جليتش",
  whip: "سحبة سريعة (Whip)",
  flash: "فلاش أبيض",
  spin: "لفة",
  none: "قطع مباشر (من غير انتقال)",
} as const;

export type TransitionKey = keyof typeof transitions;

export const transitionOptions = Object.entries(transitions).map(([value, label]) => ({ value, label }));

// بيرجع الانتقال المطلوب، أو null لو "قطع مباشر"
export const getTransition = (
  key: string,
  width: number,
  height: number,
): TransitionPresentation<any> | null => {
  switch (key as TransitionKey) {
    case "fade":
      return fade();
    case "slide":
      return slide({ direction: "from-right" });
    case "wipe":
      return wipe({ direction: "from-right" });
    case "flip":
      return flip({ direction: "from-right" });
    case "clockWipe":
      return clockWipe({ width, height });
    case "iris":
      return iris({ width, height });
    case "pushCut":
      return pushCut();
    case "zoom":
    case "glitch":
    case "whip":
    case "flash":
    case "spin":
      return custom(key as "zoom");
    default:
      return null;
  }
};

// صوت كل انتقال (الجليتش والفلاش ليهم صوت خاص، والباقي "ووش")
export const transitionSound = (key: string) => (key === "glitch" ? "demo/glitch.wav" : key === "flash" || key === "pushCut" ? "demo/impact.wav" : "demo/whoosh.wav");

// حساب طول الفيديو: كل انتقال بيدخّل المشهدين في بعض فبيقصّر الطول الكلي
export const totalDuration = (scenes: number, sceneFrames: number, transitionKey: string) => {
  const overlap = transitionKey === "none" ? 0 : TRANSITION_FRAMES;
  return Math.max(1, scenes * sceneFrames - Math.max(0, scenes - 1) * overlap);
};
