// شاشة الاستوديو: تصميم برامج المونتاج الاحترافية
// ┌──────────────────────────── الشريط العلوي ────────────────────────────┐
// │ الأدوات │ لوحة الأداة │        المعاينة + التشغيل        │ الخصائص │
// ├──────────────────────────── التايملاين ──────────────────────────────┤
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { getMeta, type Field } from "../src/compositions";
import { sceneStarts, type ProjectProps } from "../src/ProjectVideo";
import { sceneDefs, type Scene } from "../src/scenes/defs";
import { filmStarts } from "../src/FilmVideo";
import type { FilmProps } from "../src/film/types";
import type { Caption } from "@remotion/captions";
import { FieldInput } from "./fields";
import { BrandCard } from "./BrandCard";
import { ProjectCard } from "./ProjectCard";
import { ScenesPanel, moveItem } from "./ScenesPanel";
import { CaptionsPanel } from "./CaptionsPanel";
import { AiCard } from "./AiCard";
import { FilmPanel } from "./FilmPanel";
import { AutoEditPanel } from "./AutoEditPanel";
import { SoundTool } from "./SoundTool";
import { PublishTool } from "./PublishTool";
import { platforms, type Platform, type PlatformId } from "./platforms";
import { autoEditSegments, brollSpans, edlInput, type AutoEditProps } from "../src/AutoEditVideo";
import { outToSource, remapWords } from "../src/autoedit/edl";
import { BatchCard } from "./BatchCard";
import { ExportCard, defaultExportSettings, type ExportSettings } from "./ExportCard";
import { Timeline, timecode, type TlTrack } from "./Timeline";
import { useProject, type SaveState } from "./useProject";
import {
  IconClapper,
  IconDownload,
  IconFolder,
  IconLayers,
  IconMaximize,
  IconMic,
  IconMusic,
  IconPalette,
  IconPanelBottom,
  IconPanelSide,
  IconPause,
  IconPlay,
  IconRedo,
  IconRepeat,
  IconRotate,
  IconSkipBack,
  IconSkipForward,
  IconSliders,
  IconSparkles,
  IconStepBack,
  IconStepForward,
  IconTable,
  IconType,
  IconUndo,
  IconSend,
  IconSettings,
  IconCalendar,
  IconFiles,
} from "./icons";
import { SettingsTool } from "./SettingsTool";
import { PlanTool } from "./PlanTool";
import { LibraryTool } from "./LibraryTool";
import { ReviewCard } from "./ReviewCard";
import { useOnOpenSettings } from "./settings";
import { LayerHandles } from "./LayersEditor";
import type { Layer } from "../src/scenes/layers";

const isTyping = (el: EventTarget | null) => {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const saveText: Record<SaveState, string> = { idle: "", dirty: "فيه تعديلات…", saving: "بيتحفظ…", saved: "متحفظ", error: "الحفظ فشل" };

// خانات "المحتوى" (إيه اللي في الفيديو) بتروح للوحة الأدوات، وخانات "الشكل" (إزاي يبان) بتروح للخصائص
// (الصور زي اللوجو والخلفية بتعتبر "شكل"، والصور اللي جوه المشاهد موجودة في محرر المشاهد نفسه)
const contentTypes = new Set<Field["type"]>(["scenes", "film", "autoedit", "captions", "slides", "text", "lines", "media"]);

type Tool = "content" | "ai" | "sound" | "library" | "plan" | "project" | "brand" | "batch" | "export" | "publish" | "settings" | "inspect";
const tools: { id: Tool; label: string; icon: ReactNode; narrowOnly?: boolean }[] = [
  { id: "content", label: "المحتوى", icon: <IconLayers size={20} /> },
  { id: "ai", label: "ذكاء", icon: <IconSparkles size={20} /> },
  { id: "sound", label: "الصوتيات", icon: <IconMusic size={20} /> },
  { id: "library", label: "الملفات", icon: <IconFiles size={20} /> },
  { id: "plan", label: "الخطة", icon: <IconCalendar size={20} /> },
  { id: "project", label: "المشاريع", icon: <IconFolder size={20} /> },
  { id: "brand", label: "البراند", icon: <IconPalette size={20} /> },
  { id: "batch", label: "الشيت", icon: <IconTable size={20} /> },
  { id: "export", label: "التصدير", icon: <IconDownload size={20} /> },
  { id: "publish", label: "النشر", icon: <IconSend size={20} /> },
  { id: "settings", label: "الإعدادات", icon: <IconSettings size={20} /> },
  { id: "inspect", label: "الخصائص", icon: <IconSliders size={20} />, narrowOnly: true },
];
const toolTitle: Record<Tool, string> = {
  content: "المحتوى",
  ai: "الذكاء الاصطناعي",
  sound: "مزيكا ومؤثرات بالذكاء الاصطناعي",
  library: "مكتبة الملفات",
  plan: "خطة المحتوى",
  project: "المشاريع",
  brand: "هوية البراند",
  batch: "فيديوهات كتير من شيت",
  export: "التصدير",
  publish: "النشر على المنصات",
  settings: "الإعدادات: مفاتيح الخدمات",
  inspect: "الخصائص",
};

// النسبة بأبسط شكل (1080×1920 ← 9:16)
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const ratioLabel = (w: number, h: number) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;

// ===== رسم مناطق الأمان فوق المعاينة =====
const SafeZones: React.FC<{ platform: Platform; vertical: boolean; arabicUi: boolean }> = ({ platform, vertical, arabicUi }) => {
  if (!vertical || !platform.safe) return <div className="safe-note">مناطق الأمان للفيديو الطولي (9:16) بس</div>;
  const s = platform.safe;
  // في التطبيق الإنجليزي الأزرار يمين، وفي العربي شمال
  const iconsLeft = arabicUi;
  return (
    <div className="safe-zones" aria-hidden="true">
      <div className="sz sz-top" style={{ height: `${s.top * 100}%` }}>
        <span>{platform.name}: الشريط اللي فوق</span>
      </div>
      <div className="sz sz-bottom" style={{ height: `${s.bottom * 100}%` }}>
        <span>اسم الحساب والوصف والمزيكا</span>
      </div>
      <div className="sz sz-side" style={{ top: `${s.top * 100}%`, bottom: `${s.bottom * 100}%`, width: `${s.side * 100}%`, [iconsLeft ? "left" : "right"]: 0 }}>
        <span>الأزرار</span>
      </div>
      <div className="sz sz-thin" style={{ top: `${s.top * 100}%`, bottom: `${s.bottom * 100}%`, width: `${s.otherSide * 100}%`, [iconsLeft ? "right" : "left"]: 0 }} />
    </div>
  );
};

const fileName = (p: unknown) => String(p ?? "").split("/").pop()?.replace(/^[a-z0-9]+-(?=.)/, "") ?? "";

export const App: React.FC = () => {
  const { project, video, updateProps, undo, redo, canUndo, canRedo, rename, newProject, openProject, deleteProject, save } = useProject();
  const props = project.props;

  // ===== معاينة سطر من الشيت (مؤقتة، مش بتتحفظ في المشروع) =====
  const [preview, setPreview] = useState<{ row: number; props: Record<string, unknown> } | null>(null);
  const playerProps = preview?.props ?? props;
  const meta = getMeta(video, playerProps);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings);

  // ===== اللوحات =====
  const [tool, setTool] = useState<Tool>("content");
  const [showTool, setShowTool] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  // مناطق الأمان: بتوري الأماكن اللي واجهة المنصة هتغطيها
  const [safeZone, setSafeZone] = useState<PlatformId | "">("");
  const [arabicUi, setArabicUi] = useState(true);
  // أي أداة محتاجة مفتاح بتفتح الإعدادات من هنا
  useOnOpenSettings(
    useCallback(() => {
      setTool("settings");
      setShowTool(true);
    }, []),
  );

  const openTool = (t: Tool) => {
    if (t === tool && showTool) setShowTool(false);
    else {
      setTool(t);
      setShowTool(true);
    }
  };

  // ===== المشاهد (قالب "مشروع حر") =====
  const scenesField = video.fields.find((f) => f.type === "scenes");
  const scenes = scenesField ? ((props[scenesField.key] as Scene[]) ?? []) : [];
  const starts = scenesField ? sceneStarts(props as unknown as ProjectProps) : [];
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedSeg, setSelectedSeg] = useState<number | null>(null); // المقطع المختار في المونتاج الأوتوماتيك
  // أوامر الكيبورد بتقرا آخر نسخة من الدوال دي (بتتحدث كل render تحت)
  const actions = useRef({ split: () => {}, remove: () => {} });
  const setScenes = (next: Scene[]) => scenesField && updateProps({ [scenesField.key]: next });

  // ===== المشغل =====
  const playerRef = useRef<PlayerRef>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);

  // طبقات المشهد المختار بتظهر كمقابض فوق المعاينة (لما المؤشر يكون جوه المشهد ده)
  const layerScene = (() => {
    const i = scenes.findIndex((s) => s.id === selectedSceneId);
    const s = scenes[i];
    if (!s?.layers?.length || preview) return null;
    const end = starts[i] + Math.round((Number(s.duration) || 3) * meta.fps);
    return frame >= starts[i] && frame < end ? { id: s.id, layers: s.layers as Layer[] } : null;
  })();
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const playerKey = `${project.id}:${project.videoId}`;

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    p.addEventListener("frameupdate", onFrame);
    return () => {
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
      p.removeEventListener("frameupdate", onFrame);
    };
  }, [playerKey]);

  useEffect(() => {
    setFrame(0);
    setPlaying(false);
    setSelectedSceneId(scenes[0]?.id ?? null);
    setPreview(null);
  }, [playerKey]);

  // أي تعديل في الفيديو بيلغي معاينة سطر الشيت عشان متتلخبطش
  useEffect(() => {
    setPreview(null);
  }, [props]);

  // ===== مقاس المعاينة: بتملا المساحة المتاحة من غير ما تتقص =====
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // بنقيس بـ ResizeObserver، ومعاه احتياطي: أول ما الصفحة تفتح، ومع تغيير مقاس النافذة، ولما لوحة تتفتح أو تتقفل
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (Math.abs(b.w - r.width) > 0.5 || Math.abs(b.h - r.height) > 0.5 ? { w: r.width, h: r.height } : b));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 120);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [showTool, showInspector, showTimeline, tool]);
  const aspect = meta.width / meta.height;
  const playerW = Math.max(120, Math.min(box.w, box.h * aspect));

  const updateProp = (key: string, value: unknown) => updateProps({ [key]: value });

  const seek = useCallback(
    (f: number) => {
      const clamped = Math.max(0, Math.min(meta.durationInFrames - 1, f));
      playerRef.current?.seekTo(clamped);
      setFrame(clamped);
    },
    [meta.durationInFrames],
  );

  const selectScene = (id: string, startFrame?: number) => {
    setSelectedSceneId(id);
    const i = scenes.findIndex((s) => s.id === id);
    if (i < 0) return;
    const overlap = i > 0 ? starts[i - 1] + Math.round(scenes[i - 1].duration * meta.fps) - starts[i] : 0;
    playerRef.current?.pause();
    seek(startFrame ?? starts[i] + overlap);
    setTool("content");
    setShowTool(true);
  };

  // ===== اختصارات الكيبورد =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !isTyping(e.target) && (e.code === "KeyZ" || e.code === "KeyY")) {
        e.preventDefault();
        if (e.code === "KeyY" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (isTyping(e.target)) return;
      const p = playerRef.current;
      if (!p) return;
      const cur = p.getCurrentFrame();
      if (e.code === "Space") {
        e.preventDefault();
        p.toggle();
      } else if (e.code === "ArrowRight") seek(cur + (e.shiftKey ? meta.fps : 1));
      else if (e.code === "ArrowLeft") seek(cur - (e.shiftKey ? meta.fps : 1));
      else if (e.code === "Home") seek(0);
      else if (e.code === "End") seek(meta.durationInFrames - 1);
      else if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) actions.current.split();
      else if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        actions.current.remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, undo, redo, meta.fps, meta.durationInFrames]);

  // ===== مسارات التايملاين حسب القالب =====
  const fps = meta.fps;
  const total = meta.durationInFrames;
  const tracks: TlTrack[] = [];

  if (scenesField) {
    tracks.push({
      id: "v1",
      label: "المشاهد",
      icon: <IconLayers size={14} />,
      kind: "video",
      blocks: scenes.map((s, i) => ({
        id: s.id,
        start: starts[i],
        frames: Math.round(s.duration * fps),
        label: sceneDefs[s.type].summary(s) || sceneDefs[s.type].label,
        color: sceneDefs[s.type].color,
        selected: s.id === selectedSceneId,
        durationSec: s.duration,
      })),
      onBlockClick: (id) => selectScene(id),
      editable: {
        min: 1,
        max: 15,
        snap: 0.5,
        onResize: (id, sec) =>
          updateProps((prev) => ({ ...prev, [scenesField.key]: (prev[scenesField.key] as Scene[]).map((s) => (s.id === id ? { ...s, duration: sec } : s)) })),
        onReorder: (from, to) => updateProps((prev) => ({ ...prev, [scenesField.key]: moveItem(prev[scenesField.key] as Scene[], from, to) })),
      },
    });
  } else if (video.id === "Film") {
    const film = playerProps as unknown as FilmProps;
    const fStarts = filmStarts(film);
    tracks.push({
      id: "v1",
      label: "اللقطات",
      icon: <IconClapper size={14} />,
      kind: "video",
      blocks: film.shots.map((s, i) => ({
        id: s.id,
        start: fStarts[i],
        frames: Math.round(Math.max(1, s.duration) * fps),
        label: `${i + 1}. ${s.purpose || "لقطة"}`,
        color: s.clip ? "#3b82f6" : s.keyframe ? "#6366f1" : "#475569",
        thumb: s.keyframe ? `/${s.keyframe}` : undefined,
      })),
      onBlockClick: (_id, start) => seek(start + 1),
    });
    const voiced = film.shots.map((s, i) => ({ s, i })).filter(({ s }) => s.voice);
    if (film.voiceProvider === "recorded" && film.recordedVoice) {
      tracks.push({ id: "a1", label: "التعليق", icon: <IconMic size={14} />, kind: "audio", blocks: [{ id: "rec", start: 0, frames: total, label: fileName(film.recordedVoice), color: "#10b981" }] });
    } else if (voiced.length) {
      tracks.push({
        id: "a1",
        label: "التعليق",
        icon: <IconMic size={14} />,
        kind: "audio",
        blocks: voiced.map(({ s, i }) => ({
          id: s.id,
          start: fStarts[i] + Math.round(0.15 * fps),
          frames: Math.max(1, Math.round(s.voiceDuration * fps)),
          label: s.voiceLine,
          color: "#10b981",
        })),
        onBlockClick: (_id, start) => seek(start),
      });
    }
  } else if (video.id === "AutoEdit") {
    // المقاطع اللي اتسابت بعد القص، كل واحد بلون مختلف عشان القطع يبان
    const ae = playerProps as unknown as AutoEditProps;
    const segs = autoEditSegments(ae);
    const firstWords = (from: number, to: number) =>
      ae.words
        .filter((w) => w.startMs >= from - 1 && w.endMs <= to + 1)
        .slice(0, 4)
        .map((w) => w.text.trim())
        .join(" ");
    tracks.push({
      id: "v1",
      label: "المقاطع",
      icon: <IconClapper size={14} />,
      kind: "video",
      blocks: segs.map((s, i) => ({
        id: `s${i}`,
        start: Math.round((s.outMs / 1000) * fps),
        frames: Math.max(1, Math.round(((s.toMs - s.fromMs) / 1000) * fps)),
        label: firstWords(s.fromMs, s.toMs) || "مقطع",
        color: i % 2 ? "#3b82f6" : "#6366f1",
        selected: selectedSeg === i,
      })),
      onBlockClick: (id, start) => {
        setSelectedSeg(Number(id.slice(1)));
        seek(start);
      },
    });
    // لقطات B-roll فوق الكلام
    const spans = brollSpans(ae, segs);
    if (spans.length) {
      tracks.push({
        id: "broll",
        label: "B-roll",
        icon: <IconLayers size={14} />,
        kind: "video",
        blocks: spans.map(({ b, out }) => ({
          id: b.id,
          start: Math.round((out.fromMs / 1000) * fps),
          frames: Math.max(1, Math.round(((out.toMs - out.fromMs) / 1000) * fps)),
          label: b.description || b.query,
          color: "#0ea5e9",
          thumb: b.kind === "image" ? `/${b.src}` : undefined,
        })),
        onBlockClick: (_id, start) => seek(start),
      });
    }
    const words = ae.captions === "on" ? remapWords(edlInput(ae), segs) : [];
    if (words.length) {
      tracks.push({
        id: "cap",
        label: "الكابشن",
        icon: <IconType size={14} />,
        kind: "text",
        blocks: words.map((w, i) => ({ id: `w${i}`, start: Math.round((w.startMs / 1000) * fps), frames: Math.max(1, Math.round(((w.endMs - w.startMs) / 1000) * fps)), label: w.text.trim(), color: "#f59e0b" })),
        onBlockClick: (_id, start) => seek(start),
      });
    }
  } else {
    tracks.push({ id: "v1", label: "الفيديو", icon: <IconClapper size={14} />, kind: "video", blocks: [{ id: "all", start: 0, frames: total, label: video.name, color: "#6366f1" }] });
  }

  // المصدر (قالب الكابشن) والكابشن نفسه
  if (typeof props.media === "string" && props.media && video.id !== "AutoEdit") {
    const dur = Math.min(total, Math.round((Number(props.mediaDuration) || total / fps) * fps));
    tracks.push({ id: "media", label: "المصدر", icon: <IconMic size={14} />, kind: "audio", blocks: [{ id: "media", start: 0, frames: dur, label: fileName(props.media), color: "#10b981" }] });
  }
  const capList = Array.isArray(props.captions) ? (props.captions as Caption[]) : [];
  if (capList.length) {
    tracks.push({
      id: "cap",
      label: "الكابشن",
      icon: <IconType size={14} />,
      kind: "text",
      blocks: capList.map((c, i) => ({
        id: `c${i}`,
        start: Math.round((c.startMs / 1000) * fps),
        frames: Math.max(1, Math.round(((c.endMs - c.startMs) / 1000) * fps)),
        label: c.text.trim(),
        color: "#f59e0b",
      })),
      onBlockClick: (_id, start) => seek(start),
    });
  }
  if (typeof props.voiceover === "string" && props.voiceover) {
    tracks.push({ id: "vo", label: "التعليق", icon: <IconMic size={14} />, kind: "audio", blocks: [{ id: "vo", start: 0, frames: total, label: fileName(props.voiceover), color: "#10b981" }] });
  }
  if (typeof props.music === "string" && props.music) {
    tracks.push({ id: "music", label: "المزيكا", icon: <IconMusic size={14} />, kind: "audio", blocks: [{ id: "music", start: 0, frames: total, label: fileName(props.music), color: "#a855f7" }] });
  }

  // ===== القص اليدوي (المونتاج الأوتوماتيك) =====
  const isAutoEdit = video.id === "AutoEdit";
  const splitAtPlayhead = () => {
    if (!isAutoEdit) return;
    const segs = autoEditSegments(props as unknown as AutoEditProps);
    const src = outToSource((frame / fps) * 1000, segs);
    if (src === null) return;
    updateProps((prev) => ({ ...prev, splits: [...((prev.splits as number[]) ?? []), Math.round(src)] }));
  };
  const deleteSelected = () => {
    if (isAutoEdit && selectedSeg !== null) {
      const seg = autoEditSegments(props as unknown as AutoEditProps)[selectedSeg];
      if (!seg) return;
      updateProps((prev) => ({ ...prev, cuts: [...((prev.cuts as unknown[]) ?? []), { fromMs: seg.fromMs, toMs: seg.toMs, reason: "حذف يدوي", enabled: true }] }));
      setSelectedSeg(null);
    } else if (scenesField && selectedSceneId) {
      const i = scenes.findIndex((s) => s.id === selectedSceneId);
      const next = scenes.filter((s) => s.id !== selectedSceneId);
      setScenes(next);
      setSelectedSceneId(next[Math.min(i, next.length - 1)]?.id ?? null);
    }
  };
  actions.current = { split: splitAtPlayhead, remove: deleteSelected };
  const timelineTools = isAutoEdit ? (
    <>
      <button type="button" className="tl-btn" onClick={splitAtPlayhead} title="اقطع عند المؤشر (S)">
        ✂️ اقطع
      </button>
      <button type="button" className="tl-btn" onClick={deleteSelected} disabled={selectedSeg === null} title="امسح المقطع المختار (Delete)">
        🗑 امسح
      </button>
    </>
  ) : scenesField ? (
    <button type="button" className="tl-btn" onClick={deleteSelected} disabled={!selectedSceneId} title="امسح المشهد المختار (Delete)">
      🗑 امسح المشهد
    </button>
  ) : null;

  // ===== الخانات =====
  const renderField = (f: Field) => {
    if (f.type === "scenes")
      return (
        <ScenesPanel
          scenes={scenes}
          selectedId={selectedSceneId}
          onSelect={selectScene}
          onChange={setScenes}
          accent={String(props.accent ?? "#facc15")}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
        />
      );
    if (f.type === "film") return <FilmPanel projectId={project.id} props={props} updateProps={updateProps} fps={fps} seek={seek} exportSettings={exportSettings} />;
    if (f.type === "autoedit") return <AutoEditPanel props={props} updateProps={updateProps} projectName={project.name} fps={fps} frame={frame} seek={seek} exportSettings={exportSettings} />;
    if (f.type === "captions") return <CaptionsPanel props={props} updateProps={updateProps} frame={frame} fps={fps} seek={seek} />;
    return <FieldInput field={f} value={props[f.key] ?? video.defaultProps[f.key]} onChange={(v) => updateProp(f.key, v)} />;
  };

  // الخانات بتتقسم أقسام حسب الـ group، وكل قسم بيتقفل ويتفتح
  const renderGroups = (fields: Field[]) => {
    const groups: { name: string; fields: Field[] }[] = [];
    for (const f of fields) {
      const name = f.group ?? "عام";
      if (groups.at(-1)?.name === name) groups.at(-1)!.fields.push(f);
      else groups.push({ name, fields: [f] });
    }
    return groups.map((g) => (
      <details key={g.name} className="section" open>
        <summary>{g.name}</summary>
        <div className="section-body">
          {g.fields.map((f) => (
            <Fragment key={f.key}>{renderField(f)}</Fragment>
          ))}
        </div>
      </details>
    ));
  };

  const contentFields = video.fields.filter((f) => contentTypes.has(f.type));
  const styleFields = video.fields.filter((f) => !contentTypes.has(f.type));

  const inspector = (
    <>
      {styleFields.length ? renderGroups(styleFields) : <p className="empty-note">القالب ده مفيهوش إعدادات شكل.</p>}
      <button type="button" className="btn-quiet" onClick={() => confirm("ترجّع كل إعدادات الفيديو للأصل؟ (تقدر تتراجع بـ Ctrl+Z)") && updateProps(structuredClone(video.defaultProps))}>
        <IconRotate size={14} /> رجّع الأصلي
      </button>
    </>
  );

  const toolBody: Record<Tool, ReactNode> = {
    content: contentFields.length ? renderGroups(contentFields) : <p className="empty-note">القالب ده كل إعداداته في الخصائص.</p>,
    ai: <AiCard onCreate={(name, aiProps) => newProject("Project", name, aiProps)} />,
    sound: <SoundTool canSetMusic={video.fields.some((f) => f.key === "music")} onUseMusic={(path) => updateProps({ music: path })} />,
    project: <ProjectCard project={project} save={save} onRename={rename} onNew={newProject} onOpen={openProject} onDelete={deleteProject} />,
    brand: <BrandCard video={video} props={props} onApply={updateProps} />,
    batch: (
      <BatchCard
        video={video}
        props={props}
        projectName={project.name}
        settings={exportSettings}
        previewRow={preview?.row ?? null}
        onPreview={(row, rowProps) => setPreview(row === null || !rowProps ? null : { row, props: rowProps })}
      />
    ),
    export: (
      <>
        <ReviewCard videoId={project.videoId} props={props} meta={meta} settings={exportSettings} seek={seek} />
        <ExportCard settings={exportSettings} onSettings={setExportSettings} current={{ videoId: project.videoId, name: project.name, props }} />
      </>
    ),
    library: <LibraryTool />,
    plan: <PlanTool onOpen={openProject} />,
    publish: <PublishTool current={{ videoId: project.videoId, name: project.name, props }} meta={meta} />,
    settings: <SettingsTool />,
    inspect: inspector,
  };

  return (
    <div className={`studio ${showTool ? "" : "no-tool"} ${showInspector ? "" : "no-inspector"} ${showTimeline ? "" : "no-timeline"}`}>
      {/* ===== الشريط العلوي ===== */}
      <header className="topbar">
        <div className="tb-start">
          <div className="brandmark" aria-label="استوديو منتاج">
            <IconClapper size={20} />
            <span>منتاج</span>
          </div>
          <span className="tb-sep" aria-hidden="true" />
          <input className="tb-project" value={project.name} onChange={(e) => rename(e.target.value)} aria-label="اسم المشروع" />
          <span className={`tb-save save-${save}`} role="status">
            {saveText[save]}
          </span>
        </div>

        <div className="tb-center">
          <span className="chip-template" title={video.name}>
            {video.name}
          </span>
          <span className="tb-meta">
            {meta.width}×{meta.height} · {fps}fps · {timecode(total, fps)}
          </span>
        </div>

        <div className="tb-end">
          <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="تراجع" title="تراجع (Ctrl+Z)">
            <IconUndo />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="إعادة" title="إعادة (Ctrl+Y)">
            <IconRedo />
          </button>
          <span className="tb-sep" aria-hidden="true" />
          <button className={`icon-btn ${showTool ? "on" : ""}`} onClick={() => setShowTool((v) => !v)} aria-pressed={showTool} aria-label="لوحة الأدوات" title="لوحة الأدوات">
            <IconPanelSide />
          </button>
          <button className={`icon-btn mirror ${showInspector ? "on" : ""}`} onClick={() => setShowInspector((v) => !v)} aria-pressed={showInspector} aria-label="لوحة الخصائص" title="لوحة الخصائص">
            <IconPanelSide />
          </button>
          <button className={`icon-btn ${showTimeline ? "on" : ""}`} onClick={() => setShowTimeline((v) => !v)} aria-pressed={showTimeline} aria-label="التايملاين" title="التايملاين">
            <IconPanelBottom />
          </button>
          <button
            className="btn-export"
            onClick={() => {
              setTool("export");
              setShowTool(true);
            }}
          >
            <IconDownload size={16} /> تصدير
          </button>
        </div>
      </header>

      {/* ===== شريط الأدوات ===== */}
      <nav className="rail" aria-label="الأدوات">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`rail-item ${t.narrowOnly ? "narrow-only" : ""} ${tool === t.id && showTool ? "active" : ""}`}
            onClick={() => openTool(t.id)}
            aria-pressed={tool === t.id && showTool}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ===== لوحة الأداة ===== */}
      {showTool && (
        <aside className="toolpanel" aria-label={toolTitle[tool]}>
          <div className="panel-head">
            <h2>{toolTitle[tool]}</h2>
          </div>
          <div className="panel-body">{toolBody[tool]}</div>
        </aside>
      )}

      {/* ===== المعاينة ===== */}
      <main className="viewer">
        <div className="viewer-head">
          <span className="viewer-title">المعاينة</span>
          {preview && (
            <span className="viewer-banner" role="status">
              بتعاين سطر {preview.row + 1} من الشيت
              <button type="button" className="link-btn" onClick={() => setPreview(null)}>
                رجوع للأصل
              </button>
            </span>
          )}
          <label className="safe-pick" title="بيوريك الأماكن اللي أزرار وكلام المنصة هيغطوها">
            <span>مناطق الأمان</span>
            <select value={safeZone} onChange={(e) => setSafeZone(e.target.value as PlatformId | "")}>
              <option value="">مقفولة</option>
              {platforms
                .filter((pl) => pl.safe)
                .map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
            </select>
          </label>
          {safeZone && (
            <label className="check" title="التطبيقات بالعربي بتحط الأزرار على الشمال">
              <input type="checkbox" checked={arabicUi} onChange={(e) => setArabicUi(e.target.checked)} />
              التطبيق بالعربي
            </label>
          )}
          <span className="viewer-res">{ratioLabel(meta.width, meta.height)}</span>
        </div>

        <div className="viewer-stage" ref={stageRef}>
          {/* المشغل لازم يكون LTR وإلا الصورة بتتزق برا الإطار في الصفحات العربية */}
          <div className="viewer-frame" dir="ltr" style={{ width: playerW }}>
            <Player
              key={playerKey}
              ref={playerRef}
              component={video.component}
              inputProps={playerProps}
              durationInFrames={total}
              fps={fps}
              compositionWidth={meta.width}
              compositionHeight={meta.height}
              playbackRate={rate}
              loop={loop}
              clickToPlay
              acknowledgeRemotionLicense
              style={{ width: "100%" }}
            />
            {safeZone && <SafeZones platform={platforms.find((pl) => pl.id === safeZone)!} vertical={meta.height > meta.width} arabicUi={arabicUi} />}
            {layerScene && (
              <LayerHandles
                layers={layerScene.layers}
                selectedId={selectedLayerId}
                onSelect={setSelectedLayerId}
                onMove={(id, x, y) => setScenes(scenes.map((s) => (s.id === layerScene.id ? { ...s, layers: (s.layers ?? []).map((l) => (l.id === id ? { ...l, x, y } : l)) } : s)))}
              />
            )}
          </div>
        </div>

        <div className="transport-bar">
          <span className="tc" aria-label="الوقت الحالي">
            {timecode(frame, fps)}
          </span>
          <div className="transport" dir="ltr">
            <button className="icon-btn" onClick={() => seek(0)} aria-label="البداية" title="البداية (Home)">
              <IconSkipBack />
            </button>
            <button className="icon-btn" onClick={() => seek(frame - 1)} aria-label="فريم لورا" title="فريم لورا (←)">
              <IconStepBack />
            </button>
            <button className="play-btn" onClick={() => playerRef.current?.toggle()} aria-label={playing ? "إيقاف" : "تشغيل"} title="تشغيل / إيقاف (مسافة)">
              {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
            </button>
            <button className="icon-btn" onClick={() => seek(frame + 1)} aria-label="فريم لقدام" title="فريم لقدام (→)">
              <IconStepForward />
            </button>
            <button className="icon-btn" onClick={() => seek(total - 1)} aria-label="النهاية" title="النهاية (End)">
              <IconSkipForward />
            </button>
          </div>
          <div className="transport-opts">
            <button className={`icon-btn ${loop ? "on" : ""}`} onClick={() => setLoop((v) => !v)} aria-pressed={loop} aria-label="تكرار" title="تكرار">
              <IconRepeat />
            </button>
            <label className="speed">
              <span className="sr-only">السرعة</span>
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} title="سرعة التشغيل">
                {[0.25, 0.5, 1, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <button className="icon-btn" onClick={() => playerRef.current?.requestFullscreen()} aria-label="ملء الشاشة" title="ملء الشاشة">
              <IconMaximize />
            </button>
          </div>
        </div>
      </main>

      {/* ===== الخصائص ===== */}
      {showInspector && (
        <aside className="inspector" aria-label="الخصائص">
          <div className="panel-head">
            <h2>
              <IconSliders size={16} /> الخصائص
            </h2>
          </div>
          <div className="panel-body">{inspector}</div>
        </aside>
      )}

      {/* ===== التايملاين ===== */}
      {showTimeline && (
        <section className="timeline-dock" aria-label="التايملاين">
          <Timeline tracks={tracks} total={total} fps={fps} frame={frame} onSeek={seek} tools={timelineTools} />
        </section>
      )}
    </div>
  );
};
