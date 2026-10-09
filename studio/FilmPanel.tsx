// لوحة "مخرج الأفلام": الفكرة ← السيناريو ← الشخصيات ← اللقطات ← التوليد
// كل حاجة بتتولد على مراحل عشان تراجع وتتحكم في التكلفة قبل الخطوة الغالية (الفيديو)
import { useEffect, useRef, useState } from "react";
import type { Caption } from "@remotion/captions";
import { uid } from "../src/scenes/defs";
import { filmStarts } from "../src/FilmVideo";
import { emptyShot, lipsyncReady, needsLipsync, type FilmCharacter, type FilmJob, type FilmProps, type FilmShot, type FilmUpload } from "../src/film/types";
import { AssetPicker } from "./fields";
import { sendToQueue, type ExportSettings } from "./ExportCard";
import { KeyHint, useKeysVersion } from "./settings";

type Props = Record<string, unknown>;
type Status = {
  fal: boolean;
  elevenlabs: boolean;
  claude: boolean;
  mock: boolean;
  tiers: Record<string, { label: string; pricePerSecond: number }>;
  imagePrice: number;
  lipsyncPricePerSecond: number;
  voiceModels: string[];
  voicePricePer1kChars: number;
  clipSeconds: { min: number; max: number };
};
type Voices = { elevenlabs: { id: string; name: string; labels: string; preview: string }[]; windows: { id: string; name: string; lang: string }[] };
type Plan = {
  title: string;
  style: string;
  cta: string;
  ctaSub: string;
  characters: { id: string; name: string; description: string }[];
  musicPrompt: string;
  shots: Omit<FilmShot, "id" | "keyframe" | "clip" | "clipDuration" | "voice" | "voiceDuration" | "words" | "sfx" | "lipsync" | "lipsyncOf">[];
};

const videoTypes = ["إعلان تجاري", "فيلم قصير", "تقديم شركة", "تقديم منتج", "قصة ملهمة", "محتوى تعليمي", "تهنئة / مناسبة وطنية", "إعلان عقاري"];
const dialects = [
  { value: "najdi", label: "سعودي نجدي" },
  { value: "hijazi", label: "سعودي حجازي" },
  { value: "gulf", label: "خليجي عام" },
  { value: "msa", label: "فصحى" },
  { value: "eg", label: "مصري" },
  { value: "en", label: "English" },
];
const kindLabel: Record<FilmJob["kind"], string> = { plan: "السيناريو", character: "صورة الشخصية", keyframe: "صورة اللقطة", voice: "الصوت", clip: "الفيديو", lipsync: "حركة الشفايف", music: "المزيكا", sfx: "المؤثر الصوتي" };

const money = (n: number) => `$${n.toFixed(n < 1 ? 2 : 1)}`;
const clampDur = (n: number, min = 3, max = 15) => Math.min(max, Math.max(min, Math.round(Number(n) || 5)));

export const FilmPanel: React.FC<{
  projectId: string;
  props: Props;
  updateProps: (patch: Props | ((prev: Props) => Props)) => void;
  fps: number;
  seek: (frame: number) => void;
  exportSettings: ExportSettings;
}> = ({ projectId, props, updateProps, fps, seek, exportSettings }) => {
  const p = props as unknown as FilmProps;
  const [status, setStatus] = useState<Status | null>(null);
  const [voices, setVoices] = useState<Voices>({ elevenlabs: [], windows: [] });
  const [error, setError] = useState<string | null>(null);
  const [openShot, setOpenShot] = useState<string | null>(null);
  const [jobSteps, setJobSteps] = useState<Record<string, string>>({});

  // لما المفاتيح تتغير من الإعدادات، نقرا الحالة من جديد
  const keys = useKeysVersion();
  useEffect(() => setStatus(null), [keys]);

  // لو السيرفر لسه بيقوم، بنحاول تاني كل 3 ثواني
  useEffect(() => {
    if (status) return;
    const load = () => {
      fetch("/api/film/status").then((r) => (r.ok ? r.json() : null)).then((s) => s && setStatus(s)).catch(() => {});
      fetch("/api/film/voices").then((r) => (r.ok ? r.json() : null)).then((v) => v && setVoices(v)).catch(() => {});
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [status]);

  // ===== تعديل الفيلم (دايمًا على آخر نسخة من الـ props) =====
  const patchFilm = (fn: (f: FilmProps) => Partial<FilmProps>) => updateProps((prev) => ({ ...prev, ...fn(prev as unknown as FilmProps) }));
  const patchShot = (id: string, patch: Partial<FilmShot>) => patchFilm((f) => ({ shots: f.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const patchChar = (id: string, patch: Partial<FilmCharacter>) => patchFilm((f) => ({ characters: f.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // ===== العمليات على السيرفر =====
  const running = (kind: FilmJob["kind"], target: string) => (p.jobs ?? []).find((j) => j.kind === kind && j.target === target);

  const start = async (kind: FilmJob["kind"], target: string, body: Record<string, unknown>) => {
    if (running(kind, target)) return;
    setError(null);
    try {
      // المزيكا والمؤثرات ليهم endpoint مشترك
      const url = kind === "music" || kind === "sfx" ? "/api/sound/generate" : `/api/film/${kind}`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, kind, ...body }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      patchFilm((f) => ({ jobs: [...(f.jobs ?? []), { kind, target, jobId: data.jobId }] }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // لما عملية تخلص بنحط نتيجتها في مكانها
  const apply = (job: FilmJob, result: Record<string, unknown>) => {
    if (job.kind === "plan") return patchFilm((f) => planToFilm(result as unknown as Plan, f));
    if (job.kind === "character") return patchChar(job.target, { image: String(result.image) });
    if (job.kind === "keyframe") return patchShot(job.target, { keyframe: String(result.keyframe), clip: "", clipDuration: 0 });
    if (job.kind === "clip") return patchShot(job.target, { clip: String(result.clip), clipDuration: Number(result.clipDuration) });
    if (job.kind === "music") return patchFilm(() => ({ music: String(result.path) }));
    if (job.kind === "sfx") return patchShot(job.target, { sfx: String(result.path) });
    if (job.kind === "lipsync") return patchShot(job.target, { lipsync: String(result.lipsync), lipsyncOf: String(result.lipsyncOf) });
    if (job.kind === "voice") {
      const voiceDuration = Number(result.voiceDuration) || 0;
      return patchFilm((f) => ({
        shots: f.shots.map((s) =>
          s.id !== job.target
            ? s
            : {
                ...s,
                voice: String(result.voice),
                voiceDuration,
                words: (result.words as Caption[]) ?? [],
                // لو الكلام أطول من اللقطة، بنطوّل اللقطة (والفيديو هيحتاج يتعاد)
                duration: voiceDuration + 0.5 > s.duration ? clampDur(Math.ceil(voiceDuration + 0.5)) : s.duration,
              },
        ),
      }));
    }
  };

  // متابعة العمليات كل ثانيتين (وبتكمل حتى لو قفلت الصفحة ورجعت)
  const jobsRef = useRef(p.jobs);
  jobsRef.current = p.jobs;
  useEffect(() => {
    if (!(p.jobs ?? []).length) return;
    const t = setInterval(async () => {
      for (const job of jobsRef.current ?? []) {
        const r = await fetch(`/api/film/job/${job.jobId}`).catch(() => null);
        const data = r ? await r.json().catch(() => null) : null;
        if (!r || r.status === 404 || !data || data.status !== "running") {
          if (data?.status === "done") apply(job, data.result);
          if (data?.status === "error") {
            setError(`${kindLabel[job.kind]}: ${data.error}`);
            // لو "اعمل كل حاجة" شغال، بنوقفه عشان متتصرفش فلوس على خطوات بعد خطوة فشلت
            patchFilm(() => ({ auto: false }));
          }
          if (r?.status === 404) setError(`${kindLabel[job.kind]}: العملية ضاعت (السيرفر اتقفل). جرب تاني`);
          patchFilm((f) => ({ jobs: (f.jobs ?? []).filter((j) => j.jobId !== job.jobId) }));
          setJobSteps((s) => {
            const n = { ...s };
            delete n[job.jobId];
            return n;
          });
        } else setJobSteps((s) => ({ ...s, [job.jobId]: data.step }));
      }
    }, 2000);
    return () => clearInterval(t);
  }, [(p.jobs ?? []).length]);

  const stepOf = (kind: FilmJob["kind"], target: string) => {
    const j = running(kind, target);
    return j ? jobSteps[j.jobId] || "بيبدأ…" : null;
  };

  // ===== الأوامر =====
  const writePlan = () => {
    if (p.shots.length && !confirm("ده هيستبدل السيناريو واللقطات الحالية. تكمل؟")) return;
    start("plan", "plan", { brief: p.brief, videoType: p.videoType, dialect: p.dialect, targetSeconds: p.targetSeconds, format: p.format, uploads: p.uploads });
  };
  const genCharacter = (c: FilmCharacter) => start("character", c.id, { character: c, style: p.style });
  const genKeyframe = (s: FilmShot) => start("keyframe", s.id, { shot: s, characters: p.characters, uploads: p.uploads, style: p.style, format: p.format });
  const genVoice = (s: FilmShot) => {
    const i = p.shots.findIndex((x) => x.id === s.id);
    // لو الكلام على لسان شخصية ليها صوت خاص، بنستخدمه (وإلا صوت الفيلم)
    const own = p.characters.find((c) => c.id === s.speaker)?.voiceId;
    start("voice", s.id, { shot: s, prevText: p.shots[i - 1]?.voiceLine ?? "", nextText: p.shots[i + 1]?.voiceLine ?? "", provider: p.voiceProvider, voiceId: own || p.voiceId, model: p.voiceModel });
  };
  const genLipsync = (s: FilmShot) => start("lipsync", s.id, { shot: s });
  const genClip = (s: FilmShot) => start("clip", s.id, { shot: s, quality: p.quality, style: p.style });
  // المزيكا على طول الفيلم + ثانيتين، والمؤثر على طول اللقطة
  const filmSeconds = () => p.shots.reduce((sum, s) => sum + clampDur(s.duration), 0) + (p.cta || p.logo ? 3 : 0);
  const genMusic = () =>
    start("music", "music", { prompt: p.musicPrompt || "Warm cinematic instrumental background music, modern, uplifting", seconds: filmSeconds() + 2 });
  const genSfx = (s: FilmShot) => start("sfx", s.id, { prompt: s.sfxPrompt, seconds: clampDur(s.duration) });
  const soundOk = !!(status?.elevenlabs || status?.mock);
  const needMusic = !!p.musicPrompt && (!p.music || p.music.startsWith("demo/"));
  const needSfx = p.shots.filter((s) => s.sfxPrompt.trim() && !s.sfx);

  // ===== الحالة والتكلفة =====
  const tier = status?.tiers[p.quality];
  const clipOutdated = (s: FilmShot) => !!s.clip && s.clipDuration !== clampDur(s.duration);
  const needChar = p.characters.filter((c) => !c.image);
  const needKey = p.shots.filter((s) => !s.keyframe);
  const needVoice = p.shots.filter((s) => s.voiceLine.trim() && !s.voice);
  const needClip = p.shots.filter((s) => s.keyframe && (!s.clip || clipOutdated(s)));
  const needLip = p.shots.filter(needsLipsync);
  const lipCost = (shots: FilmShot[]) => shots.reduce((sum, s) => sum + clampDur(s.duration) * (status?.lipsyncPricePerSecond ?? 0.05), 0);
  const imgCost = (n: number) => n * (status?.imagePrice ?? 0.15);
  const clipCost = (shots: FilmShot[]) => shots.reduce((sum, s) => sum + clampDur(s.duration) * (tier?.pricePerSecond ?? 0.22), 0);
  const voiceCost = (shots: FilmShot[]) =>
    p.voiceProvider === "elevenlabs" ? (shots.reduce((n, s) => n + s.voiceLine.length, 0) / 1000) * (status?.voicePricePer1kChars ?? 0.2) : 0;

  const bulk = (label: string, cost: number, items: unknown[], run: () => void) => {
    if (!items.length) return;
    const free = status?.mock || cost === 0;
    if (!confirm(`${label}: ${items.length}\nالتكلفة التقريبية: ${free ? "مجاني" : money(cost)}${status?.mock ? " (وضع تجربة)" : ""}\nتكمل؟`)) return;
    run();
  };

  // ===== "🚀 اعمل كل حاجة": بيشغّل الخطوات لوحده بالترتيب لحد التصدير =====
  const usesTts = p.voiceProvider === "elevenlabs" || p.voiceProvider === "windows";
  const voicePending = (s: FilmShot) => usesTts && !!s.voiceLine.trim() && !s.voice;

  // التكلفة الكاملة: لو لسه مفيش سيناريو بنقدّر من الطول المطلوب
  const autoEstimate = () => {
    const price = tier?.pricePerSecond ?? 0.112;
    if (!p.shots.length) {
      const shots = Math.ceil(p.targetSeconds / 5);
      const chars = 2;
      const voice = p.voiceProvider === "elevenlabs" ? ((p.targetSeconds * 14) / 1000) * (status?.voicePricePer1kChars ?? 0.08) : 0;
      return 0.3 + imgCost(shots + chars) + p.targetSeconds * price + voice;
    }
    // حركة الشفايف: كل لقطة فيها شخصية بتتكلم في الكادر ومش معمولة لسه
    const lips = lipCost(p.shots.filter((s) => s.speaker && s.voiceLine.trim() && !lipsyncReady(s)));
    return imgCost(needChar.length + needKey.length) + p.shots.filter((s) => !s.clip || clipOutdated(s)).reduce((sum, s) => sum + clampDur(s.duration) * price, 0) + voiceCost(needVoice) + lips;
  };

  const startAuto = () => {
    if (!p.shots.length && !p.brief.trim()) return setError("اكتب الفكرة الأول");
    if (p.voiceProvider === "elevenlabs" && !p.voiceId) return setError("اختار صوت ElevenLabs الأول (في التعليق الصوتي)");
    const cost = autoEstimate();
    const free = status?.mock;
    if (
      !confirm(
        `هيتعمل كل حاجة لوحدها: ${p.shots.length ? "" : "السيناريو، "}صور الشخصيات واللقطات، التعليق الصوتي، الفيديوهات، والتصدير.\n` +
          `التكلفة التقريبية الكاملة: ${free ? "مجاني (وضع تجربة)" : `~${money(cost)}`}\n` +
          `ممكن ياخد من 5 لـ 20 دقيقة، وتقدر توقفه في أي وقت. تكمل؟`,
      )
    )
      return;
    autoKicked.current.clear();
    patchFilm(() => ({ auto: true, autoBatch: "" }));
  };

  const autoKicked = useRef(new Set<string>());
  useEffect(() => {
    if (!p.auto || !status) return;
    const kick = (key: string, fn: () => void) => {
      if (autoKicked.current.has(key)) return;
      autoKicked.current.add(key);
      fn();
    };
    const busy = (k: FilmJob["kind"], t: string) => !!running(k, t);

    // 1) السيناريو
    if (!p.shots.length) {
      if (!busy("plan", "plan")) kick("plan", () => start("plan", "plan", { brief: p.brief, videoType: p.videoType, dialect: p.dialect, targetSeconds: p.targetSeconds, format: p.format, uploads: p.uploads }));
      return;
    }
    // 2) صور الشخصيات + 3) التعليق الصوتي (مع بعض)
    p.characters.filter((c) => !c.image && !busy("character", c.id)).forEach((c) => kick(`char:${c.id}`, () => genCharacter(c)));
    p.shots.filter((s) => voicePending(s) && !busy("voice", s.id)).forEach((s) => kick(`voice:${s.id}:${s.voiceLine}`, () => genVoice(s)));
    // 4) صور اللقطات: بعد ما صور الشخصيات اللي فيها تخلص (عشان الوش يفضل ثابت)
    p.shots
      .filter((s) => !s.keyframe && !busy("keyframe", s.id) && s.characters.every((id) => p.characters.find((c) => c.id === id)?.image))
      .forEach((s) => kick(`key:${s.id}`, () => genKeyframe(s)));
    // 5) الفيديو: بعد الصورة والصوت (عشان المدة تتظبط على الكلام الأول)
    p.shots
      .filter((s) => s.keyframe && (!s.clip || clipOutdated(s)) && !voicePending(s) && !busy("clip", s.id))
      .forEach((s) => kick(`clip:${s.id}:${s.keyframe}:${clampDur(s.duration)}`, () => genClip(s)));

    // 6) حركة الشفايف: بعد الفيديو والصوت، للقطات اللي فيها حد بيتكلم في الكادر
    const clipsReady = p.shots.every((s) => s.keyframe && s.clip && !clipOutdated(s) && !voicePending(s));
    if (clipsReady) needLip.filter((s) => !busy("lipsync", s.id)).forEach((s) => kick(`lip:${s.id}:${s.clip}:${s.voice}`, () => genLipsync(s)));

    // 7) المزيكا والمؤثرات (لو فيه مفتاح ElevenLabs)
    if (clipsReady && soundOk) {
      if (needMusic && !busy("music", "music")) kick(`music:${p.musicPrompt}`, genMusic);
      needSfx.filter((s) => !busy("sfx", s.id)).forEach((s) => kick(`sfx:${s.id}:${s.sfxPrompt}`, () => genSfx(s)));
    }
    // 8) خلص؟ صدّر
    const soundsDone = !soundOk || (!needMusic && !needSfx.length);
    const done = clipsReady && !needLip.length && soundsDone && !(p.jobs ?? []).length;
    if (done) {
      kick("export", async () => {
        try {
          const batch = await sendToQueue(p.title || "فيلم", [{ videoId: "Film", name: p.title || "فيلم", props }], { ...exportSettings, thumbnail: true });
          patchFilm(() => ({ auto: false, autoBatch: batch.id }));
        } catch (e) {
          setError((e as Error).message);
          patchFilm(() => ({ auto: false }));
        }
      });
    }
  }, [p, status]);

  // مرحلة الوضع الأوتوماتيك دلوقتي (للعرض)
  const autoStage = !p.shots.length
    ? "بيكتب السيناريو"
    : needChar.length
      ? `صور الشخصيات (${p.characters.length - needChar.length}/${p.characters.length})`
      : needKey.length
        ? `صور اللقطات (${p.shots.length - needKey.length}/${p.shots.length})`
        : p.shots.some(voicePending)
          ? "التعليق الصوتي"
          : needClip.length
            ? `الفيديوهات (${p.shots.length - needClip.length}/${p.shots.length})`
            : needLip.length
              ? `حركة الشفايف (${needLip.length})`
              : soundOk && (needMusic || needSfx.length)
              ? "المزيكا والمؤثرات"
              : "بيصدّر";

  const autoBox = p.auto ? (
    <div className="auto-run" role="status">
      <span className="auto-pulse" aria-hidden="true" />
      <div>
        <b>بيشتغل لوحده…</b>
        <small>{autoStage}</small>
      </div>
      <button type="button" className="btn-small" onClick={() => patchFilm(() => ({ auto: false }))}>
        ⏹ وقّف
      </button>
    </div>
  ) : p.autoBatch ? (
    <div className="auto-done" role="status">
      ✅ الفيلم خلص واتبعت للتصدير. تابعه من أداة <b>التصدير</b>.
      <button type="button" className="link-btn" onClick={() => patchFilm(() => ({ autoBatch: "" }))}>
        تمام
      </button>
    </div>
  ) : null;

  const autoButton = (
    <button type="button" className="btn-primary btn-auto" onClick={startAuto} disabled={p.auto || !(status?.fal || status?.mock) || (!p.shots.length && !(status?.claude || status?.mock))}>
      🚀 اعمل كل حاجة لوحدك (~{status?.mock ? "مجاني" : money(autoEstimate())})
    </button>
  );

  const totalSecs = p.shots.reduce((s, x) => s + clampDur(x.duration), 0);
  const starts = filmStarts(p);

  return (
    <div className="film">
      {/* ===== حالة المفاتيح ===== */}
      {status && (
        <div className="film-keys">
          <span className={status.claude ? "ok" : "no"}>Claude {status.claude ? "✓" : "✗"}</span>
          <span className={status.fal ? "ok" : "no"}>fal.ai {status.fal ? "✓" : "✗"}</span>
          <span className={status.elevenlabs ? "ok" : "no"}>ElevenLabs {status.elevenlabs ? "✓" : "✗"}</span>
          {status.mock && <span className="mock">وضع تجربة</span>}
        </div>
      )}
      {status && (!status.claude || !status.fal) && !status.mock && (
        <KeyHint>محتاج مفاتيح Claude (السيناريو) و fal.ai (الصور والفيديو)، و ElevenLabs لو عايز صوت احترافي.</KeyHint>
      )}
      {autoBox}
      {error && (
        <div className="error" onClick={() => setError(null)} title="اضغط عشان تخفيها">
          {error}
        </div>
      )}

      {/* ===== 1) الفكرة ===== */}
      <details className="film-step" open={!p.shots.length}>
        <summary>① الفكرة</summary>
        <textarea
          rows={5}
          value={p.brief}
          onChange={(e) => patchFilm(() => ({ brief: e.target.value }))}
          placeholder="اكتب فكرتك بالتفصيل: المنتج أو الخدمة، الجمهور، الإحساس اللي عايزه، أي معلومات لازم تظهر (اسم، رقم، عرض)... مثلًا: إعلان لمطعم مندي في الرياض، جو عائلي دافي، عرض 25٪ على الوجبات العائلية في اليوم الوطني"
        />
        <div className="row-3">
          <label className="field">
            <span>النوع</span>
            <select value={p.videoType} onChange={(e) => patchFilm(() => ({ videoType: e.target.value }))}>
              {videoTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>لهجة التعليق</span>
            <select value={p.dialect} onChange={(e) => patchFilm(() => ({ dialect: e.target.value }))}>
              {dialects.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>الطول</span>
            <select value={p.targetSeconds} onChange={(e) => patchFilm(() => ({ targetSeconds: Number(e.target.value) }))}>
              {[15, 20, 30, 45, 60, 90].map((s) => (
                <option key={s} value={s}>
                  {s} ثانية
                </option>
              ))}
            </select>
          </label>
        </div>

        <span className="film-sub">صورك (منتجات، مكان، أشخاص، لوجو) · اختياري</span>
        {p.uploads.map((u, i) => (
          <div key={i} className="film-upload">
            <span className="film-num">#{i}</span>
            <AssetPicker kind="image" compact value={u.path} onChange={(v) => patchFilm((f) => ({ uploads: f.uploads.map((x, j) => (j === i ? { ...x, path: v } : x)) }))} />
            <input
              type="text"
              value={u.note}
              placeholder="دي إيه؟ (مثلًا: علبة المنتج، واجهة المحل، صاحب الشركة)"
              onChange={(e) => patchFilm((f) => ({ uploads: f.uploads.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }))}
            />
            <button type="button" className="btn-small btn-ghost" onClick={() => patchFilm((f) => ({ uploads: f.uploads.filter((_, j) => j !== i) }))}>
              ✕
            </button>
          </div>
        ))}
        {p.uploads.length < 8 && (
          <button type="button" className="btn-add" onClick={() => patchFilm((f) => ({ uploads: [...f.uploads, { path: "", note: "" } as FilmUpload] }))}>
            + أضف صورة
          </button>
        )}

        <button type="button" className="btn-primary" onClick={writePlan} disabled={!p.brief.trim() || !!running("plan", "plan") || !(status?.claude || status?.mock)}>
          {running("plan", "plan") ? `✍️ ${stepOf("plan", "plan")}` : "✍️ اكتب السيناريو والقطات"}
        </button>
        <div className="hint">Claude بيكتب السيناريو، ويقسمه للقطات، ويحدد الشخصيات والتعليق الصوتي. ده رخيص (سنتات)، والتوليد الغالي بيبقى بعد ما تراجع.</div>
        <div className="or-sep"><span>أو</span></div>
        {autoButton}
        <div className="hint">بيعمل كل الخطوات لوحده لحد الفيديو النهائي، وبيوريك التكلفة الكاملة قبل ما يبدأ.</div>
      </details>

      {p.shots.length > 0 && (
        <>
          {/* ===== 2) التعليق الصوتي ===== */}
          <details className="film-step">
            <summary>② التعليق الصوتي</summary>
            <label className="field">
              <span>مصدر الصوت</span>
              <select value={p.voiceProvider} onChange={(e) => patchFilm(() => ({ voiceProvider: e.target.value }))}>
                <option value="elevenlabs" disabled={!status?.elevenlabs}>
                  ElevenLabs (احترافي){status?.elevenlabs ? "" : " · محتاج مفتاح"}
                </option>
                <option value="recorded">صوتي أنا (تسجيل)</option>
                <option value="windows">صوت الويندوز (مجاني، للتجربة)</option>
                <option value="none">من غير تعليق</option>
              </select>
            </label>
            {p.voiceProvider === "elevenlabs" && (
              <>
                <label className="field">
                  <span>الصوت</span>
                  <select value={p.voiceId} onChange={(e) => patchFilm(() => ({ voiceId: e.target.value }))}>
                    <option value="">اختار صوت…</option>
                    {voices.elevenlabs.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.labels && `(${v.labels})`}
                      </option>
                    ))}
                  </select>
                </label>
                {voices.elevenlabs.find((v) => v.id === p.voiceId)?.preview && (
                  <audio src={voices.elevenlabs.find((v) => v.id === p.voiceId)!.preview} controls preload="none" className="asset-audio" />
                )}
                <label className="field">
                  <span>الموديل</span>
                  <select value={p.voiceModel} onChange={(e) => patchFilm(() => ({ voiceModel: e.target.value }))}>
                    {(status?.voiceModels ?? ["eleven_v4"]).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <div className="hint">
                  للهجة السعودية: من مكتبة الأصوات في ElevenLabs (Voice Library) فلتر على Arabic وSaudi، وضيف الأصوات اللي تعجبك لحسابك، وهتظهر هنا. ولأعلى
                  احترافية، اعمل نسخة من صوت معلّق حقيقي (Voice Clone) بموافقته.
                </div>
              </>
            )}
            {p.voiceProvider === "recorded" && (
              <>
                <div className="field">
                  <span>تسجيلك للتعليق كله</span>
                  <AssetPicker kind="audio" value={p.recordedVoice} onChange={(v) => patchFilm(() => ({ recordedVoice: v, recordedCaptions: [] }))} />
                </div>
                <RecordedCaptions path={p.recordedVoice} onCaptions={(c) => patchFilm(() => ({ recordedCaptions: c }))} count={p.recordedCaptions.length} />
                <div className="hint">سجّل في مكان هادي، والمايك على بعد شبر من بقك. الكابشن بيتعمل من تسجيلك بـ Whisper.</div>
              </>
            )}
          </details>

          {/* ===== 3) الشخصيات ===== */}
          {p.characters.length > 0 && (
            <details className="film-step">
              <summary>③ الشخصيات ({p.characters.length})</summary>
              <div className="hint">صورة الشخصية هي اللي بتخلي وشه ولبسه ثابتين في كل اللقطات. ولّدها الأول، أو ارفع صورة حقيقية (بموافقة صاحبها).</div>
              {p.characters.map((c) => (
                <div key={c.id} className="film-char">
                  <AssetPicker kind="image" compact value={c.image} onChange={(v) => patchChar(c.id, { image: v })} />
                  <div className="film-char-body">
                    <input type="text" value={c.name} onChange={(e) => patchChar(c.id, { name: e.target.value })} />
                    <textarea rows={2} dir="ltr" value={c.description} onChange={(e) => patchChar(c.id, { description: e.target.value })} />
                    {p.voiceProvider === "elevenlabs" && (
                      <label className="field">
                        <span>صوته (لما يتكلم في الكادر)</span>
                        <select value={c.voiceId ?? ""} onChange={(e) => patchChar(c.id, { voiceId: e.target.value })}>
                          <option value="">نفس صوت الفيلم</option>
                          {voices.elevenlabs.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button type="button" className="btn-small btn-ai" onClick={() => genCharacter(c)} disabled={!!running("character", c.id) || !status?.fal}>
                      {running("character", c.id) ? stepOf("character", c.id) : `🖼️ ${c.image ? "ولّد تاني" : "ولّد الصورة"} (~${money(imgCost(1))})`}
                    </button>
                  </div>
                </div>
              ))}
            </details>
          )}

          {/* ===== 4) اللقطات ===== */}
          <details className="film-step" open>
            <summary>
              ④ اللقطات ({p.shots.length} · {totalSecs} ثانية){p.title && ` · ${p.title}`}
            </summary>
            {p.style && (
              <details>
                <summary className="hint">الهوية البصرية للفيلم (بتتطبق على كل اللقطات)</summary>
                <textarea rows={3} dir="ltr" value={p.style} onChange={(e) => patchFilm(() => ({ style: e.target.value }))} />
              </details>
            )}
            {p.shots.map((s, i) => {
              const open = openShot === s.id;
              const busy = (["keyframe", "voice", "clip", "lipsync"] as const).map((k) => stepOf(k, s.id)).find(Boolean);
              return (
                <div key={s.id} className={`film-shot ${open ? "open" : ""}`}>
                  <div
                    className="film-shot-head"
                    onClick={() => {
                      setOpenShot(open ? null : s.id);
                      seek(starts[i] + 1);
                    }}
                  >
                    {s.keyframe ? <img src={`/${s.keyframe}`} alt="" className="film-thumb" /> : <div className="film-thumb empty">{i + 1}</div>}
                    <div className="film-shot-info">
                      <b>
                        {i + 1}. {s.purpose || "لقطة"}
                      </b>
                      <small>
                        {clampDur(s.duration)}ث · {s.keyframe ? "🖼️✓" : "🖼️–"} {s.voiceLine.trim() ? (s.voice ? "🎙️✓" : "🎙️–") : ""}{" "}
                        {s.clip ? (clipOutdated(s) ? "🎬⚠ محتاج يتعاد" : "🎬✓") : "🎬–"}
                        {s.speaker && (lipsyncReady(s) ? " 👄✓" : " 👄–")}
                      </small>
                      {busy && <small className="film-busy">⏳ {busy}</small>}
                    </div>
                  </div>

                  {open && (
                    <div className="film-shot-body">
                      <label className="field">
                        <span>وصف اللقطة</span>
                        <input type="text" value={s.purpose} onChange={(e) => patchShot(s.id, { purpose: e.target.value })} />
                      </label>
                      <label className="field">
                        <span>المدة: {clampDur(s.duration)} ثانية</span>
                        <input type="range" dir="ltr" min={3} max={15} step={1} value={clampDur(s.duration)} onChange={(e) => patchShot(s.id, { duration: Number(e.target.value) })} />
                      </label>
                      <label className="field">
                        <span>التعليق الصوتي</span>
                        <textarea rows={2} value={s.voiceLine} onChange={(e) => patchShot(s.id, { voiceLine: e.target.value, voice: "", voiceDuration: 0, words: [] })} />
                      </label>
                      {p.characters.length > 0 && (
                        <label className="field">
                          <span>مين بيقول الكلام ده؟</span>
                          <select value={s.speaker ?? ""} onChange={(e) => patchShot(s.id, { speaker: e.target.value })}>
                            <option value="">راوي (صوت من برا الكادر)</option>
                            {p.characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} بيتكلم في الكادر (شفايفه بتتحرك)
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="field">
                        <span>صوت الجو أو المؤثر (اختياري)</span>
                        <div className="scene-ai-row">
                          <input
                            type="text"
                            dir="ltr"
                            value={s.sfxPrompt}
                            placeholder="e.g. cafe ambience, espresso machine"
                            onChange={(e) => patchShot(s.id, { sfxPrompt: e.target.value, sfx: "" })}
                          />
                          <button type="button" className="btn-small" onClick={() => genSfx(s)} disabled={!s.sfxPrompt.trim() || !soundOk || !!running("sfx", s.id)}>
                            🔊 {running("sfx", s.id) ? "…" : s.sfx ? "تاني" : "ولّد"}
                          </button>
                        </div>
                        {s.sfx && <audio src={`/${s.sfx}`} controls preload="none" className="asset-audio" />}
                      </div>
                      <label className="field">
                        <span>كلام على الشاشة (اختياري)</span>
                        <input type="text" value={s.onScreenText} onChange={(e) => patchShot(s.id, { onScreenText: e.target.value })} />
                      </label>
                      <details>
                        <summary className="hint">وصف الصورة والحركة (متقدم)</summary>
                        <label className="field">
                          <span>الصورة الأولى</span>
                          <textarea rows={4} dir="ltr" value={s.imagePrompt} onChange={(e) => patchShot(s.id, { imagePrompt: e.target.value })} />
                        </label>
                        <label className="field">
                          <span>الحركة والكاميرا</span>
                          <textarea rows={2} dir="ltr" value={s.motionPrompt} onChange={(e) => patchShot(s.id, { motionPrompt: e.target.value })} />
                        </label>
                      </details>
                      {p.characters.length > 0 && (
                        <div className="film-checks">
                          <span>الشخصيات:</span>
                          {p.characters.map((c) => (
                            <label key={c.id} className="check">
                              <input
                                type="checkbox"
                                checked={s.characters.includes(c.id)}
                                onChange={(e) => patchShot(s.id, { characters: e.target.checked ? [...s.characters, c.id] : s.characters.filter((x) => x !== c.id) })}
                              />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      )}
                      {p.uploads.length > 0 && (
                        <div className="film-checks">
                          <span>صورك فيها:</span>
                          {p.uploads.map((u, j) => (
                            <label key={j} className="check" title={u.note}>
                              <input
                                type="checkbox"
                                checked={s.refUploads.includes(j)}
                                onChange={(e) => patchShot(s.id, { refUploads: e.target.checked ? [...s.refUploads, j] : s.refUploads.filter((x) => x !== j) })}
                              />
                              #{j} {u.note.slice(0, 18)}
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="film-actions">
                        <button type="button" className="btn-small btn-ai" onClick={() => genKeyframe(s)} disabled={!!running("keyframe", s.id) || !status?.fal}>
                          🖼️ {s.keyframe ? "صورة تانية" : "ولّد الصورة"} (~{money(imgCost(1))})
                        </button>
                        <button type="button" className="btn-small" onClick={() => genVoice(s)} disabled={!s.voiceLine.trim() || !!running("voice", s.id) || p.voiceProvider === "recorded" || p.voiceProvider === "none"}>
                          🎙️ {s.voice ? "سجّل تاني" : "سجّل الصوت"}
                        </button>
                        <button type="button" className="btn-small btn-ai" onClick={() => genClip(s)} disabled={!s.keyframe || !!running("clip", s.id) || !status?.fal}>
                          🎬 {s.clip ? "فيديو تاني" : "ولّد الفيديو"} (~{money(clipCost([s]))})
                        </button>
                        {s.speaker && (
                          <button
                            type="button"
                            className="btn-small btn-ai"
                            onClick={() => genLipsync(s)}
                            disabled={!s.clip || !s.voice || !!running("lipsync", s.id) || !status?.fal}
                            title={!s.clip || !s.voice ? "محتاج الفيديو والصوت الأول" : ""}
                          >
                            👄 {lipsyncReady(s) ? "حرّك تاني" : "حرّك الشفايف"} (~{money(lipCost([s]))})
                          </button>
                        )}
                      </div>
                      <div className="field">
                        <span>أو استخدم صورتك كأول فريم</span>
                        <AssetPicker kind="image" compact value={s.keyframe} onChange={(v) => patchShot(s.id, { keyframe: v, clip: "", clipDuration: 0 })} />
                      </div>
                      {s.voice && <audio src={`/${s.voice}`} controls preload="none" className="asset-audio" />}
                      <div className="brand-buttons">
                        <button type="button" className="btn-small btn-ghost" onClick={() => patchFilm((f) => ({ shots: f.shots.filter((x) => x.id !== s.id) }))}>
                          ✕ امسح اللقطة
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="btn-add"
              onClick={() => {
                const s = { ...emptyShot(uid()), purpose: "لقطة جديدة" };
                patchFilm((f) => ({ shots: [...f.shots, s] }));
                setOpenShot(s.id);
              }}
            >
              + أضف لقطة
            </button>
          </details>

          {/* ===== 5) الإنتاج ===== */}
          <div className="film-step film-produce">
            <span className="film-sub">⑤ الإنتاج (بالترتيب)</span>
            {autoButton}
            <span className="hint">أو خطوة خطوة:</span>
            <div className="film-music">
              <span className="film-sub">🎵 المزيكا والمؤثرات</span>
              <textarea
                rows={2}
                dir="ltr"
                value={p.musicPrompt}
                placeholder="Warm oud and soft Khaleeji percussion, uplifting, 95 bpm"
                onChange={(e) => patchFilm(() => ({ musicPrompt: e.target.value }))}
              />
              <div className="brand-buttons">
                <button type="button" className="btn-small btn-ai" onClick={genMusic} disabled={!soundOk || !!running("music", "music")}>
                  🎵 {running("music", "music") ? stepOf("music", "music") : `ولّد مزيكا (${filmSeconds() + 2} ثانية)`}
                </button>
                <button type="button" className="btn-small" onClick={() => needSfx.forEach(genSfx)} disabled={!soundOk || !needSfx.length}>
                  🔊 المؤثرات ({needSfx.length})
                </button>
              </div>
              {!soundOk && <div className="hint">محتاج مفتاح ElevenLabs. وبيستهلك من رصيدك هناك.</div>}
              {p.music && !p.music.startsWith("demo/") && <audio src={`/${p.music}`} controls preload="none" className="asset-audio" />}
            </div>
            {needChar.length > 0 && (
              <button type="button" className="btn-small" disabled={!status?.fal} onClick={() => bulk("صور الشخصيات", imgCost(needChar.length), needChar, () => needChar.forEach(genCharacter))}>
                1. صور الشخصيات ({needChar.length}) ~{money(imgCost(needChar.length))}
              </button>
            )}
            <button
              type="button"
              className="btn-small"
              disabled={!needKey.length || !status?.fal}
              onClick={() => {
                if (needChar.length && p.shots.some((s) => s.characters.length && !s.keyframe) && !confirm("فيه شخصيات لسه ملهاش صورة، فشكلها ممكن يختلف من لقطة للتانية. تكمل؟")) return;
                bulk("صور اللقطات", imgCost(needKey.length), needKey, () => needKey.forEach(genKeyframe));
              }}
            >
              2. صور اللقطات ({needKey.length}) ~{money(imgCost(needKey.length))}
            </button>
            <button
              type="button"
              className="btn-small"
              disabled={!needVoice.length || p.voiceProvider === "recorded" || p.voiceProvider === "none"}
              onClick={() => bulk("التعليقات الصوتية", voiceCost(needVoice), needVoice, () => needVoice.forEach(genVoice))}
            >
              3. التعليق الصوتي ({needVoice.length}){voiceCost(needVoice) > 0 && ` ~${money(voiceCost(needVoice))}`}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!needClip.length || !status?.fal}
              onClick={() => bulk(`الفيديوهات (${tier?.label ?? ""})`, clipCost(needClip), needClip, () => needClip.forEach(genClip))}
            >
              4. 🎬 ولّد الفيديوهات ({needClip.length}) ~{money(clipCost(needClip))}
            </button>
            {p.shots.some((s) => s.speaker) && (
              <button type="button" className="btn-small" disabled={!needLip.length || !status?.fal} onClick={() => bulk("حركة الشفايف", lipCost(needLip), needLip, () => needLip.forEach(genLipsync))}>
                5. 👄 حركة الشفايف ({needLip.length}) ~{money(lipCost(needLip))}
              </button>
            )}
            <div className="hint">
              الأسعار تقريبية ({tier?.label}: ~${tier?.pricePerSecond}/ثانية). سجّل الصوت قبل الفيديو، عشان مدة كل لقطة تتظبط على طول الكلام. وبعد ما الفيديوهات تخلص، صدّر من
              كارت التصدير.
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ===== رد Claude ← بيانات الفيلم =====
const planToFilm = (plan: Plan, f: FilmProps): Partial<FilmProps> => {
  const chars: FilmCharacter[] = (plan.characters ?? []).map((c) => ({ id: c.id || uid(), name: c.name, description: c.description, image: "" }));
  const ids = new Set(chars.map((c) => c.id));
  const nUp = f.uploads.length;
  return {
    title: plan.title,
    style: plan.style,
    cta: f.cta || plan.cta,
    musicPrompt: plan.musicPrompt ?? "",
    ctaSub: f.ctaSub || plan.ctaSub,
    characters: chars,
    shots: (plan.shots ?? []).map((s) => ({
      ...emptyShot(uid()),
      purpose: s.purpose,
      duration: clampDur(s.duration, 3, 10),
      imagePrompt: s.imagePrompt,
      motionPrompt: s.motionPrompt,
      characters: (s.characters ?? []).filter((c) => ids.has(c)),
      refUploads: (s.refUploads ?? []).filter((n) => n >= 0 && n < nUp),
      sourceUpload: s.sourceUpload >= 0 && s.sourceUpload < nUp ? s.sourceUpload : -1,
      voiceLine: s.voiceLine ?? "",
      onScreenText: s.onScreenText ?? "",
      sfxPrompt: s.sfxPrompt ?? "",
      speaker: s.speaker && ids.has(s.speaker) && s.voiceLine?.trim() ? s.speaker : "",
    })),
  };
};

// ===== كابشن التسجيل بتاعك (بـ Whisper) =====
const RecordedCaptions: React.FC<{ path: string; count: number; onCaptions: (c: Caption[]) => void }> = ({ path, count, onCaptions }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, language: "ar" }) });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await new Promise((res) => setTimeout(res, 1000));
        const j = await fetch(`/api/transcribe/${jobId}`).then((x) => x.json());
        if (j.status === "done") return onCaptions(j.captions);
        if (j.status === "error") throw new Error(j.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn-small" onClick={run} disabled={!path || busy}>
        {busy ? "بيفرّغ…" : `📝 اعمل الكابشن من التسجيل${count ? ` (${count} كلمة)` : ""}`}
      </button>
      {error && <div className="error">{error}</div>}
    </>
  );
};
