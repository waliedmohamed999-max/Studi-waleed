// لوحة "البودكاست بكذا كاميرا": الكاميرات ← زامن وقطّع ← نضّف الصوت ← كابشن ← مقاطع ريلز
import { useEffect, useState } from "react";
import type { Caption } from "@remotion/captions";
import { uid } from "../src/scenes/defs";
import { podcastShots, podcastWindow, type PodcastCam, type PodcastProps } from "../src/PodcastVideo";
import type { Highlight, TimeRange } from "../src/autoedit/edl";
import { AssetPicker } from "./fields";
import { CleanAudio } from "./CleanAudio";
import { sendToQueue, type ExportSettings } from "./ExportCard";
import { useAiStatus } from "./ai";
import { runJob } from "./jobs";
import { KeyHint } from "./settings";

type Props = Record<string, unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sec = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export const camColors = ["#6366f1", "#f97316", "#10b981", "#ec4899", "#0ea5e9", "#eab308"];
export const camName = (c: PodcastCam | undefined, i: number) => c?.label || (c?.role === "wide" ? "الواسعة" : `كاميرا ${i + 1}`);

export const PodcastPanel: React.FC<{
  props: Props;
  updateProps: (patch: Props | ((prev: Props) => Props)) => void;
  projectName: string;
  fps: number;
  seek: (frame: number) => void;
  exportSettings: ExportSettings;
}> = ({ props, updateProps, projectName, fps, seek, exportSettings }) => {
  const p = props as unknown as PodcastProps;
  const ai = useAiStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const update = (patch: Partial<PodcastProps>) => updateProps(patch as Props);
  const patchCam = (i: number, patch: Partial<PodcastCam>) => updateProps((prev) => ({ ...prev, cams: (prev.cams as PodcastCam[]).map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  // مدة الكاميرا الأولى (قبل التحليل، عشان المعاينة تبقى بطولها)
  useEffect(() => {
    const first = p.cams[0]?.src;
    if (!first) return;
    fetch(`/api/media-info?path=${encodeURIComponent(first)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => info && Math.abs((p.mediaDuration || 0) - info.duration) > 0.01 && update({ mediaDuration: info.duration }))
      .catch(() => {});
  }, [p.cams[0]?.src]);

  // أي تغيير في الكاميرات بيلغي التحليل القديم
  const camsChanged = (patch: Partial<PodcastProps>) => update({ ...patch, offsets: [], range: null, shots: [], analysis: null, clip: null });

  // ===== التحليل =====
  const analyze = async () => {
    setError(null);
    setBusy("بيبدأ…");
    try {
      const r = await runJob<{
        offsets: number[];
        audioOffset: number;
        syncScores: number[];
        range: TimeRange;
        shots: PodcastProps["shots"];
        share: { cam: number; percent: number }[];
        separationDb: number;
      }>(
        "/api/podcast/analyze",
        {
          cams: p.cams.map((c) => ({ path: c.src, mic: c.mic || undefined, role: c.role })),
          audioFile: p.audioFrom === "file" ? p.audioFile : undefined,
          minShotMs: (p.minShotSec || 2) * 1000,
          split: p.splitOnBoth === "on",
        },
        setBusy,
      );
      update({ offsets: r.offsets, audioOffset: r.audioOffset, range: r.range, shots: r.shots, clip: null, analysis: { syncScores: r.syncScores, share: r.share, separationDb: r.separationDb } });
      seek(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ===== الصوت المختار (اللي بيتسمع، وبيتفرّغ، وبيتنضف) =====
  const fromFile = p.audioFrom === "file" && !!p.audioFile;
  const audioCam = Math.min(p.cams.length - 1, Math.max(0, Number(p.audioFrom) || 0));
  const audioPath = fromFile ? p.audioFile : p.cams[audioCam]?.src;
  const audioOffset = fromFile ? p.audioOffset || 0 : p.offsets?.[audioCam] ?? 0;

  const transcribe = async () => {
    setError(null);
    setBusy("بيفرّغ الكلام… (دقيقة كلام ≈ دقيقتين ونص)");
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: audioPath, language: "ar" }) });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(1000);
        const j = await fetch(`/api/transcribe/${jobId}`).then((x) => x.json());
        if (j.status === "done") {
          // وقت الكلام بوقت الملف ← وقت الأساسية
          const words = (j.captions as Caption[]).map((w) => ({ ...w, startMs: w.startMs - audioOffset, endMs: w.endMs - audioOffset }));
          update({ words });
          break;
        }
        if (j.status === "error") throw new Error(j.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ===== مقاطع ريلز (Claude) =====
  const [reelCount, setReelCount] = useState(5);
  const findReels = async () => {
    setError(null);
    setBusy("Claude بيدوّر على أقوى المقاطع…");
    try {
      const r = await fetch("/api/autoedit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: p.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })), maxHighlights: reelCount }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      update({ highlights: (data.highlights as Highlight[]).map(({ fromWord, toWord, ...h }) => h), hookTitle: data.hookTitle || p.hookTitle, clip: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const preview = (h: Highlight | null) => {
    update({ clip: h ? { fromMs: h.fromMs, toMs: h.toMs } : null });
    seek(0);
  };
  const exportReels = async () => {
    setError(null);
    try {
      const items = p.highlights.map((h) => ({ videoId: "Podcast", name: h.title, props: { ...props, clip: { fromMs: h.fromMs, toMs: h.toMs }, format: "reel" } }));
      await sendToQueue(`${projectName} - ريلز`, items, exportSettings);
      setMsg(`اتبعت ${items.length} مقطع طولي للتصدير. تابعهم في أداة التصدير.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shots = podcastShots(p);
  const w = podcastWindow(p);
  const active = p.clip ? p.highlights.findIndex((h) => h.fromMs === p.clip!.fromMs && h.toMs === p.clip!.toMs) : -1;
  const ready = p.cams.filter((c) => c.src).length >= 2;
  const goTo = (ms: number) => seek(Math.round(((ms - w.fromMs) / 1000) * fps));

  return (
    <div className="podcast">
      {/* ① الكاميرات */}
      <div className="ae-step">
        <span className="ae-step-title">① الكاميرات</span>
        <div className="hint">كاميرا لكل متكلم (ولو عندك كاميرا واسعة بتجيب الكل ضيفها). مش لازم يكونوا بدأوا يصوّروا في نفس اللحظة، الاستوديو بيزامنهم من الصوت.</div>
        {p.cams.map((c, i) => (
          <div key={c.id} className="pod-cam" style={{ "--cam-color": camColors[i % camColors.length] } as React.CSSProperties}>
            <div className="pod-cam-head">
              <span className="pod-dot" aria-hidden="true" />
              <input type="text" value={c.label} placeholder={camName(c, i)} aria-label="الاسم" onChange={(e) => patchCam(i, { label: e.target.value })} />
              <select value={c.role} aria-label="نوع الكاميرا" onChange={(e) => camsChanged({ cams: p.cams.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })}>
                <option value="speaker">على متكلم</option>
                <option value="wide">واسعة (الكل)</option>
              </select>
              {p.cams.length > 2 && (
                <button type="button" className="btn-small btn-ghost" aria-label="شيل الكاميرا" onClick={() => camsChanged({ cams: p.cams.filter((_, j) => j !== i), audioFrom: "0" })}>
                  ✕
                </button>
              )}
            </div>
            <AssetPicker kind="video" compact value={c.src} onChange={(v) => camsChanged({ cams: p.cams.map((x, j) => (j === i ? { ...x, src: v } : x)) })} />
            <details>
              <summary className="hint">إعدادات زيادة</summary>
              {c.role !== "wide" && (
                <div className="field">
                  <span>مايك منفصل للشخص ده (اختياري، بيخلي تحديد المتكلم أدق)</span>
                  <AssetPicker kind="audio" compact value={c.mic} onChange={(v) => camsChanged({ cams: p.cams.map((x, j) => (j === i ? { ...x, mic: v } : x)) })} />
                </div>
              )}
              <label className="field">
                <span>مكان القص بالعرض ({c.focusX ?? 50}٪) لما المقاس طولي</span>
                <input type="range" dir="ltr" min={0} max={100} value={c.focusX ?? 50} onChange={(e) => patchCam(i, { focusX: Number(e.target.value) })} />
              </label>
            </details>
          </div>
        ))}
        {p.cams.length < 6 && (
          <button type="button" className="btn-add" onClick={() => camsChanged({ cams: [...p.cams, { id: uid(), src: "", label: "", role: "speaker", mic: "", focusX: 50, focusY: 40 }] })}>
            + ضيف كاميرا
          </button>
        )}
        <label className="field">
          <span>الصوت اللي بيتسمع</span>
          <select value={p.audioFrom} onChange={(e) => update({ audioFrom: e.target.value, cleanAudio: "", words: [] })}>
            {p.cams.map((c, i) => (
              <option key={c.id} value={String(i)}>
                صوت {camName(c, i)}
              </option>
            ))}
            <option value="file">ملف صوت منفصل (ريكوردر أو مايك رئيسي)</option>
          </select>
        </label>
        {p.audioFrom === "file" && <AssetPicker kind="audio" compact value={p.audioFile} onChange={(v) => camsChanged({ audioFile: v, cleanAudio: "", words: [] })} />}
      </div>

      {/* ② المزامنة والقطع */}
      <div className="ae-step">
        <span className="ae-step-title">② زامن وقطّع أوتوماتيك</span>
        <div className="row-2">
          <label className="field">
            <span>أقل مدة للقطة</span>
            <select value={p.minShotSec || 2} onChange={(e) => update({ minShotSec: Number(e.target.value) })}>
              {[1, 1.5, 2, 3, 4].map((s) => (
                <option key={s} value={s}>
                  {s} ثانية
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={p.splitOnBoth === "on"} onChange={(e) => update({ splitOnBoth: e.target.checked ? "on" : "off" })} />
            <span>شاشة مقسومة لما الاتنين يتكلموا</span>
          </label>
        </div>
        <button type="button" className="btn-primary" onClick={analyze} disabled={!ready || !!busy}>
          {p.shots.length ? "🔄 زامن وقطّع تاني" : "🎬 زامن وقطّع أوتوماتيك"}
        </button>
        {!ready && <div className="hint">ضيف فيديو لكاميرتين على الأقل.</div>}
        {p.analysis && (
          <div className="pod-result">
            <div className="ae-stats">
              <div>
                <b>{shots.length}</b>
                <small>لقطة</small>
              </div>
              <div>
                <b>{sec(w.toMs - w.fromMs)}</b>
                <small>المدة</small>
              </div>
              {p.analysis.share.map((s) => (
                <div key={s.cam}>
                  <b>{s.percent}٪</b>
                  <small>{camName(p.cams[s.cam], s.cam)}</small>
                </div>
              ))}
            </div>
            <ul className="checks">
              {p.analysis.syncScores.slice(1).map((s, k) => (
                <li key={k} className={s >= 0.5 ? "ok" : s >= 0.3 ? "warn" : "bad"}>
                  <span aria-hidden="true">{s >= 0.5 ? "✓" : "!"}</span>
                  مزامنة {camName(p.cams[k + 1], k + 1)}: {s >= 0.5 ? "ممتازة" : s >= 0.3 ? "مقبولة، راجعها بعينك" : "ضعيفة (اتأكد إن الكاميرا دي فيها صوت)"} ({p.offsets[k + 1] >= 0 ? "+" : ""}
                  {(p.offsets[k + 1] / 1000).toFixed(2)} ث)
                </li>
              ))}
              <li className={p.analysis.separationDb >= 6 ? "ok" : "warn"}>
                <span aria-hidden="true">{p.analysis.separationDb >= 6 ? "✓" : "!"}</span>
                {p.analysis.separationDb >= 6
                  ? "تحديد المتكلم واضح"
                  : "صوت الكاميرات قريب من بعض، فتحديد المتكلم ممكن يغلط. لو كل واحد عنده مايك ضيفه، أو صلّح اللقطات من التايملاين"}
              </li>
            </ul>
            <div className="hint">تقدر تغيّر كاميرا أي لقطة: اختارها من التايملاين ودوس 1 أو 2 أو 3، أو اقطع لقطة لاتنين بـ S.</div>
          </div>
        )}
      </div>

      {/* ③ الصوت والكابشن */}
      {audioPath && (
        <div className="ae-step">
          <span className="ae-step-title">③ الصوت والكابشن</span>
          <CleanAudio media={audioPath} clean={p.cleanAudio} onChange={(v) => update({ cleanAudio: v })} />
          <button type="button" className="btn-small" onClick={transcribe} disabled={!!busy}>
            📝 {p.words.length ? "فرّغ تاني" : "فرّغ الكلام (للكابشن والريلز)"}
          </button>
          {p.words.length > 0 && <div className="hint">✓ {p.words.length} كلمة</div>}
        </div>
      )}

      {/* ④ مقاطع ريلز */}
      {p.words.length > 0 && (
        <div className="ae-step">
          <span className="ae-step-title">④ مقاطع ريلز من البودكاست</span>
          <div className="row-2">
            <label className="field">
              <span>عدد المقاطع</span>
              <select value={reelCount} onChange={(e) => setReelCount(Number(e.target.value))}>
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-small btn-ai" onClick={findReels} disabled={!!busy || !ai?.available}>
              ✨ دوّر على أقوى المقاطع
            </button>
          </div>
          {ai && !ai.available && <KeyHint>محتاج مفتاح Claude.</KeyHint>}
          {p.clip && (
            <div className="viewer-banner">
              بتعاين مقطع {active + 1}
              <button type="button" className="link-btn" onClick={() => preview(null)}>
                رجوع للبودكاست كامل
              </button>
            </div>
          )}
          {p.highlights.map((h, i) => (
            <div key={i} className={`ae-highlight ${active === i ? "active" : ""}`}>
              <div className="ae-highlight-info">
                <b>{h.title}</b>
                <small>
                  «{h.hook}» · {sec(h.toMs - h.fromMs)}
                </small>
              </div>
              <button type="button" className="btn-small" onClick={() => preview(active === i ? null : h)}>
                {active === i ? "إيقاف" : "عاين"}
              </button>
            </div>
          ))}
          {p.highlights.length > 0 && (
            <button type="button" className="btn-primary" onClick={exportReels}>
              ⬇ صدّر المقاطع طولي ({p.highlights.length})
            </button>
          )}
        </div>
      )}

      {/* اللقطات */}
      {p.shots.length > 0 && (
        <details className="ae-step">
          <summary className="ae-step-title">اللقطات ({shots.length})</summary>
          <ol className="pod-shots">
            {shots.slice(0, 400).map((s, i) => (
              <li key={i}>
                <button type="button" className="link-btn" onClick={() => goTo(s.fromMs + 1)}>
                  {sec(s.fromMs)}
                </button>
                <span style={{ color: camColors[s.cam % camColors.length] }}>
                  {s.kind === "split" ? `${camName(p.cams[s.cams[0]], s.cams[0])} + ${camName(p.cams[s.cams[1]], s.cams[1])}` : camName(p.cams[s.cam], s.cam)}
                </span>
                <small>{((s.toMs - s.fromMs) / 1000).toFixed(1)} ث</small>
              </li>
            ))}
          </ol>
        </details>
      )}

      {busy && <div className="job-status">⏳ {busy}</div>}
      {msg && <div className="flash">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
