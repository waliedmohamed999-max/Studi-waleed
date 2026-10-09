// لوحة "المونتاج الأوتوماتيك": ارفع ← فرّغ ← حلّل ← راجع ← صدّر (الفيديو كامل أو مقاطع ريلز)
import { useEffect, useMemo, useState } from "react";
import type { Caption } from "@remotion/captions";
import { buildSegments, refineWords, sourceToOut, totalMs, wordDecisions, type CutRange, type Highlight, type TimeRange } from "../src/autoedit/edl";
import { edlInput, type AutoEditProps } from "../src/AutoEditVideo";
import { AssetPicker } from "./fields";
import { sendToQueue, type ExportSettings } from "./ExportCard";
import { useAiStatus } from "./ai";

type Props = Record<string, unknown>;
const sec = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const AutoEditPanel: React.FC<{
  props: Props;
  updateProps: (patch: Props | ((prev: Props) => Props)) => void;
  projectName: string;
  fps: number;
  seek: (frame: number) => void;
  exportSettings: ExportSettings;
}> = ({ props, updateProps, projectName, fps, seek, exportSettings }) => {
  const p = props as unknown as AutoEditProps;
  const ai = useAiStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ===== أول ما الفيديو يترفع: المدة + فين فيه كلام (قص السكوت بيشتغل على طول من غير تفريغ) =====
  const detectSpeech = async () => {
    const r = await fetch("/api/autoedit/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p.media }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data.speech as TimeRange[];
  };
  useEffect(() => {
    if (!p.media) return;
    fetch(`/api/media-info?path=${encodeURIComponent(p.media)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => info && Math.abs((p.mediaDuration || 0) - info.duration) > 0.01 && updateProps({ mediaDuration: info.duration }))
      .catch(() => {});
    if (!(p.speech ?? []).length) {
      setBusy("بيدوّر على السكتات…");
      detectSpeech()
        .then((speech) => updateProps({ speech }))
        .catch((e) => setError((e as Error).message))
        .finally(() => setBusy(null));
    }
  }, [p.media]);

  // ===== الإحصائيات =====
  const input = edlInput({ ...p, range: null });
  const segments = useMemo(() => buildSegments(input), [p.words, p.speech, p.silenceMs, p.padMs, p.removeFillers, p.cuts, p.mediaDuration]);
  // توقيت الكلمات بعد المحاذاة على الكلام الحقيقي
  const words = useMemo(() => refineWords(p.words ?? [], p.speech ?? []), [p.words, p.speech]);
  const decisions = useMemo(() => wordDecisions({ ...input, words }), [words, p.removeFillers, p.cuts]);
  const origMs = (p.mediaDuration || 0) * 1000;
  const editedMs = totalMs(segments);
  const fillers = decisions.filter((d) => d === "filler").length;

  // ===== 1) التفريغ =====
  const transcribe = async () => {
    setError(null);
    setBusy("بيفرّغ الكلام… (دقيقة كلام ≈ دقيقتين ونص)");
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p.media, language: "ar" }) });
      const { jobId, error: err } = await r.json();
      if (!jobId) throw new Error(err);
      for (;;) {
        await sleep(1000);
        const j = await fetch(`/api/transcribe/${jobId}`).then((x) => x.json());
        if (j.status === "done") {
          const speech = (p.speech ?? []).length ? p.speech : await detectSpeech();
          updateProps({ words: j.captions as Caption[], speech, cuts: [], emphasis: [], highlights: [], range: null });
          break;
        }
        if (j.status === "error") throw new Error(j.error);
      }
    } catch (e) {
      setError((e as Error).message || "التفريغ فشل");
    } finally {
      setBusy(null);
    }
  };

  // ===== 2) التحليل بـ Claude =====
  const analyze = async () => {
    setError(null);
    setBusy("Claude بيتفرج على الكلام… (ممكن ياخد دقيقة)");
    try {
      const r = await fetch("/api/autoedit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: p.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })), maxHighlights: origMs > 120000 ? 5 : 3 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      updateProps({ cuts: data.cuts, emphasis: data.emphasis, highlights: data.highlights, hookTitle: data.hookTitle || p.hookTitle, range: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ===== 3) مقاطع الريلز =====
  const previewHighlight = (h: Highlight | null) => {
    updateProps({ range: h ? { fromMs: h.fromMs, toMs: h.toMs } : null });
    seek(0);
  };
  const exportHighlights = async () => {
    setError(null);
    try {
      const items = p.highlights.map((h) => ({ videoId: "AutoEdit", name: h.title, props: { ...props, range: { fromMs: h.fromMs, toMs: h.toMs } as TimeRange } }));
      await sendToQueue(`${projectName} - ريلز`, items, exportSettings);
      setMsg(`اتبعت ${items.length} مقطع للطابور. تابعهم في أداة التصدير.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleCut = (i: number) => updateProps((prev) => ({ ...prev, cuts: (prev.cuts as CutRange[]).map((c, j) => (j === i ? { ...c, enabled: !c.enabled } : c)) }));
  const wordsIn = (r: TimeRange & { fromWord?: number; toWord?: number }) =>
    r.fromWord !== undefined && r.toWord !== undefined
      ? p.words
          .slice(r.fromWord, r.toWord + 1)
          .map((w) => w.text.trim())
          .join(" ")
      : p.words
      .filter((w) => w.startMs >= r.fromMs - 1 && w.endMs <= r.toMs + 1)
      .map((w) => w.text.trim())
      .join(" ");
  const activeHighlight = p.range ? p.highlights.findIndex((h) => h.fromMs === p.range!.fromMs && h.toMs === p.range!.toMs) : -1;

  const goToWord = (w: Caption) => {
    const out = sourceToOut(w.startMs + 1, segments);
    if (out !== null) seek(Math.round((out / 1000) * fps));
  };

  return (
    <div className="autoedit">
      {/* ① الفيديو */}
      <div className="ae-step">
        <span className="ae-step-title">① الفيديو</span>
        <AssetPicker
          kind="video"
          value={p.media}
          onChange={(v) => updateProps({ media: v, mediaDuration: 0, words: [], speech: [], cuts: [], emphasis: [], highlights: [], range: null })}
        />
        <div className="hint">صوّر نفسك وانت بتتكلم عادي، حتى لو غلطت أو سكتّ أو عدت جملة. الاستوديو هيشيل ده كله.</div>
      </div>

      {/* ② التفريغ */}
      {p.media && (
        <div className="ae-step">
          <span className="ae-step-title">② التفريغ والقص الأوتوماتيك</span>
          <button type="button" className="btn-primary" onClick={transcribe} disabled={!!busy}>
            {p.words.length ? "فرّغ تاني" : "📝 فرّغ الكلام (للإمم والكابشن والذكاء الاصطناعي)"}
          </button>
          {((p.speech ?? []).length > 0 || p.words.length > 0) && (
            <div className="ae-stats">
              <div>
                <b>{sec(origMs)}</b>
                <small>الأصلي</small>
              </div>
              <span aria-hidden="true">←</span>
              <div className="ae-stat-main">
                <b>{sec(editedMs)}</b>
                <small>بعد المونتاج</small>
              </div>
              <div>
                <b>{Math.max(0, segments.length - 1)}</b>
                <small>قطع</small>
              </div>
              <div>
                <b>{fillers}</b>
                <small>إمم اتشالت</small>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ③ التحليل */}
      {p.words.length > 0 && (
        <div className="ae-step">
          <span className="ae-step-title">③ مونتير ذكي (Claude)</span>
          <div className="hint">بيشيل الجمل اللي عدتها والغلطات والكلام الجانبي، ويحدد أقوى الجمل (زووم عليها)، ويقترح مقاطع ريلز بعناوين شادة.</div>
          <button type="button" className="btn-small btn-ai" onClick={analyze} disabled={!!busy || !ai?.available}>
            ✨ {p.cuts.length || p.highlights.length ? "حلّل تاني" : "حلّل الفيديو"}
          </button>
          {ai && !ai.available && <div className="hint">محتاج مفتاح Claude (ANTHROPIC_API_KEY في .env).</div>}

          {p.cuts.length > 0 && (
            <>
              <span className="film-sub">أجزاء هتتشال ({p.cuts.filter((c) => c.enabled).length}/{p.cuts.length})</span>
              <ul className="ae-cuts">
                {p.cuts.map((c, i) => (
                  <li key={i} className={c.enabled ? "" : "off"}>
                    <label className="check">
                      <input type="checkbox" checked={c.enabled} onChange={() => toggleCut(i)} />
                      <b>{c.reason}</b>
                      <small>{sec(c.fromMs)}</small>
                    </label>
                    <q dir="auto">{wordsIn(c)}</q>
                  </li>
                ))}
              </ul>
              <div className="hint">شيل العلامة من أي جزء عايزه يفضل في الفيديو.</div>
            </>
          )}
        </div>
      )}

      {/* ④ مقاطع الريلز */}
      {p.highlights.length > 0 && (
        <div className="ae-step">
          <span className="ae-step-title">④ مقاطع ريلز من الفيديو ({p.highlights.length})</span>
          {p.range && (
            <div className="viewer-banner">
              بتعاين مقطع {activeHighlight + 1}
              <button type="button" className="link-btn" onClick={() => previewHighlight(null)}>
                رجوع للفيديو الكامل
              </button>
            </div>
          )}
          {p.highlights.map((h, i) => (
            <div key={i} className={`ae-highlight ${activeHighlight === i ? "active" : ""}`}>
              <div className="ae-highlight-info">
                <b>{h.title}</b>
                <small>
                  «{h.hook}» · {sec(totalMs(buildSegments({ ...input, range: h })))}
                </small>
              </div>
              <button type="button" className="btn-small" onClick={() => previewHighlight(activeHighlight === i ? null : h)}>
                {activeHighlight === i ? "إيقاف" : "عاين"}
              </button>
            </div>
          ))}
          <button type="button" className="btn-primary" onClick={exportHighlights}>
            ⬇ صدّر كل المقاطع ({p.highlights.length})
          </button>
          {msg && <div className="flash">{msg}</div>}
        </div>
      )}

      {/* الكلام كله: المشطوب اتشال */}
      {p.words.length > 0 && (
        <details className="ae-step">
          <summary className="ae-step-title">النص بعد المونتاج</summary>
          <div className="hint">المشطوب اتشال. اضغط على أي كلمة تروح لها في الفيديو.</div>
          <div className="ae-transcript" dir="rtl">
            {words.slice(0, 3000).map((w, i) => (
              <span
                key={i}
                className={`ae-word ${decisions[i]}`}
                onClick={() => decisions[i] === "keep" && goToWord(w)}
                title={decisions[i] === "filler" ? "إمم/آآ" : decisions[i] === "cut" ? "Claude شاله" : ""}
              >
                {w.text.trim()}{" "}
              </span>
            ))}
          </div>
        </details>
      )}

      {busy && <div className="job-status">⏳ {busy}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
