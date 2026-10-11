// لوحة "المونتاج الأوتوماتيك": ارفع ← فرّغ ← حلّل ← راجع ← صدّر (الفيديو كامل أو مقاطع ريلز)
import { useEffect, useMemo, useState } from "react";
import type { Caption } from "@remotion/captions";
import { buildSegments, cleanTranscript, findRestarts, outToSource, relinkWords, wordIndexMap, rangeToOut, refineWords, resolveRange, sourceToOut, totalMs, wordDecisions, type CutRange, type Highlight, type TimeRange } from "../src/autoedit/edl";
import { edlInput, type AutoEditProps, type Broll } from "../src/AutoEditVideo";
import { FaceTrack } from "./FaceTrack";
import { BrollPanel, newBroll } from "./BrollPanel";
import { ClipsJoin, CutoutTool, DubTool, resetForMedia, useServices } from "./AutoEditExtras";
import { TranscriptEditor } from "./TranscriptEditor";
import { AutoPro } from "./AutoPro";
import { EmojiTool } from "./EmojiTool";
import { platforms } from "./platforms";
import { AssetPicker } from "./fields";
import { sendToQueue, type ExportSettings } from "./ExportCard";
import { useAiStatus } from "./ai";
import { KeyHint } from "./settings";
import { CleanAudio } from "./CleanAudio";
import { formatForSize, formats, type FormatKey } from "../src/lib/formats";

// اختيار الاتجاه: أشكال صغيرة بنفس نسبة كل مقاس
const FormatPicker: React.FC<{ value: string; detected: FormatKey | null; onChange: (v: FormatKey) => void }> = ({ value, detected, onChange }) => (
  <div className="format-picker" role="radiogroup" aria-label="مقاس الفيديو">
    {(Object.keys(formats) as FormatKey[]).map((k) => {
      const f = formats[k];
      const scale = 34 / Math.max(f.width, f.height);
      return (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={`format-option ${value === k ? "active" : ""}`} onClick={() => onChange(k)}>
          <span className="format-shape" style={{ width: f.width * scale, height: f.height * scale }} />
          <span>{f.label.replace(/ \(.*\)/, "")}</span>
          <small>{f.label.match(/\((.*)\)/)?.[1]}{detected === k ? " · زي فيديوك" : ""}</small>
        </button>
      );
    })}
  </div>
);

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
  frame: number;
  seek: (frame: number) => void;
  exportSettings: ExportSettings;
}> = ({ props, updateProps, projectName, fps, frame, seek, exportSettings }) => {
  const p = props as unknown as AutoEditProps;
  const ai = useAiStatus();
  const services = useServices();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [reelCount, setReelCount] = useState(0); // 0 = أوتوماتيك حسب طول الفيديو
  const [reelPlatform, setReelPlatform] = useState("tiktok");
  const [detected, setDetected] = useState<FormatKey | null>(null);

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
      .then((info) => {
        if (!info) return;
        if (info.width && info.height) setDetected(formatForSize(info.width, info.height));
        // فيديو جديد (لسه ملوش مدة): المقاس بيتظبط أوتوماتيك على اتجاهه
        const fresh = !p.mediaDuration;
        if (fresh || Math.abs((p.mediaDuration || 0) - info.duration) > 0.01)
          updateProps({ mediaDuration: info.duration, ...(fresh && info.width && info.height ? { format: formatForSize(info.width, info.height) } : {}) });
      })
      .catch(() => {});
    if (!(p.speech ?? []).length) {
      setBusy("بيدوّر على السكتات…");
      detectSpeech()
        .then((speech) => updateProps({ speech }))
        .catch((e) => setError((e as Error).message))
        .finally(() => setBusy(null));
    }
  }, [p.media]);

  // ===== مشروع اتفرّغ قبل التنضيف: الكلام اللي Whisper ألّفه على المزيكا بيتشال أول ما يتفتح =====
  useEffect(() => {
    const old = p.words ?? [];
    if (!old.length) return;
    const clean = cleanTranscript(old);
    if (clean.length === old.length) return;
    const map = wordIndexMap(old, clean);
    updateProps((prev) => ({
      ...prev,
      words: clean,
      cuts: relinkWords((prev.cuts as CutRange[]) ?? [], map),
      emphasis: relinkWords(((prev.emphasis as (TimeRange & { fromWord?: number; toWord?: number })[]) ?? []), map),
      highlights: relinkWords((prev.highlights as Highlight[]) ?? [], map),
      emojis: relinkWords((prev.emojis as AutoEditProps["emojis"]) ?? [], map, true),
      brolls: relinkWords((prev.brolls as Broll[]) ?? [], map),
      voiceFixes: relinkWords((prev.voiceFixes as AutoEditProps["voiceFixes"]) ?? [], map, true),
    }));
  }, [p.words]);

  // ===== لقطة B-roll من نفس الفيديو الأساسي (نسخة مرفوعة مرتين مثلًا) =====
  // بتعرض نفس الصورة بس بتوقيت تاني، فالصوت بيبان سابق الصورة أو متأخر عنها. بتتشال لوحدها
  const [dupeNote, setDupeNote] = useState<string | null>(null);
  useEffect(() => {
    const srcs = [...new Set([...(p.brolls ?? []).filter((b) => b.src && b.kind === "video").map((b) => b.src), ...(p.footage ?? [])])].filter((s) => s !== p.media);
    if (!p.media || !srcs.length) return;
    fetch(`/api/media/fingerprints?paths=${encodeURIComponent([p.media, ...srcs].join("|"))}`)
      .then((r) => r.json())
      .then((fp: Record<string, string | null>) => {
        const main = fp[p.media];
        const same = new Set(srcs.filter((s) => main && fp[s] === main));
        same.add(p.media);
        const bad = (p.brolls ?? []).filter((b) => b.src && same.has(b.src));
        const badFootage = (p.footage ?? []).filter((f) => same.has(f));
        if (!bad.length && !badFootage.length) return;
        updateProps((prev) => ({
          ...prev,
          brolls: ((prev.brolls as Broll[]) ?? []).filter((b) => !(b.src && same.has(b.src))),
          footage: ((prev.footage as string[]) ?? []).filter((f) => !same.has(f)),
        }));
        if (bad.length) setDupeNote(`اتشالت ${bad.length} لقطة B-roll كانت من نفس الفيديو الأساسي (كانت بتخلّي الصوت يبان سابق الصورة).`);
      })
      .catch(() => {});
  }, [p.media, p.brolls, p.footage]);

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
          // الكلام اللي Whisper ألّفه على المزيكا بيتشال، والجمل المتعادة بتتقص أوتوماتيك (من غير Claude)
          const clean = cleanTranscript(j.captions as Caption[]);
          // الإيموجي واللقطات المربوطة بكلمات بتتنقل مع كلمتها في التفريغ الجديد
          const map = wordIndexMap(p.words ?? [], clean);
          updateProps({
            words: clean,
            speech,
            cuts: findRestarts(clean),
            emphasis: [],
            highlights: [],
            range: null,
            voiceFixes: [],
            emojis: relinkWords(p.emojis ?? [], map, true),
            brolls: relinkWords(p.brolls ?? [], map),
          });
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
        body: JSON.stringify({ words: p.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })), maxHighlights: reelCount || (origMs > 600000 ? 10 : origMs > 120000 ? 5 : 3) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      // لقطات الـ B-roll: بنحتفظ باللي جبتها قبل كده، ونضيف اقتراحات Claude الجديدة
      const kept = (p.brolls ?? []).filter((b) => b.src);
      const brolls = [...kept, ...(data.broll ?? []).map((b: Broll) => newBroll(b))];
      updateProps({ cuts: data.cuts, emphasis: data.emphasis, highlights: data.highlights, hookTitle: data.hookTitle || p.hookTitle, range: null, brolls });
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
      const items = p.highlights.map((h) => ({
        videoId: "AutoEdit",
        name: h.title,
        props: { ...props, range: { fromMs: h.fromMs, toMs: h.toMs } as TimeRange },
        // كابشن النشر بيتحفظ في ملف نصي جنب كل مقطع
        caption: h.post ? `${h.post.caption}\n\n${h.post.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}` : "",
      }));
      await sendToQueue(`${projectName} - ريلز`, items, exportSettings);
      setMsg(`اتبعت ${items.length} مقطع للطابور. تابعهم في أداة التصدير.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ===== كابشن نشر لكل مقطع ريلز =====
  const writeReelPosts = async () => {
    setError(null);
    const platform = platforms.find((x) => x.id === reelPlatform)!;
    try {
      for (let i = 0; i < p.highlights.length; i++) {
        setBusy(`بيكتب كابشن المقطع ${i + 1} من ${p.highlights.length}…`);
        const h = p.highlights[i];
        const r = await fetch("/api/ai/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: platform.name, dialect: "eg", content: `${h.title} | ${h.hook} | ${wordsIn(h)}`.slice(0, 6000), hashtags: platform.hashtags }),
        });
        const post = await r.json();
        if (!r.ok) throw new Error(post.error);
        updateProps((prev) => ({ ...prev, highlights: (prev.highlights as Highlight[]).map((x, j) => (j === i ? { ...x, post: { caption: post.caption, hashtags: post.hashtags } } : x)) }));
      }
      setMsg("الكابشن جاهز لكل المقاطع، وهيتحفظ في ملف نصي جنب كل فيديو لما تصدّر.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
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
          onChange={(v) => updateProps({ ...resetForMedia(v), clips: p.clips ?? [] })}
        />
        {p.media && (
          <>
            <span className="hint">مقاس الفيديو اللي هيطلع:</span>
            <FormatPicker value={p.format} detected={detected} onChange={(format) => updateProps({ format })} />
            {detected && detected !== p.format && <div className="hint">فيديوك {detected === "youtube" ? "عرضي" : detected === "square" ? "مربع" : "طولي"}، فهيتقص من الأطراف عشان يملا المقاس ده (والكادر بيتبع الوش لو عملت تتبع الوش).</div>}
          </>
        )}
        {p.media && <ClipsJoin p={p} update={(x) => updateProps(x)} />}
        {p.media && (
          <details className="subpanel autopro" open>
            <summary>🎬 مونتاج احترافي بضغطة (من غير أي تدخل)</summary>
            <AutoPro p={p} update={(x) => updateProps(x)} onDone={() => seek(0)} />
          </details>
        )}
        <div className="hint">صوّر نفسك وانت بتتكلم عادي، حتى لو غلطت أو سكتّ أو عدت جملة. الاستوديو هيشيل ده كله.</div>
        {p.media && <CleanAudio media={p.media} clean={p.cleanAudio} onChange={(v) => updateProps({ cleanAudio: v })} />}
        {p.media && (
          <FaceTrack media={p.media} track={p.faceTrack ?? []} onTrack={(faceTrack, size) => updateProps({ faceTrack, mediaWidth: size.width, mediaHeight: size.height })} />
        )}
        {p.media && <CutoutTool p={p} update={(x) => updateProps(x)} />}
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
          <label className="field">
            <span>عدد مقاطع الريلز</span>
            <select value={reelCount} onChange={(e) => setReelCount(Number(e.target.value))}>
              <option value={0}>أوتوماتيك حسب طول الفيديو</option>
              {[1, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {ai && !ai.available && <KeyHint>محتاج مفتاح Claude.</KeyHint>}


        </div>
      )}

      {/* لقطات B-roll */}
      {(p.words.length > 0 || (p.brolls ?? []).length > 0) && (
        <div className="ae-step">
          <span className="ae-step-title">🎞️ لقطات B-roll ({(p.brolls ?? []).filter((b) => b.enabled && b.src).length})</span>
          <div className="hint">لقطات بتظهر فوق كلامك وهو مكمل، عشان توضّح اللي بتقوله. Claude بيقترح أماكنها لما تحلل الفيديو، أو ضيف بنفسك عند المؤشر.</div>
          <BrollPanel
            brolls={p.brolls ?? []}
            format={p.format}
            onChange={(fn) => updateProps((prev) => ({ ...prev, brolls: fn(((prev.brolls as Broll[]) ?? []).map((b) => b)) }))}
            onSeek={(b) => {
              const out = rangeToOut(resolveRange(b, words), segments);
              if (out) seek(Math.round((out.fromMs / 1000) * fps) + 1);
            }}
            playheadSourceMs={outToSource((frame / fps) * 1000, segments)}
          />
        </div>
      )}

      {/* إيموجي */}
      {p.words.length > 0 && (
        <div className="ae-step">
          <span className="ae-step-title">😀 إيموجي على الكلمات المهمة ({(p.emojis ?? []).length})</span>
          <EmojiTool
            words={words}
            items={p.emojis ?? []}
            linkWords
            onChange={(emojis) => updateProps({ emojis })}
            onSeek={(ms) => {
              const out = sourceToOut(ms + 1, segments);
              if (out !== null) seek(Math.round((out / 1000) * fps));
            }}
          />
        </div>
      )}

      {/* الترجمة والدبلجة */}
      {p.media && (
        <div className="ae-step">
          <span className="ae-step-title">🌍 ترجمة ودبلجة</span>
          <DubTool p={p} update={(x) => updateProps(x)} />
        </div>
      )}

      {/* الأجزاء اللي هتتشال (من Claude أو الحذف اليدوي) */}
      {p.cuts.length > 0 && (
        <div className="ae-step">
          <span className="ae-step-title">أجزاء هتتشال ({p.cuts.filter((c) => c.enabled).length}/{p.cuts.length})</span>
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
          {p.highlights.some((h) => h.post) && (
            <details className="ae-posts">
              <summary className="hint">الكابشن لكل مقطع</summary>
              {p.highlights.map((h, i) =>
                h.post ? (
                  <div key={i} className="ae-post">
                    <b>{h.title}</b>
                    <p dir="auto">{h.post.caption}</p>
                    <small dir="auto">{h.post.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}</small>
                  </div>
                ) : null,
              )}
            </details>
          )}
          <div className="row-2">
            <label className="field">
              <span>المنصة</span>
              <select value={reelPlatform} onChange={(e) => setReelPlatform(e.target.value)}>
                {platforms.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-small btn-ai" onClick={writeReelPosts} disabled={!!busy || !ai?.available}>
              📝 اكتب كابشن لكل مقطع
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={exportHighlights}>
            ⬇ صدّر كل المقاطع ({p.highlights.length})
          </button>
          {msg && <div className="flash">{msg}</div>}
        </div>
      )}

      {/* الكلام كله: تعديل الكتابة والصوت، والمشطوب اتشال */}
      {p.words.length > 0 && (
        <details className="ae-step" open>
          <summary className="ae-step-title">✏️ النص: صلّح الكابشن أو الصوت</summary>
          <TranscriptEditor
            p={p}
            words={words}
            decisions={decisions}
            update={(fn) => updateProps((prev) => ({ ...prev, ...fn(prev as unknown as AutoEditProps) }))}
            goToWord={goToWord}
            canRevoice={!!(services?.elevenlabs || services?.mock)}
          />
        </details>
      )}

      {dupeNote && (
        <div className="flash" onClick={() => setDupeNote(null)}>
          {dupeNote}
        </div>
      )}
      {busy && <div className="job-status">⏳ {busy}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};
