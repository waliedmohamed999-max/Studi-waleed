// فيديو "قصة نصوص": عنوان ← كل سطر مشهد لوحده ← جملة نهاية
// بيستخدم كل حاجة في المرحلة 1: الخطوط، المقاسات، الانتقالات، الحركات، والمدة المرنة
import { Fragment } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { AnimatedText } from "./lib/AnimatedText";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { getTransition, totalDuration, transitionTiming } from "./lib/transitions";

export type TextStoryProps = {
  format: string;
  font: string;
  animation: string;
  transition: string;
  secondsPerScene: number;
  title: string;
  lines: string[];
  outro: string;
  bgFrom: string;
  bgTo: string;
  textColor: string;
  accentColor: string;
};

type Scene = { kind: "title" | "line" | "outro"; text: string };

const FPS = 30;

const buildScenes = (p: TextStoryProps): Scene[] => [
  { kind: "title", text: p.title },
  ...p.lines.map((l) => l.trim()).filter(Boolean).map((text) => ({ kind: "line" as const, text })),
  { kind: "outro", text: p.outro },
];

const sceneFrames = (p: TextStoryProps) => Math.round(Math.max(1, p.secondsPerScene) * FPS);

// المدة والمقاس بيتحسبوا من الـ props: الاستوديو والتصدير الاتنين بيستخدموا الدالة دي
export const calculateTextStory = (p: TextStoryProps) => {
  const { width, height } = getFormat(p.format);
  return {
    durationInFrames: totalDuration(buildScenes(p).length, sceneFrames(p), p.transition),
    fps: FPS,
    width,
    height,
  };
};

// حجم الخط بيصغر لوحده لو الكلام طويل، عشان ميطلعش برا الشاشة
// الشاشات الطويلة (ريلز) بتستحمل سطور أكتر من العريضة (يوتيوب)
const fitSize = (text: string, preferred: number, width: number, height: number) => {
  const len = Math.max(1, Array.from(text).length);
  const maxLines = height > width ? 4 : height === width ? 3 : 2;
  return Math.min(preferred, (width * 0.85 * maxLines) / (len * 0.55));
};

const SceneView: React.FC<{ scene: Scene; index: number; p: TextStoryProps; duration: number }> = ({ scene, index, p, duration }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const font = getFont(p.font);
  const unit = Math.min(width, height);

  // كل مشهد خلفيته مختلفة شوية عشان الانتقال يبان
  const flipColors = index % 2 === 1;
  const angle = 135 + index * 40 + interpolate(frame, [0, duration], [0, 20]);
  const from = flipColors ? p.bgTo : p.bgFrom;
  const to = flipColors ? p.bgFrom : p.bgTo;

  const preferred = scene.kind === "title" ? unit * 0.13 : scene.kind === "outro" ? unit * 0.12 : unit * 0.1;
  const color = scene.kind === "outro" ? p.accentColor : p.textColor;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, ${from}, ${to})`,
        justifyContent: "center",
        alignItems: "center",
        padding: unit * 0.08,
      }}
    >
      {/* رقم المشهد صغير فوق (ماعدا العنوان والنهاية) */}
      {scene.kind === "line" && (
        <div
          style={{
            position: "absolute",
            top: height * 0.12,
            fontFamily: font.family,
            fontWeight: font.heavy,
            fontSize: unit * 0.05,
            color: p.accentColor,
            opacity: 0.9,
          }}
        >
          {String(index).padStart(2, "0")}
        </div>
      )}
      <AnimatedText
        text={scene.text}
        animation={p.animation}
        duration={duration}
        delay={4}
        style={{
          fontFamily: font.family,
          fontWeight: font.heavy,
          fontSize: fitSize(scene.text, preferred, width, height),
          lineHeight: 1.35,
          color,
          textShadow: "0 6px 30px rgba(0,0,0,0.25)",
        }}
      />
    </AbsoluteFill>
  );
};

// شريط تقدم رفيع تحت على طول الفيديو كله
const ProgressBar: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, height } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        height: Math.max(6, height * 0.006),
        width: `${(frame / (durationInFrames - 1)) * 100}%`,
        background: color,
      }}
    />
  );
};

export const TextStory: React.FC<TextStoryProps> = (p) => {
  const { width, height } = useVideoConfig();
  const scenes = buildScenes(p);
  const dur = sceneFrames(p);
  const presentation = getTransition(p.transition, width, height);

  return (
    <AbsoluteFill style={{ background: p.bgFrom }}>
      <TransitionSeries>
        {scenes.map((scene, i) => (
          <Fragment key={i}>
            {i > 0 && presentation && <TransitionSeries.Transition presentation={presentation} timing={transitionTiming} />}
            <TransitionSeries.Sequence durationInFrames={dur}>
              <SceneView scene={scene} index={i} p={p} duration={dur} />
            </TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>
      <ProgressBar color={p.accentColor} />
    </AbsoluteFill>
  );
};
