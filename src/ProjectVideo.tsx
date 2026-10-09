// فيديو "مشروع حر": بيتبني بالكامل من قايمة المشاهد اللي بتعملها في الاستوديو
import { Fragment } from "react";
import { AbsoluteFill, Html5Audio, Sequence, useVideoConfig } from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { getTransition, transitionTiming, TRANSITION_FRAMES } from "./lib/transitions";
import { assetSrc, musicVolume } from "./lib/media";
import type { Scene } from "./scenes/defs";
import { sceneRenderers, type Theme } from "./scenes/renderers";
import { LayersView } from "./scenes/layers";

export type ProjectProps = {
  format: string;
  font: string;
  animation: string;
  transition: string;
  logo: string;
  music: string;
  musicVolume: number;
  voiceover: string; // تعليق صوتي (المرحلة 4)
  voiceVolume: number;
  sfx: string;
  primary: string;
  secondary: string;
  textColor: string;
  accent: string;
  scenes: Scene[];
};

const FPS = 30;

export const sceneFrames = (s: Scene) => Math.round(Math.max(1, Number(s.duration) || 3) * FPS);
const overlapOf = (p: ProjectProps) => (p.transition === "none" ? 0 : TRANSITION_FRAMES);

// بداية كل مشهد على التايملاين بالفريمات (الاستوديو بيستخدمها للتايملاين المرئي)
export const sceneStarts = (p: ProjectProps) => {
  const overlap = overlapOf(p);
  const starts: number[] = [];
  let t = 0;
  for (const s of p.scenes) {
    starts.push(t);
    t += sceneFrames(s) - overlap;
  }
  return starts;
};

export const calculateProject = (p: ProjectProps) => {
  const { width, height } = getFormat(p.format);
  const total = p.scenes.reduce((sum, s) => sum + sceneFrames(s), 0) - Math.max(0, p.scenes.length - 1) * overlapOf(p);
  return { durationInFrames: Math.max(FPS, total), fps: FPS, width, height };
};

export const ProjectVideo: React.FC<ProjectProps> = (p) => {
  const { width, height, durationInFrames, fps } = useVideoConfig();
  const font = getFont(p.font);
  const presentation = getTransition(p.transition, width, height);
  const starts = sceneStarts(p);
  const overlap = presentation ? TRANSITION_FRAMES : 0;

  const theme: Theme = {
    fontFamily: font.family,
    heavy: font.heavy,
    animation: p.animation,
    logo: p.logo,
    primary: p.primary,
    secondary: p.secondary,
    textColor: p.textColor,
    accent: p.accent,
  };

  if (p.scenes.length === 0) {
    return (
      <AbsoluteFill style={{ background: p.primary, justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: font.family, fontSize: Math.min(width, height) * 0.06, color: p.textColor, opacity: 0.7 }}>
          أضف أول مشهد من الاستوديو ➕
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: p.primary }}>
      <TransitionSeries>
        {p.scenes.map((scene, i) => {
          const Renderer = sceneRenderers[scene.type] ?? sceneRenderers.text;
          const dur = sceneFrames(scene);
          return (
            <Fragment key={scene.id}>
              {i > 0 && presentation && <TransitionSeries.Transition presentation={presentation} timing={transitionTiming} />}
              <TransitionSeries.Sequence durationInFrames={dur}>
                <Renderer scene={scene} theme={theme} index={i} duration={dur} />
                <LayersView layers={scene.layers ?? []} fontFamily={font.family} heavy={font.heavy} sceneFrames={dur} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>

      {/* ===== الصوت ===== */}
      {p.voiceover && <Html5Audio src={assetSrc(p.voiceover)} volume={Math.max(0, Math.min(100, p.voiceVolume ?? 100)) / 100} />}
      {p.music && (
        <Html5Audio
          src={assetSrc(p.music)}
          loop
          volume={(f) => musicVolume(f, durationInFrames, Math.max(0, Math.min(100, p.musicVolume)) / 100, fps)}
        />
      )}
      {p.sfx !== "off" && (
        <>
          <Sequence from={2} durationInFrames={10}>
            <Html5Audio src={assetSrc("demo/pop.wav")} volume={0.6} />
          </Sequence>
          {starts.slice(1).map((start, i) => (
            <Sequence key={`w${i}`} from={Math.max(0, start - (overlap ? 0 : 2))} durationInFrames={20}>
              <Html5Audio src={assetSrc("demo/whoosh.wav")} volume={0.5} />
            </Sequence>
          ))}
          {p.scenes.map((s, i) =>
            s.type === "cta" ? (
              <Sequence key={`d${i}`} from={starts[i] + (i > 0 ? overlap : 0) + 4} durationInFrames={45}>
                <Html5Audio src={assetSrc("demo/ding.wav")} volume={0.5} />
              </Sequence>
            ) : null,
          )}
        </>
      )}
    </AbsoluteFill>
  );
};
