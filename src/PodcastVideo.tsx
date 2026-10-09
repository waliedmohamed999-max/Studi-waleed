// "بودكاست بكذا كاميرا": كل كاميرا على متكلم (و ممكن كاميرا واسعة)، والقطع أوتوماتيك على اللي بيتكلم
// كل الأوقات هنا بـ "وقت الأساسية" (الكاميرا الأولى)، وكل كاميرا ليها offset: وقتها = وقت الأساسية + offset
import { useMemo } from "react";
import { AbsoluteFill, Html5Audio, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { getFont } from "./lib/fonts";
import { getFormat } from "./lib/formats";
import { assetSrc, musicVolume } from "./lib/media";
import { gradeFilter } from "./lib/grades";
import { CaptionsLayer } from "./CaptionedVideo";
import { duckedMusicVolume, SoundFxLayer, speechSpans, type SoundFxItem } from "./lib/soundFx";
import type { Highlight, TimeRange } from "./autoedit/edl";

export type PodcastCam = {
  id: string;
  src: string;
  label: string; // اسم المتكلم (بيظهر تحت)
  role: string; // speaker | wide
  mic: string; // مايك منفصل للمتكلم ده (اختياري، أدق في تحديد مين بيتكلم)
  focusX: number; // مكان القص بالعرض (٪) لما المقاس مختلف عن الكاميرا
  focusY: number;
};
export type PodcastShot = TimeRange & { cam: number; cams: number[]; kind: string }; // kind: speaker | wide | split

export type PodcastProps = {
  cams: PodcastCam[];
  offsets: number[]; // ms لكل كاميرا
  range: TimeRange | null; // الفترة اللي كل الكاميرات شغالة فيها (بعد المزامنة)
  mediaDuration: number; // مدة الكاميرا الأولى بالثواني (قبل التحليل)
  shots: PodcastShot[];
  // الصوت
  audioFrom: string; // رقم الكاميرا ("0"، "1"...) أو "file"
  audioFile: string;
  audioOffset: number; // ms: وقت ملف الصوت = وقت الأساسية + audioOffset
  cleanAudio: string; // الصوت المختار بعد التنضيف (نفس توقيته)
  audioVolume: number;
  // الكلام والكابشن (بوقت الأساسية)
  words: Caption[];
  captions: string;
  captionStyle: string;
  position: string;
  captionSize: number;
  font: string;
  textColor: string;
  highlight: string;
  // الشكل
  format: string;
  grade: string;
  nameTags: string; // on | off: اسم المتكلم تحت أول ما الكاميرا تروحله
  punchIn: string; // on | off: زووم خفيف متغير بين اللقطات
  hookTitle: string;
  showHook: string;
  music: string;
  musicVolume: number;
  // مقاطع ريلز
  highlights: Highlight[];
  clip: TimeRange | null; // لو بنصدّر مقطع واحد بس
  // نتيجة التحليل (للعرض في الاستوديو)
  analysis: { syncScores: number[]; share: { cam: number; percent: number }[]; separationDb: number; mode?: string; visualConfidence?: number } | null;
  minShotSec: number;
  splitOnBoth: string;
  soundFx: SoundFxItem[];
  duckMusic: string;
  // تحديد المتكلم من حركة الشفايف (لما المايك مشترك): كل كاميرا ليها حركة بق كل 100ms بوقتها هي
  mouth: (number | null)[][];
  speakerBy: string; // audio | mouth
};

const FPS = 30;

// بداية ونهاية الفيديو بوقت الأساسية
export const podcastWindow = (p: PodcastProps): TimeRange => {
  const full = p.range ?? { fromMs: 0, toMs: Math.max(1000, (Number(p.mediaDuration) || 10) * 1000) };
  if (!p.clip) return full;
  return { fromMs: Math.max(full.fromMs, p.clip.fromMs), toMs: Math.min(full.toMs, p.clip.toMs) };
};

export const calculatePodcast = (p: PodcastProps) => {
  const { width, height } = getFormat(p.format);
  const w = podcastWindow(p);
  return { durationInFrames: Math.max(FPS, Math.round(((w.toMs - w.fromMs) / 1000) * FPS)), fps: FPS, width, height };
};

// اللقطات جوه الفيديو (لو مفيش تحليل لسه: الكاميرا الأولى طول الوقت)
export const podcastShots = (p: PodcastProps): PodcastShot[] => {
  const w = podcastWindow(p);
  const list = p.shots?.length ? p.shots : [{ fromMs: w.fromMs, toMs: w.toMs, cam: 0, cams: [0], kind: "speaker" }];
  return list.filter((s) => s.toMs > w.fromMs && s.fromMs < w.toMs).map((s) => ({ ...s, fromMs: Math.max(s.fromMs, w.fromMs), toMs: Math.min(s.toMs, w.toMs) }));
};

const CamView: React.FC<{ p: PodcastProps; cam: number; startMs: number; scale: number }> = ({ p, cam, startMs, scale }) => {
  const { fps } = useVideoConfig();
  const c = p.cams[cam];
  if (!c?.src) return <AbsoluteFill style={{ background: "#111" }} />;
  const trimBefore = Math.max(0, Math.round(((startMs + (p.offsets?.[cam] ?? 0)) / 1000) * fps));
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${c.focusX ?? 50}% ${c.focusY ?? 40}%` }}>
      <OffthreadVideo src={assetSrc(c.src)} trimBefore={trimBefore} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${c.focusX ?? 50}% ${c.focusY ?? 40}%` }} />
    </AbsoluteFill>
  );
};

const NameTag: React.FC<{ name: string; color: string; fontFamily: string; heavy: number }> = ({ name, color, fontFamily, heavy }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  const out = interpolate(frame, [fps * 2.3, fps * 2.6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: `${height * (height > width ? 0.14 : 0.08)}px ${unit * 0.06}px` }}>
      <div
        dir="auto"
        style={{
          fontFamily,
          fontWeight: heavy,
          fontSize: unit * 0.042,
          color: "#000",
          background: color,
          padding: `${unit * 0.008}px ${unit * 0.028}px`,
          borderRadius: unit * 0.012,
          opacity: enter * out,
          transform: `translateX(${(1 - enter) * -30}px)`,
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        }}
      >
        {name}
      </div>
    </AbsoluteFill>
  );
};

export const PodcastVideo: React.FC<PodcastProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const unit = Math.min(width, height);
  const font = getFont(p.font);
  const w = podcastWindow(p);
  const shots = useMemo(() => podcastShots(p), [p]);
  const vertical = height > width;

  // الصوت: الكاميرا المختارة أو ملف الريكوردر (أو نسختهم النضيفة)
  const fromFile = p.audioFrom === "file" && !!p.audioFile;
  const audioCam = Math.min(p.cams.length - 1, Math.max(0, Number(p.audioFrom) || 0));
  const audioSrc = p.cleanAudio || (fromFile ? p.audioFile : p.cams[audioCam]?.src);
  const audioOffset = fromFile ? p.audioOffset || 0 : p.offsets?.[audioCam] ?? 0;

  const captions = useMemo(
    () =>
      p.captions !== "on"
        ? []
        : (p.words ?? [])
            .filter((c) => c.endMs > w.fromMs && c.startMs < w.toMs)
            .map((c) => ({ ...c, text: ` ${c.text.trim()}`, startMs: Math.max(0, c.startMs - w.fromMs), endMs: c.endMs - w.fromMs, timestampMs: null })),
    [p.words, p.captions, w.fromMs, w.toMs],
  );

  // فترات الكلام (للمزيكا) بتوقيت الفيديو
  const captionSpans = useMemo(
    () => speechSpans((p.words ?? []).filter((c) => c.endMs > w.fromMs && c.startMs < w.toMs).map((c) => ({ startMs: c.startMs - w.fromMs, endMs: c.endMs - w.fromMs }))),
    [p.words, w.fromMs, w.toMs],
  );
  const hook = p.clip ? ((p.highlights ?? []).find((h) => h.fromMs === p.clip!.fromMs && h.toMs === p.clip!.toMs)?.hook ?? p.hookTitle) : p.hookTitle;
  const hookIn = spring({ frame, fps, config: { damping: 14 } });
  const hookOut = interpolate(frame, [fps * 3, fps * 3.4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  if (!p.cams.some((c) => c.src)) {
    return (
      <AbsoluteFill style={{ background: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontFamily: font.family, color: "#94a3b8", fontSize: unit * 0.05, textAlign: "center", padding: unit * 0.1 }}>ضيف فيديو كل كاميرا من المحتوى 🎙️🎥</div>
      </AbsoluteFill>
    );
  }

  let speakerShot = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ filter: gradeFilter(p.grade) }}>
        {shots.map((s, i) => {
          const from = Math.round(((s.fromMs - w.fromMs) / 1000) * fps);
          const frames = Math.max(1, Math.round(((s.toMs - w.fromMs) / 1000) * fps) - from);
          const zoom = p.punchIn !== "off" && s.kind === "speaker" ? (speakerShot++ % 2 ? 1.1 : 1) : 1;
          return (
            <Sequence key={`${s.fromMs}-${i}`} from={from} durationInFrames={frames} premountFor={fps}>
              {s.kind === "split" && s.cams.length > 1 ? (
                // شاشة مقسومة: فوق وتحت في الطولي، جنب بعض في العرضي
                <AbsoluteFill style={{ flexDirection: vertical ? "column" : "row", gap: unit * 0.006, background: "#000" }}>
                  {s.cams.slice(0, 2).map((c) => (
                    <div key={c} style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                      <CamView p={p} cam={c} startMs={s.fromMs} scale={1} />
                    </div>
                  ))}
                </AbsoluteFill>
              ) : (
                <CamView p={p} cam={s.cam} startMs={s.fromMs} scale={zoom} />
              )}
              {p.nameTags !== "off" && s.kind === "speaker" && p.cams[s.cam]?.label && frames > fps * 1.5 && (
                <NameTag name={p.cams[s.cam].label} color={p.highlight} fontFamily={font.family} heavy={font.heavy} />
              )}
            </Sequence>
          );
        })}
      </AbsoluteFill>

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
              transform: `scale(${0.8 + hookIn * 0.2})`,
            }}
          >
            {hook}
          </div>
        </AbsoluteFill>
      )}

      {captions.length > 0 && (
        <CaptionsLayer
          captions={captions}
          breakOnSilenceMs={500}
          look={{ captionStyle: p.captionStyle, position: p.position, wordsTogetherMs: 1100, captionSize: p.captionSize, font: p.font, textColor: p.textColor, highlight: p.highlight }}
        />
      )}

      {audioSrc && <Html5Audio src={assetSrc(audioSrc)} trimBefore={Math.max(0, Math.round(((w.fromMs + audioOffset) / 1000) * fps))} volume={Math.max(0, Math.min(100, p.audioVolume ?? 100)) / 100} />}
      <SoundFxLayer items={p.soundFx ?? []} />
      {p.music && (
        <Html5Audio
          src={assetSrc(p.music)}
          loop
          volume={(f) => duckedMusicVolume(f, durationInFrames, Math.max(0, Math.min(100, p.musicVolume)) / 100, fps, p.duckMusic === "off" || !captionSpans.length ? null : captionSpans)}
        />
      )}
    </AbsoluteFill>
  );
};
